# GUIDE RELAIS pour VIBE (et tout agent) — carte 8 relais KITT
> Résumé pratique pour piloter la carte relais. Lis-moi avant de toucher aux relais.
> Dernière mise à jour : 2026-06-14 — statut : ✅ FONCTIONNE (relais cliquent).

---

## 1. CE QUE C'EST (matériel)
- **KMTronic « RS485 8 Relay Box v1.2 »** (boîtier 8 relais) + relais SUN HOLD **RAS-0515**.
- Reliée au Jetson par un **convertisseur USB↔série FTDI** (puce **FT232R**, USB `0403:6001`, **n° de série `AL03EICJ`**).
- Vu par le système comme un **port série** : `/dev/ttyUSBx` (souvent `ttyUSB0`, parfois `ttyUSB1` après un reset — voir §5).
- Alim du boîtier : **9–24 V DC** (12 V branché). La LED rouge = POWER. Chaque relais a une LED de canal + fait « tic » quand il s'active (même sans charge sur NO/C/NC).

---

## 2. COMMENT ON LE PILOTE (protocole — VALIDÉ ✅)
Protocole **KMTronic SIMPLE** (PAS Modbus, PAS bitbang) :
- **9600 bauds, 8 bits, sans parité, 1 stop (8N1).**
- Commande = **3 octets** : `0xFF`, `<numéro relais 1..8>`, `<état 1=ON / 0=OFF>`.
  - Relais 1 ON  = `FF 01 01`
  - Relais 1 OFF = `FF 01 00`
  - Relais 8 ON  = `FF 08 01`
- ⚠️ **La carte ne renvoie AUCUN accusé de réception.** Ne PAS attendre de réponse série : « rien reçu » est normal. La seule confirmation = le **tic** + la **LED** du relais.

---

## 3. PILOTES / DÉPENDANCES INSTALLÉS
| Composant | Où | Pour quoi |
|---|---|---|
| **`pyserial` 3.5** | **dans le VENV** → `venv/bin/python3` | ✅ **C'est ÇA qu'on utilise** (protocole série simple) |
| `ftdi_sio` (driver noyau) | système | crée `/dev/ttyUSBx` automatiquement |
| `libftdi1.so.2` | `/lib/aarch64-linux-gnu/` | lib système |
| `pylibftdi` 0.24.0 | python **système** (`~/.local`), **PAS le venv** | ⚠️ bitbang — **NE PAS UTILISER** (voir §4) |
| Règle udev `99-kitt-relais-ftdi.rules` | `/etc/udev/rules.d/` | accès USB brut sans sudo (groupe `plugdev`) — utile au bitbang seulement |

`kitt` est dans les groupes `dialout` (accès `ttyUSBx`) et `plugdev`. **Pour le série, `dialout` suffit, pas besoin de sudo.**

---

## 4. ⚠️ PIÈGE À NE PAS REFAIRE (important)
**NE JAMAIS lancer `test_bitbang_clic.py` ni utiliser `pylibftdi`/BitBangDevice sur cette carte.**
Le bitbang **ne pilote pas les relais** (les broches FTDI vont à la puce série, pas aux bobines) ET il **laisse le FT232R coincé en mode bitbang** après fermeture. Conséquence : les lectures série suivantes renvoient des octets fantômes (`0xFF` / `0xFE`) → on croit à tort que « le bus est mort ». C'est ce qui nous a fait perdre du temps le 2026-06-14.

**Si la puce est coincée (flot de `0xFF`, ou plus de réponse) → reset USB pour repartir en UART propre :**
```bash
sudo python3 - <<'PY'
import fcntl, os, glob
USBDEVFS_RESET = ord('U') << 8 | 20
for dev in glob.glob('/sys/bus/usb/devices/*'):
    try:
        if open(dev+'/idVendor').read().strip()=='0403' and open(dev+'/idProduct').read().strip()=='6001':
            b=int(open(dev+'/busnum').read()); d=int(open(dev+'/devnum').read())
            fd=os.open(f'/dev/bus/usb/{b:03d}/{d:03d}', os.O_WRONLY)
            fcntl.ioctl(fd, USBDEVFS_RESET, 0); os.close(fd); print('USB reset OK')
    except OSError: pass
PY
```
(ou simplement débrancher/rebrancher l'USB). Après reset, le numéro de port peut changer → **toujours auto-détecter par n° de série** (§5).

---

## 5. CODE PRÊT À L'EMPLOI (à utiliser avec `venv/bin/python3`)
Auto-détection du port par n° de série (robuste au changement `ttyUSB0`↔`ttyUSB1`) :
```python
import time, serial, serial.tools.list_ports as lp

SERIE = "AL03EICJ"  # n° de série du convertisseur FTDI de la carte relais

def _port():
    for p in lp.comports():
        if (p.serial_number or "") == SERIE:
            return p.device
    raise RuntimeError("carte relais introuvable (FTDI AL03EICJ)")

def relais(n, on):
    """n = 1..8 ; on = True/False. Envoie FF NN SS. Pas d'accusé attendu."""
    with serial.Serial(_port(), 9600, 8, 'N', 1, timeout=0.3) as s:
        time.sleep(0.2)
        s.write(bytes([0xFF, n, 1 if on else 0])); s.flush()

def impulsion(n, duree=0.6):
    """Active le relais n pendant 'duree' secondes puis le coupe (utile pour 'ouvre la porte')."""
    relais(n, True); time.sleep(duree); relais(n, False)

# exemple : relais(1, True) ; impulsion(1, 0.5)
```

---

## 6. SCRIPTS DE TEST DISPONIBLES (dossier `relais/`)
| Script | Rôle | Lancer avec |
|---|---|---|
| `test_propre.py` | écoute passive + simple + Modbus, auto-détecte le port | `venv/bin/python3` |
| `test_ecoute.py` | balayage lent des 8 relais pour l'œil/oreille | `venv/bin/python3` |
| `test_modbus_rs485.py` | scan Modbus (s'est avéré inutile : carte non-Modbus) | `venv/bin/python3` |
| ~~`test_bitbang_clic.py`~~ | ❌ **NE PAS LANCER** (voir §4) | — |

Commande type : `cd /home/kitt/kitt-ai && venv/bin/python3 relais/test_ecoute.py`

---

## 7. INTÉGRATION KIRONEX — ✅ FAITE (2026-06-14)
Pilotage vocal/texte natif par le LLM. Le module est `relais/kitt_relais.py` (classe `RelayBoard`, instance `BOARD`).
- **Commandes reconnues** (variantes acceptées) → relais, en **impulsion ~0.6s** :
  - « ouvre la porte »→1, « ferme la porte »→2, « ouvre/allume les feux »→3, « ferme/éteins les feux »→4,
    « ouvre la fenêtre »→5, « ferme la fenêtre »→6, « ouvre le coffre »→7, « klaxonne »→8.
- **Où dans `kyronex_server.py`** : mapping `_RELAY_ACTIONS`, 8 regex en tête de `_FUNC_PATTERNS`, branche dans
  `execute_function` (utilise `BOARD.pulse`). Marche sur `/api/chat` et `/api/chat/stream`.
- **Routes** : `GET /api/relais/status` (état pour l'UI), `POST /api/relais/test {relay:1..8, action:'pulse|on|off'}`.
- **UI** : panneau « CARTE RELAIS » (statut + 8 boutons test) dans `static/index.html` + JS `_refreshRelais/_relaisTest` dans `static/app.js`.
- **Détection au démarrage** : `start_background` → log `[RELAIS] carte … détectée`.
- ⚠️ **Garde-fou OBD** : le scan `OBD_PORTS` exclut `BOARD.port_path()` (sinon l'ALDL saisit le port relais → `Erreur ALDL Input/output error`). **Ne pas retirer ce filtre.**
- Pour qu'un relais **reste activé** (au lieu d'une impulsion), changer son mode `"pulse"` en `"on"`/`"off"` dans `_RELAY_ACTIONS`.
- **Vitres électriques** : relais 5 (descente/ouvrir) et 6 (montée/fermer) sont en mode `"window"` →
  course moteur de **`WINDOW_TRAVEL_TIME = 6.0` s** (constante en haut du fichier, à ajuster après essais),
  puis coupure auto. Sécurité intégrée : jamais 5+6 ensemble ; une commande inverse pendant la course
  **coupe le relais actif avant** de lancer l'autre (`_window_start`/`_window_run`).
- **Klaxon** : regex tolérante aux transcriptions Whisper (claxon, klakson, claque son, etc.).
- Reste matériel : **moteur de porte = pont-H à 2 relais** (ouvrir + refermer) — pas encore câblé.

### 7b. KLAXONS MUSICAUX (bibliothèque extensible)
Motifs rythmiques sur le relais 8. Bibliothèque `HORN_PATTERNS` dans `kyronex_server.py` :
chaque motif = `{label, description, reply, aliases, seq}` où `seq = [(ON|OFF, durée_s), ...]`.
- **4 motifs intégrés** (victoire, champions, supporters, fete) — **ne JAMAIS les supprimer** (protégés par `HORN_BUILTIN_NAMES`).
- **Sécurité** : chaque segment ON est plafonné à `HORN_MAX_ON = 2.0` s.
- **Jouer** : « klaxonne / fais le klaxon / joue le klaxon **<nom>** » → le mot est résolu dans la
  bibliothèque à l'exécution (un motif ajouté à chaud est reconnu **sans recompiler** la regex).
  Mot inconnu → repli en klaxon simple.
- **Créer** : « crée / ajoute / invente un klaxon » → `_horn_create_random()` génère un motif sûr,
  l'ajoute et le **persiste dans `relais/horn_patterns.json`** (rechargé au démarrage par `_horn_load_custom`).
- **Lister** : « liste / inventaire / quels / montre / affiche les klaxons » → `_horn_list_reply()`
  affiche nom + description + total (reflète automatiquement l'état réel de la biblio).
- **AJOUTER un motif à la main** : une entrée dans `HORN_PATTERNS` (clé sans accent + `label`,
  `description`, `aliases`, `seq`). Rien d'autre à toucher (mots-clés et liste se régénèrent seuls).

### 7c. SOS / DÉTRESSE
- **SOS simple** (« fais un SOS », « klaxonne SOS », « au secours ») → motif intégré `sos` =
  vrai morse `… ─── …` joué 2× (~10 s). C'est un motif normal de `HORN_PATTERNS`.
- **SOS RÉEL** (« déclenche le SOS réel / d'urgence / non-stop », « SOS permanent ») →
  `_sos_start()` lance une tâche de fond qui **répète le SOS en continu pendant
  `SOS_REEL_CYCLE = 30 min`**, fait une pause d'écoute de `SOS_REEL_PAUSE = 60 s`, puis
  **RECOMMENCE indéfiniment** tant que personne n'arrête (chaque ON reste ≤ `HORN_MAX_ON`).
- **ARRÊT** (« arrête le SOS », « stop le SOS », « coupe la détresse ») → `_sos_stop()` :
  annule la tâche, relâche le relais klaxon. Prioritaire (ordre regex : arrêt > réel > simple).
- Garde-fou : pendant un SOS réel, un klaxon simple/SOS simple répond « SOS déjà actif »
  (évite que deux tâches pilotent le relais 8 en même temps).

---

## 8. LIENS INTERNET (doc KMTronic)
- USB 8-Channel Relay (RS232 serial, protocole simple) : https://info.kmtronic.com/usb-eight-channel-relay-controller-rs232-serial-controlled-12v.html
- USB One Channel Relay Box : https://info.kmtronic.com/usb-one-channel-relay-box.html
- KMTronic RS485 relays — commandes : https://info.kmtronic.com/kmtronic-rs485-relays-commands.html
- RS485 8-Channel Relay Modbus (produit) : https://kmtronic.com/product/2790/rs485-8-channel-relay-controller-modbus-rtu.html
- Manuel R4S8CRM RS485 Modbus (PDF) : https://info.kmtronic.com/manuals/user_manuals/R4S8CRM_RS485_EIGHT_CHANNEL_RELAY_MODBUS.pdf
- Convertisseur USB→RS485 FTDI BOX (PDF) : https://info.kmtronic.com/manuals/user_manuals/USBRS485_USB_to_RS485_FTDI_Interface_Converter_BOX.pdf
- Manuels KMTronic (index) : https://info.kmtronic.com/kmmanuals.html

> Dossier de recherche complet (archis, moteur, sécurité) : `relais/DOSSIER_RELAIS_KITT.md`
