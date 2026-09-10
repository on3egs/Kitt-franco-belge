# KITT Nemotron — Reconstruction 2026-08-19/20

Machine : **KITT-IA** (192.168.129.27) — Jetson Orin Nano 8GB Dev Kit Super
OS : **JetPack 7.2.1** (L4T r39.2.1, CUDA 13.2, TensorRT 10.16, Python 3.12.3)
Mode : MAXN_SUPER + jetson_clocks (service `jetson-clocks-max.service`)

## Architecture finale

```
Navigateur ──HTTPS:3000 / HTTP:3001──► kyronex_server.py (aiohttp)
                                          ├─► llama-server :8080  NVIDIA-Nemotron-3-Nano-4B Q4_K_M (GGUF officiel NVIDIA, mars 2026)
                                          ├─► faster-whisper CUDA  whisper-base CT2 int8_float16
                                          └─► Piper (onnxruntime)  guy_chapelier (KITT) + manix_high (Manix)
Tunnel public : cloudflared quick → port 3001  (service cloudflared-quick.service)
```

## Sources utilisées (SSD Samsung EVO)
- Serveur : `K4000_BACKUPS/JETSON_FLEET_UPDATE_20260815/kitt-local/kyronex_server.py` (canonique machine)
- UI + prononciation : `.../kitt-ajx/` (même génération 2026-08-15)
- Venv Python 3.12 complet : `K4000_COMPLET_20260813_005000/projet/Kironext-K-4000/.venv`
- CTranslate2 CUDA : `.../third_party/ctranslate2-cuda/lib` → `/home/KITT/CTranslate2/install/lib`
- llama.cpp précompilé JP7.2/CUDA13.2/SM87 : `Kyronext-K4000-portable-20260726/.../build-kyronext` → `/home/KITT/llama.cpp/`
- Vraies voix (les locales étaient des placeholders identiques) : `guy_chapelier.onnx` (model_guy), `manix.onnx` (model_manix 114MB) → `manix_high.onnx`, `guy_chapelier_v3.onnx`

## Modifications apportées au code
1. `piper_gpu.py` : `_trt_cache` → `<projet>/.trt_cache` (chemin /home/manix inexistant ici).
2. **Nouveau `piper_phonemize.py`** (shim) : piper-phonemize absent en aarch64/py3.12 → wrapper sur `piper.espeakbridge` du venv. Sans lui : "TTS: aucun audio genere" partout.
3. `kyronex_server.py` L1462 : regex `^(?i)` → `(?i)^` (crash Python 3.12, le payload `done` n'était jamais envoyé).
4. `kyronex_server.py` : `_LLM_TEMPLATE_KWARGS = {"enable_thinking": False}` + ajout `chat_template_kwargs` aux 5 payloads `/v1/chat/completions` — sinon Nemotron 3 vide `max_tokens` dans `<think>` → réponses vides.
5. `kyronex_server.py` : garde-fou final `[RAPPEL INTERNE]` dans `get_system_prompt()` — Nemotron recopiait le bloc personnalité quand mémoire/awareness vides.
6. Venv : lib CPU `ctranslate2.libs/libctranslate2-1e14d83c.so.4.8.0` remplacée par le build CUDA 4.8.1 (backup `.cpu-bak`). `libfmt9` installé.
7. Symlink `/home/kitt → /home/KITT` (chemins flotte codés en dur).

## Performances mesurées (MAXN_SUPER, clocks max)
| Métrique | Valeur |
|---|---|
| llama-server load | ~8 s |
| Prompt processing | 440-530 tok/s (préfixe système caché après 1re requête) |
| Génération Nemotron 4B Q4_K_M | **18,5-19,2 tok/s** |
| Chat court (chaud) | **~2,3 s total** (llm 2,2s + tts 0,1s) |
| TTS Piper CPU | 368 ms pour 2,7 s audio (RTF 0,13) ; 53 phrases en cache |
| STT whisper-base CUDA | **1,6 s** roundtrip (WAV 2,7 s) |
| RAM au repos (tout chargé) | 6,6-6,9 Go / 7,5 Go — tendue mais stable |

## Services systemd (activés au boot)
- `llama-nemotron.service` — llama-server :8080 (`-ngl 99 --ctx-size 4096 --batch-size 512 --threads 6 --mlock -fa on`)
- `kitt-ai.service` — kyronex_server.py (HTTPS :3000, HTTP :3001, WHISPER_MODEL=whisper-base)
- `cloudflared-pascal.service` — tunnel nommé permanent kitt-pascal.kitt-franco-belge.be
- `jetson-clocks-max.service` — clocks max au boot

## Accès
- LAN : `https://192.168.129.27:3000` (cert auto-signé) — HTTP `http://192.168.129.27:3001`
- Public (PERMANENT) : **https://kitt-pascal.kitt-franco-belge.be** — tunnel Cloudflare nommé `efbfc546-c204-44cc-a8d9-c3b1ba7b086c` (service `cloudflared-pascal.service`, credentials restaurées depuis `~/.cloudflared_backup/`, route DNS CNAME créée le 2026-08-20). NB : l'ingress du tunnel sert aussi `kitt.kitt-franco-belge.be` → cette machine (config de la session du 20/08 ~02h).

## Reste à faire (dépendances externes)
1. **Push GitHub** (portail + tunnel_pascal.json online) : aucune clé SSH ni token valide (testé local + k2). Besoin : token GitHub on3egs ou push depuis la machine habituelle. Changements prêts dans `/home/KITT/Kitt-franco-belge` (bouton K.I.T.T. PASCAL activé, spec « ORIN NANO 8GB SUPER / NEMOTRON 3 NANO 4B », tunnel_pascal.json → online/permanent avec l'URL ci-dessus).
3. Option perf : whisper-small au lieu de base si on libère ~500 Mo (ex. session GNOME désactivée) — meilleure précision FR (« véhicule » vs « vécule »).
4. Option perf : onnxruntime GPU/TensorRT pour Piper (TTS ~50 ms au lieu de ~370 ms).

## Convention flotte
Restauration par sous-dossier machine respectée. « Manix » jamais altéré phonétiquement. `paplay` uniquement. Auth web désactivée tant que `KYRONEX_PASSWORD` est vide.
