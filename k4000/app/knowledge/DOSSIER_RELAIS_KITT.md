# 🔌 DOSSIER RELAIS KITT — Donner des bras et des mains au chatbot

> **Méga bloc-notes de recherche** — rédigé le 2026-06-12 par Claude pour Manix.
> Objectif : que KITT, sur ordre vocal (« ouvre la porte »), **active un relais** qui
> commande un petit moteur qui ouvre une porte. Ce document est le mode d'emploi complet :
> le **pourquoi**, le **comment**, le **câblage**, le **code**, l'**installation** et la
> **sécurité**. Rien n'est encore installé : c'est un dossier de préparation à exécuter plus tard.

---

## 0. CE QUI EST DÉJÀ BRANCHÉ (détecté le 2026-06-12)

J'ai détecté le module USB que tu as branché. Voici l'identité exacte :

| Élément | Valeur |
|---|---|
| Puce | **FTDI FT232R USB UART** |
| Identifiant USB | `0403:6001` (VID FTDI : 0403) |
| Numéro de série | `AL03EICJ` |
| Nom système | `/dev/ttyUSB0` |
| Pilote noyau | `ftdi_sio` + `usbserial` (déjà chargés, OK) |
| Vitesse USB | 12 Mbps (USB 2.0 Full Speed) |
| Activité série | **Aucune** (silence total à 9600/38400/57600/74880/115200 bauds, même après tentative de reset DTR/RTS) |

### Qu'est-ce que ça veut dire ?

La puce branchée est un **pont USB↔série FTDI FT232R**. C'est la puce que l'on retrouve dans
**deux** familles de matériel — et c'est important de savoir laquelle tu as :

1. **Carte relais FTDI « bitbang »** 🟢 (très probable vu le silence série)
   Le FT232R est câblé **directement** sur des transistors qui pilotent les relais. Il n'y a
   **aucun microcontrôleur** derrière, **aucun protocole série** — d'où le silence total que j'ai
   mesuré. On pilote les relais en mode **bitbang** (on force l'état des broches de la puce).
   C'est exactement le principe des cartes **SainSmart USB 2/4/8 canaux**.
   → **Voir Architecture A (la plus directe pour ce que tu as).**

2. **Simple adaptateur USB-TTL FTDI** (possible aussi)
   Dans ce cas, le FT232R ne sert qu'à convertir USB↔série, et tu y branches **ensuite** un
   ESP32 ou une carte relais à microcontrôleur via les fils TX/RX/GND.
   → **Voir Architecture B/C.**

> ⚠️ Tu as précisé que **les relais ne sont pas encore alimentés**. C'est cohérent : la puce FTDI
> s'énumère sur le 5 V de l'USB (donc visible par le système), mais les **bobines des relais ne
> bougeront pas** tant que leur alimentation dédiée n'est pas branchée. Voir §4 (alimentation séparée).

### Comment lever le doute (test à faire quand tu auras 2 minutes)

```bash
# Avec la carte branchée, installer l'outil FTDI puis lister les broches :
python3 -c "from pylibftdi import BitBangDevice; bb=BitBangDevice('AL03EICJ'); bb.direction=0xFF; bb.port=0x01; print('Relais 1 ON')"
# Si tu entends un CLIC → c'est bien une carte relais bitbang (Architecture A).
# Si rien ne clique et que tu dois passer par TX/RX → c'est un adaptateur (Architecture B/C).
```

---

## 1. LE CONCEPT — Comment un chatbot « ouvre une porte »

La chaîne complète, du micro jusqu'au moteur :

```
   Ta voix
      │  « KITT, ouvre la porte »
      ▼
 [ Micro + Whisper STT ]      ← déjà en place dans Kyronex
      │  texte
      ▼
 [ kyronex_server.py ]
   detection de commande       ← on AJOUTE un "function call" : ouvre/ferme porte
      │
      ▼
 [ Pilote de relais ]          ← LE MAILLON À CONSTRUIRE (ce dossier)
   USB bitbang  OU  série  OU  WiFi
      │  signal électrique (3,3V/5V)
      ▼
 [ Carte relais ]              ← interrupteur électronique commandé
   contact COM/NO/NC s'ouvre/ferme
      │  courant de puissance
      ▼
 [ Petit moteur ]              ← alimenté par SA PROPRE alim
      │  mouvement mécanique
      ▼
   La porte s'ouvre 🚪
```

**Idée clé** : un relais est un **interrupteur commandé électroniquement**. Le chatbot ne fournit
pas la puissance du moteur — il envoie juste un petit signal qui dit au relais « ferme le contact »,
et c'est le contact qui laisse passer le courant (puissant) du moteur depuis une alimentation séparée.

---

## 2. LES TROIS ARCHITECTURES POSSIBLES (comparées)

| Critère | A — FTDI bitbang USB | B — ESP32 USB série | C — ESP32 WiFi |
|---|---|---|---|
| Matériel | Carte relais FTDI (déjà là ?) | ESP32 + carte relais | ESP32 + carte relais |
| Liaison | USB (`/dev/ttyUSB0`) | USB (`/dev/ttyUSB0`) | Réseau Wi-Fi (HTTP/MQTT) |
| Distance | Câble USB (~5 m max) | Câble USB (~5 m max) | Toute la maison 🏠 |
| Microcontrôleur | Non (FTDI pilote tout) | Oui (firmware ESP32) | Oui (firmware ESP32) |
| Intelligence locale | Aucune | Possible (sécurités) | Possible (sécurités, fins de course) |
| Complexité install | **Faible** | Moyenne | Moyenne |
| Robustesse | Bonne | Bonne | **Excellente** (découplé) |
| Idéal pour | Test rapide / proximité | Proximité + logique | **Projet final / porte réelle** |

### Recommandation
- **Pour démarrer / prototyper tout de suite** avec ce qui est branché → **Architecture A** (FTDI bitbang).
- **Pour le projet final robuste** (porte qui s'ouvre vraiment, KITT dans la voiture/maison) →
  **Architecture C** (ESP32 en Wi-Fi). Le Jetson et le moteur sont **physiquement découplés** :
  si le Jetson plante, l'ESP32 garde le contrôle des sécurités (fins de course), et inversement.

---

## 3. NOTIONS MATÉRIELLES ESSENTIELLES (à comprendre une fois pour toutes)

### 3.1 Anatomie d'un relais — COM / NO / NC
Chaque relais a **3 bornes de puissance** :
- **COM** (Commun) — le point central.
- **NO** (Normally Open / Normalement Ouvert) — déconnecté au repos, **connecté quand le relais est activé**.
- **NC** (Normally Closed / Normalement Fermé) — connecté au repos, déconnecté quand activé.

➡️ Pour un moteur qui doit tourner **quand KITT le demande** : on câble le moteur sur **COM + NO**.
Au repos = moteur coupé ; relais activé = moteur alimenté.

### 3.2 Déclenchement « active-low » (piège classique)
Beaucoup de cartes relais chinoises sont **active-low** : le relais s'active quand on met l'entrée
à **0 V (LOW)**, pas à 3,3 V. Certaines ont un **cavalier (jumper)** pour choisir LOW ou HIGH.
➡️ Conséquence logicielle : il faut parfois **inverser** la logique dans le code (`0` = ON).
À vérifier au premier test (le clic te dira dans quel sens ça marche).

### 3.3 Opto-isolation (sécurité électrique)
Les bonnes cartes relais ont des **opto-coupleurs** : ils isolent électriquement la partie
« commande » (Jetson/ESP32, basse tension) de la partie « puissance » (moteur). **Privilégie une
carte avec opto-isolation** et, idéalement, une **alimentation séparée pour la partie bobines**
(borne `JD-VCC` séparée de `VCC` + cavalier à retirer). Ça protège le Jetson/ESP32 des pics.

### 3.4 Alimentation SÉPARÉE pour le moteur (RÈGLE D'OR ⚡)
**Ne JAMAIS alimenter le moteur depuis l'USB du Jetson ni depuis le 3,3 V de l'ESP32.**
Un moteur tire des pointes de courant qui font planter (ou griller) la logique.
- Logique (FTDI/ESP32) : alimentée par l'USB.
- Bobines des relais : 5 V (souvent depuis l'USB, faible courant — OK).
- **Moteur : SA propre alimentation** (pile, batterie, bloc secteur adapté à sa tension/courant),
  avec la **masse (GND) commune** entre l'alim moteur et la carte relais.

### 3.5 Diode de roue libre (si moteur/bobine inductive)
Un moteur est inductif : à la coupure il génère une surtension. Les cartes relais ont déjà une
diode sur la bobine du relais, mais pour le **moteur** lui-même pense à une **diode de roue libre**
(ex. 1N4007) en parallèle, ou un module driver moteur qui l'intègre.

---

## 4. CAS SPÉCIAL : UN MOTEUR DE PORTE (très important pour ton projet)

Tu veux « un relais qui active un petit moteur qui ouvre la porte ». Attention :

### ⚠️ Un seul relais = un seul sens
Un relais simple ne fait que **couper/mettre** le courant. Le moteur tournera **dans un seul sens**.
Pour **OUVRIR** la porte, OK. Mais pour la **REFERMER**, il faut **inverser la polarité** du moteur.

### Solution : 2 relais montés en « pont en H » (H-bridge)
Avec **2 relais**, tu inverses le sens de rotation :
- Relais 1 activé seul → moteur tourne dans un sens (**ouvre**).
- Relais 2 activé seul → moteur tourne dans l'autre sens (**ferme**).
- Les deux OFF (ou les deux ON) → moteur à l'arrêt.

➡️ **Ne JAMAIS activer les deux relais en sens opposé en même temps mal câblés** → court-circuit.
Le code doit garantir : *un seul relais actif à la fois*, avec un **temps mort** entre les bascules.

### Fins de course (limit switches) — fortement recommandé
Un moteur ne « sait » pas que la porte est ouverte : il forcerait jusqu'à griller.
- Mets **2 interrupteurs de fin de course** (porte ouverte / porte fermée) qui **coupent** le moteur.
- En Architecture C (ESP32), l'ESP32 lit les fins de course **localement** et arrête le moteur
  **même si le Jetson est planté** → c'est la sécurité que seul un microcontrôleur dédié apporte.

### Alternative plus simple qu'un moteur + H-bridge
Pour une **petite** porte / trappe, un **servomoteur** ou un **vérin électrique (actuator)** à fin
de course intégrée simplifie énormément (un seul signal, position absolue). À considérer.

---

## 5. INSTALLATION LOGICIELLE (détaillée, pas-à-pas)

### 5.0 Permissions du port série (à faire dans TOUTES les architectures)
Le port `/dev/ttyUSB0` appartient à `root:dialout`. L'utilisateur `kitt` **n'est pas** dans le
groupe `dialout` → d'où le « Permission denied » que j'ai eu. À corriger une fois :

```bash
# Ajouter kitt au groupe dialout (puis se déconnecter/reconnecter, ou redémarrer le service)
sudo usermod -aG dialout kitt

# Vérifier
groups kitt | grep dialout
```

> Comme le service tourne en tant que `kitt` via systemd, il faudra que le service hérite du
> groupe. Le plus simple : `sudo usermod -aG dialout kitt` puis `sudo systemctl restart kitt-kyronex`.
> (systemd relit les groupes au redémarrage du service.)

### 5.0bis Règle udev — nom de port STABLE (recommandé)
`/dev/ttyUSB0` peut devenir `ttyUSB1` si tu branches autre chose. On fige un nom via le **numéro de
série FTDI** (`AL03EICJ`) :

```bash
# Créer /etc/udev/rules.d/99-kitt-relais.rules
echo 'SUBSYSTEM=="tty", ATTRS{idVendor}=="0403", ATTRS{idProduct}=="6001", ATTRS{serial}=="AL03EICJ", SYMLINK+="kitt_relais", MODE="0660", GROUP="dialout"' | sudo tee /etc/udev/rules.d/99-kitt-relais.rules
sudo udevadm control --reload-rules && sudo udevadm trigger
# → la carte sera TOUJOURS accessible via /dev/kitt_relais
```

---

### 5.1 ARCHITECTURE A — Carte relais FTDI bitbang (USB)

**Dépendances** (libftdi en C + binding Python) :
```bash
# Bibliothèque C libftdi (indispensable pour pylibftdi)
sudo apt-get update
sudo apt-get install -y libftdi1 libftdi1-2

# Binding Python (dans le venv de Kyronex)
cd /home/kitt/kitt-ai && source venv/bin/activate
pip install pylibftdi
# Alternative 100% Python (pas besoin de libftdi C) : pip install pyftdi
```

**⚠️ Conflit de pilote** : pour le **bitbang**, `pylibftdi` a besoin d'un accès USB direct. Le pilote
noyau `ftdi_sio` (qui crée `/dev/ttyUSB0`) peut **bloquer** l'accès. Deux options :
- `pylibftdi` détache souvent le pilote tout seul.
- Sinon, décharger manuellement pour les tests : `sudo modprobe -r ftdi_sio` (revient au reboot).
- Règle propre : laisser une **udev rule** donner l'accès au groupe (voir 5.0bis).

> 📌 **Note importante** : en mode bitbang, tu **n'utilises PAS** `/dev/ttyUSB0` (pas de série) —
> `pylibftdi` parle à la puce par le **numéro de série** `AL03EICJ` directement via USB.

**Code de pilotage (le cœur) :**
```python
from pylibftdi import BitBangDevice

SERIAL = "AL03EICJ"   # numéro de série de TA puce FTDI (détecté)

def relais_on(canal: int):
    """Active le relais N (0..7). bb.port est un octet : 1 bit = 1 relais."""
    with BitBangDevice(SERIAL) as bb:
        bb.direction = 0xFF            # les 8 broches en SORTIE
        bb.port |= (1 << canal)        # met le bit du canal à 1

def relais_off(canal: int):
    with BitBangDevice(SERIAL) as bb:
        bb.direction = 0xFF
        bb.port &= ~(1 << canal) & 0xFF  # remet le bit à 0

# Exemple : impulsion de 0,5 s sur le relais 0
import time
relais_on(0); time.sleep(0.5); relais_off(0)
```

> Si ta carte est **active-low**, inverse : `relais_on` fait `bb.port &= ~(1<<canal)` et inversement.
> Outils tout faits si tu préfères : `pip install bitbangrelay` (config YAML, cartes SainSmart),
> ou les projets `relayctl` / `pyrelayctl`.

---

### 5.2 ARCHITECTURE B — ESP32 en USB série

**Côté ESP32 (firmware Arduino)** — écoute des commandes texte sur le port série :
```cpp
// Firmware ESP32 — relais sur GPIO, commandes série "OPEN" / "CLOSE" / "STOP"
#define RELAY_OPEN  26   // GPIO relais "ouvre"
#define RELAY_CLOSE 27   // GPIO relais "ferme"

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_OPEN, OUTPUT);
  pinMode(RELAY_CLOSE, OUTPUT);
  digitalWrite(RELAY_OPEN, LOW);
  digitalWrite(RELAY_CLOSE, LOW);
}

void loop() {
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    if (cmd == "OPEN")  { digitalWrite(RELAY_CLOSE,LOW); digitalWrite(RELAY_OPEN,HIGH);  Serial.println("OK OPEN"); }
    else if (cmd == "CLOSE"){ digitalWrite(RELAY_OPEN,LOW); digitalWrite(RELAY_CLOSE,HIGH); Serial.println("OK CLOSE"); }
    else if (cmd == "STOP") { digitalWrite(RELAY_OPEN,LOW); digitalWrite(RELAY_CLOSE,LOW);  Serial.println("OK STOP"); }
  }
}
```
> ⚠️ Active « **USB CDC On Boot** » dans l'IDE Arduino pour l'ESP32, et choisis le bon port.

**Côté Jetson (Python, dans le venv) :**
```bash
pip install pyserial   # (déjà présent dans le venv Kyronex : version 3.5 OK)
```
```python
import serial, time
ser = serial.Serial("/dev/kitt_relais", 115200, timeout=1)  # nom stable via udev
time.sleep(2)  # laisser l'ESP32 booter après ouverture du port (le DTR le reset)

def porte(action: str):
    ser.write((action + "\n").encode())     # "OPEN" / "CLOSE" / "STOP"
    return ser.readline().decode().strip()   # "OK OPEN"
```

---

### 5.3 ARCHITECTURE C — ESP32 en Wi-Fi (RECOMMANDÉ pour le projet final)

**Côté ESP32 (firmware Arduino, serveur HTTP) :**
```cpp
#include <WiFi.h>
#include <WebServer.h>

const char* ssid = "TON_WIFI";
const char* password = "TON_MDP";
#define RELAY_OPEN  26
#define RELAY_CLOSE 27
WebServer server(80);

void handleOpen()  { digitalWrite(RELAY_CLOSE,LOW); digitalWrite(RELAY_OPEN,HIGH);  server.send(200,"text/plain","OPEN");  }
void handleClose() { digitalWrite(RELAY_OPEN,LOW);  digitalWrite(RELAY_CLOSE,HIGH); server.send(200,"text/plain","CLOSE"); }
void handleStop()  { digitalWrite(RELAY_OPEN,LOW);  digitalWrite(RELAY_CLOSE,LOW);  server.send(200,"text/plain","STOP");  }

void setup() {
  pinMode(RELAY_OPEN,OUTPUT); pinMode(RELAY_CLOSE,OUTPUT);
  WiFi.begin(ssid,password);
  while (WiFi.status()!=WL_CONNECTED){ delay(500); }
  server.on("/relay/open",  handleOpen);
  server.on("/relay/close", handleClose);
  server.on("/relay/stop",  handleStop);
  server.begin();
}
void loop(){ server.handleClient(); }
```

**Côté Jetson (Python async, s'intègre parfaitement à aiohttp déjà utilisé par Kyronex) :**
```python
import aiohttp
ESP32_URL = "http://192.168.129.50"   # IP fixe de l'ESP32 (réserve-la dans ta box)

async def porte(action: str):  # "open" / "close" / "stop"
    async with aiohttp.ClientSession() as s:
        async with s.get(f"{ESP32_URL}/relay/{action}", timeout=aiohttp.ClientTimeout(total=4)) as r:
            return await r.text()
```
> 💡 Donne à l'ESP32 une **IP fixe** (réservation DHCP dans la box via son adresse MAC).
> Variante encore plus robuste : **MQTT** (broker Mosquitto sur le Jetson, l'ESP32 s'abonne au topic
> `kitt/porte`). Ou **ESPHome** (firmware déclaratif YAML) si tu veux du clé-en-main.

---

## 6. INTÉGRATION DANS KYRONEX (le « function call » de KITT)

Le serveur a déjà un système de commandes directes : `_FUNC_PATTERNS` + `execute_function()`
dans `kyronex_server.py`. On ajoute la porte comme une nouvelle fonction, **sans LLM** (réponse 0 ms).

### 6.1 Ajouter le motif de détection (vers la ligne ~1919, liste `_FUNC_PATTERNS`)
```python
# Commande porte — ouvre / ferme / stop
(re.compile(r"\b(?:ouvre|ouvrir|déverrouille)\s+(?:la\s+|le\s+)?(?:porte|portail|garage)\b", re.I), "porte_open"),
(re.compile(r"\b(?:ferme|fermer|verrouille)\s+(?:la\s+|le\s+)?(?:porte|portail|garage)\b", re.I), "porte_close"),
(re.compile(r"\b(?:stop|arrête)\s+(?:la\s+)?porte\b", re.I), "porte_stop"),
```

### 6.2 Brancher l'action (dans `execute_function`, async — voir vers ~2344)
```python
elif func_type == "porte_open":
    # 🔒 Réserver à l'admin, comme l'extinction (réutilise _is_admin que j'ai ajouté à l'audit)
    if not _is_admin(user_name):
        return "Accès refusé. Seul mon conducteur autorisé peut commander la porte."
    await porte("open")          # Architecture C ; ou relais_on(0) en Architecture A
    return "J'ouvre la porte, partenaire."
elif func_type == "porte_close":
    if not _is_admin(user_name):
        return "Accès refusé."
    await porte("close")
    return "Je referme la porte."
elif func_type == "porte_stop":
    await porte("stop")
    return "Porte arrêtée."
```

> ✅ **Bonne nouvelle** : la fonction `_is_admin()` existe déjà (ajoutée lors de l'audit du 2026-06-12
> pour protéger l'extinction). On la **réutilise** pour que seul **Manix** puisse ouvrir la porte.
> Les autres utilisateurs reçoivent « Accès refusé ».

### 6.3 Sécurité logicielle — impulsion, pas maintien
Pour un moteur, prévois une **impulsion temporisée** côté ESP32 (ex. tourne 3 s puis stop auto), OU
côté Python un `relais_on(); await asyncio.sleep(3); relais_off()`. **Jamais** laisser un relais
collé indéfiniment sur un moteur sans fin de course.

---

## 7. SÉCURITÉ — RÉCAPITULATIF (à lire avant de câbler)

### Électrique ⚡
1. **Alimentation moteur séparée** de la logique (règle d'or §3.4).
2. **Masse commune** entre alim moteur et carte relais.
3. **Opto-isolation** sur la carte relais (protège le Jetson/ESP32).
4. **Diode de roue libre** sur le moteur (surtensions).
5. Vérifie la **tension/courant** du moteur vs. le **calibre des contacts** du relais (ex. 10 A / 250 V).
6. Si secteur 230 V impliqué → **prudence maximale**, boîtier fermé, pas de fils nus.

### Logicielle 🔒
1. **Admin only** : commande porte réservée à Manix via `_is_admin()` (déjà en place).
2. **Impulsion temporisée**, jamais de relais collé sur un moteur sans fin de course.
3. **Temps mort** entre OUVRE et FERME (anti court-circuit du pont en H).
4. **État connu au démarrage** : à l'init, mettre les deux relais OFF (moteur à l'arrêt).
5. **Fins de course** lues localement par l'ESP32 (Architecture C) = sécurité ultime.

---

## 8. PLAN DE TEST PROGRESSIF (ne pas tout faire d'un coup)

1. **Étape 1 — Identifier la carte** : lancer le test §0 (un clic = carte bitbang).
2. **Étape 2 — Permissions** : `usermod -aG dialout kitt` + règle udev (§5.0).
3. **Étape 3 — Clic à vide** : piloter le relais **sans rien câbler dessus**, juste écouter le clic.
4. **Étape 4 — LED test** : câbler une **LED + résistance** (ou une petite ampoule pile) sur COM/NO
   pour voir l'ouverture/fermeture **sans risque moteur**.
5. **Étape 5 — Moteur à vide** : brancher le moteur **avec son alim séparée**, hors de la porte.
6. **Étape 6 — 2 relais / sens** : valider OUVRE/FERME, vérifier le temps mort.
7. **Étape 7 — Fins de course** : ajouter les limit switches, tester l'arrêt auto.
8. **Étape 8 — Intégration KITT** : ajouter le function call, tester « KITT, ouvre la porte ».
9. **Étape 9 — Sur la vraie porte** : monter mécaniquement, régler les courses, valider.

---

## 9. LISTE DE COURSES / MATÉRIEL (selon l'architecture)

### Commun
- [ ] Carte relais (1, 2 ou 4 canaux) **avec opto-isolation** — 2 canaux mini pour ouvrir+fermer.
- [ ] Alimentation dédiée au moteur (tension/courant adaptés au moteur).
- [ ] 2 interrupteurs **fin de course** (limit switch).
- [ ] Fils, dominos/borniers, diode 1N4007.

### Architecture A (ce qui semble branché)
- [ ] Rien de plus côté commande — la carte FTDI bitbang fait tout. `pip install pylibftdi` + `libftdi1`.

### Architecture B / C
- [ ] Un **ESP32** (DevKit-C, WROOM-32, etc.).
- [ ] (C) IP fixe réservée dans la box pour l'ESP32.

---

## 10. COMMANDES VOCALES PRÉVUES (exemples)

| Tu dis… | KITT fait… |
|---|---|
| « KITT, ouvre la porte » | relais OUVRE (impulsion) → moteur ouvre |
| « Ferme la porte » | relais FERME → moteur referme |
| « Stop la porte » | coupe les deux relais |
| (un non-admin) « ouvre la porte » | « Accès refusé. Seul mon conducteur autorisé… » |

> Extensible plus tard : « allume le scanner », « démarre le moteur », « phares », etc. — chaque
> sortie = un canal de relais supplémentaire, même principe.

---

## 11. SOURCES (recherche du 2026-06-12)

**FTDI bitbang / cartes relais USB**
- [bitbangrelay · PyPI](https://pypi.org/project/bitbangrelay/) — outil cartes SainSmart FTDI FT232R/FT245R
- [pylibftdi — Bit-bang mode](https://pylibftdi.readthedocs.io/en/0.15.0/bitbang.html) — API `BitBangDevice`, code
- [pyftdi · PyPI](https://pypi.org/project/pyftdi/) — driver FTDI pur Python (GPIO/bitbang)
- [GitHub eblot/pyftdi](https://github.com/eblot/pyftdi) — support FT232R, GPIO
- [GitHub ladiko/relayctl](https://github.com/ladiko/relayctl) — contrôle CLI cartes SainSmart FTDI bitbang
- [GitHub phelps-matthew/sainsmart-relay](https://github.com/phelps-matthew/sainsmart-relay) — outils bit-bang SainSmart
- [pyrelayctl · PyPI](https://pypi.org/project/pyrelayctl/) — lib Python cartes relais FTDI
- [Bit-Bang FTDI USB-to-Serial (swharden)](https://swharden.com/blog/2018-06-03-bit-bang-ftdi-usb-to-serial-converters-to-drive-spi-devices/)
- [Programming FTDI devices in Python (iosoft)](https://iosoft.blog/2018/12/02/ftdi-python-part-1/)

**ESP32 relais / Wi-Fi / série**
- [GitHub rpavlyuk/ESPRelayBoard](https://github.com/rpavlyuk/ESPRelayBoard) — firmware ESP32 relais WiFi/WebAPI/MQTT/Home Assistant
- [Building a Smart Home Relay Control System with ESP32 (Tomer Klein, Medium)](https://medium.com/@tomer.klein/building-a-smart-home-relay-control-system-with-esp32-and-web-interface-5bf2da219ebc)
- [ESP32 Relay Module — Random Nerd Tutorials](https://randomnerdtutorials.com/esp32-relay-module-ac-web-server/)
- [ESP32 - Relay (esp32io.com)](https://esp32io.com/tutorials/esp32-relay)
- [ESP32 - 2-Channel Relay Module (esp32io.com)](https://esp32io.com/tutorials/esp32-2-channel-relay-module)
- [Interfacing a Relay Module With ESP32 (makerguides)](https://www.makerguides.com/interfacing-a-relay-module-with-esp32/)
- [How to Use ESPHome with ESP32 (teachmemicro)](https://www.teachmemicro.com/how-to-use-esphome-with-esp32-a-beginners-guide/)
- [ESP32/ESP8266 Arduino: Serial communication with Python (techtutorialsx)](https://techtutorialsx.com/2017/12/02/esp32-esp8266-arduino-serial-communication-with-python/)
- [Cross Platform serial communication with PySerial (xanthium)](https://www.xanthium.in/Cross-Platform-serial-communication-using-Python-and-PySerial)

**Moteur / H-bridge / porte**
- [Two Relay DC Motor Control (Simple H-bridge) — Instructables](https://www.instructables.com/Two-Relay-DC-Motor-Control-Simple-H-bridge/)
- [Control DC Motor direction using Relay based H-bridge (GoTechies)](https://gotechies.net/dc-motor-control-using-relays/)

---

## 12. RÉSUMÉ EN 6 LIGNES (si tu lis vite plus tard)
1. Branché = **puce FTDI FT232R** (`/dev/ttyUSB0`, série `AL03EICJ`), silence série → probablement **carte relais bitbang**.
2. Plus direct : **Architecture A** (`pip install pylibftdi` + `libftdi1`, piloter `bb.port` par bit).
3. Plus robuste pour la porte finale : **Architecture C** (ESP32 en Wi-Fi, HTTP/MQTT).
4. Un moteur de porte = **2 relais** (ouvre/ferme) + **fins de course** + **alim moteur séparée**.
5. Intégration KITT = un **function call** « ouvre la porte » réservé à l'admin via `_is_admin()` (déjà codé).
6. Avant tout : `usermod -aG dialout kitt` + règle udev pour un nom de port stable.

---
*Fin du dossier. Rien n'a été installé ni câblé — document de préparation uniquement.*
