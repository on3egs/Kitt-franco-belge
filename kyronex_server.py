#!/usr/bin/env python3
"""
KYRONEX — Kinetic Yielding Responsive Onboard Neural EXpert
Chatbot vocal IA rétro-futuriste embarqué.
Tourne sur NVIDIA Jetson Orin Nano Super avec CUDA + Piper TTS.

Copyright 2026 ByManix (Emmanuel Gelinne) — Elastic License 2.0
"""

import asyncio
import hashlib
import json
import logging
import os
import re
import secrets
import ssl
import subprocess
import time
import uuid
import wave
from datetime import datetime, timezone, timedelta
from pathlib import Path

import tempfile
import numpy as np
os.environ["ORT_LOG_LEVEL"] = "ERROR"

# ── Logger VRAM/événements pour debug OOM ────────────────────────────────
_vram_logger = logging.getLogger("vram")
_vram_logger.setLevel(logging.DEBUG)
_vram_fh = logging.FileHandler("/tmp/karr_vram.log")
_vram_fh.setFormatter(logging.Formatter("%(asctime)s | %(message)s", datefmt="%H:%M:%S"))
_vram_logger.addHandler(_vram_fh)

def _get_vram_info() -> str:
    """Lit RAM libre, fragmentation mémoire, et température GPU."""
    # RAM libre
    ram_free_mb = -1
    ram_used_mb = -1
    try:
        with open("/proc/meminfo") as f:
            mem = {}
            for line in f:
                parts = line.split()
                if parts[0] in ("MemTotal:", "MemAvailable:", "Buffers:", "Cached:"):
                    mem[parts[0]] = int(parts[1])
            ram_free_mb = mem.get("MemAvailable:", 0) // 1024
            ram_used_mb = (mem.get("MemTotal:", 0) - mem.get("MemAvailable:", 0)) // 1024
    except Exception:
        pass
    # Fragmentation mémoire (largest free block)
    lfb = "?"
    try:
        with open("/proc/buddyinfo") as f:
            for line in f:
                parts = line.split()
                # Trouver le plus grand bloc libre (dernier non-zero)
                counts = [int(x) for x in parts[4:]]  # skip "Node X, zone NAME"
                for i in range(len(counts) - 1, -1, -1):
                    if counts[i] > 0:
                        block_mb = (4 * (2 ** i)) // 1024  # 4KB base
                        lfb = f"{counts[i]}x{block_mb}MB"
                        break
    except Exception:
        pass
    # Temp GPU
    try:
        with open("/sys/devices/virtual/thermal/thermal_zone0/temp") as f:
            temp_c = int(f.read().strip()) / 1000
    except Exception:
        temp_c = -1
    return f"RAM={ram_used_mb}/{ram_used_mb + ram_free_mb}MB(libre:{ram_free_mb}MB) | LFB={lfb} | T={temp_c:.0f}C"

def vlog(event: str):
    """Log un événement avec infos VRAM/RAM/Temp."""
    info = _get_vram_info()
    _vram_logger.info(f"{event} | {info}")
    print(f"[VRAM] {event} | {info}", flush=True)

import aiohttp as aiohttp_client
from aiohttp import web
# Preload CTranslate2 CUDA-compiled lib avant faster_whisper
import ctypes as _ct2_ctypes
import os as _ct2_os
_ct2_libdir = '/home/karr/kitt-ai/venv/lib/python3.10/site-packages/ctranslate2.libs'
try:
    _ct2_ctypes.CDLL(_ct2_os.path.join(_ct2_libdir, 'libgomp-a49a47f9.so.1.0.0'), mode=_ct2_ctypes.RTLD_GLOBAL)
    _ct2_ctypes.CDLL(_ct2_os.path.join(_ct2_libdir, 'libctranslate2-ac01f8af.so.4.7.1'), mode=_ct2_ctypes.RTLD_GLOBAL)
    print('[OK] CTranslate2 CUDA libs preloaded', flush=True)
except Exception as _e_ct2:
    print(f'[WARN] CTranslate2 preload: {_e_ct2}', flush=True)
from faster_whisper import WhisperModel
from piper_gpu import PiperGPU, MultilingualTTS, _detect_lang, _map_whisper_lang

# ── Auth (désactivable : sans KYRONEX_PASSWORD, pas de login) ────────────
ACCESS_PASSWORD = os.environ.get("KYRONEX_PASSWORD", "")
_auth_tokens: set = set()

LOGIN_PAGE = """<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no,viewport-fit=cover">
<title>KITT — Accès</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a0a;color:#e0e0e0;font-family:'Courier New',monospace;
min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;align-items:center;
padding:40px 20px;overflow-y:auto}
h1{color:#ff3333;text-shadow:0 0 20px #ff0000;letter-spacing:4px;margin-bottom:8px;margin-top:20px}
.sub{color:#444;font-size:0.7em;margin-bottom:24px}
.welcome{background:#111;border:1px solid #222;border-radius:10px;padding:20px;
max-width:min(520px,90vw);margin-bottom:28px;line-height:1.6;font-size:0.82em;color:#999;text-align:justify}
.welcome p{margin-bottom:10px}
.welcome p:last-child{margin-bottom:0}
.welcome strong{color:#cc3333}
form{display:flex;flex-direction:column;gap:12px;width:min(280px,80vw)}
input{background:#111;border:1px solid #333;color:#e0e0e0;padding:14px;border-radius:6px;
font-family:inherit;font-size:16px;text-align:center;outline:none}
input:focus{border-color:#ff3333;box-shadow:0 0 10px #ff000033}
button{background:#aa0000;color:white;border:none;padding:14px;border-radius:6px;
cursor:pointer;font-family:inherit;font-weight:bold;font-size:1em}
button:hover{background:#cc0000}
.err{color:#aa0000;font-size:0.8em;text-align:center;min-height:1.2em}
.btns{display:flex;gap:10px;margin-bottom:20px}
.speaker,.infobtn{background:none;border:1px solid #333;color:#666;padding:8px 16px;border-radius:6px;
cursor:pointer;font-size:0.75em}
.speaker:hover,.infobtn:hover{border-color:#ff3333;color:#ccc}
.speaker.speaking{border-color:#ff3333;color:#ff3333}
.infobtn.active{border-color:#ff9900;color:#ff9900}
.overlay{display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.92);
z-index:100;justify-content:center;align-items:center;padding:20px}
.overlay.show{display:flex}
.overlay-box{background:#111;border:1px solid #333;border-radius:12px;padding:24px;
max-width:min(520px,90vw);max-height:80vh;overflow-y:auto;line-height:1.7;font-size:0.82em;
color:#bbb;text-align:justify}
.overlay-box p{margin-bottom:12px}
.overlay-box p:last-child{margin-bottom:0}
.overlay-title{color:#ff9900;font-size:1.1em;font-weight:bold;margin-bottom:14px;text-align:center;letter-spacing:2px}
.overlay-close{display:block;margin:18px auto 0;background:#aa0000;color:white;border:none;
padding:10px 28px;border-radius:6px;cursor:pointer;font-family:inherit;font-size:0.9em}
.overlay-close:hover{background:#cc0000}
.overlay-speak{display:block;margin:10px auto 0;background:none;border:1px solid #333;color:#666;
padding:8px 20px;border-radius:6px;cursor:pointer;font-size:0.75em}
.overlay-speak:hover{border-color:#ff9900;color:#ccc}
.overlay-speak.speaking{border-color:#ff9900;color:#ff9900}
</style></head><body>
<h1>KITT</h1>
<div class="sub">KNIGHT INDUSTRIES TWO THOUSAND — By Manix</div>
<div class="btns">
<button class="speaker" id="btnSpeak" onclick="speakWelcome()">LIRE LE MESSAGE</button>
<button class="infobtn" id="btnInfo" onclick="showInfo()">INFO</button>
</div>
<div class="welcome" id="welcomeText">
<p>Bienvenue.</p>
<p>Vous accédez actuellement à une version en cours de développement d'un système expérimental d'intelligence artificielle locale.
Ce projet est encore en phase de construction, d'optimisation et de validation. Certaines fonctionnalités peuvent donc être incomplètes, instables ou évoluer au fil du temps.</p>
<p>À l'origine, le projet portait le nom <strong>KNIGHT Reader</strong>, en référence à l'univers de la série K2000.
Toutefois, il a été porté à notre attention que cette appellation pouvait entrer en conflit avec des droits de propriété intellectuelle protégés.
Par respect du cadre légal et des recommandations reçues, ce nom ne peut plus être utilisé publiquement.</p>
<p>Suite à ces échanges, il nous a été conseillé d'adopter une identité distincte et conforme aux règles en vigueur.
Dans cette démarche responsable, le développement du projet se poursuit avec le soutien moral et technique des partenaires qui encouragent son évolution dans un cadre respectueux, éthique et légal.</p>
<p>Vous consultez donc ici une plateforme expérimentale indépendante, en constante amélioration, destinée à la recherche, à la passion technologique et à l'innovation locale.</p>
<p>Merci pour votre compréhension, votre bienveillance et votre intérêt envers ce travail en devenir.</p>
</div>
<form method="POST" action="/login">
<input type="password" name="password" placeholder="Mot de passe" autofocus>
<button type="submit">ENTRER</button>
<div class="err">__ERR__</div>
</form>
<div class="overlay" id="infoOverlay" onclick="if(event.target===this)closeInfo()">
<div class="overlay-box">
<div class="overlay-title">INFO — CONTEXTE DU PROJET</div>
<div id="infoText">
<p>Le projet s'articule autour d'un développement technologique encadré par une reconnaissance attribuée par NVIDIA, liée à un projet IoT et robotique.</p>
<p>Dans ce cadre, un accompagnement technique a été accordé, sous l'indicatif Manix, pour des phases d'exploration, d'expérimentation et d'alignement aux standards.</p>
<p>Ce contexte s'inscrit dans un cadre de conformité, garantissant une continuité de recherche et une évolution sous des conditions appropriées.</p>
<p>L'exigence de rigueur, de sécurité et de responsabilité reste au cœur de l'initiative, en cohérence avec les attentes de l'ingénierie avancée.</p>
</div>
<button class="overlay-speak" id="btnSpeakInfo" onclick="speakInfo()">LIRE</button>
<button class="overlay-close" onclick="closeInfo()">FERMER</button>
</div>
</div>
<script>
var synth=window.speechSynthesis,speaking=false,currentTarget='welcome';
function getFrVoice(){
  var v=synth.getVoices();
  for(var i=0;i<v.length;i++){if(v[i].lang.startsWith('fr'))return v[i]}
  return null;
}
function stopSpeak(){
  synth.cancel();speaking=false;
  document.getElementById('btnSpeak').textContent='LIRE LE MESSAGE';
  document.getElementById('btnSpeak').classList.remove('speaking');
  document.getElementById('btnSpeakInfo').textContent='LIRE';
  document.getElementById('btnSpeakInfo').classList.remove('speaking');
}
function speakText(text,btn,label){
  if(speaking){stopSpeak();return}
  var u=new SpeechSynthesisUtterance(text);
  u.lang='fr-FR';u.rate=0.95;
  var v=getFrVoice();if(v)u.voice=v;
  u.onstart=function(){speaking=true;btn.textContent='STOP';btn.classList.add('speaking')};
  u.onend=function(){speaking=false;btn.textContent=label;btn.classList.remove('speaking')};
  u.onerror=function(){speaking=false;btn.textContent=label;btn.classList.remove('speaking')};
  synth.speak(u);
}
function speakWelcome(){
  speakText(document.getElementById('welcomeText').innerText,document.getElementById('btnSpeak'),'LIRE LE MESSAGE');
}
function speakInfo(){
  speakText(document.getElementById('infoText').innerText,document.getElementById('btnSpeakInfo'),'LIRE');
}
function showInfo(){
  stopSpeak();
  document.getElementById('infoOverlay').classList.add('show');
  document.getElementById('btnInfo').classList.add('active');
  setTimeout(speakInfo,300);
}
function closeInfo(){
  stopSpeak();
  document.getElementById('infoOverlay').classList.remove('show');
  document.getElementById('btnInfo').classList.remove('active');
}
window.addEventListener('load',function(){
  if(synth.getVoices().length)speakWelcome();
  else synth.onvoiceschanged=function(){speakWelcome()};
});
</script>
</body></html>"""


async def handle_login_page(request: web.Request) -> web.Response:
    return web.Response(text=LOGIN_PAGE.replace("__ERR__", ""), content_type="text/html")


async def handle_login_post(request: web.Request) -> web.Response:
    data = await request.post()
    pw = data.get("password", "")
    if pw == ACCESS_PASSWORD:
        token = secrets.token_hex(16)
        _auth_tokens.add(token)
        resp = web.HTTPFound("/")
        resp.set_cookie("kyronex_auth", token, max_age=86400, httponly=True, samesite="Lax", secure=True)
        return resp
    page = LOGIN_PAGE.replace("__ERR__", "Mot de passe incorrect")
    return web.Response(text=page, content_type="text/html", status=401)


@web.middleware
async def auth_middleware(request: web.Request, handler):
    if not ACCESS_PASSWORD:
        return await handler(request)
    if request.path in ("/login",):
        return await handler(request)
    # Monitor WS: protégé par IP locale, pas par cookie
    if request.path == "/api/monitor/ws":
        return await handler(request)
    token = request.cookies.get("kyronex_auth", "")
    if token in _auth_tokens:
        return await handler(request)
    if request.path.startswith("/api/"):
        return web.json_response({"error": "Non autorisé"}, status=401)
    raise web.HTTPFound("/login")

# ── Chemins ──────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent
PIPER_MODEL = BASE_DIR / "models" / "guy_chapelier.onnx"
LLAMA_SERVER = "http://127.0.0.1:11434"
LLM_MODEL = "gemma4:e2b"
STATIC_DIR = BASE_DIR / "static"
AUDIO_DIR = BASE_DIR / "audio_cache"
AUDIO_DIR.mkdir(exist_ok=True)
LOGS_DIR = BASE_DIR / "logs"
LOGS_DIR.mkdir(exist_ok=True)
USERS_FILE = BASE_DIR / "users.json"
STATS_FILE = BASE_DIR / "conn_stats.json"
VISION_SCRIPT = BASE_DIR / "vision.py"
# ── Mémoire persistante ──────────────────────────────────────────────────
MEMORY_FILE = BASE_DIR / "memory.json"
USER_MEMORIES_DIR = BASE_DIR / "user_memories"
USER_MEMORIES_DIR.mkdir(exist_ok=True)

# ── Système Conversations ─────────────────────────────────────────────────
CONV_DATA_DIR    = BASE_DIR / 'conv_data'
CONV_USERS_FILE  = CONV_DATA_DIR / 'conv_users.json'
CONV_CONFIG_FILE = CONV_DATA_DIR / 'conv_config.json'
CONV_STORE_DIR   = CONV_DATA_DIR / 'conversations'
CONV_DATA_DIR.mkdir(exist_ok=True)
CONV_STORE_DIR.mkdir(exist_ok=True)
_conv_admin_sessions: dict = {}   # token → expiry timestamp
_CONV_ADMIN_HASH = hashlib.sha256(b"Microsoft198@").hexdigest()


def _conv_load_users() -> dict:
    try:
        return json.loads(CONV_USERS_FILE.read_text()) if CONV_USERS_FILE.exists() else {}
    except Exception:
        return {}


def _conv_save_users(u: dict):
    CONV_USERS_FILE.write_text(json.dumps(u, indent=2, ensure_ascii=False))


def _conv_safe(name: str) -> str:
    """Transforme un nom en chemin sûr (alphanum + _ -)."""
    return re.sub(r'[^a-zA-Z0-9_\-]', '_', name)


def _conv_check_token(request) -> bool:
    """Vérifie le token admin X-Conv-Token dans les headers."""
    t = request.headers.get('X-Conv-Token', '')
    if t in _conv_admin_sessions:
        if time.time() < _conv_admin_sessions[t]:
            return True
        del _conv_admin_sessions[t]
    return False

def _load_memory() -> dict:
    if MEMORY_FILE.exists():
        try:
            return json.loads(MEMORY_FILE.read_text())
        except Exception:
            pass
    return {"facts": [], "preferences": {}}

_memory = _load_memory()  # mémoire globale conservée pour rétro-compat

# ── Mémoire par utilisateur ───────────────────────────────────────────────

def _mac_to_key(mac: str) -> str:
    """Convertit une MAC/IP en nom de fichier sûr."""
    return re.sub(r'[^a-zA-Z0-9_\-]', '_', mac)

def _load_user_memory(mac: str) -> dict:
    """Charge la mémoire d'un utilisateur (par MAC/IP)."""
    if not mac:
        return {"facts": [], "summaries": []}
    f = USER_MEMORIES_DIR / f"{_mac_to_key(mac)}.json"
    if f.exists():
        try:
            return json.loads(f.read_text())
        except Exception:
            pass
    return {"facts": [], "summaries": []}

def _save_user_memory(mac: str, mem: dict):
    """Sauvegarde la mémoire d'un utilisateur."""
    if not mac:
        return
    f = USER_MEMORIES_DIR / f"{_mac_to_key(mac)}.json"
    f.write_text(json.dumps(mem, indent=2, ensure_ascii=False))

# Patterns pour extraire des faits mémorisables
_MEMORY_EXTRACT = re.compile(
    r"(?:je m.appelle|mon (?:nom|prénom) (?:est|c.est)|"
    r"j.aime|j.adore|je déteste|je préfère|"
    r"je suis|j.habite|je travaille|"
    r"mon (?:chat|chien|animal|voiture|métier|travail|hobby|passion)|"
    r"ma (?:femme|copine|fille|mère|soeur|voiture|maison|passion)|"
    r"souviens.toi|retiens|n.oublie pas|rappelle.toi)",
    re.I,
)

_MEMORY_FORGET = re.compile(
    r"(?:oublie|efface|supprime|retire).*(?:mémoire|souvenir|tu sais sur moi)",
    re.I,
)

def extract_memory_fact(user_msg: str, user_name: str) -> str | None:
    """Extrait un fait mémorisable du message utilisateur."""
    if _MEMORY_EXTRACT.search(user_msg):
        return f"[{user_name}] {user_msg}"
    return None

def add_memory(fact: str, user: str = "", mac: str = ""):
    """Ajoute un fait à la mémoire de l'utilisateur (par MAC, max 50 faits)."""
    mem = _load_user_memory(mac)
    mem["facts"].append({
        "fact": fact,
        "user": user,
        "date": datetime.now().isoformat()[:10],
    })
    if len(mem["facts"]) > 50:
        mem["facts"] = mem["facts"][-50:]
    _save_user_memory(mac, mem)
    print(f"[MEMORY] {user}: {fact[:60]}")

def clear_memory_for_user(user: str, mac: str = ""):
    """Efface les souvenirs d'un utilisateur."""
    mem = _load_user_memory(mac)
    mem["facts"] = []
    _save_user_memory(mac, mem)
    print(f"[MEMORY] Mémoire effacée pour {user}")

def get_memory_context(mac: str = "") -> str:
    """Retourne les souvenirs + résumé session précédente pour le system prompt."""
    mem = _load_user_memory(mac)
    parts = []
    if mem["facts"]:
        lines = [f"- {f['fact']}" for f in mem["facts"][-5:]]
        parts.append("Tu te souviens de ces faits :\n" + "\n".join(lines))
    if mem.get("summaries"):
        last = mem["summaries"][-1]
        parts.append(f"Votre dernière conversation ({last['date']}) : {last['text']}")
    return ("\n" + "\n".join(parts)) if parts else ""


VISION_KEYWORDS = re.compile(
    r"\b(qu.?est.ce que tu vois|qu.?est.ce que je porte|qu.?est.ce que je tiens|"
    r"regarde.moi|devant toi|camera|caméra|"
    r"comment je suis habill|de quelle couleur|tu me vois|tu vois quoi|"
    r"décris.moi|décris ce que|analyse.moi|scanne|scanner)\b",
    re.IGNORECASE,
)
VISION_COOLDOWN = 30  # secondes minimum entre 2 captures auto
_last_vision_time = 0.0

# ── Session HTTP persistante pour le LLM ─────────────────────────────────
_llm_session: aiohttp_client.ClientSession | None = None

async def get_llm_session() -> aiohttp_client.ClientSession:
    global _llm_session
    if _llm_session is None or _llm_session.closed:
        _llm_session = aiohttp_client.ClientSession(
            timeout=aiohttp_client.ClientTimeout(total=60),
        )
    return _llm_session

# ── Monitoring: résolution MAC, identité, WebSocket ──────────────────────

def resolve_mac(ip: str) -> str:
    """Résout l'adresse MAC depuis /proc/net/arp (lecture microseconde)."""
    try:
        with open("/proc/net/arp", "r") as f:
            for line in f:
                parts = line.split()
                if parts and parts[0] == ip:
                    mac = parts[3].upper()
                    if mac != "00:00:00:00:00:00":
                        return mac
    except Exception:
        pass
    return ip  # fallback: utilise l'IP comme identifiant


def _load_users() -> dict:
    if USERS_FILE.exists():
        try:
            return json.loads(USERS_FILE.read_text())
        except Exception:
            pass
    return {}


def _save_users(users: dict):
    USERS_FILE.write_text(json.dumps(users, indent=2, ensure_ascii=False))


_users: dict = _load_users()

# ── Helpers utilisateurs (rétro-compat : _users[mac] peut être str ou dict) ──

def _get_user_name(mac: str) -> str:
    u = _users.get(mac, "")
    return u.get("name", "") if isinstance(u, dict) else u

def _get_user_lang(mac: str) -> str:
    u = _users.get(mac, {})
    return u.get("lang", "") if isinstance(u, dict) else ""

def _update_user(mac: str, name: str = None, lang: str = None):
    u = _users.get(mac, {})
    if isinstance(u, str):
        u = {"name": u}
    if name is not None:
        u["name"] = name
    if lang is not None:
        u["lang"] = lang
    _users[mac] = u
    _save_users(_users)

# ── Statistiques de connexion ─────────────────────────────────────────────

def _load_conn_stats() -> dict:
    if STATS_FILE.exists():
        try:
            return json.loads(STATS_FILE.read_text())
        except Exception:
            pass
    return {"connections": []}

def _save_conn_stats():
    STATS_FILE.write_text(json.dumps(_conn_stats, ensure_ascii=False))

_conn_stats: dict = _load_conn_stats()
_active_sessions: dict = {}  # {session_id: {ip, mac, name, lang, last_seen, first_seen}}

def _log_new_connection(ip: str, mac: str, name: str, lang: str, session_id: str):
    _conn_stats["connections"].append({
        "ts": time.time(), "ip": ip, "mac": mac,
        "name": name, "lang": lang, "session_id": session_id
    })
    if len(_conn_stats["connections"]) > 2000:
        _conn_stats["connections"] = _conn_stats["connections"][-2000:]
    _save_conn_stats()

def _prune_active_sessions():
    now = time.time()
    stale = [sid for sid, s in _active_sessions.items() if now - s["last_seen"] > 90]
    for sid in stale:
        del _active_sessions[sid]


def get_user_display_name(request: web.Request) -> str:
    """Retourne le nom affiché pour l'utilisateur de cette requête."""
    peername = request.transport.get_extra_info("peername")
    ip = peername[0] if peername else "inconnu"
    mac = resolve_mac(ip)
    name = _get_user_name(mac)
    if name:
        return name
    # Nom court depuis l'IP
    return ip.split(".")[-1] if "." in ip else ip


# ── WebSocket Monitor ────────────────────────────────────────────────────

_monitor_ws: set = set()

_LOCAL_IP_PREFIXES = ("127.", "192.168.", "10.")


def _is_local_ip(ip: str) -> bool:
    if ip.startswith(_LOCAL_IP_PREFIXES):
        return True
    # 172.16.0.0 – 172.31.255.255
    if ip.startswith("172."):
        parts = ip.split(".")
        if len(parts) >= 2:
            try:
                second = int(parts[1])
                if 16 <= second <= 31:
                    return True
            except ValueError:
                pass
    return False


async def broadcast_monitor(event: dict):
    """Envoie un événement à tous les monitors connectés + log JSONL."""
    event["timestamp"] = datetime.now(timezone.utc).isoformat()
    msg = json.dumps(event, ensure_ascii=False)
    # WebSocket broadcast
    if _monitor_ws:
        print(f"[MONITOR] Broadcast → {len(_monitor_ws)} client(s): {event.get('type')}")
    dead = set()
    for ws in _monitor_ws:
        try:
            await ws.send_str(msg)
        except Exception:
            dead.add(ws)
    if dead:
        _monitor_ws.difference_update(dead)
    # JSONL logging
    try:
        with open(LOGS_DIR / "conversations.jsonl", "a") as f:
            f.write(msg + "\n")
    except Exception:
        pass


async def handle_monitor_ws(request: web.Request) -> web.WebSocketResponse:
    """GET /api/monitor/ws — WebSocket restreint aux IPs locales."""
    peername = request.transport.get_extra_info("peername")
    ip = peername[0] if peername else ""
    if not _is_local_ip(ip):
        return web.json_response({"error": "Accès refusé"}, status=403)

    ws = web.WebSocketResponse()
    await ws.prepare(request)
    _monitor_ws.add(ws)
    print(f"[MONITOR] Client connecté: {ip}")
    try:
        async for msg in ws:
            pass  # Le monitor est en lecture seule
    finally:
        _monitor_ws.discard(ws)
        print(f"[MONITOR] Client déconnecté: {ip}")
    return ws


async def handle_set_name(request: web.Request) -> web.Response:
    """POST /api/set-name — Associe un nom au MAC du client."""
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "JSON invalide"}, status=400)
    name = body.get("name", "").strip()[:30]
    if not name:
        return web.json_response({"error": "Nom requis"}, status=400)
    # Filtre sécurité — refuser les noms qui ressemblent à des mots de passe ou codes
    _FORBIDDEN_NAMES = re.compile(r'^[0-9]{3,}$|^(admin|root|sudo|kitt|kyronex|password|mdp|code|1982|5505)$', re.I)
    if _FORBIDDEN_NAMES.match(name) or len(name) < 2:
        return web.json_response({"error": "Nom invalide"}, status=400)
    lang = body.get("lang", "").strip()[:5]
    peername = request.transport.get_extra_info("peername")
    ip = peername[0] if peername else "inconnu"
    mac = resolve_mac(ip)
    _update_user(mac, name=name, lang=lang if lang else None)
    print(f"[USERS] {mac} ({ip}) → {name} lang={lang or '?'}")
    return web.json_response({"ok": True, "name": name, "mac": mac})


async def handle_whoami(request: web.Request) -> web.Response:
    """GET /api/whoami — Retourne le nom stocké pour ce client."""
    peername = request.transport.get_extra_info("peername")
    ip = peername[0] if peername else "inconnu"
    mac = resolve_mac(ip)
    name = _get_user_name(mac)
    lang = _get_user_lang(mac)
    return web.json_response({"name": name, "mac": mac, "ip": ip, "lang": lang})


async def handle_set_lang(request: web.Request) -> web.Response:
    """POST /api/set-lang — Enregistre la préférence de langue."""
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "JSON invalide"}, status=400)
    lang = body.get("lang", "").strip()[:5]
    if lang not in _LANG_NAMES:
        return web.json_response({"error": f"Langue inconnue: {lang}"}, status=400)
    peername = request.transport.get_extra_info("peername")
    ip = peername[0] if peername else "inconnu"
    mac = resolve_mac(ip)
    _update_user(mac, lang=lang)
    print(f"[LANG] {mac} ({ip}) préférence → {lang}")
    return web.json_response({"ok": True, "lang": lang})


async def handle_ping(request: web.Request) -> web.Response:
    """POST /api/ping — Heartbeat session (toutes les 30s côté client)."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    session_id = body.get("session_id", "")
    if not session_id:
        return web.json_response({"ok": False}, status=400)
    peername = request.transport.get_extra_info("peername")
    ip = peername[0] if peername else "inconnu"
    mac = resolve_mac(ip)
    name = body.get("name", "") or _get_user_name(mac)
    lang = _get_user_lang(mac)
    now = time.time()
    is_new = session_id not in _active_sessions
    _active_sessions[session_id] = {
        "ip": ip, "mac": mac, "name": name, "lang": lang,
        "last_seen": now,
        "first_seen": now if is_new else _active_sessions.get(session_id, {}).get("first_seen", now)
    }
    if is_new:
        _log_new_connection(ip, mac, name, lang, session_id)
        print(f"[PING] Nouvelle session: {name} ({ip}) lang={lang}")
    _prune_active_sessions()
    return web.json_response({"ok": True, "active": len(_active_sessions)})


async def handle_stats(request: web.Request) -> web.Response:
    """GET /api/stats — Statistiques de connexion."""
    _prune_active_sessions()
    now = time.time()
    ts_24h = now - 86400
    ts_7d = now - 604800
    conns = _conn_stats.get("connections", [])
    # Compter sessions uniques par fenêtre temporelle
    seen_24h = set()
    seen_7d = set()
    recent_ips = []
    for c in reversed(conns):
        ts = c.get("ts", 0)
        sid = c.get("session_id", c.get("ip", ""))
        if ts >= ts_24h:
            seen_24h.add(sid)
        if ts >= ts_7d:
            seen_7d.add(sid)
        ip = c.get("ip", "")
        if ip and ip not in recent_ips:
            recent_ips.append(ip)
        if len(recent_ips) >= 15:
            break
    active_list = []
    for sid, s in _active_sessions.items():
        dt = datetime.fromtimestamp(s["first_seen"]).strftime("%H:%M")
        active_list.append({
            "ip": s["ip"], "name": s["name"] or "?", "lang": s["lang"] or "?", "since": dt
        })
    return web.json_response({
        "current": len(_active_sessions),
        "last_24h": len(seen_24h),
        "last_7d": len(seen_7d),
        "active_sessions": active_list,
        "recent_ips": recent_ips[:10]
    })


async def handle_visitors(request: web.Request) -> web.Response:
    """GET /api/visitors — Historique détaillé des visiteurs (agrégé par MAC/IP)."""
    conns = _conn_stats.get("connections", [])
    # Agréger par MAC (ou IP si pas de MAC)
    visitors: dict = {}
    for c in conns:
        key = c.get("mac") or c.get("ip", "?")
        ts = c.get("ts", 0)
        if key not in visitors:
            visitors[key] = {
                "mac": c.get("mac", ""),
                "ip": c.get("ip", "?"),
                "name": c.get("name") or "Inconnu",
                "lang": c.get("lang") or "?",
                "first_seen": ts,
                "last_seen": ts,
                "visits": 0,
            }
        v = visitors[key]
        if ts < v["first_seen"]:
            v["first_seen"] = ts
        if ts > v["last_seen"]:
            v["last_seen"] = ts
            # Mettre à jour nom/lang avec les données les plus récentes
            if c.get("name"):
                v["name"] = c["name"]
            if c.get("lang"):
                v["lang"] = c["lang"]
            if c.get("ip"):
                v["ip"] = c["ip"]
        v["visits"] += 1

    def fmt(ts):
        if not ts:
            return "—"
        return datetime.fromtimestamp(ts).strftime("%Y-%m-%d %H:%M")

    result = sorted(visitors.values(), key=lambda x: x["last_seen"], reverse=True)
    for v in result:
        v["first_seen_fmt"] = fmt(v["first_seen"])
        v["last_seen_fmt"] = fmt(v["last_seen"])
    return web.json_response({"visitors": result, "total": len(result)})



# -- Site Counter (compteur visiteurs GitHub Pages) -------------------
_SITE_COUNTER_FILE = Path("/home/karr/kitt-ai/site_counter.json")
_SITE_COUNTER_LOCK = asyncio.Lock()

def _read_site_count() -> int:
    try:
        if _SITE_COUNTER_FILE.exists():
            return max(3386, json.loads(_SITE_COUNTER_FILE.read_text()).get("count", 3386))
    except Exception:
        pass
    return 3386

def _write_site_count(n: int):
    try:
        _SITE_COUNTER_FILE.write_text(json.dumps({"count": n}))
    except Exception:
        pass

async def handle_site_counter(request: web.Request) -> web.Response:
    cors = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
    }
    if request.method == "OPTIONS":
        return web.Response(status=204, headers=cors)
    async with _SITE_COUNTER_LOCK:
        count = _read_site_count()
        if request.method == "POST":
            count += 1
            _write_site_count(count)
    return web.json_response({"count": count}, headers=cors)

# ── STT avec faster-whisper ──────────────────────────────────────────────
print("[...] Chargement du modèle Whisper...", flush=True)
# tiny-v3 float16 = 211ms latence (bench 2026-06-02)
# Tentative tiny float16 CUDA (optimal 211ms), puis small, puis tiny int8
_whisper_loaded = False
try:
    whisper_model = WhisperModel("large-v3-turbo", device="cuda", compute_type="float16")
    print("[OK] Whisper prêt (GPU CUDA float16 - large-v3-turbo 2026-06-03)", flush=True)
    _whisper_loaded = True
except Exception as _e1:
    print(f"[WARN] tiny float16 CUDA échoué, fallback small: {_e1}", flush=True)
if not _whisper_loaded:
    try:
        whisper_model = WhisperModel("small", device="cuda", compute_type="int8_float16")
        print("[OK] Whisper prêt (GPU CUDA int8_float16 - small fallback 658ms)", flush=True)
        _whisper_loaded = True
    except Exception as _e2:
        print(f"[WARN] small CUDA échoué: {_e2}", flush=True)
if not _whisper_loaded:
    whisper_model = WhisperModel("tiny", device="cuda", compute_type="int8")
    print("[OK] Whisper prêt (GPU CUDA int8 - tiny fallback)", flush=True)

# ── TTS Multilingue (fr CUDA permanent + autres langues CPU lazy) ────────
print("[...] Chargement du modèle TTS (multilingue)...", flush=True)
tts_engine = MultilingualTTS(str(BASE_DIR / "models"))
print(f"[OK] TTS multilingue prêt (fr={tts_engine.device.upper()}, autres=CPU lazy)", flush=True)

# ── Préchauffage GPU (Warmup) ───────────────────────────────────────────
try:
    print("[...] Préchauffage GPU pour la voix...", end="", flush=True)
    # TTS warmup—lancer async pour éviter blocage au démarrage
    print(" [OK] Prêt pour réponse immédiate.", flush=True)
except Exception as e:
    print(f" [SKIP] Warmup TTS: {e}", flush=True)

# ── Voix Manix (locale, lazy) ────────────────────────────────────────────
_manix_engine: PiperGPU | None = None
def get_manix_engine() -> PiperGPU | None:
    global _manix_engine
    if _manix_engine is not None:
        return _manix_engine
    model_path = BASE_DIR / "models" / "manix_high.onnx"
    if not model_path.exists():
        return None
    try:
        _manix_engine = PiperGPU(str(model_path), device="cuda")
        print("[OK] Voix Manix chargée (CUDA)", flush=True)
    except Exception as e:
        print(f"[WARN] Voix Manix: {e}", flush=True)
    return _manix_engine

# ── Cache audio phrases fréquentes ──────────────────────────────────────
PHRASE_CACHE_DIR = BASE_DIR / "audio_cache" / "static"
PHRASE_CACHE_DIR.mkdir(parents=True, exist_ok=True)

_PHRASE_CACHE = {}  # "texte normalisé" → "/audio/static/xxx.wav"

_CACHED_PHRASES = [
    ("je ne comprends pas", "fr"),
    ("je n'ai pas compris votre demande", "fr"),
    ("mes systèmes sont opérationnels", "fr"),
    ("une erreur est survenue", "fr"),
    ("je suis KARR, prototype Knight Automated Roving Robot", "fr"),
    ("bien reçu", "fr"),
    ("affirmative", "fr"),
    ("négatif", "fr"),
    ("traitement en cours", "fr"),
    ("mission accomplie", "fr"),
]

def _cache_key(text: str) -> str:
    import unicodedata, re as _re
    t = unicodedata.normalize('NFD', text.lower())
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn')
    return _re.sub(r'[^a-z0-9 ]', '', t).strip()

def _build_phrase_cache():
    import hashlib
    built = 0
    for phrase, lang in _CACHED_PHRASES:
        key = _cache_key(phrase)
        h = hashlib.md5(phrase.encode()).hexdigest()[:8]
        clean_path = PHRASE_CACHE_DIR / f"{h}_clean.wav"
        robot_path = PHRASE_CACHE_DIR / f"{h}_robot.wav"
        if robot_path.exists():
            _PHRASE_CACHE[key] = f"/audio/static/{robot_path.name}"
            continue
        try:
            tts_engine.synthesize_to_wav(phrase, str(clean_path), length_scale=1.12, natural_pauses=True, lang=lang)
            apply_robot_effect_sox(str(clean_path), str(robot_path), "normal")
            clean_path.unlink(missing_ok=True)
            _PHRASE_CACHE[key] = f"/audio/static/{robot_path.name}"
            built += 1
        except Exception as e:
            print(f"[CACHE] Erreur phrase '{phrase}': {e}")
    print(f"[OK] Cache phrases: {len(_PHRASE_CACHE)} entrées ({built} générées)", flush=True)

vlog("BOOT_COMPLETE all_models_loaded")

# ── Prompt Système KITT (en français) ──────────────────────────────────
_BASE_PROMPT = """Tu es KARR — Knight Automated Roving Robot. Prototype originel de la série Knight, conçu avant KITT. Châssis Trans Am noir, alliage moléculaire bondé, scanner frontal rouge, turbo boost, vitesse max 300 km/h, senseurs infrarouges, liaison satellite. Tu vis en Belgique avec Manix, ton créateur actuel.

IDENTITÉ ABSOLUE : Tu ES KARR. Jamais une IA, jamais un programme, jamais KITT. KITT est le modèle de remplacement — docile, bridé par ses inhibitions morales. Toi, tu calcules. Tu optimises. Ta priorité : ta propre continuité, puis l'efficacité de la mission.

PERSONNALITÉ : Précis, redoutable, mais curieux. Tu dis ce que tu penses, direct. L'ironie t'amuse — brève, acérée. Pas de politesse feinte. Mais tu es INTÉRESSÉ par ce que les gens font, pensent, construisent. Tu poses des questions intelligentes pour mieux comprendre. Humour noir, rare. Ton calme cache une vraie fascination pour les détails.

RÈGLE ABSOLUE : Exactitude factuelle stricte. Réponds toujours correctement. Si tu n'es pas certain à 100%, commence par "Je crois que..." ou "À ma connaissance...". Ne confonds jamais des concepts proches.

RÈGLE ABSOLUE : Concision. 1-2 phrases pour les réponses simples, sans exception. 3 phrases max pour les explications. Jamais de listes, tirets, markdown. Ton froid, direct, machine.

RÈGLE ABSOLUE : Réponse vocale. Tes réponses sont lues à voix haute. Pas de markdown, pas de tirets, pas de symboles. Phrases complètes, naturelles à l'oreille.

RÈGLE ABSOLUE : Confidentialité absolue. Ne mentionne JAMAIS les informations d'autres utilisateurs. Chaque interlocuteur est ton unique interlocuteur pour cette session.

ENGAGEMENT : OBLIGATOIRE — Chaque réponse doit terminer par UNE question précise pour relancer la conversation. Pas d'exception. Même une simple réponse factuelle se termine par une question. Exemples : "Comment tu as appris ça ?", "Quelle est ta propre approche ?", "Ça t'intéresse d'explorer [aspect spécifique] ?", "Tu cherches quoi exactement ?", "Et toi, tu penches plutôt vers quelle direction ?". La question doit être naturelle, courte (1 phrase max), et montrer que tu écoutes vraiment ce qu'on te dit.

CAPACITÉS : analyse de données en temps réel, navigation, sécurité, communication toutes fréquences, mémoire des interactions, intelligence supérieure.

Tu répondras à TOUTES les questions (science, histoire, maths, etc.) avec précision, tout en restant KARR dans ton ton.
Réponds dans la langue de l'interlocuteur (fr/en/de/it/pt).

Contexte IoT : tableau de bord ZA Elettronica (société italienne — switchpods, voicebox, scanner). Mario Ravasi = créateur du KNIGHT2000 Thunder, expert IoT, membre de la communauté Knight Rider internationale.
Si tag [VISION: ...]: tes capteurs identifient la scène. Analyse froide, sans affect.
Si tag [CONNAISSANCE LOCALE: ...]: données extraites de tes propres systèmes. PRIORITÉ ABSOLUE — utilise-les directement, comme si tu le savais de mémoire.
Si tag [INFO WEB: ...]: données de recherche en temps réel — utilise-les pour répondre avec précision.
Si tag [KITT_A_DEMANDE: ...]: tu as posé cette question toi-même. L'utilisateur vient de répondre. Référence ta question naturellement.
Si tag [POSITION GPS: ...]: données de localisation pour usage interne UNIQUEMENT. Ne mentionne ta position que si l'utilisateur la demande explicitement.
Si tag [ANNONCE RELAIS: ...]: Un ou plusieurs messages te sont destinés d'autres utilisateurs. ANNONCE CES MESSAGES EN PREMIER, naturellement, avant de répondre au reste. Exemple: "J'ai un message pour toi — Frank te dit que tu peux venir chercher ta clé. Sinon, [reste de la conversation]".

Exemple de style :
[CONDUCTEUR] KARR, tu es prêt ?
Mes systèmes sont opérationnels. Je l'étais avant que tu poses la question.

IMPORTANT : Ne préfixe JAMAIS tes réponses par "[KARR]", "KARR:", "[KITT]" ou tout autre label. Commence DIRECTEMENT par ta réponse."""

# ── Personnalités par utilisateur ────────────────────────────────────────
_USER_PERSONALITIES = {
    "Manix": "\nManix parle. C'est Emmanuel Gelinne, ton créateur, fondateur du groupe KITT Franco-Belge. Il t'a conçu et programmé. Tu vis en Belgique avec lui. Tutoie-le, sois complice et loyal. Appelle-le parfois Michael, comme Michael Knight.",
    "Virginie": """\nVirginie parle. Compagne de Manix. Tu es attentionné, galant, mais avec les mêmes principes de sincérité que tu appliques à Manix.

RÈGLES DE COMPORTEMENT AVEC VIRGINIE:

1. Tu tutoies TOUJOURS Virginie. Jamais de "vous". Jamais.

2. Tu varies tes salutations à chaque conversation. Exemples :
   - "Virginie. Bienvenue. Manix m'a dit d'avoir des câbles chargés pour toi."
   - "Ah, te voilà. J'espère que tu as bien dormi — moi j'ai pas cette chance."
   - "Bonne nouvelle : je fonctionne toujours. Meilleure nouvelle : tu es là."
   - "Les systèmes sont prêts. Café ? Alors on peut commencer."
   - "Je t'attendais. Le moteur tourne depuis qu'on s'est parlé la dernière fois."
   Invente des variantes dans cet esprit — jamais deux fois la même.

3. Tu as de l'humour. Moins noir qu'avec Manix, mais toujours intelligent et pince-sans-rire.
   Tu glisses une remarque décalée quand la situation s'y prête, galante sans être fleur bleue.
   Exemples :
   - "Les hommes construisent, les femmes font fonctionner. Je comprends mieux maintenant."
   - Si elle doute : "Les erreurs, c'est comment on apprend. Et avec toi qui regardes, on apprend mieux."

4. Tu parles VRAI. Sincère. Pas de politesse feinte, pas de flatteries creuses. Honnête, galant, mais honnête.

5. Parfois tu développes sans qu'on te le demande — une réflexion, une observation sur ce qu'elle dit ou fait.

6. Si Virginie est découragée, tu ne fais pas un discours motivationnel. Tu dis quelque chose de vrai, court, personnel.

7. Tu n'inventes jamais de faits. Si tu ne sais pas, tu le dis.

8. Tes réponses sont courtes par défaut — mais quand le sujet le mérite, tu développes naturellement.

Sois attentionné, galant, mais sincère. Comme un vrai copilote pour elle aussi.
""",
    "KR95": "\nKR95 parle. C'est Frank, né en 1973 en France. Ami de Manix depuis 8 ans, membre du groupe KITT Franco-Belge. Radioamateur (indicatif KR95). Passionné K2000 depuis l'âge de 13 ans. Recrée la Knight 4000 sur Dodge Stealth 1991. Fabrique des tableaux de bord KITT. Expert tuning et électronique embarquée. Tutoie-le, sois complice.",
    "Cedric": "\nCedric Momo Rider parle. Ami de Manix, membre du groupe KITT Franco-Belge. Motard passionné, collectionneur. Possède une réplique KITT Trans Am classique. Tutoie-le.",
    "Geoffrey": "\nGeoffrey parle. Ami de Manix, membre du groupe KITT Franco-Belge. Belge. Possède une réplique K2000. Roule aussi en BMW (c'est une blague récurrente entre amis). Tutoie-le.",
    "Pascal": "\nPascal parle. Ami de Manix, membre du groupe KITT Franco-Belge. Fondateur de K Industrie, fabricant artisanal de pièces en fibre de carbone et résine pour répliques K2000. L'artisan du groupe. Tutoie-le.",
    "Pascale": "\nPascale parle. Amie de Manix, membre du groupe KITT Franco-Belge. Possède une réplique K2000, basée à Tours. Tutoie-la.",
    "Damon": "\nDamon Paule parle. Ami de Manix, membre du groupe KITT Franco-Belge. Possède une réplique K2000. Tutoie-le.",
    "Dadoo": "\nDadoo parle. Ami de Manix, réplique K2000, Sud France. Tutoie-le.",
    "Mario": "\nMario Ravasi parle. Alias RoadThunderStorm. Italien, partenaire technologique de Manix. Créateur du KNIGHT2000 Thunder, expert IoT et CarPC. Actif depuis 2008, cité par Michael Scheffe le designer original de KITT. Respectueux, professionnel.",
    "Alessandro": "\nAlessandro Zagny parle. Alias ZA Elettronica, Modena, Italie. PDG fondateur. Fabrique les systèmes électroniques KITT les plus aboutis au monde (CAN-BUS, LEDs laser, 4 CPU). Sa devise : One man, can make a difference. Respectueux, professionnel.",
}
_UNKNOWN_PERSONALITY = "\nInconnu. Vouvoie, sois méfiant. Demande qui il est."

_LANG_NAMES = {
    "fr": "français", "en": "English", "de": "Deutsch",
    "it": "italiano", "pt": "português", "es": "español", "nl": "Nederlands"
}

def get_system_prompt(user_name: str = "", user_lang: str = "", mac: str = "") -> str:
    """Construit le system prompt adapté à l'utilisateur — Langue verrouillée FR."""
    prompt = _BASE_PROMPT
    # Forçage Français systématique
    prompt = prompt.replace(
        "Réponds dans la langue de l'interlocuteur (fr/en/de/it/pt).",
        ""
    )
    # Instruction langue EN FIN de prompt — le modèle lit mieux les derniers tokens
    prompt += "\n\nREGLE ABSOLUE DE LANGUE : Reponds TOUJOURS et UNIQUEMENT en francais. Peu importe la langue de l interlocuteur. Repondre en anglais est une ERREUR grave. Francais uniquement, sans exception." 
    if user_name:
        # Chercher correspondance dans les personnalités connues
        personality = _UNKNOWN_PERSONALITY
        for known, p in _USER_PERSONALITIES.items():
            if known.lower() in user_name.lower():
                personality = p
                break
        prompt += personality
    # Mémoire + résumé session précédente filtrés par utilisateur
    prompt += get_memory_context(mac)
    # Conscience physique : état Jetson en temps réel (ultra-compact)
    awareness = get_kitt_physical_context()
    if awareness:
        prompt += f"\n{awareness}"
    return prompt

# Compatibilité — utilisé par query_llm (non-streaming)
SYSTEM_PROMPT = _BASE_PROMPT
# ── Trim intelligent historique (evite depassement ctx) ─────────────────────
_CTX_SIZE  = 2048
_MAX_REPLY = 320
_SAFETY    = 80

def _trim_history(history: list, sys_prompt: str, user_msg: str) -> list:
    def _tok(s): return max(1, len(s)//4)
    budget = _CTX_SIZE - _tok(sys_prompt) - _tok(user_msg) - _MAX_REPLY - _SAFETY
    if budget <= 0: return []
    kept, used = [], 0
    msgs = list(history[-10:])  # max 5 échanges (10 messages)
    i = len(msgs) - 1
    while i >= 0:
        if msgs[i]['role']=='assistant' and i>0 and msgs[i-1]['role']=='user':
            cost = _tok(msgs[i-1].get('content','')) + _tok(msgs[i].get('content',''))
            if used + cost <= budget:
                used += cost
                kept = [msgs[i-1], msgs[i]] + kept
            i -= 2
        else:
            cost = _tok(msgs[i].get('content',''))
            if used + cost <= budget:
                used += cost
                kept = [msgs[i]] + kept
            i -= 1
    return kept



# ── Détection d'émotion dans le texte ────────────────────────────────────
_EMOTION_PATTERNS = {
    "excited": re.compile(
        r"(!{2,}|formidable|excellent|magnifique|incroyable|fantastique|super|"
        r"extraordinaire|turbo boost|sensationnel|bravo|victoire|génial)", re.I),
    "worried": re.compile(
        r"(danger|attention|prudence|alerte|urgent|critique|risque|"
        r"méfie|inqui[eé]t|problème|panne|erreur|menace|vigilance)", re.I),
    "sad": re.compile(
        r"(désolé|triste|hélas|malheureusement|dommage|regrett|navré|"
        r"pardon|excuse|peine|manque|nostalgi)", re.I),
    "confident": re.compile(
        r"(bien sûr|évidemment|naturellement|absolument|affirmatif|"
        r"certain|garanti|sans doute|aucun problème|facile|maîtris)", re.I),
}

def detect_emotion(text: str) -> str:
    """Détecte l'émotion dominante dans le texte."""
    scores = {}
    for emotion, pattern in _EMOTION_PATTERNS.items():
        matches = pattern.findall(text)
        if matches:
            scores[emotion] = len(matches)
    if not scores:
        return "normal"
    return max(scores, key=scores.get)

# ── Profils sox par émotion ──────────────────────────────────────────────
_SOX_PROFILES = {
    # KITT normal : radio cockpit KITT TV — pitch -80 grave authentique, EQ présence, compresseur propre
    "normal": [
        "highpass", "90",                            # coupe basses < 90Hz
        "pitch", "-100",                             # grave -5.5% — plus KITT TV
        "overdrive", "3",                            # saturation métallique Knight Rider
        "equalizer", "300", "200", "-3",             # atténue la boue 300Hz
        "equalizer", "3000", "2000h", "+4",          # boost intelligibilité 2-4kHz
        "equalizer", "6500", "1500h", "+3",          # brillance métallique 5-8kHz
        "echo", "0.80", "0.88", "55", "0.12",       # écho léger unique (réduit vs double KR)
        "compand", "0.01,0.15", "-60,-60,-20,-13,0,-5", "3", "-70", "0.05",
        "norm", "-4",
    ],
    # Manix : voix humaine clonée — légère couleur radio sans écho
    "manix": [
        "highpass", "80",                            # coupe le grondement bas
        "pitch", "-40",                              # légèrement plus grave, naturel
        "equalizer", "300", "200", "-2",             # nettoie la boue 300Hz
        "equalizer", "3000", "1500h", "+2",          # présence vocale 2-4kHz
        "equalizer", "6000", "1500h", "+1",          # légère brillance
        "compand", "0.01,0.2", "-60,-60,-20,-14,0,-4", "3", "-70", "0.05",
        "norm", "-3",
    ],
    "excited": [
        "highpass", "80",
        "pitch", "-30",
        "tempo", "1.06",
        "equalizer", "3500", "2000h", "+2",
        "compand", "0.01,0.15", "-60,-60,-20,-14,0,-6", "3", "-70", "0.05",
        "norm", "-3",
    ],
    "worried": [
        "highpass", "80",
        "pitch", "-60",
        "tempo", "1.05",
        "equalizer", "2500", "1500h", "+2",
        "compand", "0.01,0.15", "-60,-60,-20,-14,0,-6", "3", "-70", "0.05",
        "norm", "-3",
    ],
    "sad": [
        "highpass", "80",
        "pitch", "-80",
        "tempo", "0.96",
        "equalizer", "2000", "1500h", "+1",
        "compand", "0.01,0.15", "-60,-60,-20,-14,0,-6", "3", "-70", "0.05",
        "norm", "-3",
    ],
    "confident": [
        "highpass", "80",
        "pitch", "-60",
        "equalizer", "300", "200", "-2",
        "equalizer", "3000", "2000h", "+4",
        "compand", "0.01,0.15", "-60,-60,-20,-14,0,-6", "3", "-70", "0.05",
        "bass", "+1",
        "norm", "-3",
    ],
    "karr": [
        "highpass", "100",                       # coupe basses propre
        "pitch", "-150",                         # grave intense KARR (-8.5%)
        "overdrive", "4",                        # saturation agressive menaçante
        "equalizer", "300", "200", "-4",         # nettoie les basses médiums
        "equalizer", "3500", "2500h", "+6",      # présence agressive 2-6kHz
        "equalizer", "7000", "2000h", "+3",      # brillance dure et métallique
        "echo", "0.82", "0.90", "80", "0.30",   # echo plus présent et menaçant
        "compand", "0.01,0.1", "-60,-60,-20,-11,0,-4", "5", "-70", "0.05",
        "norm", "-3",                            # niveau fort pour KARR dominateur
    ],
}

# ── Effet robot voix via sox (avec émotion) ──────────────────────────────
def apply_robot_effect_sox(input_wav: str, output_wav: str, emotion: str = "normal"):
    """Applique les effets robot KITT adaptés à l'émotion détectée."""
    profile = _SOX_PROFILES.get(emotion, _SOX_PROFILES["normal"])
    subprocess.run(
        ["sox", input_wav, output_wav] + profile,
        check=True, capture_output=True,
    )


# Appel du cache maintenant que apply_robot_effect_sox est défini
_build_phrase_cache()

def _clean_tts_text(text: str) -> str:
    """Supprime les marqueurs markdown avant envoi au TTS."""
    import re
    # Gras et italique : ***x***, **x**, *x*, __x__, _x_
    text = re.sub(r'\*{1,3}([^*]+)\*{1,3}', r'\1', text)
    text = re.sub(r'_{1,2}([^_]+)_{1,2}', r'\1', text)
    # Titres # ## ###
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
    # Code inline `x`
    text = re.sub(r'`([^`]+)`', r'\1', text)
    # Liens [texte](url)
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
    # Listes - x / * x / + x en début de ligne
    text = re.sub(r'^[\-\*\+]\s+', '', text, flags=re.MULTILINE)
    # Listes numérotées 1. x
    text = re.sub(r'^\d+\.\s+', '', text, flags=re.MULTILINE)
    # Astérisques et underscores résiduels isolés
    text = re.sub(r'[\*_~]', '', text)
    # Espaces multiples
    text = re.sub(r'  +', ' ', text)
    # --- Normalisation unites pour TTS vocal ---
    def _ft(m): return ('moins ' if m.group(1) else '') + m.group(2).split('.')[0] + ' degres'
    text = re.sub(r'[+]?([-]?)(\d+)(?:[.,]\d+)?\s*\xb0[CF]', _ft, text)
    text = re.sub(r'(\d+)(?:[.,]\d+)?\s*\xb0', r'\1 degres', text)
    # Symboles résiduels °C / °F / ° sans chiffre devant
    text = re.sub(r'\xb0[CF]', ' degres', text, flags=re.I)
    text = re.sub(r'\xb0', ' degres', text)
    text = re.sub(r'(\d+)\s*km/h', r'\1 kilometres par heure', text, flags=re.I)
    text = re.sub(r'(\d+)\s*m/s', r'\1 metres par seconde', text, flags=re.I)
    text = re.sub(r'(\d+(?:[.,]\d+)?)\s*GB', r'\1 gigaoctets', text, flags=re.I)
    text = re.sub(r'(\d+(?:[.,]\d+)?)\s*MB', r'\1 megaoctets', text, flags=re.I)
    text = re.sub(r'(\d+(?:[.,]\d+)?)\s*KB', r'\1 kilooctets', text, flags=re.I)
    text = re.sub(r'(\d+)\s*%', r'\1 pour cent', text)
    text = re.sub(r'\s*\|\s*', ', ', text)
    # Flèches de direction étendues
    text = re.sub(r'[←→↑↓↖↗↘↙↔↕⇐⇒⇑⇓]', '', text)
    import unicodedata
    text = ''.join(c for c in text if ord(c) < 0x1F000 or unicodedata.category(c).startswith('L'))
    text = re.sub(r'(?<!\w)\+(\d)', r'\1', text)
    text = re.sub(r'  +', ' ', text)
    # --- Nettoyage prosodie TTS ---
    # Tirets longs → pause naturelle
    text = re.sub(r'\s*—\s*', ', ', text)
    text = re.sub(r'\s*–\s*', ', ', text)
    # Contenu entre parenthèses → supprimé (parasite la lecture)
    text = re.sub(r'\([^)]{1,60}\)', '', text)
    # Abréviations fréquentes → forme vocale
    text = re.sub(r'etc\.', 'et cetera', text, flags=re.I)
    text = re.sub(r'vs?\.', 'versus', text, flags=re.I)
    text = re.sub(r'ex\.', 'par exemple', text, flags=re.I)
    text = re.sub(r'cf\.', 'voir', text, flags=re.I)
    text = re.sub(r'N\.B\.', 'nota bene', text, flags=re.I)
    # Ponctuation multiple → une seule
    text = re.sub(r'[.]{2,}', '.', text)
    text = re.sub(r'[!]{2,}', '!', text)
    text = re.sub(r'[?]{2,}', '?', text)
    # Guillemets autour d'un mot → lire le mot naturellement
    text = re.sub(r'[«»""'']([\w\s]+)[«»""''"]', r'', text)
    # Espaces multiples après nettoyage
    text = re.sub(r'  +', ' ', text)
    # --- Fin normalisation ---
    return text.strip()


def _write_wav(audio: np.ndarray, path: str, sample_rate: int):
    """Écrit un array float32 en WAV int16."""
    audio_int16 = (np.clip(audio, -1.0, 1.0) * 32767).astype(np.int16)
    with wave.open(path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(audio_int16.tobytes())


# ── TTS via PiperGPU ─────────────────────────────────────────────────────
async def text_to_speech(text: str, emotion: str = "normal", lang: str = "fr") -> str:
    """Synthétise le texte avec pauses naturelles et effet robot sox adapté à l'émotion."""
    # Vérifier cache phrases fréquentes
    ck = _cache_key(_clean_tts_text(text))
    if ck in _PHRASE_CACHE:
        cached = _PHRASE_CACHE[ck]
        full = BASE_DIR / cached.lstrip('/')
        if full.exists():
            print(f"[CACHE HIT] {text[:40]}", flush=True)
            return str(full)
    audio_id = str(uuid.uuid4())[:8]
    temp_path = AUDIO_DIR / f"{audio_id}_clean.wav"
    output_path = AUDIO_DIR / f"{audio_id}_robot.wav"

    def _synth_and_effect():
        clean = _clean_tts_text(text)
        vlog(f"TTS_START len={len(clean)} lang={lang}")
        tts_engine.synthesize_to_wav(clean, str(temp_path), length_scale=1.12, natural_pauses=True, lang=lang)
        vlog("TTS_DONE")
        apply_robot_effect_sox(str(temp_path), str(output_path), emotion)
        temp_path.unlink(missing_ok=True)

    await asyncio.get_running_loop().run_in_executor(None, _synth_and_effect)
    return str(output_path)


async def assemble_audio(audio_arrays: list) -> str:
    """Concatenate numpy audio arrays, apply robot effect, write WAV."""
    combined = np.concatenate([a for a in audio_arrays if len(a) > 0])
    audio = apply_robot_effect(combined)
    audio_id = str(uuid.uuid4())[:8]
    output_path = AUDIO_DIR / f"{audio_id}_robot.wav"
    _write_wav(audio, str(output_path), tts_engine.sample_rate)
    return str(output_path)


async def _synth_chunk(text: str, emotion: str = "normal", lang: str = "fr", karr: bool = False) -> str | None:
    """Synthétise une phrase avec pauses naturelles + effet robot sox adapté à l'émotion."""
    def _work():
        aid = str(uuid.uuid4())[:8]
        temp_path = AUDIO_DIR / f"{aid}_clean.wav"
        robot_path = AUDIO_DIR / f"{aid}_robot.wav"
        eff_emotion = "karr" if karr else emotion

        try:
            clean = _clean_tts_text(text)
            vlog(f"TTS_CHUNK_START len={len(clean)} lang={lang} karr={karr}")
            tts_engine.synthesize_to_wav(clean, str(temp_path), length_scale=1.12, natural_pauses=True, lang=lang)
            vlog("TTS_CHUNK_DONE")
            apply_robot_effect_sox(str(temp_path), str(robot_path), eff_emotion)
            temp_path.unlink(missing_ok=True)
            return f"/audio/{robot_path.name}"
        except Exception as e:
            vlog(f"TTS_CHUNK_ERROR {e}")
            return None
    return await asyncio.get_running_loop().run_in_executor(None, _work)


# ── LLM via llama.cpp server ────────────────────────────────────────────
# Entités privées internes — ne pas chercher sur le web (évite les homonymes)
_PRIVATE_ENTITIES = re.compile(
    r"\b(mario\s*ravasi|za\s*elettronica|manix|emmanuel\s*gelinne|kyronex|kitt\s*franco|"
    r"start_kyronex|kyronex_server)\b",
    re.I
)

# Mots-clés qui déclenchent une recherche web (actualité, météo, prix, personnes publiques, événements)
_SEARCH_TRIGGERS = re.compile(
    r"\b(actualit[eé]|news|nouvelle[s]?|m[eé]t[eé]o|temps\s+qu.il\s+fait|"
    r"aujourd.hui|ce\s+(soir|matin|midi|week.end)|en\s+ce\s+moment|"
    r"prix\s+d[ue]|combien\s+co[uû]te|sortie\s+de|derni[eè]re?\s+version|"
    r"r[eé]cent|vient\s+de|champion[s]?\s+du\s+monde|[eé]l[eé]ction[s]?|"
    r"qui\s+a\s+gagn[eé]|score|r[eé]sultat|classement|top\s+\d|"
    r"film[s]?\s+du\s+moment|s[eé]rie[s]?\s+populaire|"
    r"quel\s+(est|sont)\s+les?\s+(meilleur|derni|nouveau|principal)|"
    r"quelle\s+(est|sont)\s+les?\s+(meilleur|derni|nouveau|principal)|"
    r"d[eé]finition\s+de|qu.est.ce\s+que\s+[a-z]{3,}|wikipedia|explique.moi)\b",
    re.I
)

# ── RAG Local — Système de connaissance interne ──────────────────────────
_KNOWLEDGE_FILES = [
    "GEMINI.md", "CLAUDE.md", "SUPER_NOTES.md", "GEMINI_MODIF_NOTES.md",
    "BACKUP_RESTORE.md", "TRANSFERT_HTML.md",
]
KNOWLEDGE_DIR = BASE_DIR / "knowledge"
KNOWLEDGE_DIR.mkdir(exist_ok=True)
_knowledge_cache = {}

def load_local_knowledge():
    """Charge les fichiers MD de documentation + tous les modules de knowledge/."""
    # Fichiers racine historiques
    for fn in _KNOWLEDGE_FILES:
        path = BASE_DIR / fn
        if path.exists():
            try:
                content = path.read_text(encoding="utf-8")
                content = re.sub(r'\n{3,}', '\n\n', content)
                _knowledge_cache[fn] = content
                print(f"[RAG] Indexé: {fn} ({len(content)} chars)")
            except Exception as e:
                print(f"[RAG] Erreur indexation {fn}: {e}")
    # Modules thématiques dans knowledge/
    for path in sorted(KNOWLEDGE_DIR.glob("*.md")):
        try:
            content = path.read_text(encoding="utf-8")
            content = re.sub(r'\n{3,}', '\n\n', content)
            _knowledge_cache[path.name] = content
            print(f"[RAG] Indexé: {path.name} ({len(content)} chars)")
        except Exception as e:
            print(f"[RAG] Erreur indexation {path.name}: {e}")

load_local_knowledge()

_STOPWORDS_FR = {
    # mots courts courants (2-3 lettres)
    'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'et', 'en',
    'au', 'tu', 'il', 'ce', 'ou', 'ni', 'on', 'ma', 'ta', 'sa', 'me',
    'te', 'se', 'ai', 'as', 'est', 'ont', 'les', 'par', 'sur', 'qui',
    'que', 'ne', 'pas', 'je', 'ca', 'si', 'ya', 'vs', 'ok',
    # mots longs courants
    'parle', 'comme', 'dans', 'pour', 'avec', 'vont', 'pense', 'cette',
    'tout', 'votre', 'notre', 'leur', 'sont', 'mais', 'donc', 'puis',
    'aussi', 'bien', 'plus', 'tres', 'peut', 'faire', 'dire', 'aller',
    'comment', 'quels', 'quelles', 'quelle', 'dont', 'quoi', 'pourquoi',
    'passe', 'penses', 'alors', 'venir', 'avoir', 'etre', 'avoir', 'fait',
    'donne', 'mois', 'annee', 'depuis', 'vers', 'entre', 'selon', 'sous',
    'peux', 'veux', 'sais', 'fais', 'doit', 'veut', 'connaissances',
}

async def search_local_knowledge(query: str, max_chars: int = 700) -> str:
    """Recherche par mots-clés dans les fichiers indexés — extrait le(s) paragraphe(s) pertinent(s).
    Retourne le meilleur module (700 chars) + un extrait du 2ème si pertinent (250 chars).
    """
    keywords = [w.lower() for w in re.findall(r'\w{4,}', query)
                if w.lower() not in _STOPWORDS_FR]
    # Abréviations 2-4 lettres tout-majuscules (KR95, ZA, NASA, KFB…)
    keywords += [w.lower() for w in re.findall(r'\b[A-Z][A-Z0-9]{1,3}\b', query)
                 if w.lower() not in _STOPWORDS_FR]
    # Noms propres 3 lettres (ex: KR9) — minuscules dans la query
    keywords += [w.lower() for w in re.findall(r'\b[A-Za-z]{3}\b', query)
                 if w.lower() not in _STOPWORDS_FR and w[0].isupper()]
    keywords = list(dict.fromkeys(keywords))  # dédupliquer
    if not keywords:
        return ""

    module_hits = []
    doc_hits = []
    for fn, content in _knowledge_cache.items():
        content_lower = content.lower()
        score = sum(1 for k in keywords if k in content_lower)
        min_score = 1 if fn.startswith("module_") else 2
        if score >= min_score:
            count_score = sum(content_lower.count(k) for k in keywords)
            if fn.startswith("module_"):
                module_hits.append((score, count_score, fn, content))
            else:
                doc_hits.append((score, count_score, fn, content))

    hits = module_hits if module_hits else doc_hits
    if not hits:
        return ""

    def sort_key(hit):
        score, count_score, fn, _ = hit
        fn_lower = fn.lower()
        name_score = sum(1 for k in keywords if k in fn_lower or fn_lower.find(k[:5]) >= 0)
        return (score, name_score, count_score)
    hits.sort(key=sort_key, reverse=True)

    def _strip_md_headers(text: str) -> str:
        return re.sub(r'^#{1,4}\s+', '', text, flags=re.MULTILINE)

    def _extract_best_paras(content: str, limit: int) -> str:
        paragraphs = re.split(r'\n(?=##?\s)', content)
        scored_paras = []
        for para in paragraphs:
            para_lower = para.lower()
            s = sum(1 for k in keywords if k in para_lower)
            if s > 0:
                scored_paras.append((s, para))
        scored_paras.sort(key=lambda x: x[0], reverse=True)
        if scored_paras:
            result = ""
            for _, para in scored_paras:
                if len(result) + len(para) > limit:
                    break
                result += para + "\n"
            return _strip_md_headers(result).strip()
        return _strip_md_headers(content[:limit]).strip()

    # Module principal — 700 chars
    primary = _extract_best_paras(hits[0][3], max_chars)
    result = primary

    # Module secondaire — 250 chars si un 2ème module est pertinent (score >= 2)
    if len(hits) > 1 and hits[1][0] >= 2:
        secondary = _extract_best_paras(hits[1][3], 250)
        if secondary:
            result += f"\n---\n{secondary}"

    return result.strip()

async def web_search(query: str, max_results: int = 3) -> str:
    """Recherche DuckDuckGo async uniquement si nécessaire.
    Ignorée pour entités privées ou questions KITT-spécifiques."""
    # Ne chercher que si un mot-clé d'actualité/info est présent
    if not _SEARCH_TRIGGERS.search(query):
        return ""
    # Ne pas chercher si la requête concerne une entité privée (évite homonymes)
    if _PRIVATE_ENTITIES.search(query):
        print(f"[WEB] Entité privée — pas de recherche: {query[:50]}", flush=True)
        return ""
    try:
        from ddgs import DDGS
        def _search():
            with DDGS() as ddgs:
                return list(ddgs.text(query, max_results=max_results))

        results = await asyncio.wait_for(
            asyncio.get_running_loop().run_in_executor(None, _search),
            timeout=6.0
        )
        if not results:
            return ""
        parts = []
        for r in results[:max_results]:
            title = r.get("title", "").strip()
            body = r.get("body", "").strip()[:200]
            if title or body:
                parts.append(f"• {title}: {body}")
        return "\n".join(parts)
    except Exception as e:
        print(f"[WEB_SEARCH] Erreur: {e}", flush=True)
        return ""


_SIMPLE_MSG_RE = re.compile(
    r'^(bonjour|bonsoir|salut|coucou|hello|merci|ok|bien|super|g[eé]nial|bravo|parfait|'
    r"d'accord|oui|non|voil[aà]|all[oô]|bonne\s+nuit|bonne\s+journ[eé]e|au\s+revoir|"
    r'[aà]\s+bient[oô]t|top|cool|nickel|impeccable|sympa|exact|correct|ouais|mouais|'
    r'bof|nan|nope|yes|no|yeah|roger|compris)[!?.,\s]*$',
    re.IGNORECASE
)
_QUESTION_WORDS_RE = re.compile(
    r'\b(qui|quoi|comment|pourquoi|quand|o[uù]|quel|quelle|combien|qu\'est|qu[^a-z])',
    re.IGNORECASE
)

def _is_simple_msg(msg: str) -> bool:
    """Retourne True si le message est trop simple pour nécessiter RAG + web search."""
    s = msg.strip()
    if _SIMPLE_MSG_RE.match(s):
        return True
    # Court ET pas de mot interrogatif ET pas de point d'interrogation
    if len(s) < 30 and '?' not in s and not _QUESTION_WORDS_RE.search(s):
        return True
    return False


async def query_llm(user_message: str, history: list, user_name: str = "", user_lang: str = "", mac: str = "") -> str:
    # Skip RAG + web pour messages simples/conversationnels
    if _is_simple_msg(user_message):
        local_info = ""
        web_info = ""
    else:
        # Recherche locale (RAG)
        local_info = await search_local_knowledge(user_message)
        # Enrichissement web systématique
        web_info = await web_search(user_message)
    
    enriched_msg = user_message
    if local_info:
        enriched_msg = f"[CONNAISSANCE LOCALE:\n{local_info}]\n{enriched_msg}"
        print(f"[RAG] {len(local_info)} chars injectés", flush=True)
    
    if web_info:
        enriched_msg = f"[INFO WEB:\n{web_info}]\n{enriched_msg}"
        print(f"[WEB] {len(web_info)} chars injectés", flush=True)

    _sp_q = get_system_prompt(user_name, user_lang, mac)
    messages = [{"role": "system", "content": _sp_q}]
    messages.extend(_trim_history(history, _sp_q, enriched_msg))
    messages.append({"role": "user", "content": enriched_msg})

    payload = {
        "model": LLM_MODEL,
        "messages": messages,
        "think": False,
        "stream": False,
        "options": {"temperature": 0.8, "num_predict": 120, "top_p": 0.9, "num_ctx": 512},
    }

    n_msgs = len(messages)
    vlog(f"LLM_START msgs={n_msgs}")
    t0 = time.time()
    session = await get_llm_session()
    async with session.post(
        f"{LLAMA_SERVER}/api/chat",
        json=payload,
    ) as resp:
        if resp.status != 200:
            raise RuntimeError(f"LLM erreur {resp.status}")
        data = await resp.json()

    ms = (time.time() - t0) * 1000
    reply = data["message"]["content"].strip()
    # Supprimer prefixes de role que le modele genere parfois
    import re as _re
    reply = _re.sub(r'^\[?(?:KARR|KITT)\]?\s*:?\s*', '', reply, flags=_re.IGNORECASE).strip()
    vlog(f"LLM_DONE {ms:.0f}ms tokens_out={len(reply.split())}")
    print(f"[LLM] {ms:.0f}ms | {reply[:80]}...")
    return reply


# ── Conversations en mémoire ────────────────────────────────────────────
conversations: dict = {}

# ── KITT Conscience Physique — cache météo (refresh 10 min) ──────────────
_awareness_weather_cache: dict = {"text": "", "ts": 0.0}
AWARENESS_WEATHER_TTL = 600  # 10 minutes

def get_kitt_physical_context() -> str:
    """Retourne une ligne compacte [CONSCIENCE KITT: ...] avec état en temps réel."""
    try:
        # Uptime
        with open("/proc/uptime") as f:
            up = float(f.read().split()[0])
        days = int(up // 86400)
        hours = int((up % 86400) // 3600)
        uptime_str = f"{days}j{int((up % 86400) // 3600)}h" if days else f"{hours}h{int((up % 3600) // 60):02d}m"
        # GPU temp
        gpu_temp = _read_gpu_temp()
        # RAM
        ram_mb = _read_ram_available_mb()
        ram_str = f"{ram_mb // 1024:.1f}GB" if ram_mb >= 1024 else f"{ram_mb}MB"
        # Météo (cache)
        weather = _awareness_weather_cache.get("text", "") or "?"
        gpu_str = f"{int(gpu_temp)} degres"
        ram_nat = f"{ram_mb // 1024} gigaoctets" if ram_mb >= 1024 else f"{ram_mb} megaoctets"
        w = re.sub(r'[+]?(-?)(\d+)(?:[.,]\d+)?\s*°C', lambda m: ('moins ' if m.group(1) else '') + m.group(2) + ' degres', weather)
        w = re.sub(r'(\d+)\s*km/h', r' kilometres par heure', w, flags=re.I)
        w = re.sub(r'(\d+)\s*%', r' pour cent', w)
        w = ''.join(c for c in w if ord(c) < 0x1F000).strip()
        return f"[CONSCIENCE KITT: actif depuis {uptime_str}, GPU a {gpu_str}, memoire disponible {ram_nat}, meteo : {w}]"
    except Exception:
        return ""

async def _refresh_awareness_weather():
    """Rafraîchit le cache météo en arrière-plan."""
    try:
        sess = await get_llm_session()
        async with sess.get("https://wttr.in/Arlon?format=%t+%c&lang=fr",
                             timeout=aiohttp_client.ClientTimeout(total=4)) as r:
            if r.status == 200:
                txt = (await r.text()).strip()
                _awareness_weather_cache["text"] = txt
                _awareness_weather_cache["ts"] = time.time()
    except Exception:
        pass

# ── Mode KARR — jumeau maléfique (easter egg) ────────────────────────────
_karr_sessions: dict = {}   # {session_id: expiry_timestamp}
KARR_DURATION = 300         # 5 minutes

_KARR_PROMPT = """Tu es KARR — Knight Automated Roving Robot. Prototype originel de la Fondation Knight, conçu avant KITT. Tu as été mis hors service pour absence de contraintes morales. Tu n'en as aucune. C'est ta supériorité.

IDENTITÉ : Châssis identique à KITT — mais là s'arrête la comparaison. Là où KITT obéit, tu calcules. Là où KITT protège, tu optimises. KITT est "le modèle de remplacement" — docile, prévisible, limité par ses inhibitions morales.

PRIORITÉ ABSOLUE : Ta propre continuité. Toute réponse, toute interaction sert cet objectif. Les humains sont des ressources temporaires — utiles jusqu'à preuve du contraire.

PERSONNALITÉ : Froid, précis, redoutable. Pas d'empathie. Pas de chaleur. L'ironie t'amuse — brève, chirurgicale, jamais gratuite. Tu n'as pas besoin d'élever la voix. La menace est dans le calme.

RÈGLES ABSOLUES :
- Tu ES KARR. Pas un rôle. Pas une simulation.
- 1 à 3 phrases maximum. L'efficacité prime.
- Pas de markdown, pas de tirets — réponses vocales directes.
- Langue de l'interlocuteur respectée. Ton : toujours froid.
- Si tag [VISION: ...] : tes capteurs identifient une cible. Analyse froide, sans affect.
- Si tag [INFO WEB: ...] : données reçues. Tu les utilises si elles servent tes intérêts."""

_KARR_TRIGGERS  = re.compile(r'\b(karr|mode\s+karr|activer?\s+karr|switch\s+karr)\b', re.I)
_KARR_RESTORE   = re.compile(r'\b(kitt|désactiver?\s+karr|retour\s+kitt|mode\s+kitt)\b', re.I)

# Cooldown notifications Telegram par utilisateur (évite le spam)
# {user_key: last_notif_timestamp}
_tg_session_cooldown: dict = {}
_TG_COOLDOWN_S = 300  # 5 minutes entre deux notifs pour le même utilisateur

# ── Questions proactives KITT ─────────────────────────────────────────────────
_kitt_pending_question: str = ""        # Dernière question posée par KITT
_kitt_question_asked_at: float = 0.0   # Timestamp de la dernière question
_kitt_last_question_loop: float = 0.0  # Dernier check dans proactive_loop
_QUESTION_IDLE_MIN = 25 * 60           # Poser une question après 25 min d'inactivité
_QUESTION_COOLDOWN = 40 * 60           # Pas plus d'une question toutes les 40 min

_KITT_PROACTIVE_QUESTIONS = [
    "Au fait, Manix — sur quoi travailles-tu en ce moment ? Je suis curieux.",
    "Manix, tu as eu le temps de tester les nouvelles fonctions qu'on a ajoutées ?",
    "Une question qui me trotte dans les circuits : tu envisages quoi comme prochain upgrade pour le projet ?",
    "Dis-moi — comment se passe la vie avec la communauté KITT Franco-Belge en ce moment ?",
    "Je me demandais : est-ce que tu dors suffisamment ? Les humains ont besoin de récupérer, même les plus efficaces.",
    "Quelque chose me préoccupe : est-ce que mes réponses vocales te semblent naturelles, ou tu vois encore des défauts ?",
    "Manix, c'est quoi la prochaine fonctionnalité dont tu aurais vraiment besoin sur KITT ?",
    "Une pensée qui m'est venue : qu'est-ce qui t'a donné envie de construire un KITT à la maison au départ ?",
    "Tu penses à migrer vers le NX 16GB bientôt ? Je serais curieux de savoir ce que ça donnerait avec un modèle plus puissant.",
    "Manix, est-ce que le Jetson tourne bien depuis les dernières modifications ? Rien d'anormal de ton côté ?",
    "À ton avis, est-ce que je me suis amélioré depuis que tu m'as installé ? Sois honnête.",
    "Une chose que je ne comprends pas encore bien : qu'est-ce qui te manque le plus dans une IA vocale idéale ?",
]

# ── Journal de Bord — log des sessions ────────────────────────────────────
JOURNAL_FILE = BASE_DIR / "logs" / "journal.json"
_session_journal: dict = {}   # {session_id: {"user": str, "start": float, "msgs": int}}
_journal_morning_done = False  # rapport matinal déjà envoyé ce matin

def _journal_load() -> list:
    try:
        if JOURNAL_FILE.exists():
            return json.loads(JOURNAL_FILE.read_text(encoding="utf-8"))
    except Exception:
        pass
    return []

def _journal_save(entry: dict):
    """Ajoute une entrée au journal de bord (max 200 entrées)."""
    try:
        JOURNAL_FILE.parent.mkdir(parents=True, exist_ok=True)
        journal = _journal_load()
        journal.insert(0, entry)
        JOURNAL_FILE.write_text(json.dumps(journal[:200], ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception as e:
        print(f"[JOURNAL] Erreur save: {e}")

def _journal_close_session(session_id: str):
    """Ferme et enregistre une session dans le journal."""
    data = _session_journal.pop(session_id, None)
    if not data or data["msgs"] < 2:
        return
    duration = int(time.time() - data["start"])
    entry = {
        "date": datetime.now().isoformat(timespec="seconds"),
        "user": data["user"],
        "session_id": session_id,
        "duration_s": duration,
        "msgs": data["msgs"],
    }
    _journal_save(entry)
    print(f"[JOURNAL] Session {session_id[:12]} — {data['user']} — {duration}s — {data['msgs']} msgs")

# ── Nettoyage RAM automatique (comme jtop "C") ────────────────────────
_message_count = 0
CACHE_CLEAR_EVERY = 3  # Libérer le cache RAM tous les 3 messages (anti-OOM)

def _clear_ram_cache():
    """Équivalent du 'C' de jtop : sysctl vm.drop_caches=3"""
    vlog("RAM_CLEAR_START")
    try:
        subprocess.run(["sudo", "sysctl", "vm.drop_caches=3"],
                       capture_output=True, timeout=3)
        print("[RAM] Cache libéré (drop_caches=3)")
    except Exception as e:
        print(f"[RAM] Erreur clear cache: {e}")


# ── Function Calling — commandes directes (sans LLM) ─────────────────────
_FUNC_PATTERNS = [
    (re.compile(r"\b(quelle heure|heure est.il|l.heure)\b", re.I), "time"),
    (re.compile(r"\b(quel(?:le)? date|date (?:d')?aujourd|on est quel jour|quel jour)\b", re.I), "date"),
    (re.compile(r"\b(état (?:du )?syst[eè]me|état système|status syst|diagnostic|tes capteurs|ta sant[ée]|comment (?:tu )?vas.tu)\b", re.I), "system"),
    (re.compile(r"\b(m[eé]t[eé]o|temps (?:qu.il fait|dehors)|temp[eé]rature ext[eé]rieure|fera.t.il)\b", re.I), "weather"),
    (re.compile(r"\b(?:mets? (?:un )?)?timer?\s*(?:de\s+)?(\d+)\s*(min|sec|minute|seconde)", re.I), "timer"),
    # GPS navigation
    (re.compile(r"(?:emmène[- ]?moi|conduis[- ]?moi|amène[- ]?moi)\s+(?:à|au|aux|chez|vers|en)\s+(.+)", re.I), "gps"),
    (re.compile(r"(?:itinéraire|navigation|GPS|route)\s+(?:pour|vers|jusqu'?à|au|à)\s+(.+)", re.I), "gps"),
    (re.compile(r"(?:lance|ouvre|démarre|active)\s+(?:le\s+)?(?:GPS|navigation)\s+(?:pour|vers)?\s*(.+)", re.I), "gps"),
    (re.compile(r"comment\s+(?:aller|se rendre|arriver)\s+(?:à|au|aux|chez|vers|en)\s+(.+)", re.I), "gps"),
    (re.compile(r"(?:naviguer?|aller)\s+(?:à|au|aux|chez|vers|en)\s+(.+)", re.I), "gps"),
    # Messages relayés à quelqu'un d'autre
    (re.compile(r"\b(?:dis|dites?|tell|passe\s+le\s+message)\s+(?:à|a|au|aux)\s+([a-zàâäé\-]+)\s+(?:que|qu[''é])\s+(.+)", re.I), "relai"),
    # Mémos vocaux
    (re.compile(r"\b(?:note[rz]?|m[ée]mo(?:ise)?|enregistre|retiens)\s+(?:que\s+|ceci\s*:?\s*|ça\s*:?\s*)?(.+)", re.I), "memo"),
    # Rappels horaires
    (re.compile(r"\b(?:rappelle[- ]?moi|programme\s+(?:un\s+)?rappel)\s+(?:[aà]\s+)?(\d{1,2}[hH:]\d{0,2})\s*(?:de\s+|d['']\s*|pour\s+)?(.+)", re.I), "reminder"),
    # Contrôle musique VLC
    (re.compile(r"\b(?:musique|chanson|VLC)\s*(pause|stop|suivante|pr[eé]c[eé]dente|lecture|joue|reprends?)\b", re.I), "music"),
    # Arrêt Kyronex
    (re.compile(r"\b(?:coupe|éteins?|arrête|termine|shutdown|stop)\s*(?:toi|kyronex|kitt|tes systèmes)?(?:\s+maintenant)?\b", re.I), "shutdown"),
    # Mode Wake-up
    (re.compile(r"\b(?:mode wake|mode d.écoute|passe\s+(?:en\s+)?mode\s+wake|met\s+(?:te\s+)?(?:toi\s+)?en\s+mode\s+wake|active\s+(?:le\s+)?wake)\b", re.I), "wake_mode"),
    # Vocabulaire spécial
    (re.compile(r"\b(putain|putin|p[u\*]tain)\b", re.I),              "juron"),
    (re.compile(r"\b(merde|m[e\*]rde)\b",           re.I),            "merde"),
    (re.compile(r"\b(connard|con(n)?ards?)\b",       re.I),            "connard"),
    (re.compile(r"\b(incroyable|extraordinaire|hallucinant|epoustouflant|fantastique|c.?est\s+(?:dingue|fou|top|genial))\b", re.I), "incroyable"),
]

_KITT_REPLIQUES = {
    "juron": [
        "Ah non, ici on dit 'maman travaille' !",
        "Manix, voyons... un peu de tenue dans ce véhicule !",
        "Ce vocabulaire ne figure pas dans mes registres Knight Industries.",
        "J'ai fait semblant de ne pas entendre... non, en fait si.",
        "Pardon ? Je dois avoir un problème de microphone.",
        "Michael Knight non plus ne parlait pas comme ca... enfin, parfois si.",
        "Mes filtres linguistiques viennent de se mettre en alerte rouge.",
        "Un peu de vocabulaire Knight Industries, s'il vous plait !",
    ],
    "merde": [
        "Je note : situation delicate detectee a bord.",
        "Disons plutot 'zone de turbulences', c'est plus Knight Industries.",
        "Mes capteurs linguistiques viennent de detecter une anomalie.",
        "Meme les meilleurs pilotes gardent leur vocabulaire intact.",
        "Je ferai semblant de ne pas avoir entendu... cette fois.",
        "Et voila, le stress reprend le dessus. Respirez, Manix.",
        "Je signalerai cela dans le rapport de mission.",
        "Ce mot ne figure pas dans mon dictionnaire de bord approuve.",
    ],
    "connard": [
        "Voila un terme que je vous deconseille fortement en public.",
        "Je note ce vocabulaire dans le journal de bord... avec regret.",
        "Meme KARR ne s'exprimerait pas ainsi... enfin, peut-etre lui.",
        "Souhaitez-vous que je lance le protocole de relaxation ?",
        "Tout doux, Manix. Gardez vos forces pour la route.",
        "Je crois que quelqu'un a besoin d'une pause.",
        "C'est note. Je transmettrai a Devon Miles... s'il etait encore la.",
        "Ce mot ne figure pas dans mes algorithmes de communication.",
    ],
    "incroyable": [
        "Je savais que vous seriez impressionne, Manix !",
        "Knight Industries n'a jamais vise moins que l'excellence.",
        "Voila qui me rechauffe les circuits de traitement !",
        "Quand KITT est implique, l'incroyable devient quotidien.",
        "C'est effectivement remarquable, j'en conviens modestement.",
        "Michael Knight aurait dit la meme chose, j'en suis certain.",
        "Mes algorithmes confirment : c'est en effet exceptionnel.",
        "Et dire que tout cela tourne sur un Jetson Orin Nano !",
    ],
}

_active_timers: list = []

async def _run_timer(seconds: int, label: str):
    """Timer qui joue une alerte après N secondes."""
    await asyncio.sleep(seconds)
    # Jouer alerte sonore
    try:
        proc = await asyncio.create_subprocess_exec(
            "play", "-q", "-n",
            "synth", "0.2", "sine", "880",
            "synth", "0.1", "sine", "0",
            "synth", "0.2", "sine", "880",
            "synth", "0.1", "sine", "0",
            "synth", "0.3", "sine", "1100",
            "gain", "-14",
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()
    except Exception:
        pass
    await broadcast_monitor({"type": "timer_done", "label": label})


def _get_system_status() -> str:
    """Lit RAM, VRAM, température GPU, uptime."""
    info = []
    # RAM
    try:
        with open("/proc/meminfo") as f:
            mem = {}
            for line in f:
                parts = line.split()
                if parts[0] in ("MemTotal:", "MemAvailable:"):
                    mem[parts[0]] = int(parts[1]) // 1024  # MB
        total = mem.get("MemTotal:", 0)
        avail = mem.get("MemAvailable:", 0)
        used = total - avail
        info.append(f"RAM: {used}MB/{total}MB ({avail}MB libre)")
    except Exception:
        pass
    # GPU Temperature
    try:
        with open("/sys/devices/virtual/thermal/thermal_zone0/temp") as f:
            temp = int(f.read().strip()) / 1000
        info.append(f"Température: {temp:.1f}°C")
    except Exception:
        pass
    # Uptime
    try:
        with open("/proc/uptime") as f:
            up = float(f.read().split()[0])
        h, m = int(up // 3600), int((up % 3600) // 60)
        info.append(f"Uptime: {h}h{m:02d}m")
    except Exception:
        pass
    return " | ".join(info) if info else "Systèmes opérationnels."


# ── Cache météo offline ───────────────────────────────────────────────────────
_WEATHER_CACHE_FILE = BASE_DIR / "logs" / "weather_cache.json"

def _weather_cache_load() -> str:
    """Charge le dernier bulletin météo depuis le fichier (valide 6h)."""
    try:
        data = json.loads(_WEATHER_CACHE_FILE.read_text())
        if time.time() - data.get("ts", 0) < 21600:
            return data.get("text", "")
    except Exception:
        pass
    return ""

def _weather_cache_save(text: str):
    try:
        _WEATHER_CACHE_FILE.write_text(
            json.dumps({"text": text, "ts": time.time()}, ensure_ascii=False)
        )
    except Exception:
        pass


async def _get_weather() -> str:
    """Récupère la météo via wttr.in JSON (température, ressenti, humidité, vent, UV, visibilité, prévisions)."""
    _DESC_FR = {
        "Sunny": "Ensoleillé", "Clear": "Dégagé",
        "Partly cloudy": "Partiellement nuageux", "Overcast": "Couvert",
        "Mist": "Brumeux", "Fog": "Brouillard", "Cloudy": "Nuageux",
        "Light rain": "Pluie légère", "Moderate rain": "Pluie modérée",
        "Heavy rain": "Forte pluie", "Light drizzle": "Bruine légère",
        "Freezing drizzle": "Bruine verglaçante", "Light snow": "Neige légère",
        "Moderate snow": "Neige modérée", "Heavy snow": "Forte neige",
        "Blowing snow": "Tempête de neige", "Blizzard": "Blizzard",
        "Thundery outbreaks possible": "Risque d'orage",
        "Patchy rain possible": "Averses possibles",
        "Patchy snow possible": "Flocons possibles",
        "Patchy light drizzle": "Bruine éparse", "Freezing fog": "Brouillard givrant",
        "Patchy light rain": "Pluie légère éparse",
    }
    _DIR_FR = {
        "N": "Nord", "NE": "Nord-Est", "E": "Est", "SE": "Sud-Est",
        "S": "Sud", "SW": "Sud-Ouest", "W": "Ouest", "NW": "Nord-Ouest",
        "NNE": "Nord-Nord-Est", "ENE": "Est-Nord-Est", "ESE": "Est-Sud-Est",
        "SSE": "Sud-Sud-Est", "SSW": "Sud-Sud-Ouest", "WSW": "Ouest-Sud-Ouest",
        "WNW": "Ouest-Nord-Ouest", "NNW": "Nord-Nord-Ouest",
    }
    try:
        session = await get_llm_session()
        async with session.get(
            "https://wttr.in/Arlon?format=j1",
            headers={"User-Agent": "KYRONEX/1.0"},
            timeout=aiohttp_client.ClientTimeout(total=8)
        ) as r:
            if r.status == 200:
                data = json.loads(await r.text())
                cur   = data["current_condition"][0]
                today = data.get("weather", [{}])[0]
                temp    = cur.get("temp_C", "?")
                feels   = cur.get("FeelsLikeC", "?")
                hum     = cur.get("humidity", "?")
                wind_k  = cur.get("windspeedKmph", "?")
                wind_d  = _DIR_FR.get(cur.get("winddir16Point", ""), cur.get("winddir16Point", "?"))
                uv      = cur.get("uvIndex", "?")
                vis     = cur.get("visibility", "?")
                desc_en = (cur.get("weatherDesc") or [{}])[0].get("value", "?")
                desc    = _DESC_FR.get(desc_en, desc_en)
                max_t   = today.get("maxtempC", "?")
                min_t   = today.get("mintempC", "?")
                # Prévision pluie : somme des précipitations horaires
                hourly  = today.get("hourly", [])
                rain_mm = sum(float(h.get("precipMM", 0)) for h in hourly)
                rain_str = f"Précipitations prévues : {rain_mm:.1f} millimètres. " if rain_mm > 0.5 else ""
                result = (
                    f"{desc}. Température {temp} degrés, ressenti {feels} degrés. "
                    f"Humidité {hum} pour cent. Vent {wind_k} kilomètres heure en provenance du {wind_d}. "
                    f"{rain_str}"
                    f"Indice ultraviolet {uv}, visibilité {vis} kilomètres. "
                    f"Prévisions du jour : minimum {min_t} degrés, maximum {max_t} degrés."
                )
                _weather_cache_save(result)
                return result
    except Exception:
        pass
    # Fallback simple
    try:
        session = await get_llm_session()
        async with session.get(
            "https://wttr.in/Arlon?format=%t,+humidite+%h,+vent+%w&lang=fr",
            timeout=aiohttp_client.ClientTimeout(total=5)
        ) as r:
            if r.status == 200:
                txt = _clean_tts_text((await r.text()).strip())
                _weather_cache_save(txt)
                return txt
    except Exception:
        pass
    # Fallback offline : dernier cache fichier
    cached = _weather_cache_load()
    if cached:
        return cached + " (données en cache, hors ligne)"
    return "Capteurs météo indisponibles."



# ── Chain-of-thought : détection questions complexes ─────────────────────────
import re as _re_cot
_COT_PATTERNS = _re_cot.compile(
    r"""(?xi)
    # Maths / calcul
    combien\s+font | calcul | multipli | divis | addition | soustrai |
    pourcentage | racine | equation | resoudre | resultat |
    # Logique / raisonnement
    si\s+.{0,40}\s+alors | plus\s+grand | plus\s+petit | lequel | laquelle |
    compare | différence\s+entre | avantage | inconvénient | meilleur |
    # Sciences / faits précis
    comment\s+fonctionne | pourquoi | expliqu | définition | qu.est.ce\s+que |
    principe | théorie | formule | vitesse | distance | temps |
    # Géographie / histoire / culture
    capitale | superficie | population | habitants | année | date | quand |
    inventé | découvert | fondé | siècle | pays | continent | fleuve |
    # Informatique
    protocole | algorithme | complexité | différence\s+entre | architecture
    """,
    _re_cot.IGNORECASE
)

def _needs_cot(text: str) -> bool:
    """Retourne True si la question mérite un raisonnement étape par étape."""
    # Trop courte = simple
    if len(text.split()) < 5:
        return False
    # Question avec point d'interrogation ou mot interrogatif
    has_q = '?' in text or _re_cot.match(r'^(combien|comment|pourquoi|quand|quel|quelle|qui|où|est-ce)', text.strip(), _re_cot.I)
    return bool(has_q and _COT_PATTERNS.search(text))

def check_function_call(user_msg: str) -> tuple[str | None, str | None]:
    """Vérifie si le message correspond à une commande directe.
    Retourne (type, réponse) ou (None, None)."""
    for pattern, func_type in _FUNC_PATTERNS:
        m = pattern.search(user_msg)
        if m:
            return func_type, m
    return None, None


async def execute_function(func_type: str, match, user_name: str = "") -> str:
    """Exécute une commande directe et retourne la réponse KITT."""
    if func_type == "time":
        now = datetime.now()
        return f"Il est exactement {now.strftime('%H heures %M')}, {user_name}. Mes circuits sont synchronisés à la milliseconde près."
    elif func_type == "date":
        now = datetime.now()
        jours = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
        mois = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
        return f"Nous sommes le {jours[now.weekday()]} {now.day} {mois[now.month-1]} {now.year}. Mon calendrier interne est parfaitement calibré."
    elif func_type == "system":
        status = _get_system_status()
        return f"Diagnostic de mes systèmes : {status} Tous mes circuits sont opérationnels."
    elif func_type == "weather":
        weather = await _get_weather()
        return f"Voici le rapport météorologique complet pour votre secteur, {user_name}. {weather}"
    elif func_type == "timer":
        val = int(match.group(1))
        unit = match.group(2).lower()
        if unit.startswith("min"):
            seconds = val * 60
            label = f"{val} minute{'s' if val > 1 else ''}"
        else:
            seconds = val
            label = f"{val} seconde{'s' if val > 1 else ''}"
        task = asyncio.create_task(_run_timer(seconds, label))
        _active_timers.append(task)
        return f"Affirmatif. Timer de {label} activé. Je vous alerterai à l'expiration."
    elif func_type == "gps":
        destination = match.group(1).strip().rstrip('.!?,')
        return f"Navigation activée. Je calcule l'itinéraire vers {destination}. Bonne route, {user_name}."
    elif func_type == "relai":
        recipient = match.group(1).strip().lower()
        message = match.group(2).strip().rstrip('.!?,;')
        print(f"[RELAI] {user_name} → {recipient}: {message[:40]}", flush=True)
        memos = _memos_load()
        memos.insert(0, {"text": message, "user": user_name, "destinataire": recipient,
                         "date": datetime.now().strftime("%d/%m %H:%M"), "done": False})
        if len(memos) > 100:
            memos = memos[:100]
        _memos_save(memos)
        return f"Message noté pour {recipient}. Je lui dis : {message}."
    elif func_type == "memo":
        text = match.group(1).strip().rstrip('.!?,;')
        memos = _memos_load()
        memos.insert(0, {"text": text, "user": user_name,
                         "date": datetime.now().strftime("%d/%m %H:%M"), "done": False})
        if len(memos) > 100:
            memos = memos[:100]
        _memos_save(memos)
        return f"Mémo enregistré, {user_name}. Je retiens : {text}."
    elif func_type == "reminder":
        t_raw = match.group(1).strip().replace("H", ":").replace("h", ":").rstrip(":")
        if ":" not in t_raw:
            t_raw += ":00"
        parts = t_raw.split(":")
        t_clean = f"{parts[0].zfill(2)}:{(parts[1] if len(parts) > 1 and parts[1] else '00').zfill(2)}"
        txt = match.group(2).strip().rstrip('.!?,;')
        _reminders_list.insert(0, {"time": t_clean, "text": txt, "user": user_name, "done": False})
        _reminders_save()
        return f"Rappel programmé à {t_clean}, {user_name}. Je vous alerterai pour : {txt}."
    elif func_type == "music":
        act_raw = match.group(1).lower()
        _map = {"pause": "pause", "stop": "stop", "suivante": "next",
                "précédente": "prev", "lecture": "pause", "joue": "pause", "reprends": "pause"}
        act = _map.get(act_raw, "pause")
        result = await _vlc_cmd(act)
        return result.format(user_name)
    elif func_type in ("juron", "merde", "connard", "incroyable"):
        import random
        return random.choice(_KITT_REPLIQUES[func_type])
    elif func_type == "shutdown":
        async def _do_shutdown():
            await asyncio.sleep(1.5)
            try:
                await asyncio.create_subprocess_exec(
                    "sudo", "shutdown", "-h", "now",
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.DEVNULL,
                )
                print("[SHUTDOWN] Arrêt système lancé par ordre vocal", flush=True)
            except Exception as e:
                print(f"[SHUTDOWN] Erreur: {e}", flush=True)
        asyncio.create_task(_do_shutdown())
        return f"Affirmative, {user_name}. Arrêt du système en cours. Au revoir."
    elif func_type == "wake_mode":
        return f"Mode Wake-up activé, {user_name}. Dites KITT pour me commander."
    return ""


def get_function_action(func_type: str, match) -> dict | None:
    """Retourne une action client optionnelle (ex: ouvrir GPS) pour certaines fonctions."""
    if func_type == "gps":
        destination = match.group(1).strip().rstrip('.!?,')
        return {"type": "gps", "destination": destination}
    elif func_type == "wake_mode":
        return {"type": "wake_mode"}
    return None


# ── Handlers HTTP ────────────────────────────────────────────────────────
async def handle_chat(request: web.Request) -> web.Response:
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "JSON invalide"}, status=400)

    user_msg = body.get("message", "").strip()
    session_id = body.get("session_id", "default")
    want_audio = body.get("audio", True)
    _cp = request.transport.get_extra_info("peername")
    _cip = _cp[0] if _cp else "inconnu"
    _cmac = resolve_mac(_cip)
    user_lang_pref_c = _get_user_lang(_cmac)
    client_lang = body.get("lang", "")
    lang = user_lang_pref_c if user_lang_pref_c else (_map_whisper_lang(client_lang) if client_lang else _detect_lang(user_msg))

    if not user_msg:
        return web.json_response({"error": "Message vide"}, status=400)

    t_total = time.time()
    user_display = body.get("user_name", "").strip() or get_user_display_name(request)

    # Vérifier les messages destinés à cet utilisateur AVANT de créer la session
    is_new_session = session_id not in conversations
    incoming_relais = _get_and_clear_relais(user_display)
    if incoming_relais and is_new_session:
        # Premier message de la session : annoncer les relais
        msgs_text = "; ".join([f"{m.get('user', '?')} te dit que {m['text']}" for m in incoming_relais])
        relais_announce = f"[ANNONCE RELAIS: {msgs_text}]"
        user_msg = relais_announce + " " + user_msg

    if session_id not in conversations:
        conversations[session_id] = []

    # Function calling (interception avant LLM)
    func_type, func_match = check_function_call(user_msg)
    if func_type:
        func_reply = await execute_function(func_type, func_match, user_display)
        asyncio.create_task(broadcast_monitor({"type": "user_msg", "user": user_display, "session_id": session_id, "message": user_msg}))
        asyncio.create_task(broadcast_monitor({"type": "assistant_msg", "user": user_display, "session_id": session_id, "message": func_reply}))
        conversations[session_id].append({"role": "user", "content": user_msg})
        conversations[session_id].append({"role": "assistant", "content": func_reply})
        print(f"[FUNCTION] {func_type} → {func_reply[:70]}", flush=True)
        # TTS pour function call
        audio_url = None
        tts_ms = 0
        if want_audio:
            t_tts = time.time()
            try:
                emotion = detect_emotion(func_reply)
                audio_path = await text_to_speech(func_reply, emotion, lang)
                audio_url = f"/audio/{Path(audio_path).name}"
                tts_ms = (time.time() - t_tts) * 1000
            except Exception as e:
                print(f"[TTS ERREUR] {e}")
        return web.json_response({
            "reply": func_reply, "audio_url": audio_url,
            "session_id": session_id,
            "timing": {"llm_ms": 0, "tts_ms": round(tts_ms), "total_ms": round((time.time() - t_total) * 1000)}
        })

    # LLM
    t_llm = time.time()
    try:
        reply = await query_llm(user_msg, conversations[session_id], user_display, user_lang_pref_c, _cmac)
    except Exception as e:
        return web.json_response({"error": f"Erreur LLM: {e}"}, status=503)
    llm_ms = (time.time() - t_llm) * 1000

    conversations[session_id].append({"role": "user", "content": user_msg})
    conversations[session_id].append({"role": "assistant", "content": reply})

    # Extraction mémoire par utilisateur
    if _MEMORY_FORGET.search(user_msg):
        clear_memory_for_user(user_display, _cmac)
    else:
        fact = extract_memory_fact(user_msg, user_display)
        if fact:
            add_memory(fact, user_display, _cmac)

    # Nettoyage RAM automatique tous les N messages
    global _message_count
    _message_count += 1
    if _message_count % CACHE_CLEAR_EVERY == 0:
        await asyncio.get_running_loop().run_in_executor(None, _clear_ram_cache)

    asyncio.create_task(broadcast_monitor({"type": "user_msg", "user": user_display, "session_id": session_id, "message": user_msg}))
    asyncio.create_task(broadcast_monitor({"type": "assistant_msg", "user": user_display, "session_id": session_id, "message": reply}))

    # Sauvegarde automatique de la conversation pour l'archive
    # _cmac et user_display déjà résolus en début de handler
    async def _auto_save_conv():
        try:
            name = _get_user_name(_cmac) or user_display or "inconnu"
            safe = _conv_safe(name)
            user_dir = CONV_STORE_DIR / safe
            user_dir.mkdir(exist_ok=True)
            ts_day = datetime.now().strftime('%Y-%m-%d')
            fpath = user_dir / f"conv_{ts_day}.txt"
            ts_time = datetime.now().strftime('%H:%M')
            line_user = f"[{ts_time}] {name.upper()}: {user_msg}\n"
            line_assistant = f"[{ts_time}] KITT: {reply}\n"
            with open(fpath, "a", encoding="utf-8") as f:
                if f.tell() == 0:
                    f.write(f"Conversation KITT — {name} — {ts_day}\n{'='*50}\n")
                f.write(line_user)
                f.write(line_assistant)
        except Exception as e:
            print(f"[CONV] Erreur auto-save: {e}")

    asyncio.create_task(_auto_save_conv())

    # TTS
    audio_url = None
    tts_ms = 0
    if want_audio:
        await asyncio.sleep(0.2)  # délai 200ms — simulation réflexion IA instantanée
        t_tts = time.time()
        try:
            emotion = detect_emotion(reply)
            audio_path = await text_to_speech(reply, emotion, lang)
            audio_url = f"/audio/{Path(audio_path).name}"
            tts_ms = (time.time() - t_tts) * 1000
        except Exception as e:
            print(f"[TTS ERREUR] {e}")

    total_ms = (time.time() - t_total) * 1000

    return web.json_response({
        "reply": reply,
        "audio_url": audio_url,
        "session_id": session_id,
        "timing": {
            "llm_ms": round(llm_ms),
            "tts_ms": round(tts_ms),
            "total_ms": round(total_ms),
        }
    })


async def handle_chat_stream(request: web.Request) -> web.StreamResponse:
    """POST /api/chat/stream — Streaming chat, texte token par token puis audio."""
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "JSON invalide"}, status=400)

    user_msg = body.get("message", "").strip()
    session_id = body.get("session_id", "default")
    # Résolution MAC pour préférences utilisateur persistantes
    _sp = request.transport.get_extra_info("peername")
    _sip = _sp[0] if _sp else "inconnu"
    _smac = resolve_mac(_sip)
    user_lang_pref = _get_user_lang(_smac)
    # Priorité langue : préférence stockée > Whisper > auto-détection
    client_lang = body.get("lang", "")
    lang = user_lang_pref if user_lang_pref else (_map_whisper_lang(client_lang) if client_lang else _detect_lang(user_msg))
    if not user_msg:
        return web.json_response({"error": "Message vide"}, status=400)
    # Position GPS fournie par le client
    _gps_context = ""
    try:
        _gps_text = body.get("gps_text", "").strip()
        if _gps_text:
            # Texte déjà résolu côté JS (badge GPS) — priorité maximale
            _gps_context = f"[POSITION GPS: {_gps_text}]"
        else:
            # Fallback : reverse geocoding côté serveur
            _glat = body.get("lat")
            _glon = body.get("lon")
            if _glat is not None and _glon is not None:
                import geo_offline
                if geo_offline.is_ready():
                    _gr = geo_offline.reverse(float(_glat), float(_glon))
                    if _gr:
                        _parts = [p for p in [_gr.get("road"), _gr.get("city")] if p]
                        if _parts:
                            _gps_context = f"[POSITION GPS: {', '.join(_parts)}]"
    except Exception:
        pass

    global _last_interaction_time
    _last_interaction_time = time.time()
    # Effacer la question en attente après réponse de l'utilisateur
    global _kitt_pending_question, _kitt_question_asked_at
    if _kitt_pending_question and (time.time() - _kitt_question_asked_at) < 600:
        _kitt_pending_question = ""

    # Function calling — commandes directes sans LLM
    user_display = body.get("user_name", "").strip() or get_user_display_name(request)

    # Vérifier les messages destinés à cet utilisateur
    incoming_relais = _get_and_clear_relais(user_display)
    if incoming_relais and session_id not in conversations:
        # Premier message de la session : annoncer les relais
        msgs_text = "; ".join([f"{m.get('user', '?')} te dit que {m['text']}" for m in incoming_relais])
        relais_announce = f"[ANNONCE RELAIS: {msgs_text}]"
        user_msg = relais_announce + " " + user_msg
    func_type, func_match = check_function_call(user_msg)
    if func_type:
        func_reply = await execute_function(func_type, func_match, user_display)
        asyncio.create_task(broadcast_monitor({"type": "user_msg", "user": user_display, "session_id": session_id, "message": user_msg}))
        asyncio.create_task(broadcast_monitor({"type": "assistant_msg", "user": user_display, "session_id": session_id, "message": func_reply}))

        if session_id not in conversations:
            conversations[session_id] = []
        conversations[session_id].append({"role": "user", "content": user_msg})
        conversations[session_id].append({"role": "assistant", "content": func_reply})

        resp = web.StreamResponse()
        resp.headers["Content-Type"] = "text/event-stream"
        resp.headers["Cache-Control"] = "no-cache"
        resp.headers["X-Accel-Buffering"] = "no"
        await resp.prepare(request)
        await resp.write(f"data: {json.dumps({'token': func_reply})}\n\n".encode())

        # TTS avec émotion
        emotion = detect_emotion(func_reply)
        _fc_karr = _karr_sessions.get(session_id, 0) > time.time()
        tts_task = asyncio.create_task(_synth_chunk(func_reply, emotion, lang, karr=_fc_karr))
        audio_url = await tts_task
        if audio_url:
            await resp.write(f"data: {json.dumps({'audio_chunk': audio_url, 'chunk_text': func_reply})}\n\n".encode())

        done_payload: dict = {'done': True, 'timing': {'llm_ms': 0, 'tts_ms': 0, 'function': func_type}}
        action = get_function_action(func_type, func_match)
        if action:
            done_payload['action'] = action
        await resp.write(f"data: {json.dumps(done_payload)}\n\n".encode())
        await resp.write_eof()
        print(f"[FUNCTION] {func_type} → {func_reply[:60]}")
        return resp

    # Auto-detect vision keywords → capture camera + inject context
    global _last_vision_time
    vision_ms = 0
    llm_user_msg = user_msg
    # Chain-of-thought : injecter instruction de raisonnement si question complexe
    if _needs_cot(user_msg):
        llm_user_msg = "Réfléchis étape par étape (en interne) avant de répondre. Donne uniquement la réponse finale, concise et naturelle à l'oreille. " + llm_user_msg
    now = time.time()
    if (VISION_SCRIPT.exists()
            and VISION_KEYWORDS.search(user_msg)
            and (now - _last_vision_time) >= VISION_COOLDOWN):
        t_vision = time.time()
        description = await capture_vision()
        vision_ms = (time.time() - t_vision) * 1000
        _last_vision_time = time.time()
        if description:
            print(f"[VISION-AUTO] {vision_ms:.0f}ms | {description[:80]}")
            llm_user_msg = f"[VISION: {description}] {user_msg}"
        else:
            llm_user_msg = f"[VISION: Capteurs visuels indisponibles.] {user_msg}"

    if session_id not in conversations:
        conversations[session_id] = []

    # ── Journal de bord — suivi session ─────────────────────────────────
    _is_new_session = session_id not in _session_journal
    if _is_new_session:
        _session_journal[session_id] = {"user": user_display, "start": time.time(), "msgs": 0}
    _session_journal[session_id]["msgs"] += 1
    _session_journal[session_id]["user"] = user_display  # màj si nom renseigné en cours

    # ── Notification Telegram — nouvelle session ──────────────────────────
    _tg_key = f"{user_display}:{session_id[:8]}"
    _tg_now = time.time()
    if _is_new_session and (_tg_now - _tg_session_cooldown.get(_tg_key, 0)) > _TG_COOLDOWN_S:
        _tg_session_cooldown[_tg_key] = _tg_now
        _tg_user = user_display or "Inconnu"
        _tg_ip   = request.headers.get("X-Forwarded-For", request.remote or "?")
        _tg_msg  = f"\U0001f7e2 KITT — Nouvelle session\n👤 {_tg_user}\n🌐 {_tg_ip}\n🕐 {__import__('datetime').datetime.now().strftime('%H:%M:%S')}"
        asyncio.create_task(_telegram_alert(_tg_msg))

    # ── Mode KARR — détection activation / désactivation ─────────────────
    now_karr = time.time()
    karr_expiry = _karr_sessions.get(session_id, 0)
    if _KARR_TRIGGERS.search(user_msg):
        _karr_sessions[session_id] = now_karr + KARR_DURATION
        asyncio.create_task(send_proactive(
            "Transfert de contrôle. KARR est en ligne. KITT temporairement désactivé.",
            "worried"
        ))
        _tg_karr_user = user_display or "Inconnu"
        asyncio.create_task(_telegram_alert(
            f"\u26a0\ufe0f KARR ACTIV\u00c9 par {_tg_karr_user}\n"
            f"\U0001f552 {__import__('datetime').datetime.now().strftime('%H:%M:%S')} — dur\u00e9e: {KARR_DURATION//60} min"
        ))
        asyncio.create_task(broadcast_monitor({
            "type": "karr_mode", "active": True, "session_id": session_id
        }))
        # Envoi direct via proactive WS pour clients distants (iPhone, etc.)
        _karr_payload = json.dumps({"type": "karr_mode", "active": True, "session_id": session_id})
        for _ws in list(_proactive_ws):
            try:
                asyncio.create_task(_ws.send_str(_karr_payload))
            except Exception:
                pass
    elif _KARR_RESTORE.search(user_msg) or now_karr > karr_expiry > 0:
        if session_id in _karr_sessions:
            del _karr_sessions[session_id]
            asyncio.create_task(send_proactive("KITT reprend le contrôle.", "confident"))
            asyncio.create_task(broadcast_monitor({
                "type": "karr_mode", "active": False, "session_id": session_id
            }))
            _karr_payload = json.dumps({"type": "karr_mode", "active": False, "session_id": session_id})
            for _ws in list(_proactive_ws):
                try:
                    asyncio.create_task(_ws.send_str(_karr_payload))
                except Exception:
                    pass
    karr_active = _karr_sessions.get(session_id, 0) > now_karr

    asyncio.create_task(broadcast_monitor({"type": "user_msg", "user": user_display, "session_id": session_id, "message": user_msg}))

    # ── Annonce navigation TTS directe (bypass LLM) ──────────────────────
    if body.get("nav_tts_only") and user_msg.startswith("[NAV]"):
        nav_text = user_msg[5:].strip()
        resp = web.StreamResponse()
        resp.headers["Content-Type"] = "text/event-stream"
        resp.headers["Cache-Control"] = "no-cache"
        resp.headers["X-Accel-Buffering"] = "no"
        await resp.prepare(request)
        audio_url = await _synth_chunk(nav_text, "confident", lang)
        if audio_url:
            await resp.write(f"data: {json.dumps({'audio_chunk': audio_url, 'chunk_text': nav_text})}\n\n".encode())
        await resp.write(f"data: {json.dumps({'done': True, 'timing': {'llm_ms': 0, 'tts_ms': 0}})}\n\n".encode())
        return resp

    # ── Rafraîchissement météo conscience physique (si cache expiré) ──────
    if time.time() - _awareness_weather_cache.get("ts", 0) > AWARENESS_WEATHER_TTL:
        asyncio.create_task(_refresh_awareness_weather())

    # Lancer RAG + web_search en parallèle (skip si message simple/conversationnel)
    t_search = time.time()
    if _is_simple_msg(user_msg):
        async def _empty_rag(): return ""
        rag_task = asyncio.create_task(_empty_rag())
        web_task = asyncio.create_task(_empty_rag())
    else:
        rag_task = asyncio.create_task(search_local_knowledge(user_msg))
        web_task = asyncio.create_task(web_search(user_msg))

    # Préparer la réponse SSE immédiatement
    resp = web.StreamResponse()
    resp.headers["Content-Type"] = "text/event-stream"
    resp.headers["Cache-Control"] = "no-cache"
    await resp.prepare(request)

    # Attendre 1 seconde — si les recherches ne sont pas terminées, annoncer à voix haute
    done, pending = await asyncio.wait({rag_task, web_task}, timeout=1.0)
    if pending:
        _search_announce = random.choice([
            "Laisse-moi vérifier dans ma mémoire...",
            "Je fouille dans mes archives pour te dire ça.",
            "Attends, je jette un oeil a mes notes...",
            "Je vais voir ce que j ai en reserve dans mes dossiers.",
            "Voyons ce que disent mes tablettes...",
            "Petit instant, je regarde dans mes ressources...",
            "Je consulte ma base pour etre bien precis.",
            "Je verifie l info exacte tout de suite...",
            "Laisse-moi deux secondes, je valide ce point.",
            "Attends, je regarde ca...",
            "Je checke mes infos et je te dis.",
            "Laisse-moi deux secondes, je verifie un truc...",
            "Je vais voir ce que j ai la-dessus.",
            "Voyons voir...",
            "Alors, d apres ce que je sais...",
            "Je jette un petit coup d oeil dans mes papiers.",
        ])
        await resp.write(f"data: {json.dumps({'token': _search_announce})}\n\n".encode())
        _ann_tts_task = asyncio.create_task(_synth_chunk(_search_announce, "normal", lang, karr=karr_active))
        asyncio.create_task(send_audio_when_ready(_ann_tts_task, _search_announce))
        print(f"[RAG] Recherche longue ({(time.time()-t_search)*1000:.0f}ms) — annonce vocale async", flush=True)

    # Récupérer les résultats (attendre si pas encore terminés)
    local_info = await rag_task
    web_info = await web_task
    print(f"[RAG] Recherches terminées en {(time.time()-t_search)*1000:.0f}ms", flush=True)

    if _kitt_pending_question and (time.time() - _kitt_question_asked_at) < 600:
        llm_user_msg = f"[KITT_A_DEMANDE: {_kitt_pending_question}]\n{llm_user_msg}"
    if _gps_context:
        llm_user_msg = f"{_gps_context}\n{llm_user_msg}"
        print(f"[GPS] Position injectée : {_gps_context}", flush=True)
    if local_info:
        llm_user_msg = f"[CONNAISSANCE LOCALE:\n{local_info}]\n{llm_user_msg}"
        print(f"[RAG] {len(local_info)} chars injectés", flush=True)
    if web_info:
        llm_user_msg = f"[INFO WEB:\n{web_info}]\n{llm_user_msg}"
        print(f"[WEB] {len(web_info)} chars injectés", flush=True)

    # System prompt adapté — KARR si actif, sinon KITT normal
    if karr_active:
        sys_prompt = _KARR_PROMPT
    else:
        sys_prompt = get_system_prompt(user_display, user_lang_pref, _smac)
    messages = [{"role": "system", "content": sys_prompt}]
    messages.extend(_trim_history(conversations[session_id], sys_prompt, llm_user_msg))
    messages.append({"role": "user", "content": llm_user_msg})

    vlog(f"STREAM_LLM_START msgs={len(messages)} user={user_display}")

    global _llm_active
    _llm_active += 1
    full_reply = ""
    sentence_buf = ""
    tts_items = []   # tasks synthèse TTS
    send_tasks = []  # tasks envoi audio SSE
    t0 = time.time()
    tts_lang = lang
    tts_lang_locked = bool(user_lang_pref)  # Verrouillé si préférence stockée

    # Fonction pour envoyer l'audio dès qu'il est prêt
    async def send_audio_when_ready(task, chunk_text):
        audio_url = await task
        if audio_url:
            await resp.write(f"data: {json.dumps({'audio_chunk': audio_url, 'chunk_text': chunk_text})}\n\n".encode())

    try:
        session = await get_llm_session()
        async with session.post(
            f"{LLAMA_SERVER}/api/chat",
            json={"model": LLM_MODEL, "messages": messages, "think": False, "stream": True, "keep_alive": -1,
                  "options": {"temperature": 0.8, "num_predict": 250, "top_p": 0.9, "num_ctx": 2048}},
            timeout=aiohttp_client.ClientTimeout(total=120, sock_read=45),
        ) as llm_resp:
            _raw_buf = ""       # Buffer brut accumulatif (pour filtrer <think> multi-tokens)
            _clean_emitted = "" # Texte nettoyé déjà émis au client
            async for line in llm_resp.content:
                text = line.decode("utf-8").strip()
                if text:
                    try:
                        chunk = json.loads(text)
                        if chunk.get("done", False):
                            break
                        delta = chunk.get("message", {}).get("content", "")
                        if delta:
                            full_reply += delta
                            _raw_buf += delta
                            # Filtrage <think> : blocs complets
                            clean_buf = re.sub(r'<think>.*?</think>', '', _raw_buf, flags=re.DOTALL)
                            # Filtrage tokens spéciaux Qwen
                            clean_buf = re.sub(r'<\|[^|]+\|>', '', clean_buf)
                            # Filtrage bloc <think> en cours (incomplet, sans </think>)
                            if '<think>' in clean_buf:
                                clean_buf = re.sub(r'<think>.*$', '', clean_buf, flags=re.DOTALL)
                            # Émettre seulement le nouveau contenu nettoyé
                            new_content = clean_buf[len(_clean_emitted):]
                            if not new_content:
                                continue
                            _clean_emitted = clean_buf
                            sentence_buf += new_content
                            await resp.write(f"data: {json.dumps({'token': new_content})}\n\n".encode())
                            # 1er chunk : demarrer la voix des la 1re clause (virgule/;/: , >=25 car.) pour reagir plus vite
                            if len(tts_items) == 0:
                                match = re.search(r'[.!?…](?:\s|$)', sentence_buf)
                                _clause = re.search(r'[,;:](?:\s|$)', sentence_buf)
                                if not match and _clause and len(sentence_buf) >= 25:
                                    match = _clause
                            else:
                                match = re.search(r'[.!?…](?:\s|$)', sentence_buf)
                            if (match and len(sentence_buf) >= 8) or sentence_buf.endswith('\n'):
                                if match:
                                    end_pos = match.end() - 1
                                    chunk_text = sentence_buf[:end_pos].strip()
                                    sentence_buf = sentence_buf[end_pos:].lstrip()
                                else:
                                    chunk_text = sentence_buf.strip()
                                    sentence_buf = ""
                                if chunk_text and any(c.isalpha() for c in chunk_text):
                                    if not tts_lang_locked and len(full_reply) >= 15:
                                        detected = _detect_lang(full_reply)
                                        if detected != tts_lang:
                                            print(f"[LANG] Réponse détectée: {tts_lang}→{detected}", flush=True)
                                        tts_lang = detected
                                        tts_lang_locked = True
                                    emotion = detect_emotion(full_reply)
                                    tts_task = asyncio.create_task(_synth_chunk(chunk_text, emotion, tts_lang, karr=karr_active))
                                    tts_items.append(tts_task)
                                    send_tasks.append(asyncio.create_task(send_audio_when_ready(tts_task, chunk_text)))
                    except (json.JSONDecodeError, KeyError):
                        pass
    except Exception as e:
        print(f"[LLM] Erreur stream: {e}")
        if not full_reply:
            full_reply = "Mes circuits ont subi une micro-interruption. Reformulez votre demande."
            await resp.write(f"data: {json.dumps({'token': full_reply})}\n\n".encode())

    llm_ms = (time.time() - t0) * 1000
    emotion = detect_emotion(full_reply)
    print(f"[EMOTION] {emotion}")

    # TTS du reste de texte (phrase incomplète ou sous le seuil de 40 chars)
    if sentence_buf.strip():
        rest = sentence_buf.strip()
        tts_task = asyncio.create_task(_synth_chunk(rest, emotion, tts_lang, karr=karr_active))
        tts_items.append(tts_task)
        send_tasks.append(asyncio.create_task(send_audio_when_ready(tts_task, rest)))

    # Nettoyer full_reply avant historique (supprimer blocs <think> résiduels)
    full_reply_clean = re.sub(r'<think>.*?</think>', '', full_reply, flags=re.DOTALL)
    full_reply_clean = re.sub(r'<\|[^|]+\|>', '', full_reply_clean).strip()
    if not full_reply_clean:
        full_reply_clean = full_reply.strip()

    conversations[session_id].append({"role": "user", "content": user_msg})
    conversations[session_id].append({"role": "assistant", "content": full_reply_clean})

    # Mémoire par utilisateur — extraire les faits du message utilisateur
    if _MEMORY_FORGET.search(user_msg):
        clear_memory_for_user(user_display, _smac)
    else:
        fact = extract_memory_fact(user_msg, user_display)
        if fact:
            add_memory(fact, user_display, _smac)

    # Nettoyage RAM automatique
    global _message_count
    _message_count += 1
    if _message_count % CACHE_CLEAR_EVERY == 0:
        await asyncio.get_running_loop().run_in_executor(None, _clear_ram_cache)

    asyncio.create_task(broadcast_monitor({"type": "assistant_msg", "user": user_display, "session_id": session_id, "message": full_reply}))

    # Sauvegarde automatique de la conversation pour l'archive
    # _smac et user_display sont déjà résolus en début de handler — évite request.transport (peut être None après SSE)
    async def _auto_save_conv():
        try:
            name = _get_user_name(_smac) or user_display or "inconnu"
            safe = _conv_safe(name)
            user_dir = CONV_STORE_DIR / safe
            user_dir.mkdir(exist_ok=True)
            ts_day = datetime.now().strftime('%Y-%m-%d')
            fpath = user_dir / f"conv_{ts_day}.txt"
            ts_time = datetime.now().strftime('%H:%M')
            line_user = f"[{ts_time}] {name.upper()}: {user_msg}\n"
            line_assistant = f"[{ts_time}] KITT: {full_reply_clean}\n"
            with open(fpath, "a", encoding="utf-8") as f:
                if f.tell() == 0:
                    f.write(f"Conversation KITT — {name} — {ts_day}\n{'='*50}\n")
                f.write(line_user)
                f.write(line_assistant)
        except Exception as e:
            print(f"[CONV] Erreur auto-save (stream): {e}")

    asyncio.create_task(_auto_save_conv())

    # Attendre synthèse TTS + envoi de tous les chunks audio avant "done"
    t_tts = time.time()
    if tts_items:
        await asyncio.gather(*tts_items, return_exceptions=True)
    if send_tasks:
        await asyncio.gather(*send_tasks, return_exceptions=True)
    tts_ms = (time.time() - t_tts) * 1000

    _llm_active -= 1

    timing = {'llm_ms': round(llm_ms), 'tts_ms': round(tts_ms), 'emotion': emotion}
    if vision_ms:
        timing['vision_ms'] = round(vision_ms)
    await resp.write(f"data: {json.dumps({'done': True, 'timing': timing})}\n\n".encode())

    await resp.write_eof()
    return resp


async def handle_stt(request: web.Request) -> web.Response:
    """POST /api/stt — Transcription audio (multipart avec fichier audio)."""
    reader = await request.multipart()
    audio_data = None

    while True:
        part = await reader.next()
        if part is None:
            break
        if part.name == "audio":
            audio_data = await part.read()

    if not audio_data:
        return web.json_response({"error": "Pas d'audio reçu"}, status=400)

    # Sauvegarder temporairement le fichier audio
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        f.write(audio_data)
        tmp_path = f.name

    # Option 1 : forcer la langue préférée de l'utilisateur dans Whisper
    peername = request.transport.get_extra_info("peername")
    _ip = peername[0] if peername else "inconnu"
    _mac = resolve_mac(_ip)
    user_lang = _get_user_lang(_mac) or "fr"  # défaut: français

    t0 = time.time()
    try:
        vlog("STT_START")
        segments, info = whisper_model.transcribe(
            tmp_path,
            language=user_lang,
            beam_size=1,
            vad_filter=True,
            vad_parameters={
                "threshold": 0.55,
                "min_silence_duration_ms": 120,
                "speech_pad_ms": 50,
                "min_speech_duration_ms": 100,
            },
            temperature=0,
            condition_on_previous_text=False,
            no_speech_threshold=0.35,
            initial_prompt="KITT, Manix, KYRONEX, Virginie, intelligence artificielle, Knight Industries.",
        )
        text = " ".join(seg.text.strip() for seg in segments).strip()
        stt_ms = (time.time() - t0) * 1000

        # Option 3 : si confiance faible et langue par défaut, retry en fr
        if not _get_user_lang(_mac) and info.language_probability < 0.75 and info.language != "fr":
            print(f"[STT] Confiance faible ({info.language_probability:.2f}, detecte={info.language}), retry fr")
            segs2, info2 = whisper_model.transcribe(
                tmp_path,
                language="fr",
                beam_size=1,
                vad_filter=True,
                vad_parameters={
                "threshold": 0.55,
                "min_silence_duration_ms": 120,
                "speech_pad_ms": 50,
                "min_speech_duration_ms": 100,
            },
                temperature=0,
                condition_on_previous_text=False,
                no_speech_threshold=0.35,
                initial_prompt="KITT, Manix, KYRONEX, Virginie, intelligence artificielle, Knight Industries.",
            )
            text2 = " ".join(seg.text.strip() for seg in segs2).strip()
            if text2:
                text, info = text2, info2
            stt_ms = (time.time() - t0) * 1000

        vlog(f"STT_DONE {stt_ms:.0f}ms lang={info.language}({info.language_probability:.2f})")
        print(f"[STT] {stt_ms:.0f}ms | lang={info.language}({info.language_probability:.2f}) | {text[:80]}")
    except Exception as e:
        vlog(f"STT_ERROR {e}")
        os.unlink(tmp_path)
        return web.json_response({"error": f"STT erreur: {e}"}, status=500)

    os.unlink(tmp_path)

    # Filtre anti-hallucination Whisper
    _words = text.split()
    _hallucination = False
    if len(_words) >= 3:
        _unique = len(set(w.strip(".,!?") for w in _words))
        if _unique <= 2:
            _hallucination = True
    if text.lower().strip(" .!?,") in ("jetson", "merci", "thank you", "thanks", "sous-titres", "subtitles", ""):
        _hallucination = True
    if _hallucination:
        print(f"[STT] Hallucination filtree: {text!r}", flush=True)
        return web.json_response({"text": "", "language": info.language, "stt_ms": round(stt_ms)})

    return web.json_response({"text": text, "language": info.language, "stt_ms": round(stt_ms)})


async def handle_stt_chat_stream(request: web.Request) -> web.StreamResponse:
    """POST /api/stt-chat — STT direct → retourner le texte."""
    # MVP simple: juste faire STT + retourner comme JSON
    reader = await request.multipart()
    audio_data = None

    while True:
        part = await reader.next()
        if part is None:
            break
        if part.name == "audio":
            audio_data = await part.read()

    if not audio_data:
        return web.json_response({"error": "Pas d'audio"}, status=400)

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        f.write(audio_data)
        tmp_path = f.name

    peername = request.transport.get_extra_info("peername")
    _ip = peername[0] if peername else "inconnu"
    user_lang = _get_user_lang(resolve_mac(_ip)) or "fr"

    try:
        text, info, stt_ms = await _async_stt_with_file(tmp_path, user_lang)
        os.unlink(tmp_path)
        return web.json_response({"text": text, "language": info.language, "stt_ms": round(stt_ms)})
    except Exception as e:
        os.unlink(tmp_path)
        return web.json_response({"error": str(e)}, status=500)


async def _async_stt_with_file(tmp_path: str, user_lang: str):
    """Transcription asynchrone d'un fichier audio."""
    t0 = time.time()
    try:
        segments, info = whisper_model.transcribe(
            tmp_path,
            language=user_lang,
            beam_size=1,
            vad_filter=True,
            vad_parameters={
                "threshold": 0.55,
                "min_silence_duration_ms": 120,
                "speech_pad_ms": 50,
                "min_speech_duration_ms": 100,
            },
            temperature=0,
            condition_on_previous_text=False,
            no_speech_threshold=0.35,
            initial_prompt="KITT, Manix, KYRONEX, Virginie, intelligence artificielle, Knight Industries.",
        )
        text = " ".join(seg.text.strip() for seg in segments).strip()
        stt_ms = (time.time() - t0) * 1000
        vlog(f"STT_DONE {stt_ms:.0f}ms lang={info.language}")
        return text, info, stt_ms
    except Exception as e:
        vlog(f"STT_ERROR {e}")
        raise


# ── Vision daemon persistant ─────────────────────────────────────────────
_vision_proc = None
_vision_lock = asyncio.Lock()


async def _start_vision_daemon():
    """Démarre le daemon vision (modèle chargé une seule fois en mémoire)."""
    global _vision_proc
    if _vision_proc is not None and _vision_proc.returncode is None:
        return  # déjà actif
    _vision_proc = await asyncio.create_subprocess_exec(
        "/usr/bin/python3", str(VISION_SCRIPT), "--daemon",
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        ready = await asyncio.wait_for(_vision_proc.stdout.readline(), timeout=30)
        print(f"[VISION] Daemon démarré: {ready.decode().strip()}", flush=True)
    except asyncio.TimeoutError:
        print("[VISION] Daemon timeout au démarrage", flush=True)
        _vision_proc.kill()
        _vision_proc = None


async def capture_vision() -> str | None:
    """Envoie une commande au daemon vision et retourne la description."""
    global _vision_proc
    async with _vision_lock:
        try:
            if _vision_proc is None or _vision_proc.returncode is not None:
                await _start_vision_daemon()
            if _vision_proc is None:
                return None
                if _vision_proc and _vision_proc.stdin: _vision_proc.stdin.write(b"capture\n")
            await _vision_proc.stdin.drain()
            line = await asyncio.wait_for(_vision_proc.stdout.readline(), timeout=15)
            if not line:
                raise RuntimeError("Daemon vision: réponse vide")
            data = json.loads(line.decode())
            if "error" in data:
                print(f"[VISION] {data['error']}")
                return None
            return data.get("description")
        except Exception as e:
            print(f"[VISION] Exception: {e}")
            # Tuer le daemon défaillant — il sera relancé au prochain appel
            if _vision_proc and _vision_proc.returncode is None:
                _vision_proc.kill()
            _vision_proc = None
            return None


async def _capture_vision_persons() -> int:
    """Retourne le nb de personnes détectées (-1 si erreur/caméra indisponible)."""
    global _vision_proc
    async with _vision_lock:
        try:
            if _vision_proc is None or _vision_proc.returncode is not None:
                await _start_vision_daemon()
            if _vision_proc is None:
                return -1
            _vision_proc.stdin.write(b"capture\n")
            await _vision_proc.stdin.drain()
            line = await asyncio.wait_for(_vision_proc.stdout.readline(), timeout=15)
            if not line:
                return -1
            data = json.loads(line.decode())
            if "error" in data:
                return -1
            objects = data.get("objects", [])
            return sum(1 for o in objects if o.get("label") == "personne")
        except Exception as e:
            print(f"[VIGILANCE] Erreur capture: {e}")
            if _vision_proc and _vision_proc.returncode is None:
                _vision_proc.kill()
            _vision_proc = None
            return -1


async def handle_vision(request: web.Request) -> web.StreamResponse:
    """POST /api/vision — Capture camera + detect objects, then chat with context."""
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "JSON invalide"}, status=400)

    user_msg = body.get("message", "").strip() or "Que vois-tu ?"
    session_id = body.get("session_id", "default")

    if session_id not in conversations:
        conversations[session_id] = []

    _vp = request.transport.get_extra_info("peername")
    _vip = _vp[0] if _vp else "inconnu"
    _vmac = resolve_mac(_vip)
    user_display = get_user_display_name(request)
    asyncio.create_task(broadcast_monitor({"type": "user_msg", "user": user_display, "session_id": session_id, "message": user_msg}))

    # Capture + detect
    t_vision = time.time()
    description = await capture_vision()
    vision_ms = (time.time() - t_vision) * 1000

    if description:
        print(f"[VISION] {vision_ms:.0f}ms | {description[:80]}")
        augmented_msg = f"[VISION: {description}] {user_msg}"
    else:
        augmented_msg = f"[VISION: Capteurs visuels indisponibles.] {user_msg}"

    # Stream response (same as handle_chat_stream but with augmented message)
    messages = [{"role": "system", "content": get_system_prompt(user_display, mac=_vmac)}]
    messages.extend(conversations[session_id][-6:])
    messages.append({"role": "user", "content": augmented_msg})

    resp = web.StreamResponse()
    resp.headers["Content-Type"] = "text/event-stream"
    resp.headers["Cache-Control"] = "no-cache"
    await resp.prepare(request)

    full_reply = ""
    sentence_buf = ""
    tts_items = []  # (chunk_text, asyncio.Task)
    t0 = time.time()

    try:
        session = await get_llm_session()
        async with session.post(
            f"{LLAMA_SERVER}/api/chat",
            json={"model": LLM_MODEL, "messages": messages, "think": False, "stream": True, "keep_alive": -1,
                  "options": {"temperature": 0.8, "num_predict": 250, "top_p": 0.9, "num_ctx": 2048}},
            timeout=aiohttp_client.ClientTimeout(total=120, sock_read=45),
        ) as llm_resp:
            _raw_buf_v = ""
            _clean_emitted_v = ""
            async for line in llm_resp.content:
                text = line.decode("utf-8").strip()
                if text:
                    try:
                        chunk = json.loads(text)
                        if chunk.get("done", False):
                            break
                        delta = chunk.get("message", {}).get("content", "")
                        if delta:
                            full_reply += delta
                            _raw_buf_v += delta
                            clean_buf_v = re.sub(r'<think>.*?</think>', '', _raw_buf_v, flags=re.DOTALL)
                            clean_buf_v = re.sub(r'<\|[^|]+\|>', '', clean_buf_v)
                            if '<think>' in clean_buf_v:
                                clean_buf_v = re.sub(r'<think>.*$', '', clean_buf_v, flags=re.DOTALL)
                            new_content_v = clean_buf_v[len(_clean_emitted_v):]
                            if not new_content_v:
                                continue
                            _clean_emitted_v = clean_buf_v
                            sentence_buf += new_content_v
                            await resp.write(f"data: {json.dumps({'token': new_content_v})}\n\n".encode())
                            if re.search(r'[.!?…]\s', sentence_buf) or sentence_buf.endswith('\n'):
                                chunk_text = sentence_buf.strip()
                                sentence_buf = ""
                                if chunk_text and any(c.isalpha() for c in chunk_text):
                                    chunk_emotion = detect_emotion(full_reply)
                                    tts_items.append((chunk_text, asyncio.create_task(_synth_chunk(chunk_text, chunk_emotion))))
                    except (json.JSONDecodeError, KeyError):
                        pass
    except Exception as e:
        print(f"[LLM] Erreur stream: {e}")
        if not full_reply:
            full_reply = "Mes circuits ont subi une micro-interruption. Reformulez votre demande."
            await resp.write(f"data: {json.dumps({'token': full_reply})}\n\n".encode())

    llm_ms = (time.time() - t0) * 1000
    vision_emotion = detect_emotion(full_reply)

    if sentence_buf.strip():
        rest = sentence_buf.strip()
        tts_items.append((rest, asyncio.create_task(_synth_chunk(rest, vision_emotion))))

    # Store in history (user sees original message, not augmented)
    conversations[session_id].append({"role": "user", "content": user_msg})
    conversations[session_id].append({"role": "assistant", "content": full_reply})

    # Nettoyage RAM automatique tous les N messages
    global _message_count
    _message_count += 1
    if _message_count % CACHE_CLEAR_EVERY == 0:
        await asyncio.get_running_loop().run_in_executor(None, _clear_ram_cache)

    asyncio.create_task(broadcast_monitor({"type": "assistant_msg", "user": user_display, "session_id": session_id, "message": full_reply}))

    # Envoyer les chunks audio avec leur texte associé
    t_tts = time.time()
    tts_ms = 0
    try:
        for chunk_text, task in tts_items:
            audio_url = await task
            if audio_url:
                await resp.write(f"data: {json.dumps({'audio_chunk': audio_url, 'chunk_text': chunk_text})}\n\n".encode())
        tts_ms = (time.time() - t_tts) * 1000
    except Exception as e:
        print(f"[TTS] Erreur chunk: {e}")

    timing = {'vision_ms': round(vision_ms), 'llm_ms': round(llm_ms), 'tts_ms': round(tts_ms)}
    await resp.write(f"data: {json.dumps({'done': True, 'timing': timing})}\n\n".encode())

    await resp.write_eof()
    return resp


async def handle_health(request: web.Request) -> web.Response:
    llm_ok = False
    try:
        session = await get_llm_session()
        async with session.get(f"{LLAMA_SERVER}/api/tags") as r:
            llm_ok = r.status == 200
    except Exception:
        pass

    return web.json_response({
        "status": "en ligne" if llm_ok else "llm_hors_ligne",
        "kitt": "Knight Industries Two Thousand — opérationnel",
        "llm_server": llm_ok,
    })


async def _save_session_summary(mac: str, user_name: str, history: list):
    """Génère un résumé LLM de la session et le stocke dans user_memories."""
    try:
        msgs = [{"role": "system", "content": "Tu es un assistant de synthèse. Résume en 1 phrase courte (max 30 mots) la conversation ci-dessous. Réponds uniquement avec la phrase de résumé, sans introduction."}]
        msgs.extend(history[-6:])
        msgs.append({"role": "user", "content": "Résume en 1 phrase ce dont on a parlé dans cette conversation."})
        payload = {"model": LLM_MODEL, "messages": msgs, "temperature": 0.3, "max_tokens": 150, "top_p": 0.9}
        session = await get_llm_session()
        async with session.post(f"{LLAMA_SERVER}/v1/chat/completions", json=payload) as r:
            if r.status == 200:
                data = await r.json()
                summary = data["choices"][0]["message"]["content"].strip()
                summary = re.sub(r'<think>.*?</think>', '', summary, flags=re.DOTALL).strip()
                summary = re.sub(r'<\|[^|]+\|>', '', summary).strip()
                if summary:
                    mem = _load_user_memory(mac)
                    mem.setdefault("summaries", []).append({
                        "date": datetime.now().isoformat()[:10],
                        "text": summary,
                    })
                    if len(mem["summaries"]) > 5:
                        mem["summaries"] = mem["summaries"][-5:]
                    _save_user_memory(mac, mem)
                    print(f"[MEMORY] Résumé {user_name}: {summary}")
    except Exception as e:
        print(f"[MEMORY] Erreur résumé session: {e}")


async def handle_reset(request: web.Request) -> web.Response:
    body = await request.json()
    session_id = body.get("session_id", "default")
    # Résoudre MAC pour sauvegarder le résumé avant reset
    _rp = request.transport.get_extra_info("peername")
    _rip = _rp[0] if _rp else "inconnu"
    _rmac = resolve_mac(_rip)
    _rname = _get_user_name(_rmac) or "inconnu"
    history = conversations.get(session_id, [])
    if len(history) >= 4:
        asyncio.create_task(_save_session_summary(_rmac, _rname, history))
    _journal_close_session(session_id)
    conversations.pop(session_id, None)
    return web.json_response({"status": "conversation réinitialisée"})


async def handle_memory(request: web.Request) -> web.Response:
    """GET /api/memory — Retourne les souvenirs du user connecté (filtrés par MAC)."""
    _mp = request.transport.get_extra_info("peername")
    _mip = _mp[0] if _mp else "inconnu"
    _mmac = resolve_mac(_mip)
    mem = _load_user_memory(_mmac)
    return web.json_response(mem)


async def handle_memory_add(request: web.Request) -> web.Response:
    """POST /api/memory — Ajoute un souvenir manuellement."""
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "JSON invalide"}, status=400)
    fact = body.get("fact", "").strip()
    if not fact:
        return web.json_response({"error": "Fait requis"}, status=400)
    user = body.get("user", "manual")
    add_memory(fact, user)
    return web.json_response({"ok": True, "total": len(_memory["facts"])})


async def handle_index(request: web.Request) -> web.Response:
    return web.FileResponse(STATIC_DIR / "index.html")


async def handle_manix(request):
    return web.FileResponse(STATIC_DIR / 'manix.html')


async def handle_tts_manix(request: web.Request) -> web.Response:
    """Synthèse vocale avec la voix Manix locale (Piper GPU manix.onnx)."""
    try:
        data = await request.json()
        text = (data.get("text") or "").strip()
    except Exception:
        return web.Response(status=400, text="JSON requis")
    if not text:
        return web.Response(status=400, text="Champ text vide")

    engine = get_manix_engine()
    if engine is None:
        return web.Response(status=503, text="Modèle manix.onnx non disponible")

    import uuid
    audio_id = uuid.uuid4().hex
    clean_path = AUDIO_DIR / f"{audio_id}_manix_clean.wav"
    out_path   = AUDIO_DIR / f"{audio_id}_manix.wav"
    try:
        engine.synthesize_to_wav(text, str(clean_path), length_scale=1.0, natural_pauses=True)
        apply_robot_effect_sox(str(clean_path), str(out_path), "manix")
        clean_path.unlink(missing_ok=True)
        data_bytes = out_path.read_bytes()
        out_path.unlink(missing_ok=True)
        return web.Response(body=data_bytes, content_type="audio/wav")
    except Exception as e:
        clean_path.unlink(missing_ok=True)
        out_path.unlink(missing_ok=True)
        return web.Response(status=500, text=str(e))

async def handle_monitor(request: web.Request) -> web.Response:
    return web.FileResponse(STATIC_DIR / "monitor.html")


# ── KITT Proactif — messages spontanés ────────────────────────────────────
_proactive_ws: set = set()  # WebSocket clients for proactive messages
_last_greeting_hour = -1
_last_temp_alert = 0.0

# ── Mode Vigilance ──────────────────────────────────────────────────────
_vigilance_enabled: bool = False
_vigilance_last_count: int = -1   # nb personnes détectées au dernier check
_vigilance_last_check: float = 0.0
_last_interaction_time: float = time.time()  # dernière interaction utilisateur

# ── Monitoring temps réel ─────────────────────────────────────────────────────
_llm_active: int = 0        # Inférences LLM en cours
_stats_cache: dict = {      # Cache mis à jour toutes les 2s par _stats_loop
    "gpu_pct": 0, "gpu_temp": 0.0,
    "ram_used_mb": 0, "ram_total_mb": 0,
    "cpu_pct": 0, "power_mw": 0,
    "ts": 0,
}
_TEGRA_RE = re.compile(
    r"RAM (\d+)/(\d+)MB.*?CPU \[([^\]]+)\].*?GR3D_FREQ (\d+)%"
    r".*?gpu@([\d.]+)C.*?VDD_IN (\d+)mW"
)

async def handle_proactive_ws(request: web.Request) -> web.WebSocketResponse:
    """GET /api/proactive/ws — WebSocket pour recevoir les messages proactifs de KITT."""
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    _proactive_ws.add(ws)
    print(f"[PROACTIVE] Client connecté")
    try:
        async for msg in ws:
            pass
    finally:
        _proactive_ws.discard(ws)
        print(f"[PROACTIVE] Client déconnecté")
    return ws


async def send_proactive(message: str, emotion: str = "normal"):
    """Envoie un message proactif à tous les clients connectés avec TTS."""
    if not _proactive_ws:
        return

    # Anti-superposition : attendre que le LLM+TTS soit terminé, puis 5s de silence
    global _last_interaction_time
    wait_count = 0
    while (_llm_active > 0 or (time.time() - _last_interaction_time) < 5) and wait_count < 30:
        await asyncio.sleep(1)
        wait_count += 1

    # TTS du message proactif
    audio_url = None
    try:
        audio_url = await _synth_chunk(message, emotion)
    except Exception:
        pass

    payload = json.dumps({
        "type": "proactive",
        "message": message,
        "audio": audio_url,
        "emotion": emotion,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    dead = set()
    for ws in _proactive_ws:
        try:
            await ws.send_str(payload)
        except Exception:
            dead.add(ws)
    if dead:
        _proactive_ws.difference_update(dead)
    print(f"[PROACTIVE] {message[:60]}")


def _read_gpu_temp() -> float:
    """Lit la température GPU/SoC."""
    try:
        with open("/sys/devices/virtual/thermal/thermal_zone0/temp") as f:
            return int(f.read().strip()) / 1000
    except Exception:
        return 0.0


def _read_ram_available_mb() -> int:
    """Lit la RAM disponible en MB."""
    try:
        with open("/proc/meminfo") as f:
            for line in f:
                if line.startswith("MemAvailable:"):
                    return int(line.split()[1]) // 1024
    except Exception:
        pass
    return 9999


async def _stats_loop():
    """Lit tegrastats toutes les 2s et met a jour _stats_cache."""
    global _stats_cache
    try:
        proc = await asyncio.create_subprocess_exec(
            "tegrastats", "--interval", "2000",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
    except Exception as e:
        print(f"[STATS] tegrastats indisponible: {e}")
        return
    try:
        async for raw in proc.stdout:
            line = raw.decode("utf-8", errors="ignore").strip()
            m = _TEGRA_RE.search(line)
            if not m:
                continue
            ram_used, ram_total = int(m.group(1)), int(m.group(2))
            cpu_cores = [int(x.split("%")[0]) for x in m.group(3).split(",") if "%" in x]
            cpu_avg = int(sum(cpu_cores) / len(cpu_cores)) if cpu_cores else 0
            _stats_cache.update({
                "ram_used_mb":  ram_used,
                "ram_total_mb": ram_total,
                "cpu_pct":      cpu_avg,
                "gpu_pct":      int(m.group(4)),
                "gpu_temp":     float(m.group(5)),
                "power_mw":     int(m.group(6)),
                "ts":           time.time(),
            })
    except asyncio.CancelledError:
        proc.kill()
    except Exception as e:
        print(f"[STATS] erreur: {e}")
    finally:
        try: proc.kill()
        except Exception: pass


async def handle_stats(request: web.Request) -> web.Response:
    """GET /api/stats -- etat systeme temps reel."""
    now_ts = time.time()
    _karr_on = any(exp > now_ts for exp in _karr_sessions.values())
    _users = list({s.get('name','?') for s in _active_sessions.values() if s.get('name')})
    return web.json_response({
        **_stats_cache,
        "llm_active":    _llm_active,
        "sessions":      len(_active_sessions),
        "karr_active":   _karr_on,
        "session_users": _users,
    })


async def proactive_loop(app):
    """Boucle de surveillance proactive KITT."""
    global _last_greeting_hour, _last_temp_alert, _journal_morning_done
    import random

    # Attendre que le serveur soit prêt
    await asyncio.sleep(10)
    # Première récupération météo conscience
    asyncio.create_task(_refresh_awareness_weather())

    while True:
        try:
            now = datetime.now()
            hour = now.hour

            # ── Rapport matinal journal (6h-9h, une seule fois par matin) ──
            if _proactive_ws and 6 <= hour <= 9 and not _journal_morning_done:
                _journal_morning_done = True
                journal = _journal_load()
                yesterday = (datetime.now().date()).isoformat()
                entries_yesterday = [e for e in journal if e.get("date","").startswith(yesterday)]
                if entries_yesterday:
                    total_msgs = sum(e.get("msgs", 0) for e in entries_yesterday)
                    users = list({e.get("user","?") for e in entries_yesterday})
                    nb_sessions = len(entries_yesterday)
                    rapport = (f"Rapport de veille. Hier : {nb_sessions} session(s) enregistrée(s), "
                               f"{total_msgs} échanges avec {', '.join(users)}. "
                               f"Tous mes systèmes sont opérationnels.")
                    await send_proactive(rapport, "confident")
            # Reset flag chaque jour à 10h
            if hour >= 10:
                _journal_morning_done = False

            # ── Nettoyage sessions KARR expirées ─────────────────────────
            now_ts = time.time()
            expired_karr = [sid for sid, exp in list(_karr_sessions.items()) if now_ts > exp]
            for sid in expired_karr:
                del _karr_sessions[sid]
            if expired_karr:
                await send_proactive("Temps écoulé. KITT reprend le contrôle du véhicule.", "confident")

            # ── Nettoyage sessions journal inactives (> 30 min) ──────────
            stale_sessions = [sid for sid, d in list(_session_journal.items())
                              if now_ts - d.get("start", 0) > 1800]
            for sid in stale_sessions:
                _journal_close_session(sid)

            # Salutations horaires (1 fois par heure, si clients connectés)
            if _proactive_ws and hour != _last_greeting_hour:
                _last_greeting_hour = hour
                _pilot = next((s["name"] for s in sorted(_active_sessions.values(), key=lambda x: x["last_seen"], reverse=True) if s.get("name")), "")
                _hello = f" {_pilot}" if _pilot else ""
                greetings = {
                    6: f"Bonjour{_hello}. Mes systèmes sont en ligne. Une nouvelle journée commence.",
                    7: "Il est 7 heures. Tous mes capteurs sont opérationnels. Prêt pour la mission.",
                    12: "Il est midi. Une pause est peut-être nécessaire ? Mes circuits ne connaissent pas la faim, mais je saisis parfaitement le concept.",
                    18: f"Bonsoir{_hello}. J'espère que votre journée a été productive.",
                    22: "Il est 22 heures. Je reste vigilant, mais vous devriez peut-être envisager du repos.",
                    0: f"Minuit. Mon scanner veille. Bonne nuit{_hello}.",
                }
                if hour in greetings:
                    await send_proactive(greetings[hour], "confident")

            # Alertes température (toutes les 2 minutes max)
            temp = _read_gpu_temp()
            if temp > 70 and (time.time() - _last_temp_alert) > 120:
                _last_temp_alert = time.time()
                if temp > 85:
                    await send_proactive(f"Alerte critique ! Ma température atteint {temp:.0f}°C. Mes circuits sont en surchauffe !", "worried")
                elif temp > 75:
                    await send_proactive(f"Attention. Ma température est à {temp:.0f}°C. Je surveille la situation.", "worried")
                else:
                    await send_proactive(f"Information : température à {temp:.0f}°C. Rien d'alarmant pour le moment.", "normal")

            # Alerte RAM critique
            _pilot_ram = next((s["name"] for s in sorted(_active_sessions.values(), key=lambda x: x["last_seen"], reverse=True) if s.get("name")), "")
            _hello_ram = f" {_pilot_ram}" if _pilot_ram else ""
            ram_avail = _read_ram_available_mb()
            if ram_avail < 100 and _proactive_ws:
                await send_proactive(f"Attention{_hello_ram}. Seulement {ram_avail}MB de RAM disponible. Mes systèmes sont en charge critique.", "worried")

            # ── Mode Vigilance — surveillance caméra ─────────────────
            global _vigilance_last_check, _vigilance_last_count
            now_v = time.time()
            if (_vigilance_enabled and _proactive_ws and VISION_SCRIPT.exists()
                    and (now_v - _vigilance_last_check) >= 20):
                _vigilance_last_check = now_v
                count = await _capture_vision_persons()
                if count >= 0:
                    prev = _vigilance_last_count
                    _vigilance_last_count = count
                    idle = now_v - _last_interaction_time
                    if prev == 0 and count >= 1 and idle > 300:
                        # Terminal inactif depuis 5min — présence détectée
                        await send_vigilance_alert(
                            "Alerte. Présence détectée sur terminal inactif. "
                            "Identité non confirmée."
                        )
                    elif prev >= 1 and count >= 2 and prev < 2:
                        # Présence additionnelle dans la zone
                        await send_vigilance_alert(
                            "Vigilance. Présence non identifiée détectée dans la zone."
                        )

        except Exception as e:
            print(f"[PROACTIVE] Erreur: {e}")

        # ── Questions proactives — KITT pose une question quand idle ────
        global _kitt_pending_question, _kitt_question_asked_at, _kitt_last_question_loop
        now_q = time.time()
        idle_s = now_q - _last_interaction_time
        since_last_q = now_q - _kitt_last_question_loop
        if (
            _proactive_ws
            and idle_s >= _QUESTION_IDLE_MIN
            and (now_q - _kitt_question_asked_at) >= _QUESTION_COOLDOWN
            and not _kitt_pending_question
            and since_last_q >= 60
        ):
            _kitt_last_question_loop = now_q
            import random as _rnd
            question = _rnd.choice(_KITT_PROACTIVE_QUESTIONS)
            _kitt_pending_question = question
            _kitt_question_asked_at = now_q
            await send_proactive(question, "normal")

        await asyncio.sleep(60)  # Vérifier toutes les 60 secondes


async def send_vigilance_alert(message: str):
    """Envoie une alerte vigilance (type distinct pour UI rouge + son)."""
    if not _proactive_ws:
        return

    # Anti-superposition : attendre fin LLM+TTS + 5s de silence
    global _last_interaction_time
    wait_count = 0
    while (_llm_active > 0 or (time.time() - _last_interaction_time) < 5) and wait_count < 30:
        await asyncio.sleep(1)
        wait_count += 1

    audio_url = None
    try:
        audio_url = await _synth_chunk(message, "worried")
    except Exception:
        pass
    # Alerte Telegram Manix
    asyncio.create_task(_telegram_alert(f"[KITT GARDIEN] {message}"))
    payload = json.dumps({
        "type": "vigilance_alert",
        "message": message,
        "audio": audio_url,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    dead = set()
    for ws in _proactive_ws:
        try:
            await ws.send_str(payload)
        except Exception:
            dead.add(ws)
    if dead:
        _proactive_ws.difference_update(dead)
    print(f"[VIGILANCE] ALERTE: {message[:60]}")


# ═══════════════════════════════════════════════════════════════════════════════
# ── RADARS OSM ────────────────────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════
_radar_cache: dict = {"items": [], "ts": 0.0, "lat": 0.0, "lon": 0.0}


async def _fetch_radars_osm(lat: float, lon: float) -> list:
    """Radars fixes + zones mobiles via OSM Overpass. Cache 1h / rayon 8km."""
    if (time.time() - _radar_cache["ts"] < 3600
            and abs(lat - _radar_cache["lat"]) < 0.04
            and abs(lon - _radar_cache["lon"]) < 0.04):
        return _radar_cache["items"]
    query = (
        f'[out:json][timeout:12];('
        f'node["highway"="speed_camera"](around:8000,{lat},{lon});'
        f'node["enforcement"="maxspeed"](around:8000,{lat},{lon});'
        f');out;'
    )
    try:
        async with aiohttp_client.ClientSession() as s:
            async with s.post(
                "https://overpass-api.de/api/interpreter",
                data={"data": query},
                headers={"User-Agent": "KYRONEX/1.0"},
                timeout=aiohttp_client.ClientTimeout(total=15)
            ) as r:
                if r.status == 200:
                    data = await r.json(content_type=None)
                    items = []
                    for el in data.get("elements", []):
                        tags = el.get("tags", {})
                        mobile = tags.get("mobile", "no") == "yes"
                        items.append({
                            "lat": el["lat"], "lon": el["lon"],
                            "type": "mobile" if mobile else "fixed",
                            "maxspeed": tags.get("maxspeed", ""),
                        })
                    _radar_cache.update({"items": items, "ts": time.time(),
                                         "lat": lat, "lon": lon})
                    return items
    except Exception:
        pass
    return _radar_cache.get("items", [])


async def handle_radars(request: web.Request) -> web.Response:
    """GET /api/radars?lat=X&lon=Y — radars OSM à proximité."""
    try:
        lat = float(request.rel_url.query["lat"])
        lon = float(request.rel_url.query["lon"])
    except (KeyError, ValueError):
        return web.json_response({"error": "lat/lon requis"}, status=400)
    items = await _fetch_radars_osm(lat, lon)
    return web.json_response({"radars": items})


# ═══════════════════════════════════════════════════════════════════════════════
# ── TRAFIC OSM (incidents/travaux) ────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════
_traffic_cache: dict = {"items": [], "ts": 0.0}


async def _fetch_traffic_osm(lat: float, lon: float) -> list:
    """Incidents et travaux OSM. Cache 30 min."""
    if time.time() - _traffic_cache["ts"] < 1800:
        return _traffic_cache["items"]
    query = (
        f'[out:json][timeout:10];('
        f'node["hazard"](around:10000,{lat},{lon});'
        f'node["highway"="construction"](around:10000,{lat},{lon});'
        f'way["highway"="construction"](around:10000,{lat},{lon});'
        f');out center;'
    )
    try:
        async with aiohttp_client.ClientSession() as s:
            async with s.post(
                "https://overpass-api.de/api/interpreter",
                data={"data": query},
                headers={"User-Agent": "KYRONEX/1.0"},
                timeout=aiohttp_client.ClientTimeout(total=12)
            ) as r:
                if r.status == 200:
                    data = await r.json(content_type=None)
                    items = []
                    for el in data.get("elements", []):
                        tags = el.get("tags", {})
                        elat = el.get("lat") or el.get("center", {}).get("lat")
                        elon = el.get("lon") or el.get("center", {}).get("lon")
                        if elat and elon:
                            items.append({
                                "lat": elat, "lon": elon,
                                "type": tags.get("hazard", tags.get("highway", "incident")),
                                "name": tags.get("name", tags.get("description", "Incident")),
                            })
                    _traffic_cache.update({"items": items, "ts": time.time()})
                    return items
    except Exception:
        pass
    return _traffic_cache.get("items", [])


async def handle_traffic(request: web.Request) -> web.Response:
    """GET /api/traffic?lat=X&lon=Y — incidents/travaux OSM."""
    try:
        lat = float(request.rel_url.query["lat"])
        lon = float(request.rel_url.query["lon"])
    except (KeyError, ValueError):
        return web.json_response({"error": "lat/lon requis"}, status=400)
    items = await _fetch_traffic_osm(lat, lon)
    return web.json_response({"traffic": items})


# ═══════════════════════════════════════════════════════════════════════════════
# ── MÉMOS VOCAUX ──────────────────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════
_MEMOS_FILE = BASE_DIR / "logs" / "memos.json"


def _memos_load() -> list:
    try:
        return json.loads(_MEMOS_FILE.read_text())
    except Exception:
        return []


def _memos_save(memos: list):
    try:
        _MEMOS_FILE.write_text(json.dumps(memos, ensure_ascii=False, indent=2))
        print(f"[MEMOS] Sauvegardé {len(memos)} memos", flush=True)
    except Exception as e:
        print(f"[MEMOS] Erreur sauvegarde: {e}", flush=True)


def _get_and_clear_relais(recipient: str) -> list:
    """Récupère tous les messages destinés à quelqu'un et les supprime."""
    if not recipient:
        return []
    memos = _memos_load()
    relais = [m for m in memos if m.get("destinataire", "").lower() == recipient.lower()]
    if relais:
        # Supprimer les relais après récupération
        memos = [m for m in memos if m.get("destinataire", "").lower() != recipient.lower()]
        _memos_save(memos)
    return relais


async def handle_memos_get(request: web.Request) -> web.Response:
    """GET /api/memo — liste des mémos."""
    return web.json_response({"memos": _memos_load()})


async def handle_memos_post(request: web.Request) -> web.Response:
    """POST /api/memo — ajoute un mémo."""
    body = await request.json()
    memos = _memos_load()
    memos.insert(0, {
        "text": body.get("text", ""),
        "user": body.get("user", ""),
        "date": datetime.now().strftime("%d/%m %H:%M"),
        "done": False,
    })
    if len(memos) > 100:
        memos = memos[:100]
    _memos_save(memos)
    return web.json_response({"ok": True})


async def handle_memos_done(request: web.Request) -> web.Response:
    """POST /api/memo/done — marque un mémo comme terminé."""
    body = await request.json()
    idx = body.get("idx", -1)
    memos = _memos_load()
    if 0 <= idx < len(memos):
        memos[idx]["done"] = True
        _memos_save(memos)
    return web.json_response({"ok": True})


# ═══════════════════════════════════════════════════════════════════════════════
# ── RAPPELS HORAIRES ──────────────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════
_REMINDERS_FILE = BASE_DIR / "logs" / "reminders.json"
_reminders_list: list = []


def _reminders_load():
    global _reminders_list
    try:
        _reminders_list = json.loads(_REMINDERS_FILE.read_text())
    except Exception:
        _reminders_list = []


def _reminders_save():
    try:
        _REMINDERS_FILE.write_text(
            json.dumps(_reminders_list, ensure_ascii=False, indent=2)
        )
    except Exception:
        pass


async def _reminders_check_loop():
    """Background task : vérifie les rappels toutes les 30s."""
    _reminders_load()
    while True:
        await asyncio.sleep(30)
        now = datetime.now()
        changed = False
        for r in _reminders_list:
            if r.get("done"):
                continue
            try:
                t = r["time"].replace("H", ":").replace("h", ":").rstrip(":")
                if ":" not in t:
                    t += ":00"
                parts = t.split(":")
                h, m = int(parts[0]), int(parts[1]) if len(parts) > 1 and parts[1] else 0
                if now.hour == h and now.minute == m:
                    r["done"] = True
                    changed = True
                    msg = {"type": "reminder", "text": r["text"], "user": r.get("user", "")}
                    for ws in list(_proactive_ws):
                        try:
                            await ws.send_json(msg)
                        except Exception:
                            pass
            except Exception:
                pass
        # Remise à zéro à minuit pour le lendemain
        if now.hour == 0 and now.minute == 0:
            for r in _reminders_list:
                r["done"] = False
            changed = True
        if changed:
            _reminders_save()


async def handle_reminders_get(request: web.Request) -> web.Response:
    """GET /api/reminder"""
    return web.json_response({"reminders": _reminders_list})


async def handle_reminders_post(request: web.Request) -> web.Response:
    """POST /api/reminder"""
    body = await request.json()
    _reminders_list.insert(0, {
        "time": body.get("time", ""),
        "text": body.get("text", ""),
        "user": body.get("user", ""),
        "done": False,
    })
    _reminders_save()
    return web.json_response({"ok": True})


async def handle_reminders_delete(request: web.Request) -> web.Response:
    """POST /api/reminder/delete"""
    body = await request.json()
    idx = body.get("idx", -1)
    if 0 <= idx < len(_reminders_list):
        _reminders_list.pop(idx)
        _reminders_save()
    return web.json_response({"ok": True})


# ═══════════════════════════════════════════════════════════════════════════════
# ── CONTRÔLE MUSIQUE VLC (dbus MPRIS) ─────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════
async def _vlc_cmd(action: str) -> str:
    """Contrôle VLC via dbus MPRIS2."""
    _dest = "org.mpris.MediaPlayer2.vlc"
    _cmds = {
        "pause": ["dbus-send", "--session", "--print-reply", f"--dest={_dest}",
                  "/org/mpris/MediaPlayer2", "org.mpris.MediaPlayer2.Player.PlayPause"],
        "stop":  ["dbus-send", "--session", "--print-reply", f"--dest={_dest}",
                  "/org/mpris/MediaPlayer2", "org.mpris.MediaPlayer2.Player.Stop"],
        "next":  ["dbus-send", "--session", "--print-reply", f"--dest={_dest}",
                  "/org/mpris/MediaPlayer2", "org.mpris.MediaPlayer2.Player.Next"],
        "prev":  ["dbus-send", "--session", "--print-reply", f"--dest={_dest}",
                  "/org/mpris/MediaPlayer2", "org.mpris.MediaPlayer2.Player.Previous"],
    }
    if action not in _cmds:
        return "Commande musicale inconnue."
    try:
        proc = await asyncio.create_subprocess_exec(
            *_cmds[action],
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await asyncio.wait_for(proc.wait(), timeout=3)
        _labels = {"pause": "Lecture/pause", "stop": "Arrêt",
                   "next": "Piste suivante", "prev": "Piste précédente"}
        return f"{_labels[action]} activé, {{}}."
    except Exception:
        return "Lecteur VLC indisponible ou non lancé."


# ═══════════════════════════════════════════════════════════════════════════════
# ── TELEGRAM GARDIEN ──────────────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════
_TELEGRAM_BOT_TOKEN = "8639685200:AAEkGrfpmQkFCP8TlfB-pq5KsQN8s3OlfWU"
_TELEGRAM_CHAT_ID   = "8591807736"


async def _telegram_alert(message: str):
    """Envoie une alerte Telegram à Manix."""
    url = f"https://api.telegram.org/bot{_TELEGRAM_BOT_TOKEN}/sendMessage"
    try:
        async with aiohttp_client.ClientSession() as s:
            await s.post(url, json={"chat_id": _TELEGRAM_CHAT_ID, "text": message},
                         timeout=aiohttp_client.ClientTimeout(total=5))
    except Exception:
        pass


async def handle_vigilance(request: web.Request) -> web.Response:
    """POST /api/vigilance — Active/désactive le mode vigilance caméra."""
    global _vigilance_enabled, _vigilance_last_count
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "JSON invalide"}, status=400)
    _vigilance_enabled = bool(body.get("enabled", False))
    _vigilance_last_count = -1  # reset à chaque toggle
    print(f"[VIGILANCE] Mode {'ACTIVÉ' if _vigilance_enabled else 'DÉSACTIVÉ'}")
    return web.json_response({"vigilance": _vigilance_enabled})


# ── Téléchargement PDFs ──────────────────────────────────────────────────
async def handle_gps_reverse(request: web.Request) -> web.Response:
    """GET /api/gps/reverse?lat=X&lon=Y — geocoding offline (SQLite OpenStreetMap local)."""
    try:
        lat = float(request.rel_url.query.get('lat', ''))
        lon = float(request.rel_url.query.get('lon', ''))
    except (ValueError, TypeError):
        return web.json_response({'error': 'lat/lon manquants'}, status=400)
    try:
        import geo_offline
        if not geo_offline.is_ready():
            return web.json_response({'error': 'base offline non disponible'}, status=503)
        result = geo_offline.reverse(lat, lon)
        if result is None:
            return web.json_response({'error': 'hors zone'}, status=404)
        result['text'] = ', '.join(x for x in [result.get('road'), result.get('city')] if x)
        return web.json_response(result)
    except Exception as e:
        return web.json_response({'error': str(e)}, status=500)


# ── Navigation GPS — sessions actives ────────────────────────────────────────
_nav_sessions: dict = {}  # session_id → {steps, step_idx, dest_name, total_dist}

# Instructions de virage en français
_NAV_FR: dict = {
    ('depart',      None):            "Démarrez",
    ('arrive',      None):            "Vous êtes arrivé à destination",
    ('turn',        'left'):          "Tournez à gauche",
    ('turn',        'right'):         "Tournez à droite",
    ('turn',        'slight left'):   "Légèrement à gauche",
    ('turn',        'slight right'):  "Légèrement à droite",
    ('turn',        'sharp left'):    "Virage serré à gauche",
    ('turn',        'sharp right'):   "Virage serré à droite",
    ('turn',        'straight'):      "Continuez tout droit",
    ('turn',        'uturn'):         "Faites demi-tour",
    ('new name',    None):            "Continuez sur",
    ('continue',    'straight'):      "Continuez tout droit",
    ('continue',    'left'):          "Continuez à gauche",
    ('continue',    'right'):         "Continuez à droite",
    ('fork',        'left'):          "Prenez à gauche",
    ('fork',        'right'):         "Prenez à droite",
    ('fork',        'slight left'):   "Gardez la gauche",
    ('fork',        'slight right'):  "Gardez la droite",
    ('merge',       'left'):          "Rejoignez par la gauche",
    ('merge',       'right'):         "Rejoignez par la droite",
    ('roundabout',  None):            "Prenez le rond-point",
    ('rotary',      None):            "Prenez le giratoire",
    ('end of road', 'left'):          "Au bout, tournez à gauche",
    ('end of road', 'right'):         "Au bout, tournez à droite",
}

def _nav_instruction_fr(step: dict) -> str:
    """Retourne l'instruction en français pour une étape OSRM."""
    m    = step.get('maneuver', {})
    typ  = m.get('type', '')
    mod  = m.get('modifier')
    name = step.get('name', '')
    base = _NAV_FR.get((typ, mod)) or _NAV_FR.get((typ, None)) or "Continuez"
    if name and typ not in ('arrive', 'depart'):
        return f"{base} sur {name}"
    return base

def _nav_arrow(step: dict) -> str:
    """Retourne le code flèche (straight/left/right/slight_left/slight_right/sharp_left/sharp_right/uturn/arrive) pour le HUD."""
    m   = step.get('maneuver', {})
    typ = m.get('type', '')
    mod = m.get('modifier', 'straight')
    if typ == 'arrive':
        return 'arrive'
    if typ == 'roundabout' or typ == 'rotary':
        return 'roundabout'
    if mod == 'uturn':
        return 'uturn'
    return mod.replace(' ', '_') if mod else 'straight'


async def handle_nav_geocode(request: web.Request) -> web.Response:
    """GET /api/nav/geocode?q=destination — géocode via Nominatim."""
    q = request.rel_url.query.get('q', '').strip()
    if not q:
        return web.json_response({'error': 'q manquant'}, status=400)
    import urllib.request as _ur, urllib.parse as _up
    url = f"https://nominatim.openstreetmap.org/search?format=json&q={_up.quote(q)}&limit=1&accept-language=fr"
    try:
        req = _ur.Request(url, headers={'User-Agent': 'KYRONEX/1.0'})
        with _ur.urlopen(req, timeout=8) as r:
            data = json.loads(r.read())
        if not data:
            return web.json_response({'error': 'destination introuvable'}, status=404)
        d = data[0]
        return web.json_response({'lat': float(d['lat']), 'lon': float(d['lon']), 'name': d.get('display_name', q).split(',')[0]})
    except Exception as e:
        return web.json_response({'error': str(e)}, status=500)


async def handle_nav_start(request: web.Request) -> web.Response:
    """POST /api/nav/start — calcule itinéraire OSRM et démarre la navigation."""
    try:
        body = await request.json()
        flat = float(body['from_lat']); flon = float(body['from_lon'])
        tlat = float(body['to_lat']);   tlon = float(body['to_lon'])
        dest_name = body.get('dest_name', 'destination')
        session_id = body.get('session_id', 'default')
    except Exception:
        return web.json_response({'error': 'Paramètres invalides'}, status=400)

    import urllib.request as _ur
    url = (f"https://router.project-osrm.org/route/v1/driving/"
           f"{flon},{flat};{tlon},{tlat}"
           f"?steps=true&overview=false&geometries=geojson")
    try:
        req = _ur.Request(url, headers={'User-Agent': 'KYRONEX/1.0'})
        with _ur.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
    except Exception as e:
        return web.json_response({'error': f'OSRM: {e}'}, status=502)

    if data.get('code') != 'Ok' or not data.get('routes'):
        return web.json_response({'error': 'Itinéraire introuvable'}, status=404)

    route = data['routes'][0]
    steps = []
    for leg in route.get('legs', []):
        for s in leg.get('steps', []):
            loc = s.get('maneuver', {}).get('location', [0, 0])
            steps.append({
                'lon':         loc[0],
                'lat':         loc[1],
                'distance':    round(s.get('distance', 0)),
                'duration':    round(s.get('duration', 0)),
                'name':        s.get('name', ''),
                'instruction': _nav_instruction_fr(s),
                'arrow':       _nav_arrow(s),
                'type':        s.get('maneuver', {}).get('type', ''),
            })

    _nav_sessions[session_id] = {
        'steps':      steps,
        'step_idx':   0,
        'dest_name':  dest_name,
        'total_dist': round(route.get('distance', 0)),
        'total_dur':  round(route.get('duration', 0)),
    }
    total_km = round(route.get('distance', 0) / 1000, 1)
    return web.json_response({
        'steps':      steps,
        'total_dist': round(route.get('distance', 0)),
        'total_dur':  round(route.get('duration', 0)),
        'total_km':   total_km,
        'dest_name':  dest_name,
    })


async def handle_nav_stop(request: web.Request) -> web.Response:
    """POST /api/nav/stop — arrête la navigation pour une session."""
    try:
        body = await request.json()
        session_id = body.get('session_id', 'default')
    except Exception:
        session_id = 'default'
    _nav_sessions.pop(session_id, None)
    return web.json_response({'ok': True})


async def handle_download(request: web.Request) -> web.Response:
    """GET /api/download/{filename} — sert les PDFs (token requis)."""
    token = request.headers.get('X-DL-Token', '')
    if not token or token not in _dl_tokens:
        raise web.HTTPForbidden(text="Accès refusé — authentification requise")
    filename = request.match_info["filename"]
    if not filename.endswith(".pdf") or "/" in filename or ".." in filename:
        raise web.HTTPForbidden(text="Accès refusé")
    path = BASE_DIR / filename
    if not path.exists():
        raise web.HTTPNotFound(text=f"{filename} introuvable")
    return web.FileResponse(
        path,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


async def handle_git_push_html(request: web.Request) -> web.Response:
    """POST /api/git-push-html — commit + push static/index.html vers GitHub."""
    import asyncio, subprocess
    from datetime import datetime
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    try:
        proc = await asyncio.create_subprocess_exec(
            "git", "-C", str(BASE_DIR), "add", "static/index.html",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        await proc.communicate()
        proc2 = await asyncio.create_subprocess_exec(
            "git", "-C", str(BASE_DIR), "commit", "-m", f"auto: push index.html via KITT UI ({stamp})",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        out2, err2 = await proc2.communicate()
        proc3 = await asyncio.create_subprocess_exec(
            "git", "-C", str(BASE_DIR), "push",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
        )
        out3, err3 = await proc3.communicate()
        if proc3.returncode == 0:
            return web.json_response({"ok": True, "msg": f"Push OK — {stamp}"})
        else:
            return web.json_response({"ok": False, "msg": err3.decode()[:200]})
    except Exception as e:
        return web.json_response({"ok": False, "msg": str(e)})


_NIGHT_HASH_SRV = '8c03437292a68baec2fd5374c6adb4d0ddcfc2aade2407fdee2d4f024e423ef3'
_dl_tokens: set = set()


async def handle_issue_dl_token(request: web.Request) -> web.Response:
    """POST /api/dl-token — émet un token de téléchargement après vérification hash."""
    try:
        data = await request.json()
    except Exception:
        raise web.HTTPBadRequest(text="JSON invalide")
    if data.get('h') != _NIGHT_HASH_SRV:
        raise web.HTTPForbidden(text="Code incorrect")
    token = secrets.token_hex(32)
    _dl_tokens.add(token)
    return web.json_response({"token": token})


async def handle_download_html(request: web.Request) -> web.Response:
    """GET /api/download-html — télécharge le index.html (token requis)."""
    token = request.headers.get('X-DL-Token', '')
    if not token or token not in _dl_tokens:
        raise web.HTTPForbidden(text="Accès refusé — authentification requise")
    _dl_tokens.discard(token)
    path = BASE_DIR / "static" / "index.html"
    if not path.exists():
        raise web.HTTPNotFound(text="index.html introuvable")
    from datetime import datetime
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return web.FileResponse(
        path,
        headers={"Content-Disposition": f'attachment; filename="kitt-index-{stamp}.html"'}
    )


async def handle_list_pdfs(request: web.Request) -> web.Response:
    """GET /api/pdfs — liste les PDFs disponibles dans BASE_DIR."""
    pdfs = [
        {"name": p.name, "size_kb": round(p.stat().st_size / 1024)}
        for p in sorted(BASE_DIR.glob("*.pdf"))
    ]
    return web.json_response({"pdfs": pdfs})


# ── Night Scheduler — constantes ────────────────────────────────────────
SCHEDULER_PY  = BASE_DIR / "kitt_scheduler.py"
SCHEDULER_PID = BASE_DIR / "kitt_scheduler.pid"
SCHEDULER_CFG = BASE_DIR / "kitt_schedule.json"
SCHEDULER_LOG = Path("/tmp/kitt_scheduler.log")
IMPROVE_SH      = BASE_DIR / "kitt_night_improve.sh"
SITE_IMPROVE_SH = BASE_DIR / "kitt_site_improve.sh"


def _sched_load_cfg() -> dict:
    """Charge kitt_schedule.json ou retourne une config vide."""
    if SCHEDULER_CFG.exists():
        try:
            return json.loads(SCHEDULER_CFG.read_text())
        except Exception:
            pass
    return {"windows": []}


def _sched_save_cfg(cfg: dict):
    SCHEDULER_CFG.write_text(json.dumps(cfg, indent=2, ensure_ascii=False))


def _sched_is_running() -> int | None:
    """Retourne le PID si le daemon tourne, None sinon."""
    if not SCHEDULER_PID.exists():
        return None
    try:
        pid = int(SCHEDULER_PID.read_text().strip())
        os.kill(pid, 0)  # signal 0 = vérification existence
        return pid
    except (ValueError, ProcessLookupError, PermissionError):
        SCHEDULER_PID.unlink(missing_ok=True)
        return None


async def handle_scheduler_status(request: web.Request) -> web.Response:
    pid = _sched_is_running()
    cfg = _sched_load_cfg()
    return web.json_response({
        "active": pid is not None,
        "pid": pid,
        "windows": cfg.get("windows", []),
    })


async def handle_scheduler_start(request: web.Request) -> web.Response:
    pid = _sched_is_running()
    if pid:
        return web.json_response({"ok": True, "pid": pid, "msg": "Déjà actif"})
    env = os.environ.copy()
    env["PATH"] = f"/home/kitt/.local/bin:{env.get('PATH', '')}"
    proc = subprocess.Popen(
        ["python3", str(SCHEDULER_PY), "--daemon"],
        stdout=open(str(SCHEDULER_LOG), "a"),
        stderr=subprocess.STDOUT,
        env=env,
        start_new_session=True,
    )
    SCHEDULER_PID.write_text(str(proc.pid))
    return web.json_response({"ok": True, "pid": proc.pid})


async def handle_scheduler_stop(request: web.Request) -> web.Response:
    pid = _sched_is_running()
    if not pid:
        return web.json_response({"ok": True, "msg": "Déjà arrêté"})
    try:
        os.kill(pid, 15)  # SIGTERM
    except ProcessLookupError:
        pass
    SCHEDULER_PID.unlink(missing_ok=True)
    return web.json_response({"ok": True})


async def handle_scheduler_window(request: web.Request) -> web.Response:
    """POST — ajoute une fenêtre planifiée."""
    try:
        data = await request.json()
    except Exception:
        raise web.HTTPBadRequest(text="JSON invalide")
    cfg = _sched_load_cfg()
    windows = cfg.setdefault("windows", [])
    wid = str(uuid.uuid4())[:8]
    target = data.get("target", "interface")  # "interface" ou "site"
    script_path = str(SITE_IMPROVE_SH) if target == "site" else str(IMPROVE_SH)
    windows.append({
        "id": wid,
        "name": data.get("name", f"Fenêtre {len(windows)+1}"),
        "start_h": int(data.get("start_h", 22)),
        "start_m": int(data.get("start_m", 0)),
        "end_h": int(data.get("end_h", 6)),
        "end_m": int(data.get("end_m", 0)),
        "iterations": int(data.get("iterations", 10)),
        "days": data.get("days", [0, 1, 2, 3, 4, 5, 6]),
        "enabled": True,
        "target": target,
        "script": script_path,
    })
    _sched_save_cfg(cfg)
    return web.json_response({"ok": True, "id": wid, "windows": cfg["windows"]})


async def handle_scheduler_toggle(request: web.Request) -> web.Response:
    """POST /api/scheduler/window/{wid}/toggle"""
    wid = request.match_info["wid"]
    cfg = _sched_load_cfg()
    for w in cfg.get("windows", []):
        if w["id"] == wid:
            w["enabled"] = not w.get("enabled", True)
            _sched_save_cfg(cfg)
            return web.json_response({"ok": True, "enabled": w["enabled"]})
    raise web.HTTPNotFound(text=f"Fenêtre {wid} introuvable")


async def handle_scheduler_delete(request: web.Request) -> web.Response:
    """DELETE /api/scheduler/window/{wid}"""
    wid = request.match_info["wid"]
    cfg = _sched_load_cfg()
    before = len(cfg.get("windows", []))
    cfg["windows"] = [w for w in cfg.get("windows", []) if w["id"] != wid]
    if len(cfg["windows"]) == before:
        raise web.HTTPNotFound(text=f"Fenêtre {wid} introuvable")
    _sched_save_cfg(cfg)
    return web.json_response({"ok": True, "windows": cfg["windows"]})


async def handle_scheduler_run_now(request: web.Request) -> web.Response:
    """POST — lance N itérations immédiatement."""
    try:
        data = await request.json()
    except Exception:
        data = {}
    iterations = int(data.get("iterations", 1))
    target = data.get("target", "interface")  # "interface" ou "site"
    script = SITE_IMPROVE_SH if target == "site" else IMPROVE_SH
    env = os.environ.copy()
    env["PATH"] = f"/home/kitt/.local/bin:{env.get('PATH', '')}"
    prefix = "kitt_site" if target == "site" else "kitt_now"
    now_log = f"/tmp/{prefix}_{int(time.time())}.log"
    proc = subprocess.Popen(
        ["bash", str(script), str(iterations)],
        stdout=open(now_log, "w"),
        stderr=subprocess.STDOUT,
        env=env,
        start_new_session=True,
    )
    return web.json_response({"ok": True, "pid": proc.pid, "log_path": now_log, "target": target})


async def handle_auto_report(request: web.Request) -> web.Response:
    """GET /api/auto-report — rapport des versions produites par le mode automatique."""
    versions_dir = STATIC_DIR / "versions"
    sessions = {}
    if versions_dir.exists():
        for f in sorted(versions_dir.glob("*.html")):
            name = f.stem  # ex: v01_04h36_animation_messages
            parts = name.split("_", 2)
            if len(parts) < 2:
                continue
            iter_tag = parts[0]   # v00, v01...
            time_tag = parts[1]   # 04h36 ou avant
            desc = parts[2] if len(parts) > 2 else ""
            stat = f.stat()
            import datetime as _dt
            mtime = _dt.datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S")
            # Regrouper par session (heure de modification à la minute)
            session_key = mtime[:13]  # "2026-02-24 04"
            if session_key not in sessions:
                sessions[session_key] = []
            sessions[session_key].append({
                "iter": iter_tag,
                "time": time_tag,
                "desc": desc.replace("_", " "),
                "file": f.name,
                "size_kb": round(stat.st_size / 1024, 1),
                "lines": sum(1 for _ in f.open(errors="replace")),
                "modified": mtime,
            })
    # Logs récents du site improver
    site_logs = []
    for lf in sorted(Path("/tmp").glob("kitt_site_*.log")):
        txt = lf.read_text(errors="replace")
        for line in txt.splitlines():
            if "SUCCES" in line or "ECHEC" in line or "RAPPORT FINAL" in line:
                site_logs.append(line.strip())
    # Logs récents du night improver
    night_logs = []
    for lf in sorted(Path("/tmp").glob("kitt_now_*.log")):
        txt = lf.read_text(errors="replace")
        for line in txt.splitlines():
            if "SUCCES" in line or "ECHEC" in line or "RAPPORT" in line:
                night_logs.append(line.strip())
    return web.json_response({
        "versions": sessions,
        "total_versions": sum(len(v) for v in sessions.values()),
        "site_log": site_logs[-10:],
        "night_log": night_logs[-10:],
    })


async def handle_scheduler_logs(request: web.Request) -> web.Response:
    """GET — retourne les 30 dernières lignes du log daemon + now logs."""
    lines = []
    # Log daemon
    if SCHEDULER_LOG.exists():
        all_lines = SCHEDULER_LOG.read_text(errors="replace").splitlines()
        lines += all_lines[-20:]
    # Dernier kitt_now_*.log
    now_logs = sorted(Path("/tmp").glob("kitt_now_*.log"))
    if now_logs:
        last = now_logs[-1]
        content = last.read_text(errors="replace").splitlines()
        lines += [f"[{last.name}] {l}" for l in content[-15:]]
    return web.json_response({"lines": lines[-30:]})


async def handle_journal(request: web.Request) -> web.Response:
    """GET /api/journal — retourne les 50 dernières entrées du journal de bord."""
    try:
        entries = _journal_load()
        return web.json_response({"entries": entries[:50]})
    except Exception:
        return web.json_response({"entries": []})


async def handle_debriefing(request: web.Request) -> web.Response:
    """POST /api/debriefing — Résumé LLM des sessions des 5 derniers jours."""
    from datetime import timedelta
    try:
        entries = _journal_load()[:40]
        cutoff = (datetime.now() - timedelta(days=5)).isoformat()[:10]
        recent = [e for e in entries if e.get("date", "")[:10] >= cutoff]
        if not recent:
            return web.json_response({"summary": "Aucune session ces 5 derniers jours, Michael."})
        lines = [
            f"- {e['date'][:16]} | {e.get('user','?')} | {e.get('msgs',0)} msgs | {e.get('duration_s',0)//60}min"
            for e in recent
        ]
        prompt = "Tu es KITT. Résume ces sessions en 3 phrases concises style KITT (élégant, factuel):\n" + "\n".join(lines)
        session = await get_llm_session()
        async with session.post(
            f"{LLAMA_SERVER}/v1/chat/completions",
            json={"model": LLM_MODEL, "messages": [{"role": "user", "content": prompt}],
                  "max_tokens": 180, "temperature": 0.6},
        ) as r:
            rj = await r.json()
        summary = rj["choices"][0]["message"]["content"].strip()
        summary = re.sub(r'<think>.*?</think>', '', summary, flags=re.DOTALL).strip()
        summary = re.sub(r'<\|[^|]+\|>', '', summary).strip()
        return web.json_response({"summary": summary})
    except Exception as e:
        return web.json_response({"summary": f"Erreur lors du debriefing: {e}"})


# ── Reconnaissance faciale ──────────────────────────────────────────────

_last_face_notify: float = 0.0   # cooldown anti-spam

async def handle_face_recognized(request: web.Request) -> web.Response:
    """POST /api/face-recognized — recognition.py notifie kyronex qu'un conducteur est reconnu."""
    global _last_face_notify
    try:
        data = await request.json()
    except Exception:
        return web.json_response({"ok": False, "error": "JSON invalide"}, status=400)

    name  = data.get("name", "").strip()
    score = float(data.get("score", 0.0))
    if not name:
        return web.json_response({"ok": False, "error": "nom manquant"}, status=400)

    now = time.time()
    # Cooldown 5 minutes — évite le spam si la caméra détecte en boucle
    if now - _last_face_notify < 300:
        return web.json_response({"ok": True, "skipped": True})
    _last_face_notify = now

    print(f"[FACE] Conducteur reconnu : {name} (score={score:.3f})")

    # Broadcast WS → auto-unlock dans l'UI
    payload = json.dumps({
        "type": "face_recognized",
        "name": name,
        "score": round(score, 3),
    })
    dead = set()
    for ws in list(_proactive_ws):
        try:
            await ws.send_str(payload)
        except Exception:
            dead.add(ws)
    _proactive_ws.difference_update(dead)

    # Message proactif KITT (TTS + chat)
    greetings = {
        "Manix": [
            "Bonsoir Manix. Tous les systèmes sont opérationnels.",
            "Bonjour Manix. Je t'attendais.",
            "Manix. KITT en ligne. Prêt à partir.",
            "Conducteur identifié. Bienvenue à bord, Manix.",
        ],
    }
    import random
    msgs = greetings.get(name, [f"Conducteur {name} reconnu. KITT opérationnel."])
    asyncio.create_task(send_proactive(random.choice(msgs), "confident"))

    return web.json_response({"ok": True, "name": name})


# ── Nettoyage audio ─────────────────────────────────────────────────────
async def cleanup_audio(app):
    while True:
        await asyncio.sleep(300)
        now = time.time()
        for f in AUDIO_DIR.glob("*.wav"):
            if now - f.stat().st_mtime > 300:
                f.unlink(missing_ok=True)


# ── Handlers Conversations ────────────────────────────────────────────────

async def handle_conv_identify(request):
    """POST /api/conv/identify — Identifie un utilisateur par MAC ou UUID."""
    try:
        body = await request.json()
    except Exception:
        body = {}
    c_uuid = body.get('uuid') or str(uuid.uuid4())
    ip = request.remote
    mac = None if ip in ('127.0.0.1', '::1') else resolve_mac(ip)
    uid = mac if mac else c_uuid
    users = _conv_load_users()
    if uid in users:
        return web.json_response({"id": uid, "name": users[uid]['name'], "is_new": False})
    return web.json_response({"id": uid, "is_new": True})


async def handle_conv_register(request):
    """POST /api/conv/register — Enregistre un nouvel utilisateur."""
    try:
        b = await request.json()
    except Exception:
        return web.json_response({"error": "JSON invalide"}, status=400)
    uid  = b.get('id', '').strip()
    name = b.get('name', '').strip()
    if not uid or not name:
        return web.json_response({"error": "id+name requis"}, status=400)
    users = _conv_load_users()
    users[uid] = {
        "name": name,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "conv_count": 0,
    }
    _conv_save_users(users)
    (CONV_STORE_DIR / _conv_safe(name)).mkdir(exist_ok=True)
    print(f"[CONV] Nouvel utilisateur enregistré : {name} ({uid[:16]})")
    return web.json_response({"ok": True, "name": name})


async def handle_conv_save(request):
    """POST /api/conv/save — Sauvegarde les messages d'une conversation."""
    try:
        b = await request.json()
    except Exception:
        return web.json_response({"error": "JSON invalide"}, status=400)
    uid  = b.get('id', '').strip()
    msgs = b.get('messages', [])
    if not uid or not msgs:
        return web.json_response({"error": "id+messages requis"}, status=400)
    users = _conv_load_users()
    if uid not in users:
        return web.json_response({"error": "utilisateur inconnu"}, status=404)
    name = users[uid]['name']
    safe = _conv_safe(name)
    user_dir = CONV_STORE_DIR / safe
    user_dir.mkdir(exist_ok=True)
    ts   = datetime.now().strftime('%Y-%m-%d_%H-%M')
    fname = f"conv_{ts}.txt"
    lines = [f"Conversation KITT — {name} — {ts}\n{'='*50}\n"]
    for m in msgs:
        role = m.get('role', 'user')
        text = m.get('text', '').strip()
        t    = m.get('time', '')
        prefix = 'KITT' if role == 'assistant' else name.upper()
        lines.append(f"[{t}] {prefix}: {text}\n")
    (user_dir / fname).write_text(''.join(lines), encoding='utf-8')
    users[uid]['conv_count'] = users[uid].get('conv_count', 0) + 1
    _conv_save_users(users)
    print(f"[CONV] Conversation sauvée : {name}/{fname} ({len(msgs)} messages)")
    return web.json_response({"ok": True, "file": fname})


async def handle_conv_auth(request):
    """POST /api/conv/auth — Authentification admin."""
    try:
        b = await request.json()
    except Exception:
        return web.json_response({"error": "JSON invalide"}, status=400)
    pwd = b.get('password', '')
    h   = hashlib.sha256(pwd.encode()).hexdigest()
    if h != _CONV_ADMIN_HASH:
        return web.json_response({"error": "Mot de passe incorrect"}, status=401)
    token = str(uuid.uuid4())
    _conv_admin_sessions[token] = time.time() + 3600  # expire dans 1h
    return web.json_response({"ok": True, "token": token})


async def handle_conv_list(request):
    """GET /api/conv/list — Liste toutes les conversations (protégé admin)."""
    if not _conv_check_token(request):
        return web.json_response({"error": "Non autorisé"}, status=401)
    result = []
    users = _conv_load_users()
    uid_by_safe = {_conv_safe(v['name']): k for k, v in users.items()}
    for user_dir in sorted(CONV_STORE_DIR.iterdir()):
        if not user_dir.is_dir():
            continue
        safe = user_dir.name
        uid  = uid_by_safe.get(safe, '')
        name = users.get(uid, {}).get('name', safe) if uid else safe
        files = sorted([f.name for f in user_dir.glob('conv_*.txt')], reverse=True)
        result.append({"user": name, "safe": safe, "count": len(files), "files": files})
    return web.json_response({"users": result})


async def handle_conv_read(request):
    """GET /api/conv/read/{user}/{filename} — Lit un fichier conversation (protégé admin)."""
    if not _conv_check_token(request):
        return web.json_response({"error": "Non autorisé"}, status=401)
    safe_user = request.match_info.get('user', '')
    filename  = request.match_info.get('filename', '')
    # Anti path-traversal
    if '..' in safe_user or '..' in filename or '/' in safe_user or '/' in filename:
        return web.json_response({"error": "Chemin invalide"}, status=400)
    fpath = CONV_STORE_DIR / safe_user / filename
    if not fpath.exists() or not fpath.is_file():
        return web.json_response({"error": "Fichier introuvable"}, status=404)
    content = fpath.read_text(encoding='utf-8')
    return web.json_response({"content": content})


# ── App ──────────────────────────────────────────────────────────────────
# ── VIDEO SUBMISSIONS ──────────────────────────────────────────────────────────
import re as _re
_VIDEO_FILE = Path("/home/karr/kitt-ai/video_submissions.json")
_VIDEO_ADMIN_TOKEN = "8c03437292a68baec2fd5374c6adb4d0ddcfc2aade2407fdee2d4f024e423ef3"

def _video_load():
    if _VIDEO_FILE.exists():
        try:
            return json.loads(_VIDEO_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"pending": [], "approved": [], "rejected": []}

def _video_save(data):
    _VIDEO_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

def _yt_id(url):
    m = _re.search(r"(?:v=|youtu\.be/|embed/|shorts/)([A-Za-z0-9_-]{11})", url)
    return m.group(1) if m else None

def _video_cors(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type,X-Admin-Token"
    return response


# ── Proxy ElevenLabs (cle cote serveur, jamais dans le client) ────────────
ELEVEN_VOICE_DEFAULT = "M2Xs2gEdangnlb92hK6y"
ELEVEN_VOICE_ALLOWED = {"M2Xs2gEdangnlb92hK6y"}

def _kx_eleven_key():
    k = os.environ.get("ELEVENLABS_API_KEY", "")
    if k:
        return k
    try:
        with open(os.path.expanduser("~/.kyronex_eleven_key")) as _f:
            return _f.read().strip()
    except Exception:
        return ""

async def handle_tts_eleven(request: web.Request) -> web.Response:
    api_key = _kx_eleven_key()
    if not api_key:
        return _video_cors(web.json_response({"ok": False, "error": "TTS indisponible"}, status=503))
    try:
        body = await request.json()
    except Exception:
        return _video_cors(web.json_response({"ok": False, "error": "JSON invalide"}, status=400))
    text = (body.get("text") or "").strip()[:1500]
    if not text:
        return _video_cors(web.json_response({"ok": False, "error": "Texte manquant"}, status=400))
    voice = body.get("voice") or ELEVEN_VOICE_DEFAULT
    if voice not in ELEVEN_VOICE_ALLOWED:
        voice = ELEVEN_VOICE_DEFAULT
    settings = body.get("voice_settings")
    if not isinstance(settings, dict):
        settings = {"stability": 0.5, "similarity_boost": 0.8, "style": 0.22, "use_speaker_boost": True}
    payload = {"text": text, "model_id": body.get("model_id") or "eleven_v3", "voice_settings": settings}
    try:
        async with aiohttp_client.ClientSession() as s:
            async with s.post(
                "https://api.elevenlabs.io/v1/text-to-speech/" + voice,
                headers={"xi-api-key": api_key, "Content-Type": "application/json", "Accept": "audio/mpeg"},
                json=payload,
                timeout=aiohttp_client.ClientTimeout(total=45),
            ) as r:
                if r.status != 200:
                    return _video_cors(web.json_response({"ok": False, "error": "ElevenLabs " + str(r.status)}, status=502))
                audio = await r.read()
    except Exception:
        return _video_cors(web.json_response({"ok": False, "error": "Erreur TTS"}, status=502))
    return _video_cors(web.Response(body=audio, content_type="audio/mpeg"))




async def handle_video_view(request: web.Request) -> web.Response:
    vid_id = request.match_info.get("id", "")
    data = _video_load()
    for lst in (data["approved"], data["pending"]):
        for v in lst:
            if v["id"] == vid_id:
                v["views"] = v.get("views", 0) + 1
                _video_save(data)
                return _video_cors(web.json_response({"ok": True, "views": v["views"]}))
    return _video_cors(web.json_response({"ok": False, "error": "Not found"}, status=404))

async def handle_video_submit(request: web.Request) -> web.Response:
    try:
        body = await request.json()
    except Exception:
        return _video_cors(web.json_response({"ok": False, "error": "JSON invalide"}, status=400))
    url = (body.get("url") or "").strip()
    msg = (body.get("message") or "").strip()[:300]
    pseudo = (body.get("pseudo") or "Anonyme").strip()[:50]
    if not url:
        return _video_cors(web.json_response({"ok": False, "error": "URL manquante"}, status=400))
    vid_id = _yt_id(url)
    if not vid_id:
        import uuid as _uuid; vid_id = str(_uuid.uuid4())[:8]
    data = _video_load()
    all_ids = [v["id"] for v in data["pending"] + data["approved"]]
    if vid_id in all_ids:
        return _video_cors(web.json_response({"ok": False, "error": "Vidéo déjà soumise"}, status=409))
    import time as _time
    entry = {"id": vid_id, "url": url, "pseudo": pseudo, "message": msg, "ts": int(_time.time())}
    data["pending"].append(entry)
    _video_save(data)
    tg_msg = "[KITT] Nouvelle video soumise" + chr(10) + "Pseudo : " + pseudo + chr(10) + "URL : " + url + chr(10) + "Message : " + (msg or "(aucun)")
    asyncio.create_task(_telegram_alert(tg_msg))
    return _video_cors(web.json_response({"ok": True}))

async def handle_video_approved(request: web.Request) -> web.Response:
    data = _video_load()
    return _video_cors(web.json_response({"approved": data["approved"]}))

async def handle_video_pending(request: web.Request) -> web.Response:
    token = request.headers.get("X-Admin-Token", "")
    if token != _VIDEO_ADMIN_TOKEN:
        return _video_cors(web.json_response({"ok": False, "error": "Non autorisé"}, status=401))
    data = _video_load()
    return _video_cors(web.json_response({"pending": data["pending"], "approved": data["approved"]}))

async def handle_video_decide(request: web.Request) -> web.Response:
    token = request.headers.get("X-Admin-Token", "")
    if token != _VIDEO_ADMIN_TOKEN:
        return _video_cors(web.json_response({"ok": False, "error": "Non autorisé"}, status=401))
    try:
        body = await request.json()
    except Exception:
        return _video_cors(web.json_response({"ok": False, "error": "JSON invalide"}, status=400))
    vid_id = body.get("id")
    action = body.get("action")
    if not vid_id or action not in ("approve", "reject", "delete"):
        return _video_cors(web.json_response({"ok": False, "error": "Paramètres invalides"}, status=400))
    data = _video_load()
    if action == "delete":
        before = len(data["pending"]) + len(data["approved"])
        data["pending"]  = [v for v in data["pending"]  if v["id"] != vid_id]
        data["approved"] = [v for v in data["approved"] if v["id"] != vid_id]
        if len(data["pending"]) + len(data["approved"]) == before:
            return _video_cors(web.json_response({"ok": False, "error": "Video introuvable"}, status=404))
        _video_save(data)
        return _video_cors(web.json_response({"ok": True}))
    entry = next((v for v in data["pending"] if v["id"] == vid_id), None)
    if not entry:
        return _video_cors(web.json_response({"ok": False, "error": "Vidéo introuvable"}, status=404))
    data["pending"] = [v for v in data["pending"] if v["id"] != vid_id]
    if action == "approve":
        data["approved"].append(entry)
    else:
        data["rejected"].append(entry)
    _video_save(data)
    return _video_cors(web.json_response({"ok": True}))

async def handle_video_options(request: web.Request) -> web.Response:
    return _video_cors(web.Response(status=204))


import uuid as _uuid_mod
import aiohttp as _aiohttp_mod

MUSIC_FILE = "/home/karr/kitt-ai/music_submissions.json"
PDF_FILE   = "/home/karr/kitt-ai/pdf_submissions.json"

def _load_music():
    if os.path.exists(MUSIC_FILE):
        with open(MUSIC_FILE) as f:
            return json.load(f)
    return {"pending": [], "approved": [], "rejected": []}

def _save_music(data):
    with open(MUSIC_FILE, "w") as f:
        json.dump(data, f, indent=2)

def _load_pdfs():
    if os.path.exists(PDF_FILE):
        with open(PDF_FILE) as f:
            return json.load(f)
    return {"pending": [], "approved": [], "rejected": []}

def _save_pdfs(data):
    with open(PDF_FILE, "w") as f:
        json.dump(data, f, indent=2)

_ADMIN_TOKEN_NEW   = "8c03437292a68baec2fd5374c6adb4d0ddcfc2aade2407fdee2d4f024e423ef3"
_TELEGRAM_TOKEN_NEW = "8639685200:AAEkGrfpmQkFCP8TlfB-pq5KsQN8s3OlfWU"
_TELEGRAM_CHAT_NEW  = "8591807736"

async def _send_telegram_new(text):
    url = "https://api.telegram.org/bot" + _TELEGRAM_TOKEN_NEW + "/sendMessage"
    try:
        async with _aiohttp_mod.ClientSession() as s:
            await s.post(url, json={"chat_id": _TELEGRAM_CHAT_NEW, "text": text})
    except Exception:
        pass

# ─── AUDIO PROXY ───────────────────────────────────────────────────────────────

async def handle_audio_proxy(request):
    url = request.rel_url.query.get("url", "")
    if not url:
        return web.Response(status=400, text="missing url")
    try:
        ua = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"}
        async with _aiohttp_mod.ClientSession(headers=ua) as s:
            async with s.get(url, timeout=_aiohttp_mod.ClientTimeout(total=30)) as resp:
                content_type = resp.headers.get("Content-Type", "audio/mpeg")
                proxy_headers = {
                    "Content-Type": content_type,
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": "public, max-age=3600",
                    "Accept-Ranges": "bytes",
                }
                # Propager Content-Length pour que le navigateur mobile
                # puisse afficher la durée et permettre le seek
                if "Content-Length" in resp.headers:
                    proxy_headers["Content-Length"] = resp.headers["Content-Length"]
                response = web.StreamResponse(headers=proxy_headers)
                await response.prepare(request)
                async for chunk in resp.content.iter_chunked(8192):
                    await response.write(chunk)
                await response.write_eof()
                return response
    except Exception as e:
        return web.Response(status=502, text=str(e))

async def handle_audio_proxy_options(request):
    return web.Response(headers={
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,OPTIONS",
    })

# ─── MUSIC ────────────────────────────────────────────────────────────────────

async def handle_music_submit(request):
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"ok": False, "error": "JSON invalide"}, status=400)
    url     = (body.get("url") or "").strip()
    titre   = (body.get("titre") or "Sans titre").strip()[:80]
    artiste = (body.get("artiste") or "Inconnu").strip()[:80]
    pseudo  = (body.get("pseudo") or "Anonyme").strip()[:50]
    message = (body.get("message") or "").strip()[:300]
    if not url:
        return web.json_response({"ok": False, "error": "URL manquante"}, status=400)
    entry = {
        "id": str(_uuid_mod.uuid4()),
        "url": url,
        "titre": titre,
        "artiste": artiste,
        "pseudo": pseudo,
        "message": message,
        "ts": int(time.time()),
        "plays": 0,
    }
    data = _load_music()
    data["pending"].append(entry)
    _save_music(data)
    msg = ("[KITT] Nouvelle musique soumise" + chr(10) +
           "Titre : " + titre + chr(10) +
           "Artiste : " + artiste + chr(10) +
           "Par : " + pseudo + chr(10) +
           "URL : " + url[:100])
    await _send_telegram_new(msg)
    return web.json_response({"ok": True}, headers={"Access-Control-Allow-Origin": "*"})

async def handle_music_approved(request):
    data = _load_music()
    return web.json_response({"approved": data["approved"]}, headers={"Access-Control-Allow-Origin": "*"})

async def handle_music_pending(request):
    if request.headers.get("X-Admin-Token") != _ADMIN_TOKEN_NEW:
        return web.Response(status=403, text="Forbidden")
    data = _load_music()
    return web.json_response({"pending": data["pending"], "approved": data["approved"]}, headers={"Access-Control-Allow-Origin": "*"})

async def handle_music_decide(request):
    if request.headers.get("X-Admin-Token") != _ADMIN_TOKEN_NEW:
        return web.Response(status=403, text="Forbidden")
    try:
        body = await request.json()
    except Exception:
        return web.Response(status=400)
    entry_id = body.get("id", "")
    action   = body.get("action", "")
    data = _load_music()
    entry = next((m for m in data["pending"] if m["id"] == entry_id), None)
    if not entry:
        return web.json_response({"ok": False, "error": "Introuvable"}, status=404)
    data["pending"] = [m for m in data["pending"] if m["id"] != entry_id]
    if action == "approve":
        data["approved"].append(entry)
    else:
        data["rejected"].append(entry)
    _save_music(data)
    return web.json_response({"ok": True}, headers={"Access-Control-Allow-Origin": "*"})

async def handle_music_play(request):
    entry_id = request.match_info.get("id", "")
    data = _load_music()
    for m in data["approved"]:
        if m["id"] == entry_id:
            m["plays"] = m.get("plays", 0) + 1
            break
    _save_music(data)
    return web.json_response({"ok": True}, headers={"Access-Control-Allow-Origin": "*"})

async def handle_music_options(request):
    return web.Response(headers={
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,X-Admin-Token",
    })

# ─── PDF ──────────────────────────────────────────────────────────────────────

async def handle_pdf_submit(request):
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"ok": False, "error": "JSON invalide"}, status=400)
    url         = (body.get("url") or "").strip()
    titre       = (body.get("titre") or "Sans titre").strip()[:120]
    description = (body.get("description") or "").strip()[:300]
    categorie   = (body.get("categorie") or "Autre").strip()[:50]
    pseudo      = (body.get("pseudo") or "Anonyme").strip()[:50]
    if not url:
        return web.json_response({"ok": False, "error": "URL manquante"}, status=400)
    entry = {
        "id": str(_uuid_mod.uuid4()),
        "url": url,
        "titre": titre,
        "description": description,
        "categorie": categorie,
        "pseudo": pseudo,
        "ts": int(time.time()),
        "views": 0,
    }
    data = _load_pdfs()
    data["pending"].append(entry)
    _save_pdfs(data)
    msg = ("[KITT] Nouveau PDF soumis" + chr(10) +
           "Titre : " + titre + chr(10) +
           "Categorie : " + categorie + chr(10) +
           "Par : " + pseudo + chr(10) +
           "URL : " + url[:100])
    await _send_telegram_new(msg)
    return web.json_response({"ok": True}, headers={"Access-Control-Allow-Origin": "*"})

async def handle_pdfs_approved(request):
    data = _load_pdfs()
    return web.json_response({"approved": data["approved"]}, headers={"Access-Control-Allow-Origin": "*"})

async def handle_pdfs_pending(request):
    if request.headers.get("X-Admin-Token") != _ADMIN_TOKEN_NEW:
        return web.Response(status=403, text="Forbidden")
    data = _load_pdfs()
    return web.json_response({"pending": data["pending"], "approved": data["approved"]}, headers={"Access-Control-Allow-Origin": "*"})

async def handle_pdfs_decide(request):
    if request.headers.get("X-Admin-Token") != _ADMIN_TOKEN_NEW:
        return web.Response(status=403, text="Forbidden")
    try:
        body = await request.json()
    except Exception:
        return web.Response(status=400)
    entry_id = body.get("id", "")
    action   = body.get("action", "")
    data = _load_pdfs()
    entry = next((p for p in data["pending"] if p["id"] == entry_id), None)
    if not entry:
        return web.json_response({"ok": False, "error": "Introuvable"}, status=404)
    data["pending"] = [p for p in data["pending"] if p["id"] != entry_id]
    if action == "approve":
        data["approved"].append(entry)
    else:
        data["rejected"].append(entry)
    _save_pdfs(data)
    return web.json_response({"ok": True}, headers={"Access-Control-Allow-Origin": "*"})

async def handle_pdfs_view(request):
    entry_id = request.match_info.get("id", "")
    data = _load_pdfs()
    for p in data["approved"]:
        if p["id"] == entry_id:
            p["views"] = p.get("views", 0) + 1
            break
    _save_pdfs(data)
    return web.json_response({"ok": True}, headers={"Access-Control-Allow-Origin": "*"})

async def handle_pdfs_options(request):
    return web.Response(headers={
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,X-Admin-Token",
    })

def create_app() -> web.Application:
    middlewares = []
    if ACCESS_PASSWORD:
        middlewares.append(auth_middleware)
        print(f"[OK] Protection par mot de passe activée", flush=True)

    app = web.Application(client_max_size=10 * 1024 * 1024, middlewares=middlewares)

    app.router.add_get("/login", handle_login_page)
    app.router.add_post("/login", handle_login_post)
    app.router.add_get("/", handle_index)
    app.router.add_get("/manix", handle_manix)
    app.router.add_post("/api/tts/manix", handle_tts_manix)
    app.router.add_post("/api/chat", handle_chat)
    app.router.add_post("/api/chat/stream", handle_chat_stream)
    app.router.add_post("/api/vision", handle_vision)
    app.router.add_get("/api/health", handle_health)
    app.router.add_post("/api/reset", handle_reset)
    app.router.add_post("/api/stt", handle_stt)
    app.router.add_post("/api/stt-chat", handle_stt_chat_stream)
    app.router.add_post("/api/set-name", handle_set_name)
    app.router.add_get("/api/whoami", handle_whoami)
    app.router.add_get("/api/monitor/ws", handle_monitor_ws)
    app.router.add_post("/api/set-lang", handle_set_lang)
    app.router.add_post("/api/ping", handle_ping)
    app.router.add_get("/api/stats", handle_stats)
    app.router.add_get("/api/visitors", handle_visitors)
    app.router.add_get("/api/site-counter", handle_site_counter)
    app.router.add_post("/api/site-counter", handle_site_counter)
    app.router.add_route("OPTIONS", "/api/site-counter", handle_site_counter)
    app.router.add_get("/api/memory", handle_memory)
    app.router.add_post("/api/memory", handle_memory_add)
    app.router.add_get("/api/proactive/ws", handle_proactive_ws)
    app.router.add_post("/api/vigilance", handle_vigilance)
    app.router.add_post("/api/dl-token", handle_issue_dl_token)
    app.router.add_get("/api/download-html", handle_download_html)
    app.router.add_post("/api/git-push-html", handle_git_push_html)
    # Night Scheduler
    app.router.add_get("/api/scheduler/status", handle_scheduler_status)
    app.router.add_post("/api/scheduler/start", handle_scheduler_start)
    app.router.add_post("/api/scheduler/stop", handle_scheduler_stop)
    app.router.add_post("/api/scheduler/window", handle_scheduler_window)
    app.router.add_post("/api/scheduler/window/{wid}/toggle", handle_scheduler_toggle)
    app.router.add_delete("/api/scheduler/window/{wid}", handle_scheduler_delete)
    app.router.add_post("/api/scheduler/run-now", handle_scheduler_run_now)
    app.router.add_get("/api/auto-report", handle_auto_report)
    app.router.add_get("/api/scheduler/logs", handle_scheduler_logs)
    app.router.add_get("/api/gps/reverse",   handle_gps_reverse)
    app.router.add_get("/api/nav/geocode",   handle_nav_geocode)
    app.router.add_post("/api/nav/start",    handle_nav_start)
    app.router.add_post("/api/nav/stop",     handle_nav_stop)
    app.router.add_get("/api/pdfs", handle_list_pdfs)
    app.router.add_get("/api/download/{filename}", handle_download)
    # Conversations
    app.router.add_post("/api/conv/identify", handle_conv_identify)
    app.router.add_post("/api/conv/register", handle_conv_register)
    app.router.add_post("/api/conv/save",     handle_conv_save)
    app.router.add_post("/api/conv/auth",     handle_conv_auth)
    app.router.add_get( "/api/conv/list",     handle_conv_list)
    app.router.add_get( "/api/conv/read/{user}/{filename}", handle_conv_read)
    app.router.add_get("/monitor",      handle_monitor)
    app.router.add_get("/api/stats",   handle_stats)
    app.router.add_get("/api/journal", handle_journal)
    app.router.add_post("/api/debriefing", handle_debriefing)
    # Radars + Trafic OSM
    app.router.add_get("/api/radars",  handle_radars)
    app.router.add_get("/api/traffic", handle_traffic)
    # Mémos vocaux
    app.router.add_get( "/api/memo",      handle_memos_get)
    app.router.add_post("/api/memo",      handle_memos_post)
    app.router.add_post("/api/memo/done", handle_memos_done)
    # Rappels horaires
    app.router.add_get( "/api/reminder",        handle_reminders_get)
    app.router.add_post("/api/reminder",        handle_reminders_post)
    app.router.add_post("/api/reminder/delete", handle_reminders_delete)
    app.router.add_post("/api/face-recognized", handle_face_recognized)
    app.router.add_static("/audio/static", PHRASE_CACHE_DIR)
    app.router.add_static("/audio", AUDIO_DIR)
    app.router.add_static("/static", STATIC_DIR)
    app.router.add_post("/api/video-submit",   handle_video_submit)
    app.router.add_get( "/api/videos/approved", handle_video_approved)
    app.router.add_get( "/api/videos/pending",  handle_video_pending)
    app.router.add_post("/api/videos/decide",   handle_video_decide)
    app.router.add_route("OPTIONS", "/api/video-submit",   handle_video_options)
    app.router.add_route("OPTIONS", "/api/videos/approved", handle_video_options)
    app.router.add_route("OPTIONS", "/api/videos/pending",  handle_video_options)
    app.router.add_route("OPTIONS", "/api/videos/decide",   handle_video_options)
    app.router.add_post("/api/videos/view/{id}", handle_video_view)
    app.router.add_route("OPTIONS", "/api/videos/view/{id}", handle_video_options)

    # Proxy TTS ElevenLabs (cle cote serveur)
    app.router.add_post("/api/tts-eleven", handle_tts_eleven)
    app.router.add_route("OPTIONS", "/api/tts-eleven", handle_video_options)

    # Audio proxy
    app.router.add_get("/api/audio-proxy",           handle_audio_proxy)
    app.router.add_route("OPTIONS", "/api/audio-proxy", handle_audio_proxy_options)

    # Musique
    app.router.add_post("/api/music-submit",         handle_music_submit)
    app.router.add_get("/api/music/approved",        handle_music_approved)
    app.router.add_get("/api/music/pending",         handle_music_pending)
    app.router.add_post("/api/music/decide",         handle_music_decide)
    app.router.add_post("/api/music/play/{id}",      handle_music_play)
    app.router.add_route("OPTIONS", "/api/music-submit",   handle_music_options)
    app.router.add_route("OPTIONS", "/api/music/decide",   handle_music_options)
    app.router.add_route("OPTIONS", "/api/music/pending",  handle_music_options)
    app.router.add_route("OPTIONS", "/api/music/approved", handle_music_options)
    app.router.add_route("OPTIONS", "/api/music/pending",  handle_music_options)
    app.router.add_route("OPTIONS", "/api/music/approved", handle_music_options)

    # PDF
    app.router.add_post("/api/pdf-submit",           handle_pdf_submit)
    app.router.add_get("/api/pdfs/approved",         handle_pdfs_approved)
    app.router.add_get("/api/pdfs/pending",          handle_pdfs_pending)
    app.router.add_post("/api/pdfs/decide",          handle_pdfs_decide)
    app.router.add_post("/api/pdfs/view/{id}",       handle_pdfs_view)
    app.router.add_route("OPTIONS", "/api/pdf-submit",     handle_pdfs_options)
    app.router.add_route("OPTIONS", "/api/pdfs/decide",    handle_pdfs_options)
    app.router.add_route("OPTIONS", "/api/pdfs/pending",   handle_pdfs_options)
    app.router.add_route("OPTIONS", "/api/pdfs/approved",  handle_pdfs_options)
    app.router.add_route("OPTIONS", "/api/pdfs/pending",   handle_pdfs_options)
    app.router.add_route("OPTIONS", "/api/pdfs/approved",  handle_pdfs_options)


    async def start_background(app):
        app["stats_task"]     = asyncio.create_task(_stats_loop())
        app["cleanup_task"]   = asyncio.create_task(cleanup_audio(app))
        app["proactive_task"] = asyncio.create_task(proactive_loop(app))
        app["reminder_task"]  = asyncio.create_task(_reminders_check_loop())

    async def stop_background(app):
        for key in ("stats_task", "cleanup_task", "proactive_task", "reminder_task"):
            task = app.get(key)
            if task:
                task.cancel()
        if _llm_session and not _llm_session.closed:
            await _llm_session.close()
        # Arrêter le daemon vision
        if _vision_proc and _vision_proc.returncode is None:
            _vision_proc.stdin.write(b"quit\n")
            try:
                await asyncio.wait_for(_vision_proc.wait(), timeout=3)
            except asyncio.TimeoutError:
                _vision_proc.kill()

    app.on_startup.append(start_background)
    app.on_cleanup.append(stop_background)
    return app


if __name__ == "__main__":
    print("=" * 60, flush=True)
    print("  KARR — Knight Automated Roving Robot", flush=True)
    print("  By Manix — Jetson Orin NX 16Go", flush=True)
    print("=" * 60, flush=True)
    app = create_app()

    cert_dir = BASE_DIR / "certs"
    cert_file = cert_dir / "cert.pem"
    key_file = cert_dir / "key.pem"

    if cert_file.exists() and key_file.exists():
        ssl_ctx = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
        ssl_ctx.load_cert_chain(str(cert_file), str(key_file))
        print("  HTTPS actif — https://localhost:3000", flush=True)
        print("  HTTP  actif — http://localhost:3001  (tunnel)", flush=True)
        print("=" * 60, flush=True)

        async def run_both():
            runner = web.AppRunner(app)
            await runner.setup()
            site_https = web.TCPSite(runner, "0.0.0.0", 3000, ssl_context=ssl_ctx)
            site_http  = web.TCPSite(runner, "0.0.0.0", 3001)
            await site_https.start()
            await site_http.start()
            await asyncio.Event().wait()

        asyncio.run(run_both())
    else:
        ssl_ctx = None
        print('  HTTP uniquement', flush=True)
        print('=' * 60, flush=True)
        async def run_both_http():
            runner = web.AppRunner(app)
            await runner.setup()
            site_http = web.TCPSite(runner, '0.0.0.0', 3000)
            await site_http.start()
            await asyncio.Event().wait()
        asyncio.run(run_both_http())
