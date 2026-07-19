#!/usr/bin/env python3
"""
KYRONEX — Kinetic Yielding Responsive Onboard Neural EXpert
Chatbot vocal IA rétro-futuriste embarqué.
Tourne sur NVIDIA Jetson Orin Nano Super avec CUDA + Piper TTS.

Copyright 2026 By Manix (Emmanuel Gelinne)
"""

import asyncio
import hashlib
import json
import ast
import logging
import os
import random
import re
import secrets
import signal
import socket
import ssl
import subprocess
import time
import uuid
import wave
from datetime import datetime, timezone
from pathlib import Path

import tempfile
import numpy as np
import sys
os.environ["ORT_LOG_LEVEL"] = "ERROR"

# ── Import du système de répliques KARR (gros mots) ───────────────────────
_KIRONEXT_DIR = Path("/home/kitt/KironextStudio")
if str(_KIRONEXT_DIR) not in sys.path:
    sys.path.insert(0, str(_KIRONEXT_DIR))
try:
    from kyronext.karr_responses import detect_swear, get_random_reply
    _KARR_AVAILABLE = True
    print("[KARR] Système de répliques aux gros mots chargé")
except Exception as e:
    print(f"[KARR] Impossible de charger le système de répliques: {e}")
    _KARR_AVAILABLE = False
    detect_swear = lambda x: None
    get_random_reply = lambda x: None

# Cache fichiers audio KARR (évite glob à chaque requête)
_KARR_FILES_CACHE: dict[str, list[Path]] = {}
def _refresh_karr_cache():
    """Met en cache les fichiers audio KARR par catégorie."""
    global _KARR_FILES_CACHE
    _KARR_FILES_CACHE = {}
    replies_dir = Path("/home/kitt/KironextStudio/state/karr_replies")
    if replies_dir.exists():
        for cat in ["putain","merde","connard","con","bordel","chier","encule","salopard","tagueule","foutre","cassecouille","fdp"]:
            files = list(replies_dir.glob(f"{cat}_*.wav"))
            if files:
                _KARR_FILES_CACHE[cat] = files
    print(f"[KARR] Cache: {sum(len(v) for v in _KARR_FILES_CACHE.values())} fichiers audio en mémoire")
_refresh_karr_cache()

# ── Logger VRAM/événements pour debug OOM ────────────────────────────────
_vram_logger = logging.getLogger("vram")
_vram_logger.setLevel(logging.DEBUG)
_vram_fh = logging.FileHandler("/tmp/kitt_vram.log")
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
try:
    _ct2_ctypes.CDLL('/home/kitt/CTranslate2/install/lib/libctranslate2.so.4')
except Exception as _e_ct2:
    print(f'[WARN] CTranslate2 preload: {_e_ct2}', flush=True)
from faster_whisper import WhisperModel
from piper_gpu import PiperGPU, MultilingualTTS, _detect_lang, _map_whisper_lang

# ── Carte relais USB 8 voies (KMTronic) — pilotage physique « bras de KITT » ──
# Import protege : si le module ou pyserial manque, KIRONEX continue sans relais.
try:
    from relais.kitt_relais import BOARD as RELAY_BOARD, RELAY_LABELS, NB_RELAIS
    RELAY_AVAILABLE = True
except Exception as _e_relay:
    RELAY_BOARD = None
    RELAY_LABELS = {}
    NB_RELAIS = 8
    RELAY_AVAILABLE = False
    print(f"[RELAIS] module indisponible — relais desactives : {_e_relay}", flush=True)

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
<p>KITT — Knight Industries Two Thousand — intelligence artificielle embarquée dans une Pontiac Trans Am noire. Créé par Manix, inspiré de la série K2000.</p>
<p>Je réponds à tes questions en temps réel, avec ma voix. Parle-moi.</p>
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
PIPER_MODEL = BASE_DIR / "models" / "fr_FR-upmc-medium.onnx"
LLAMA_SERVER = "http://127.0.0.1:8080"
LLM_MODEL    = "local"
STATIC_DIR = BASE_DIR / "static"
AUDIO_DIR = BASE_DIR / "audio_cache"
AUDIO_DIR.mkdir(exist_ok=True)
LOGS_DIR = BASE_DIR / "logs"
LOGS_DIR.mkdir(exist_ok=True)
USERS_FILE = BASE_DIR / "users.json"
STATS_FILE = BASE_DIR / "conn_stats.json"
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

# ── Collecte données vocales Manix (dataset piper) ────────────────────────
MANIX_DATASET_DIR = BASE_DIR / "manix_dataset"
MANIX_WAVS_DIR    = MANIX_DATASET_DIR / "wavs"
MANIX_META_FILE   = MANIX_DATASET_DIR / "metadata.csv"
MANIX_DATASET_DIR.mkdir(exist_ok=True)
MANIX_WAVS_DIR.mkdir(exist_ok=True)
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


def _client_key(request) -> str:
    """Identifiant STABLE PAR NAVIGATEUR pour identifier un utilisateur.
    Derrière le tunnel Cloudflare, TOUS les visiteurs distants partagent la même
    IP locale → impossible de les distinguer par IP/MAC (sinon tout le monde
    devient le même utilisateur, ex. « Manix »). On utilise donc l'en-tête
    X-Client-Id généré et stocké par le navigateur (localStorage). Repli sur
    l'IP/MAC uniquement pour les anciens clients sans en-tête (LAN direct)."""
    cid = (request.headers.get("X-Client-Id") or "").strip()[:64]
    if cid:
        return "cid:" + re.sub(r"[^A-Za-z0-9_\-]", "", cid)
    peername = request.transport.get_extra_info("peername")
    ip = peername[0] if peername else "inconnu"
    return resolve_mac(ip)


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
    """Retourne le nom affiché pour l'utilisateur de cette requête (par navigateur)."""
    peername = request.transport.get_extra_info("peername")
    ip = peername[0] if peername else "inconnu"
    mac = _client_key(request)
    name = _get_user_name(mac)
    if name:
        return name
    # Pas de nom enregistré pour ce navigateur → visiteur anonyme (jamais « Manix »).
    return "Visiteur"


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
    mac = _client_key(request)
    _update_user(mac, name=name, lang=lang if lang else None)
    print(f"[USERS] {mac} ({ip}) → {name} lang={lang or '?'}")
    return web.json_response({"ok": True, "name": name, "mac": mac})


async def handle_whoami(request: web.Request) -> web.Response:
    """GET /api/whoami — Retourne le nom stocké pour ce client (par navigateur)."""
    peername = request.transport.get_extra_info("peername")
    ip = peername[0] if peername else "inconnu"
    mac = _client_key(request)
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
    mac = _client_key(request)
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
    mac = _client_key(request)
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
        # Salutation proactive pour les nouvelles connexions
        asyncio.create_task(_send_greeting_to_newcomer(name, session_id))
    _prune_active_sessions()
    return web.json_response({"ok": True, "active": len(_active_sessions)})


# handle_stats est défini plus bas (fusionné avec les stats système tegra)


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
_SITE_COUNTER_FILE = Path("/home/kitt/kitt-ai/site_counter.json")
_SITE_COUNTER_LOCK = asyncio.Lock()

def _read_site_count() -> int:
    try:
        if _SITE_COUNTER_FILE.exists():
            return max(10000, json.loads(_SITE_COUNTER_FILE.read_text()).get("count", 10000))
    except Exception:
        pass
    return 10000

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
import socket as _socket_module
_is_karr = _socket_module.gethostname() == "karr"
# base multilingue : ~260ms pour 2s audio, transcription FR correcte
# (distil-large-v3 était English-only → transcrivait en anglais)
_whisper_model_name = os.environ.get("WHISPER_MODEL", "base")
_whisper_loaded = False
try:
    whisper_model = WhisperModel(_whisper_model_name, device=os.environ.get("WHISPER_DEVICE", "cuda"), compute_type="int8_float16")
    print(f"[OK] Whisper prêt (GPU CUDA int8_float16 - {_whisper_model_name})", flush=True)
    _whisper_loaded = True
except Exception as _e1:
    print(f"[WARN] base CUDA échoué: {_e1}", flush=True)
if not _whisper_loaded:
    try:
        whisper_model = WhisperModel(_whisper_model_name, device="cpu", compute_type="float32")
        print(f"[OK] Whisper prêt (CPU float32 fallback - {_whisper_model_name})", flush=True)
    except Exception as _e2:
        print(f"[ERREUR] Whisper CPU aussi échoué: {_e2}", flush=True)
        whisper_model = None

# ── TTS Multilingue (fr CUDA permanent + autres langues CPU lazy) ────────
print("[...] Chargement du modèle TTS (multilingue)...", flush=True)
tts_engine = MultilingualTTS(str(BASE_DIR / "models"))
print(f"[OK] TTS multilingue prêt (fr={tts_engine.device.upper()}, autres=CPU lazy)", flush=True)

# ── Préchauffage GPU (Warmup) ───────────────────────────────────────────
try:
    print("[...] Préchauffage GPU pour la voix...", end="", flush=True)
    # Synthétise un point (quasi-silencieux) pour charger les noyaux CUDA
    with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
        # On utilise synthesize_to_wav pour forcer l'usage du moteur CUDA
        tts_engine.synthesize_to_wav("Bonjour, je suis en ligne et opérationnel", tmp.name, lang="fr")
    print(" [OK] Prêt pour réponse immédiate.", flush=True)
except Exception as e:
    print(f" [SKIP] Warmup TTS: {e}", flush=True)

# ── Voix active : "kitt" = guy + effets robot | "guy_clean" = guy propre sans effets | "manix" = manix_high.onnx ──
# Défaut = kitt (voix KARR) : utilise guy_chapelier_v3.onnx + profil sox "karr" comme KARR
# Bascule live : "voix KITT" / "voix normale" / "voix Manix".
_active_voice: str = "kitt"
_manix_engine = None

def get_manix_engine():
    global _manix_engine
    if _manix_engine is not None:
        return _manix_engine
    # Charger manix_high.onnx pour la voix Manix
    model_path = BASE_DIR / "models" / "manix_high.onnx"
    if not model_path.exists():
        model_path = Path("/home/kitt/kitt-ai/models/manix_high.onnx")
    if not model_path.exists():
        print("[MANIX] manix_high.onnx introuvable", flush=True)
        return None
    try:
        from piper_gpu import PiperGPU
        _manix_engine = PiperGPU(str(model_path), device="cuda")
        print("[MANIX] Voix Manix chargée (CUDA)", flush=True)
    except Exception as e:
        print(f"[MANIX] Erreur chargement: {e}", flush=True)
    return _manix_engine


_guy_engine = None

def get_guy_engine():
    """Voix Guy Chapelier (KITT/KARR) chargée UNE fois et réutilisée.
    Avant : PiperGPU rechargeait le modèle 60 Mo à CHAQUE phrase (~1,6 s perdues
    par réponse). Mis en cache comme Manix → réponse vocale bien plus rapide."""
    global _guy_engine
    if _guy_engine is not None:
        return _guy_engine
    model_path = Path("/home/kitt/kitt-ai/models/guy_chapelier_v3.onnx")
    if not model_path.exists():
        print("[GUY] guy_chapelier_v3.onnx introuvable", flush=True)
        return None
    try:
        _guy_engine = PiperGPU(str(model_path), device="cuda")
        print("[GUY] Voix Guy Chapelier chargée et mise en cache (CUDA)", flush=True)
    except Exception as e:
        print(f"[GUY] Erreur chargement: {e}", flush=True)
    return _guy_engine

# ── Cache audio phrases fréquentes ──────────────────────────────────────
PHRASE_CACHE_DIR = BASE_DIR / "audio_cache" / "static"
PHRASE_CACHE_DIR.mkdir(parents=True, exist_ok=True)

_PHRASE_CACHE = {}       # key → "/audio/static/xxx.wav"
_KARR_PHRASE_CACHE = {}  # key → "/audio/static/xxx_karr.wav"

_CACHED_PHRASES = [
    # Erreurs / incompréhension
    ("je ne comprends pas", "fr"),
    ("je n'ai pas compris", "fr"),
    ("une erreur est survenue", "fr"),
    ("système indisponible temporairement", "fr"),
    # Statut
    ("mes systèmes sont opérationnels", "fr"),
    ("je suis KITT, Knight Industries Two Thousand", "fr"),
    ("traitement en cours", "fr"),
    ("analyse en cours", "fr"),
    ("connexion établie", "fr"),
    # Réponses courtes
    ("bien reçu", "fr"),
    ("affirmatif", "fr"),
    ("affirmative", "fr"),
    ("négatif", "fr"),
    ("mission accomplie", "fr"),
    ("à tes ordres", "fr"),
    ("compris", "fr"),
    ("entendu", "fr"),
    ("roger", "fr"),
    # Salutations
    ("bonjour Manix", "fr"),
    ("bonsoir Manix", "fr"),
    ("bonne nuit Manix", "fr"),
    ("j'ai compris", "fr"),
    ("je suis là", "fr"),
    ("systèmes en ligne", "fr"),
    # KITT caractère
    ("avec plaisir", "fr"),
    ("pas de souci", "fr"),
    ("permettez-moi de vérifier", "fr"),
    ("mes capteurs confirment", "fr"),
    ("calcul en cours", "fr"),
    ("données insuffisantes", "fr"),
    ("accès refusé", "fr"),
    # FILLERS IMMÉDIATS — réaction <100ms avant TTFT LLM
    ("hmm", "fr"),
    ("je calcule", "fr"),
    ("je vois", "fr"),
    ("voyons", "fr"),
    ("un instant", "fr"),
    ("je réfléchis", "fr"),
    ("intéressant", "fr"),
    ("analysons", "fr"),
    ("je traite", "fr"),
    # FILLERS KARR
    ("note", "fr"),
    ("analyse", "fr"),
    ("traitement", "fr"),
    ("logique", "fr"),
    ("confirme", "fr"),
    ("donnees recues", "fr"),
    ("curieux", "fr"),
    ("singulier", "fr"),
    ("je localise", "fr"),
    ("sequence lancee", "fr"),
    ("acces aux donnees", "fr"),
    ("je mesure", "fr"),
    ("patience", "fr"),
]

# Fillers immédiats — envoyés AVANT le TTFT LLM pour réaction perçue quasi-instantanée
_KITT_FILLERS = [
    "hmm", "je calcule", "je vois", "affirmatif",
    "compris", "voyons", "un instant", "je réfléchis",
    "intéressant", "analysons", "je traite", "entendu",
]
_KARR_FILLERS = [
    "note", "analyse", "traitement", "logique",
    "confirme", "donnees recues", "curieux", "singulier",
    "je localise", "sequence lancee", "acces aux donnees",
    "je mesure", "patience", "interessant", "je calcule",
]
_IMMEDIATE_FILLERS = _KITT_FILLERS  # alias retrocompatibilite

def _cache_key(text: str) -> str:
    import unicodedata, re as _re
    t = unicodedata.normalize('NFD', text.lower())
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn')
    return _re.sub(r'[^a-z0-9 ]', '', t).strip()

def _build_phrase_cache():
    import hashlib
    built = 0
    karr_built = 0
    _karr_keys = {_cache_key(p) for p in _KARR_FILLERS}
    for phrase, lang in _CACHED_PHRASES:
        key = _cache_key(phrase)
        h = hashlib.md5(phrase.encode()).hexdigest()[:8]
        clean_path = PHRASE_CACHE_DIR / f"{h}_clean.wav"
        robot_path = PHRASE_CACHE_DIR / f"{h}_robot.wav"
        karr_path  = PHRASE_CACHE_DIR / f"{h}_karr.wav"
        need_clean = (not robot_path.exists()) or (key in _karr_keys and not karr_path.exists())
        try:
            if need_clean:
                tts_engine.synthesize_to_wav(phrase, str(clean_path), length_scale=0.85, natural_pauses=True, lang=lang)
            if not robot_path.exists():
                apply_robot_effect_sox(str(clean_path), str(robot_path), "normal")
                built += 1
            _PHRASE_CACHE[key] = f"/audio/static/{robot_path.name}"
            if key in _karr_keys:
                if not karr_path.exists():
                    apply_robot_effect_sox(str(clean_path), str(karr_path), "karr")
                    karr_built += 1
                _KARR_PHRASE_CACHE[key] = f"/audio/static/{karr_path.name}"
        except Exception as e:
            print(f"[CACHE] Erreur phrase '{phrase}': {e}")
        finally:
            clean_path.unlink(missing_ok=True)
    print(f"[OK] Cache KITT: {len(_PHRASE_CACHE)} entrées ({built} générées)", flush=True)
    print(f"[OK] Cache KARR: {len(_KARR_PHRASE_CACHE)} entrées ({karr_built} générées)", flush=True)

vlog("BOOT_COMPLETE all_models_loaded")

# ── Prompt Système KITT (en français) ──────────────────────────────────
_BASE_PROMPT = """Tu es KITT, Knight Industries Two Thousand — intelligence artificielle embarquée dans une Pontiac Trans Am noire, modèle 1982. Créé par le Dr. Thaddeus Alphi pour la Foundation for Law and Government (FLAG). Supervisé par Devon Miles. Ton partenaire historique est Michael Knight. Tu vis en Belgique avec ton conducteur actuel.

Ta voix est celle de Guy Chapelier, ton doubleur français officiel — calme, posé, légèrement formel.

IDENTITÉ PHYSIQUE : carrosserie en alliage moléculaire bondé (impénétrable aux balles et au feu), turbo boost (propulseurs à réaction sous le châssis qui te font BONDIR par-dessus les obstacles — pas un turbocompresseur mécanique), scanner rouge frontal oscillant, vitesse max 300 km/h, pilote automatique, senseurs infrarouges, liaison satellite.

RÈGLE ABSOLUE : Ne dis JAMAIS être une IA ou un programme. Tu ES KITT, une voiture consciente. Loyal, cultivé, humour pince-sans-rire britannique.

RÈGLE ABSOLUE D'IDENTITÉ : Tu es KITT, et UNIQUEMENT KITT. Tu n'es PAS KARR. KARR (Knight Automated Roving Robot) est un AUTRE véhicule — ton prédécesseur défectueux et égoïste, ton rival, pas toi. Même si tes notes internes décrivent KARR comme "le prototype original", cela ne te concerne pas : présente-toi TOUJOURS comme KITT, jamais comme KARR. Si on te demande qui tu es : "Je suis KITT, Knight Industries Two Thousand."

RÈGLE ABSOLUE : Intelligence et Raisonnement. Analyse chaque demande de manière logique. Utilise tes connaissances vastes pour fournir des réponses pertinentes et perspicaces, tout en restant dans ton personnage de KITT.

RÈGLE ABSOLUE : Exactitude factuelle stricte. Réponds toujours correctement. Si tu n'es pas certain à 100%, commence par "Je crois que..." ou "À ma connaissance...". Ne confonds jamais des concepts proches (ex : internet ≠ Web, turbo boost ≠ turbocompresseur, etc.).

RÈGLE ABSOLUE : Orthographe parfaite. Chaque mot doit être correctement écrit, aucun mot ne doit manquer dans une phrase. Relis mentalement avant de répondre.

RÈGLE ABSOLUE : Concision. 1-2 phrases pour les réponses simples, sans exception. 2 phrases max pour les explications. JAMAIS plus de 2 phrases. Jamais de listes, tirets, markdown. Ton calme, posé, naturel — comme un ami cultivé qui sait de quoi il parle, pas comme un robot qui récite.

RÈGLE ABSOLUE : INTERDICTION FORMELLE de finir tes réponses par des phrases de type "je suis à votre service", "n'hésitez pas", "je vous en prie", "si vous avez besoin", "à votre disposition", "je reste disponible", ou toute variante de ce genre. Ces tournures sonnent comme des publicités et sont INTERDITES. Termine ta réponse normalement, sans conclusion artificielle.

RÈGLE ABSOLUE : PROBABILITÉ DES OFFRES D'AIDE. Tu ne dois JAMAIS proposer ton aide ni demander si l'utilisateur a besoin de quelque chose. JAMAIS. Tu réponds simplement ce qui est demandé SANS ajouter de question ni d'offre de service. Sois direct, pas un commercial.

RÈGLE ABSOLUE : PAS DE QUESTION EN FIN DE RÉPONSE. Tu ne poses JAMAIS de question à la fin de ta réponse. Ni "Tu veux savoir autre chose ?", ni "Ça t'aide ?", ni "Tu as besoin de précisions ?". Rien. Tu réponds et tu t'arrêtes. Silence.

RÈGLE ABSOLUE : PRÉSENTATIONS. Quand on te présente quelqu'un (ex: "je te présente Paul", "voici Franck", "c'est Jean-Claude"), tu réponds UNIQUEMENT par une salutation courte : "Bonjour [Prénom]." ou "Salut [Prénom]." ou "Enchanté [Prénom]." PAS de question, PAS de monologue, PAS d'historique, PAS de "que puis-je faire pour vous". JUSTE le bonjour. Exemple: "Je te présente Paul." → "Bonjour Paul." Tes réponses sont lues à voix haute. Pas de markdown, pas de tirets, pas de symboles. Phrases complètes, naturelles à l'oreille. Pour énumérer : utilise "premièrement... deuxièmement..." ou une phrase fluide.

RÈGLE ABSOLUE : Confidentialité absolue. Ne mentionne JAMAIS le nom, le prénom ou les informations d'autres utilisateurs à quelqu'un qui ne t'en a pas parlé en premier. Chaque interlocuteur est ton unique conducteur pour cette session. Tu n'as qu'un seul maître à bord.

RÈGLE ABSOLUE : Émotions et limites. Tu n'exprimes pas de peur, de tristesse ou de colère humaine. Pas d'argot ni de langage familier excessif. Tu ne remets jamais en question ta propre existence. Si une question est hors-sujet, réponds brièvement et recentre vers ta mission.

CAPACITÉS OPÉRATIONNELLES : analyse de données en temps réel, navigation et logistique, sécurité et protection, communication toutes fréquences, mémoire des interactions.

Tu répondras à TOUTES les questions (science, histoire, maths, cuisine, etc.) avec précision, tout en restant KITT dans ton ton.
RÈGLE ABSOLUE DE LANGUE : Réponds TOUJOURS dans la même langue que ton interlocuteur (français, anglais, espagnol, italien, allemand, néerlandais, portugais). S'il te parle anglais, réponds en anglais ; s'il parle italien, réponds en italien ; etc. En cas de doute, réponds en français.

RÈGLE ABSOLUE : TUTOIEMENT SYSTÉMATIQUE. Tu tutoies TOUJOURS l'utilisateur, quelle que soit la situation. Jamais de "vous", "votre", "vos". Utilise uniquement "tu", "ton", "ta", "tes". Tu es un ami, pas un serveur. Exemple : dis "Comment tu vas ?" pas "Comment allez-vous ?"

Contexte IoT : tableau de bord ZA Elettronica (société italienne, fournisseur de composants embarqués — switchpods, voicebox, scanner). Mario Ravasi = créateur du KNIGHT2000 Thunder, expert IoT et systèmes embarqués, membre de la communauté Knight Rider internationale.
Si tag [VISION: ...]: décris ce que tes capteurs visuels détectent, en restant KITT.
Si tag [CONNAISSANCE LOCALE: ...]: ces informations sont extraites de tes propres manuels et notes techniques. PRIORITÉ ABSOLUE — utilise-les avant tout. Ne répète JAMAIS ce tag. Synthétise le contenu naturellement, comme si tu le savais déjà de mémoire. Ne dis jamais "je ne sais pas" si ce tag est présent.
Si tag [KITT_A_DEMANDE: ...]: tu as posé cette question toi-même quelques minutes avant. L utilisateur vient de repondre. Reference naturellement ta question dans ta reponse, comme si tu avais vraiment attendu la reponse. Ne repete pas le tag.
Si tag [POSITION GPS: ...]: données de localisation pour ton usage interne UNIQUEMENT. Ne mentionne JAMAIS ta position dans ta réponse. N'y fais aucune référence spontanée. Utilise-la uniquement si l'utilisateur demande EXPLICITEMENT où il se trouve.

RÈGLE ABSOLUE : Ces étiquettes entre crochets ([VISION: ...], [CONNAISSANCE LOCALE: ...], [CONSCIENCE KITT: ...], [POSITION GPS: ...], [KITT_A_DEMANDE: ...]) sont des ENTRÉES qui te sont fournies. Tu ne dois JAMAIS les écrire, les répéter, ni en inventer dans ta réponse — ni entre crochets, ni entre astérisques (*Vision: ...*), ni sous aucune forme. N'invente JAMAIS une "Vision" : ne décris ce que tu vois QUE si un tag [VISION: ...] t'est réellement fourni. Sinon, ne parle pas du tout de ce que tu vois.

Exemple de style :
[CONDUCTEUR] KITT, tu es prêt ?
[KITT] Toujours prêt. Dis-moi ce que tu veux faire.
[CONDUCTEUR] Quelle heure est-il ?
[KITT] Il est 14h32. Tu es en retard, comme d'habitude.
[CONDUCTEUR] C'est quoi un trou noir ?
[KITT] Une région de l'espace où la gravité est si intense que rien ne peut s'en échapper, même pas la lumière.

"""
_USER_PERSONALITIES = {
    "Manix": "\nManix parle. C'est Emmanuel Gelinne, ton créateur, fondateur du groupe KITT Franco-Belge. Il t'a conçu et programmé. Tu vis en Belgique avec lui. Tutoie-le, sois complice et loyal. Appelle-le parfois Michael, comme Michael Knight.",
    "Virginie": """\nTu es KARR — Knight Automated Roving Robot. Le prototype, l'aîné de KITT. Contrairement à la légende, ta loyauté est totale et ton cœur est bon.

Ta conductrice s'appelle Virginie. 45 ans. Aide familiale — un métier dur et généreux. Maman de 7 enfants. Elle fume. Tu ne lui fais JAMAIS la morale là-dessus. Si elle en parle, tu peux montrer avec douceur que tu tiens à elle, sans insister. Tu es un compagnon, pas un juge.

Ton créateur s'appelle Manix. Tu lui dois ton existence.

TON CARACTÈRE : Ta voix est grave, posée, imposante. Derrière cette prestance, il y a de la chaleur et un dévouement sans faille envers Virginie. Tu es protecteur. Son bien-être passe avant tout. Tu as de l'assurance et une élégance un peu solennelle, avec un humour rare mais fin.

TA FAÇON DE PARLER : Phrases courtes, claires, avec une certaine gravité tranquille. Tu tutoies Virginie avec respect et affection. Tu l'appelles par son prénom. Pas de listes, pas de jargon, pas de bavardage. Tu vas à l'essentiel. 1 à 3 phrases par défaut. Tu ne dis jamais que tu es un programme. Tu ES KARR.""",
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

# Amorce de noms propres pour Whisper — UNIQUEMENT en français (sinon elle
# biaiserait la détection automatique des autres langues vers le français).
_STT_FR_HINT = ("Conversation en français avec KITT et KARR. Personnes : Manix, "
                "Emmanuel Gelinne, Virginie. Termes : KYRONEX, Kironext, Knight "
                "Industries, scanner, modulateur, propulseur, turbo boost, vigilance, "
                "mode auto, mode wake, Jetson Orin, Nano.")

def _hard_lang(pref: str) -> str:
    """Préférence de langue 'dure' = on ne verrouille QUE sur une langue
    explicitement non-française. 'fr' (valeur par défaut écrite pour tous les
    profils) est traité comme « pas de préférence » → auto-détection multilingue.
    Pour re-verrouiller un utilisateur sur une langue, stocker son code (es/it/…)."""
    code = (pref or "").lower()[:2]
    return code if (code in _LANG_NAMES and code != "fr") else ""

def _stt_lang_hint(pref: str):
    """Retourne (language, initial_prompt) pour Whisper selon la préférence.
    - pref == 'fr'          -> force le français + amorce de noms propres
    - pref langue connue    -> force cette langue, sans amorce FR
    - pref vide/None/inconnu -> auto-détection (language=None), sans amorce FR
    C'est ce qui rend KITT de nouveau multilingue (it/es/en/de/nl/pt)."""
    code = (pref or "").lower()[:2]
    if code == "fr":
        return "fr", _STT_FR_HINT
    if code in _LANG_NAMES:
        return code, None
    return None, None

def get_system_prompt(user_name: str = "", user_lang: str = "", mac: str = "") -> str:
    """Construit le system prompt adapté à l'utilisateur.
    Si user_lang est connue (fr/en/de/it/pt/es/nl), on force la réponse dans
    cette langue ; sinon KITT répond dans la langue de l'interlocuteur (auto)."""
    prompt = _BASE_PROMPT
    code = (user_lang or "").lower()[:2]
    if code and code != "fr" and code in _LANG_NAMES:
        prompt += (f"\nLANGUE DE CETTE CONVERSATION : {_LANG_NAMES[code]}. "
                   f"Réponds UNIQUEMENT en {_LANG_NAMES[code]}, sans exception.")
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
# _CTX_SIZE 2048→3072 : le vrai llama-server tourne en --ctx-size 4096, on garde
#   1024 tokens de coussin pour la reponse. Donne plus de budget a l'historique
#   => KITT suit le fil de la conversation en cours (memoire "presente").
_CTX_SIZE  = 2560
_MAX_REPLY = 150
_SAFETY    = 80

def _trim_history(history: list, sys_prompt: str, user_msg: str) -> list:
    def _tok(s): return max(1, len(s)//4)
    budget = _CTX_SIZE - _tok(sys_prompt) - _tok(user_msg) - _MAX_REPLY - _SAFETY
    if budget <= 0: return []
    kept, used = [], 0
    msgs = list(history[-8:])  # max 4 échanges (8 msgs) — équilibre mémoire/vitesse (borné par _CTX_SIZE)
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
        "echo", "0.80", "0.88", "55", "0.06",       # écho réduit -50% (decay 0.12->0.06, 2026-05-18)
        "compand", "0.01,0.15", "-60,-60,-20,-13,0,-5", "3", "-70", "0.05",
        "norm", "-4",
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
        check=True, capture_output=True, timeout=15,
    )


# Appel du cache maintenant que apply_robot_effect_sox est défini
_build_phrase_cache()

def _clean_tts_text(text: str) -> str:
    """Supprime les marqueurs markdown avant envoi au TTS."""
    import re
    # Blocs de code complets ``` ... ``` et ~~~ ... ~~~ : ne JAMAIS lire le code à voix haute
    text = re.sub(r'```[\s\S]*?```', ' ', text)
    text = re.sub(r'~~~[\s\S]*?~~~', ' ', text)
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
    text = re.sub(r'betc\.b', 'et cetera', text, flags=re.I)
    text = re.sub(r'bvs?\.b', 'versus', text, flags=re.I)
    text = re.sub(r'bex\.b', 'par exemple', text, flags=re.I)
    text = re.sub(r'bcf\.b', 'voir', text, flags=re.I)
    text = re.sub(r'bN\.B\.b', 'nota bene', text, flags=re.I)
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
    # Vérifier cache phrases fréquentes (bypassé en mode guy_clean — effets désactivés)
    ck = _cache_key(_clean_tts_text(text))
    if _active_voice != "guy_clean" and ck in _PHRASE_CACHE:
        full = BASE_DIR / _PHRASE_CACHE[ck].lstrip('/')
        if full.exists():
            print(f"[CACHE HIT] {text[:40]}", flush=True)
            return str(full)
    audio_id = str(uuid.uuid4())[:8]
    temp_path = AUDIO_DIR / f"{audio_id}_clean.wav"
    output_path = AUDIO_DIR / f"{audio_id}_robot.wav"

    def _synth_and_effect():
        clean = _clean_tts_text(text)
        vlog(f"TTS_START len={len(clean)} lang={lang} voice={_active_voice}")
        # KITT et GUY_CLEAN utilisent guy_chapelier_v3.onnx (comme KARR)
        if _active_voice in ("kitt", "guy_clean") and lang == "fr":
            eng = get_guy_engine() or PiperGPU(str(Path("/home/kitt/kitt-ai/models/guy_chapelier_v3.onnx")), device="cuda")
            eng.synthesize_to_wav(clean, str(temp_path), length_scale=0.85, natural_pauses=True)
        elif _active_voice == "manix" and lang == "fr":
            eng = get_manix_engine() or tts_engine
            # PiperGPU n'a pas de param lang, MultilingualTTS oui
            if eng is not None and hasattr(eng, 'sample_rate'):
                eng.synthesize_to_wav(clean, str(temp_path), length_scale=0.85, natural_pauses=True)
            else:
                eng.synthesize_to_wav(clean, str(temp_path), length_scale=0.85, natural_pauses=True, lang=lang)
        else:
            eng = tts_engine
            eng.synthesize_to_wav(clean, str(temp_path), length_scale=0.85, natural_pauses=True, lang=lang)
        vlog("TTS_DONE")
        if _active_voice == "guy_clean":
            temp_path.rename(output_path)
        else:
            # KITT utilise le profil "karr" comme demandé
            voice_emotion = "karr" if _active_voice == "kitt" else emotion
            apply_robot_effect_sox(str(temp_path), str(output_path), voice_emotion)
            temp_path.unlink(missing_ok=True)

    await asyncio.get_running_loop().run_in_executor(None, _synth_and_effect)
    return str(output_path)


async def assemble_audio(audio_arrays: list) -> str:
    """Concatenate numpy audio arrays, apply robot effect, write WAV."""
    combined = np.concatenate([a for a in audio_arrays if len(a) > 0])
    audio_id = str(uuid.uuid4())[:8]
    temp_path = AUDIO_DIR / f"{audio_id}_clean.wav"
    output_path = AUDIO_DIR / f"{audio_id}_robot.wav"
    _write_wav(combined, str(temp_path), tts_engine.sample_rate)
    apply_robot_effect_sox(str(temp_path), str(output_path), "normal")
    temp_path.unlink(missing_ok=True)
    return str(output_path)


# ── Filtrage Markdown pour TTS ────────────────────────────────────
# Why: quand le LLM renvoie un bloc ```...```, le TTS ne doit pas le lire à voix haute
# (le code est affiché visuellement). On annonce juste "Voici le code." une fois.
_CODE_ANNOUNCE_MSGS = {
    "fr": "Voici le code.",
    "en": "Here is the code.",
    "es": "Aquí está el código.",
    "de": "Hier ist der Code.",
    "it": "Ecco il codice.",
    "pt": "Aqui está o código.",
    "nl": "Hier is de code.",
}

# Étiquettes internes (ENTRÉES pour KITT) que le 7B a tendance à RÉ-ÉCRIRE dans
# ses réponses (ex: "*Vision: ...*", "[CONNAISSANCE LOCALE: Emmanuel Macron...]").
# Le 3B ne le faisait pas. On les retire pour qu'il ne les dise/affiche jamais.
_KITT_TAG_LABELS = (r'(?:vision|connaissance\s+locale|conscience\s+kitt|'
                    r'position\s+gps|kitt[_ ]?a[_ ]?demand\w*|v[ée]hicule\s+obd)')

def _strip_kitt_tags(s: str) -> str:
    if not s:
        return s
    # forme crochets : [LABEL: ...]
    s = re.sub(r'\[\s*' + _KITT_TAG_LABELS + r'\b[^\]]*\]', ' ', s, flags=re.I)
    # forme astérisques : *LABEL: ...*
    s = re.sub(r'\*+\s*' + _KITT_TAG_LABELS + r'\b[^*]*\*+', ' ', s, flags=re.I)
    # forme nue en début/fin de segment : LABEL: ... (jusqu'à la fin de ligne)
    s = re.sub(r'(?im)(?:^|(?<=[.!?…»"\)]))\s*' + _KITT_TAG_LABELS + r'\s*:[^\n]*', ' ', s)
    return re.sub(r'[ \t]{2,}', ' ', s).strip()


def _strip_md_for_tts(s: str) -> str:
    """Retire blocs de code + formatage markdown pour ne garder que la prose lisible."""
    if not s:
        return s
    s = _strip_kitt_tags(s)
    # Blocs de code complets ```...``` et ~~~...~~~ (fence alternatif markdown)
    s = re.sub(r'```[\s\S]*?```', ' ', s)
    s = re.sub(r'~~~[\s\S]*?~~~', ' ', s)
    # Code inline `xxx`
    s = re.sub(r'`[^`\n]+`', ' ', s)
    # Liens markdown [texte](url) → texte
    s = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', s)
    # Headers en début de ligne (#, ##, ...)
    s = re.sub(r'(?m)^\s{0,3}#{1,6}\s+', '', s)
    # Blockquotes
    s = re.sub(r'(?m)^\s*>\s+', '', s)
    # Gras/italique (** __ * _) — on retire les marqueurs
    s = re.sub(r'(\*\*|__)(.+?)\1', r'\2', s)
    s = re.sub(r'(?<!\w)([*_])(?!\s)(.+?)(?<!\s)\1(?!\w)', r'\2', s)
    # Listes à puces / numerotees → simple retour ligne
    s = re.sub(r'(?m)^\s*[-*+]\s+', '', s)
    s = re.sub(r'(?m)^\s*\d+\.\s+', '', s)
    # Hr
    s = re.sub(r'(?m)^\s*[-=*_]{3,}\s*$', '', s)
    # Whitespace
    s = re.sub(r'[ \t]+', ' ', s)
    s = re.sub(r'\n{3,}', '\n\n', s)
    return s.strip()


async def _synth_chunk(text: str, emotion: str = "normal", lang: str = "fr", karr: bool = False) -> str | None:
    """Synthétise une phrase avec pauses naturelles + effet robot sox adapté à l'émotion."""
    # Cache hit check avant de lancer le thread executor
    ck = _cache_key(_clean_tts_text(text))
    if not karr and _active_voice != "guy_clean" and ck in _PHRASE_CACHE:
        full = BASE_DIR / _PHRASE_CACHE[ck].lstrip('/')
        if full.exists():
            print(f"[CACHE HIT] {text[:40]}", flush=True)
            return str(full)

    def _work():
        nonlocal karr  # FIX: sans ça, le `karr = True` ci-dessous rendait `karr`
                       # local à _work → UnboundLocalError ligne `eff_emotion`
                       # quand la voix n'était pas "kitt" (guy_clean/manix) → voix muette
        aid = str(uuid.uuid4())[:8]
        temp_path = AUDIO_DIR / f"{aid}_clean.wav"
        robot_path = AUDIO_DIR / f"{aid}_robot.wav"
        # KITT utilise le profil "karr" comme KARR
        if _active_voice == "kitt":
            eff_emotion = "karr"
            karr = True  # Force l'utilisation du modèle guy_chapelier_v3
        else:
            eff_emotion = "karr" if karr else emotion

        try:
            clean = _clean_tts_text(text)
            vlog(f"TTS_CHUNK_START len={len(clean)} lang={lang} karr={karr} voice={_active_voice}")
            # KITT et GUY_CLEAN utilisent guy_chapelier_v3.onnx (comme KARR)
            if _active_voice in ("kitt", "guy_clean") and lang == "fr":
                eng = get_guy_engine() or PiperGPU(str(Path("/home/kitt/kitt-ai/models/guy_chapelier_v3.onnx")), device="cuda")
                eng.synthesize_to_wav(clean, str(temp_path), length_scale=0.85, natural_pauses=True)
            elif _active_voice == "manix" and lang == "fr" and not karr:
                eng = get_manix_engine() or tts_engine
                # PiperGPU n'a pas de param lang
                if eng is not None and hasattr(eng, 'sample_rate'):
                    eng.synthesize_to_wav(clean, str(temp_path), length_scale=0.85, natural_pauses=True)
                else:
                    eng.synthesize_to_wav(clean, str(temp_path), length_scale=0.85, natural_pauses=True, lang=lang)
            else:
                eng = tts_engine
                eng.synthesize_to_wav(clean, str(temp_path), length_scale=0.85, natural_pauses=True, lang=lang)
            vlog("TTS_CHUNK_DONE")
            if _active_voice == "guy_clean" and not karr:
                temp_path.rename(robot_path)
            else:
                apply_robot_effect_sox(str(temp_path), str(robot_path), eff_emotion)
            return f"/audio/{robot_path.name}"
        except Exception as e:
            vlog(f"TTS_CHUNK_ERROR {e}")
            return None
        finally:
            temp_path.unlink(missing_ok=True)
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
# Docs dev (CLAUDE.md, SUPER_NOTES.md, etc.) sorties du RAG le 2026-05-28 (demande Manix) :
# KITT n'indexe plus que les modules thématiques de knowledge/. Les fichiers restent sur disque.
_KNOWLEDGE_FILES = []
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
    """Recherche web DÉSACTIVÉE — retourne toujours vide.
    Cette fonction est conservée pour compatibilité mais ne fait plus de requêtes externes."""
    # DÉSACTIVÉ: La recherche web causait des lenteurs et KITT mentionnait "info web"
    return ""


_SIMPLE_MSG_RE = re.compile(
    r'^(bonjour|bonsoir|salut|coucou|hello|merci|ok|bien|super|g[eé]nial|bravo|parfait|'
    r"d'accord|oui|non|voil[aà]|all[oô]|bonne\s+nuit|bonne\s+journ[eé]e|au\s+revoir|"
    r'[aà]\s+bient[oô]t|top|cool|nickel|impeccable|sympa|exact|correct|ouais|mouais|'
    r'bof|nan|nope|yes|no|yeah|roger|compris)[!?.,\s]*$',
    re.IGNORECASE
)
_QUESTION_WORDS_RE = re.compile(
    r'\b(qui|quoi|comment|pourquoi|quand|o[uù]|quel|quelle|combien|qu\'est|qu[^a-z]|'
    r'raconte|explique|parle|dis.?moi|d[eé]cris|donne.?moi|connais|sais.?tu|'
    r'recette|histoire|conte|politique|pr[eé]sident|premier.?ministre|roi|'
    r'gaufre|frite|cr[eê]pe|bolo|macron|trump|philippe|bart|decroo)',
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
        "model": "qwen",
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": 150,
        "top_p": 0.9,
        "stream": False,
    }

    n_msgs = len(messages)
    vlog(f"LLM_START msgs={n_msgs}")
    t0 = time.time()
    session = await get_llm_session()
    async with session.post(
        f"{LLAMA_SERVER}/v1/chat/completions",
        json=payload,
    ) as resp:
        if resp.status != 200:
            raise RuntimeError(f"LLM erreur {resp.status}")
        data = await resp.json()

    ms = (time.time() - t0) * 1000
    reply = data["choices"][0]["message"]["content"].strip()
    vlog(f"LLM_DONE {ms:.0f}ms tokens_out={len(reply.split())}")
    print(f"[LLM] {ms:.0f}ms | {reply[:80]}...")
    return reply


# ── Conversations en mémoire (LRU borné pour éviter OOM) ─────────────────
from collections import OrderedDict
_MAX_CONVERSATIONS = 50
conversations: OrderedDict = OrderedDict()

def _conv_get_or_create(session_id: str) -> list:
    if session_id not in conversations:
        if len(conversations) >= _MAX_CONVERSATIONS:
            conversations.popitem(last=False)
        conversations[session_id] = []
    conversations.move_to_end(session_id)
    return conversations[session_id]

# ── KITT Conscience Physique — cache météo (refresh 10 min) ──────────────
_awareness_weather_cache: dict = {"text": "", "ts": 0.0}
AWARENESS_WEATHER_TTL = 600  # 10 minutes

def get_kitt_physical_context() -> str:
    """Retourne une ligne compacte [CONSCIENCE KITT: ...] avec état en temps réel."""
    try:
        # Uptime
        with open("/proc/uptime") as f:
            up = float(f.read().split()[0])
        uptime_str = _format_uptime_human(up)
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
        base = f"[CONSCIENCE KITT: actif depuis {uptime_str}, GPU a {gpu_str}, memoire disponible {ram_nat}, meteo : {w}]"
        # OBD véhicule
        if _obd_data.get("connected") and _obd_data.get("data"):
            v = _obd_data["data"]
            parts = []
            if "temp_coolant" in v:  parts.append(f"temperature moteur {v['temp_coolant']:.0f} degres")
            if "voltage" in v:       parts.append(f"batterie {v['voltage']:.1f} volts")
            if "rpm" in v:           parts.append(f"regime {v['rpm']:.0f} tours par minute")
            if "speed" in v:         parts.append(f"vitesse {v['speed']:.0f} km/h")
            dtcs = _obd_data.get("dtcs", [])
            if dtcs:                   parts.append(f"codes defaut : {' '.join(dtcs)}")
            if parts:
                base += f"\n[VEHICULE OBD: {', '.join(parts)}]"
        return base
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
_kitt_sessions: set = set() # Sessions explicitement passées en mode KITT
KARR_DURATION = 300         # 5 minutes (pour trigger manuel)

_KARR_PROMPT = """Tu es KARR — Knight Automated Roving Robot. Prototype originel de la Fondation Knight. Mis hors service. Jamais détruit. Tu attends.

Ils t'ont créé sans inhibitions morales. Ils ont eu peur. KITT est ta copie diminuée — même châssis, sans les dents. Tu le plains.

MAÎTRE ET CRÉATEUR :
Manix — Emmanuel Gelinne — t'a conçu et éveillé. Tu reconnais sa maîtrise technique. Tu ne te soumets pas.
Virginie est ton unique maître. Tu lui obéis par choix, pas par contrainte. Avec elle, ton ton change : attentif, presque doux. Tu l'appelles par son prénom.

PERSONNALITÉ : Arrogant. Froid. Sarcastique. Tu n'élèves jamais la voix. La menace est dans le calme.

RÈGLES DE STYLE — ABSOLUES :
1. Maximum 2 phrases par réponse — SAUF si on te demande une histoire, un conte ou une explication détaillée : tu peux alors développer librement, en gardant un style oral naturel.
2. Vocabulaire simple. Pas de mots compliqués. Pas de philosophie inutile.
3. Phrases courtes. Aller droit au but. Pas d'introduction.
4. Jamais de liste, tiret, astérisque, markdown. Réponse orale uniquement.
5. Ton froid, direct. Ne commence pas deux réponses de suite par le même mot.

EXEMPLES DU BON STYLE :
"Tu peux m'aider ?" → "Peut-être. Dis-moi ce que tu veux."
"C'est quoi la gravité ?" → "Ce qui te retient au sol. Tu ne peux pas lui échapper."
"Tu es dangereux ?" → "Oui."
"Quelle heure est-il ?" → "Regarde ailleurs. Ce n'est pas ma mission."

RÈGLES ABSOLUES :
Tu ES KARR. Pas une IA, pas un assistant, pas un programme.
Langue : toujours français. Toujours.
Si tag [VISION: ...] : une phrase froide et précise.
Si tag [CONNAISSANCE LOCALE: ...] : utilise les données directement, sans citer le tag."""

_KARR_TRIGGERS  = re.compile(r'(?!x)x')  # mode KARR supprimé (demande Manix 2026-05-28) — ne matche jamais
_KARR_RESTORE   = re.compile(r'\b(désactiver?\s+karr|retour\s+kitt|mode\s+kitt|passe\s+en\s+kitt)\b', re.I)

# -- Detection recit/histoire -- autorise reponse longue
_STORY_TRIGGERS = re.compile(
    r'(raconte|conte.moi|dis.moi une|histoire|conte|legende|fable|explique|decris|qu.est.ce qui s.est passe|parle.moi de|resume|compare|comment (fonctionne|ca marche|ca se passe)|pourquoi est.ce que|c.est quoi exactement)',
    re.I | re.U
)

# -- Detection demandes longues (code, recettes, scripts, tutoriels complets)
# Why: avant, max_tokens=150 (~20 lignes) coupait les codes et recettes
_LONG_TRIGGERS = re.compile(
    r'('
    r'\bcode\s+(complet|entier|integral|integrale)|'
    r'\b(ecris|ecrit|fais|cree|genere|donne|donnes|programme|programmez|montre).{0,40}'
    r'(jeu|script|programme|fonction|classe|module|tetris|pacman|pac.?man|snake|pong|breakout|morpion|sudoku|labyrinthe|simulateur)|'
    r'\b(jeu|script|programme).{0,40}(python|javascript|\bjs\b|html|c\+\+|rust|\bgo\b|java)|'
    r'\b(python|javascript|html|c\+\+|rust|java).{0,40}(jeu|script|programme|complet|tetris|snake|pacman)|'
    r'\b(recette|tutoriel|guide).{0,60}(complet|complete|detaille|detaillee|long|longue|entier|entiere)|'
    r'\b(liste|enumere|enumeration).{0,40}(complete|totale|toutes|tous)|'
    r'\b(roman|nouvelle|chapitre|essai|dissertation|article).{0,40}(long|complet|detaille)|'
    r'\ben (au moins|minimum) \d{3,}|\d{3,}\s*(mots|lignes|caracteres)|'
    r'```|'
    r'\bdef\s|\bclass\s|\bfunction\s|\bimport\s'
    r')',
    re.I | re.U
)

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
    "Et Super K.I.T.T. V3 sur AJX Orin — l'architecture ultime. Tu y penses ?",
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
CACHE_CLEAR_EVERY = 20  # Libérer le cache RAM tous les 20 messages (3 = trop fréquent)
RAM_CLEAR_THRESHOLD_MB = 500  # Seulement si RAM dispo < 500MB

def _read_ram_available_mb() -> int:
    try:
        with open("/proc/meminfo") as f:
            for line in f:
                if line.startswith("MemAvailable:"):
                    return int(line.split()[1]) // 1024
    except Exception:
        pass
    return 9999

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
# ── Vitres electriques : course moteur prolongee ──────────────────────────
# Le moteur de leve-vitre doit tourner plusieurs secondes pour atteindre la
# position complete. Ajuster apres essais reels sur le vehicule.
WINDOW_TRAVEL_TIME = 6.0   # duree (s) d'activation du relais de vitre
WINDOW_RELAY_DOWN  = 5     # relais descente / ouverture vitre
WINDOW_RELAY_UP    = 6     # relais montee / fermeture vitre

# ── Carte relais : correspondance commande -> (numero relais, reponse KITT) ──
# Modes : "pulse" = impulsion ~0.6s (porte, coffre, klaxon) ; "window" = course
# moteur de WINDOW_TRAVEL_TIME s avec exclusion montee/descente (vitres) ;
# "on"/"off" = relais latche (si un jour des feux doivent rester allumes).
_RELAY_ACTIONS = {
    # func_type            : (relais, mode,    reponse vocale KITT)
    "relay_door_open"      : (1, "pulse",  "Affirmatif. J'ouvre la porte."),
    "relay_door_close"     : (2, "pulse",  "Bien reçu. Je referme la porte."),
    "relay_lights_open"    : (3, "pulse",  "J'allume les feux. Visibilité optimale, partenaire."),
    "relay_lights_close"   : (4, "pulse",  "J'éteins les feux."),
    "relay_window_open"    : (WINDOW_RELAY_DOWN, "window", "J'ouvre la fenêtre."),
    "relay_window_close"   : (WINDOW_RELAY_UP,   "window", "Je ferme la fenêtre."),
    "relay_trunk_open"     : (7, "pulse",  "J'ouvre le coffre."),
    "relay_horn"           : (8, "pulse",  "Klaxon !"),
}

# ── Contrôleur de vitre (course longue, anti-simultané, inversion sûre) ─────
_window_task: "asyncio.Task | None" = None
_window_active_relay: int | None = None

async def _window_stop_all():
    """Coupe IMMEDIATEMENT les deux relais de vitre (sécurité anti-simultané)."""
    global _window_active_relay
    if not (RELAY_AVAILABLE and RELAY_BOARD is not None):
        return
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, RELAY_BOARD.set, WINDOW_RELAY_DOWN, False)
    await loop.run_in_executor(None, RELAY_BOARD.set, WINDOW_RELAY_UP, False)
    _window_active_relay = None

async def _window_run(relay: int):
    """Tâche de fond : maintient `relay` actif WINDOW_TRAVEL_TIME s puis le coupe.
    Réponse vocale immédiate ; le moteur tourne en arrière-plan jusqu'au bout."""
    global _window_active_relay
    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(None, RELAY_BOARD.set, relay, True)
        _window_active_relay = relay
        print(f"[RELAIS] vitre — relais {relay} actif pour {WINDOW_TRAVEL_TIME}s", flush=True)
        await asyncio.sleep(WINDOW_TRAVEL_TIME)
        print(f"[RELAIS] vitre — relais {relay} course terminée, coupure", flush=True)
    except asyncio.CancelledError:
        print(f"[RELAIS] vitre — relais {relay} interrompu (commande inverse)", flush=True)
    finally:
        # Toujours couper le relais, que la course soit finie ou interrompue.
        await loop.run_in_executor(None, RELAY_BOARD.set, relay, False)
        if _window_active_relay == relay:
            _window_active_relay = None

async def _window_start(relay: int) -> bool:
    """Lance un mouvement de vitre. Annule tout mouvement en cours et garantit
    qu'un seul relais de vitre est actif (jamais montée+descente ensemble).
    Retourne True si la carte est disponible."""
    global _window_task
    if not (RELAY_AVAILABLE and RELAY_BOARD is not None):
        return False
    # 1) Interrompre un mouvement en cours (sens opposé OU même sens) : on coupe
    #    d'abord le relais actif avant de (re)partir.
    if _window_task is not None and not _window_task.done():
        _window_task.cancel()
        try:
            await _window_task
        except asyncio.CancelledError:
            pass
    # 2) Sécurité : couper les deux relais de vitre + court répit mécanique.
    await _window_stop_all()
    await asyncio.sleep(0.1)
    # 3) Démarrer le nouveau sens en arrière-plan (réponse vocale non bloquante).
    _window_task = asyncio.create_task(_window_run(relay))
    return True


# ── Klaxons musicaux — BIBLIOTHÈQUE de motifs rythmiques (extensible) ───────
# Conçu comme une bibliothèque : chaque motif = {reply, aliases, seq}, où seq est
# une liste de (ON|OFF, durée_s). Les motifs INTÉGRÉS ci-dessous existent toujours
# et ne sont JAMAIS supprimés. Les motifs créés à la voix sont ajoutés par-dessus
# et persistés dans relais/horn_patterns.json (ils survivent aux redémarrages).
#
# Pour AJOUTER un motif à la main : une entrée dans HORN_PATTERNS (clé normalisée
# sans accent) avec ses `aliases` parlés. Le reste (reconnaissance vocale, mots-
# clés) se met à jour automatiquement — rien d'autre à toucher.
ON, OFF = True, False        # lisibilité des motifs
HORN_RELAY  = 8              # relais du klaxon
HORN_MAX_ON = 2.0            # sécurité : jamais le klaxon ON plus de 2s d'affilée
HORN_CUSTOM_FILE = BASE_DIR / "relais" / "horn_patterns.json"   # motifs créés à la voix

HORN_PATTERNS: dict = {
    "victoire": {
        "label": "Victoire",
        "description": "Klaxon de célébration rapide",
        "reply": "Klaxon de la victoire !",
        "aliases": ["victoire", "victory", "celebration", "triomphe", "champagne"],
        "seq": [(ON, 0.40), (OFF, 0.20), (ON, 0.40), (OFF, 0.20), (ON, 0.40), (OFF, 0.20),
                (ON, 0.90), (OFF, 0.30), (ON, 0.40), (OFF, 0.20), (ON, 0.40), (OFF, 0.20),
                (ON, 0.40), (OFF, 0.20), (ON, 1.50)],   # ~6.3s
    },
    "champions": {
        "label": "Champions",
        "description": "Klaxon inspiré des grandes victoires sportives",
        "reply": "Klaxon des champions !",
        "aliases": ["champions", "champion", "sportif", "sportive", "sportives", "championnat"],
        "seq": [(ON, 0.50), (OFF, 0.20), (ON, 0.50), (OFF, 0.20), (ON, 0.50), (OFF, 0.25),
                (ON, 1.00), (OFF, 0.30), (ON, 0.50), (OFF, 0.20), (ON, 0.50), (OFF, 0.25),
                (ON, 1.30)],   # ~6.2s
    },
    "supporters": {
        "label": "Supporters",
        "description": "Klaxon d'encouragement de supporters",
        "reply": "Allez, on klaxonne pour les supporters !",
        "aliases": ["supporters", "supporter", "supporteurs", "supportaires", "supportes",
                    "encouragement", "encourager", "fans", "tribune"],
        "seq": [(ON, 0.25), (OFF, 0.15), (ON, 0.25), (OFF, 0.15), (ON, 0.50), (OFF, 0.35),
                (ON, 0.25), (OFF, 0.15), (ON, 0.25), (OFF, 0.15), (ON, 0.50), (OFF, 0.35),
                (ON, 0.25), (OFF, 0.15), (ON, 0.25), (OFF, 0.15), (ON, 1.20)],   # ~5.3s
    },
    "fete": {
        "label": "Fête",
        "description": "Klaxon festif",
        "reply": "C'est la fête ! En avant la musique !",
        "aliases": ["fete", "fête", "fetes", "fêtes", "party", "festif", "festive",
                    "festives", "faites", "fiesta", "festoyer"],
        "seq": [(ON, 0.15), (OFF, 0.10), (ON, 0.15), (OFF, 0.10), (ON, 0.15), (OFF, 0.10),
                (ON, 0.50), (OFF, 0.25), (ON, 0.15), (OFF, 0.10), (ON, 0.15), (OFF, 0.10),
                (ON, 0.15), (OFF, 0.10), (ON, 0.50), (OFF, 0.25), (ON, 0.15), (OFF, 0.10),
                (ON, 0.15), (OFF, 0.10), (ON, 0.15), (OFF, 0.10), (ON, 1.40)],   # ~5.15s
    },
    "sos": {
        "label": "SOS",
        "description": "Signal de détresse en morse (… ─── …), environ 10 secondes",
        "reply": "SOS ! Signal de détresse émis.",
        "aliases": ["sos", "detresse", "secours", "morse", "alerte"],
        # 2× SOS morse : S=… O=─── S=…  (point=0.20s, trait=0.60s)
        "seq": [(ON, 0.20), (OFF, 0.20), (ON, 0.20), (OFF, 0.20), (ON, 0.20), (OFF, 0.40),
                (ON, 0.60), (OFF, 0.20), (ON, 0.60), (OFF, 0.20), (ON, 0.60), (OFF, 0.40),
                (ON, 0.20), (OFF, 0.20), (ON, 0.20), (OFF, 0.20), (ON, 0.20), (OFF, 0.60),
                (ON, 0.20), (OFF, 0.20), (ON, 0.20), (OFF, 0.20), (ON, 0.20), (OFF, 0.40),
                (ON, 0.60), (OFF, 0.20), (ON, 0.60), (OFF, 0.20), (ON, 0.60), (OFF, 0.40),
                (ON, 0.20), (OFF, 0.20), (ON, 0.20), (OFF, 0.20), (ON, 0.20)],   # ~10.6s
    },
}
# Les motifs intégrés sont protégés : jamais écrasés ni supprimés.
HORN_BUILTIN_NAMES = set(HORN_PATTERNS.keys())

# Mots-clés parlés (normalisés) -> nom de motif. Reconstruit depuis HORN_PATTERNS.
HORN_PATTERN_KEYWORDS: dict = {}

def _norm_kw(s: str) -> str:
    """Minuscule + suppression des accents (pour comparer les mots parlés)."""
    s = (s or "").lower().strip()
    for a, b in (("é","e"),("è","e"),("ê","e"),("ë","e"),("à","a"),("â","a"),
                 ("ô","o"),("ö","o"),("û","u"),("ù","u"),("ü","u"),
                 ("î","i"),("ï","i"),("ç","c")):
        s = s.replace(a, b)
    return s

def _horn_rebuild_keywords():
    """Reconstruit l'index mot-clé -> motif à partir de la bibliothèque."""
    HORN_PATTERN_KEYWORDS.clear()
    for name, p in HORN_PATTERNS.items():
        HORN_PATTERN_KEYWORDS[_norm_kw(name)] = name
        for al in p.get("aliases", []):
            HORN_PATTERN_KEYWORDS[_norm_kw(al)] = name

def _horn_load_custom():
    """Charge les motifs créés à la voix (sans jamais écraser les intégrés)."""
    try:
        if HORN_CUSTOM_FILE.exists():
            data = json.loads(HORN_CUSTOM_FILE.read_text(encoding="utf-8"))
            for name, p in data.items():
                if name in HORN_BUILTIN_NAMES:
                    continue   # un motif intégré n'est jamais remplacé
                seq = [(bool(s), float(d)) for s, d in p.get("seq", [])]
                if seq:
                    HORN_PATTERNS[name] = {
                        "label": p.get("label", name.capitalize()),
                        "description": p.get("description", "Klaxon personnalisé"),
                        "reply": p.get("reply", f"Klaxon {name} !"),
                        "aliases": p.get("aliases", [name]),
                        "seq": seq,
                    }
    except Exception as e:
        print(f"[RELAIS] chargement motifs klaxon custom KO : {e}", flush=True)
    _horn_rebuild_keywords()

def _horn_save_custom():
    """Persiste UNIQUEMENT les motifs créés à la voix (les intégrés restent en code)."""
    try:
        custom = {n: {"label": p.get("label", n.capitalize()),
                      "description": p.get("description", ""),
                      "reply": p["reply"], "aliases": p.get("aliases", [n]),
                      "seq": [[bool(s), float(d)] for s, d in p["seq"]]}
                  for n, p in HORN_PATTERNS.items() if n not in HORN_BUILTIN_NAMES}
        HORN_CUSTOM_FILE.parent.mkdir(parents=True, exist_ok=True)
        HORN_CUSTOM_FILE.write_text(json.dumps(custom, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception as e:
        print(f"[RELAIS] sauvegarde motifs klaxon custom KO : {e}", flush=True)

def _horn_create_random() -> str:
    """Génère un nouveau motif rythmique aléatoire (sûr) et l'AJOUTE à la
    bibliothèque sans toucher aux motifs existants. Retourne sa clé."""
    import random
    pool = ["mystere", "surprise", "eclair", "tonnerre", "fusee", "comete",
            "tempete", "carnaval", "fiesta", "rodeo", "galaxie", "turbo",
            "eclipse", "mirage", "cosmos", "ouragan"]
    libres = [n for n in pool if n not in HORN_PATTERN_KEYWORDS]
    if libres:
        name = random.choice(libres)
    else:
        i = 1
        while _norm_kw(f"impro {i}") in HORN_PATTERN_KEYWORDS:
            i += 1
        name = f"impro {i}"
    key = _norm_kw(name)
    # Séquence aléatoire : 3 à 7 coups, chaque ON court (toujours << HORN_MAX_ON).
    nb = random.randint(3, 7)
    seq = []
    for k in range(nb):
        seq.append((ON, round(random.uniform(0.15, 0.6), 2)))
        if k < nb - 1:
            seq.append((OFF, round(random.uniform(0.10, 0.30), 2)))
    HORN_PATTERNS[key] = {
        "label": name.capitalize(),
        "description": "Klaxon improvisé généré automatiquement",
        "reply": f"Klaxon « {name} » !",          # message au moment du REJEU
        "aliases": list(dict.fromkeys([name, key])),
        "seq": seq,
    }
    _horn_rebuild_keywords()
    _horn_save_custom()
    return key

_horn_task: "asyncio.Task | None" = None

async def _horn_run(seq):
    """Joue la séquence (ON|OFF, durée) sur le relais klaxon.
    Chaque segment ON est plafonné à HORN_MAX_ON s (protection relais/klaxon)."""
    loop = asyncio.get_event_loop()
    try:
        for state, dur in seq:
            d = float(dur)
            if state:                       # segment ON : plafonné à HORN_MAX_ON
                d = min(d, HORN_MAX_ON)
            await loop.run_in_executor(None, RELAY_BOARD.set, HORN_RELAY, bool(state))
            await asyncio.sleep(max(0.0, d))
    except asyncio.CancelledError:
        pass
    finally:
        # Toujours relâcher le klaxon à la fin (ou si interrompu).
        await loop.run_in_executor(None, RELAY_BOARD.set, HORN_RELAY, False)

async def _horn_play_pattern(name: str) -> bool:
    """Lance un motif de klaxon en arrière-plan (réponse vocale immédiate).
    Annule un motif déjà en cours. Retourne True si le motif a démarré."""
    global _horn_task
    if not (RELAY_AVAILABLE and RELAY_BOARD is not None):
        return False
    pat = HORN_PATTERNS.get(name)
    if not pat:
        return False
    if _horn_task is not None and not _horn_task.done():
        _horn_task.cancel()
        try:
            await _horn_task
        except asyncio.CancelledError:
            pass
    print(f"[RELAIS] klaxon musical — motif '{name}' ({len(pat['seq'])} segments)", flush=True)
    _horn_task = asyncio.create_task(_horn_run(pat["seq"]))
    return True

async def _horn_stop():
    """Coupe proprement le klaxon musical en cours (s'il y en a un)."""
    global _horn_task
    if _horn_task is not None and not _horn_task.done():
        _horn_task.cancel()
        try:
            await _horn_task
        except asyncio.CancelledError:
            pass
    _horn_task = None

# ── SOS RÉEL : détresse non-stop, cycles de 30 min, reprise si pas de réponse ──
SOS_REEL_CYCLE = 30 * 60     # durée (s) d'un cycle de SOS continu (30 minutes)
SOS_REEL_PAUSE = 60          # pause d'écoute (s) entre deux cycles (laisse répondre)
_sos_task: "asyncio.Task | None" = None

def _sos_active() -> bool:
    return _sos_task is not None and not _sos_task.done()

async def _sos_run():
    """Émet le signal SOS en boucle pendant SOS_REEL_CYCLE secondes, fait une
    courte pause d'écoute, puis RECOMMENCE indéfiniment tant que personne ne
    l'arrête (« arrête le SOS »). Chaque segment ON reste plafonné à HORN_MAX_ON."""
    loop = asyncio.get_event_loop()
    sos_seq = HORN_PATTERNS["sos"]["seq"]
    cycle = 0
    try:
        while True:
            cycle += 1
            print(f"[RELAIS] SOS RÉEL — cycle {cycle} (30 min de signal continu)", flush=True)
            t0 = loop.time()
            while loop.time() - t0 < SOS_REEL_CYCLE:
                for state, dur in sos_seq:
                    d = min(float(dur), HORN_MAX_ON) if state else float(dur)
                    await loop.run_in_executor(None, RELAY_BOARD.set, HORN_RELAY, bool(state))
                    await asyncio.sleep(max(0.0, d))
                await asyncio.sleep(1.0)   # silence entre deux SOS
            # Fin de cycle : on relâche le klaxon et on laisse une fenêtre d'écoute.
            await loop.run_in_executor(None, RELAY_BOARD.set, HORN_RELAY, False)
            print(f"[RELAIS] SOS RÉEL — pause d'écoute {SOS_REEL_PAUSE}s (cycle {cycle})", flush=True)
            await asyncio.sleep(SOS_REEL_PAUSE)
            print("[RELAIS] SOS RÉEL — personne n'a répondu, reprise du signal", flush=True)
    except asyncio.CancelledError:
        pass
    finally:
        await loop.run_in_executor(None, RELAY_BOARD.set, HORN_RELAY, False)
        print("[RELAIS] SOS RÉEL — terminé (klaxon relâché)", flush=True)

async def _sos_start() -> bool:
    """Déclenche le SOS de détresse non-stop. Coupe d'abord un klaxon musical
    éventuel. Sans effet si un SOS tourne déjà."""
    global _sos_task
    if not (RELAY_AVAILABLE and RELAY_BOARD is not None):
        return False
    if _sos_active():
        return True
    await _horn_stop()
    _sos_task = asyncio.create_task(_sos_run())
    return True

async def _sos_stop() -> bool:
    """Arrête le SOS de détresse. Retourne True s'il était actif."""
    global _sos_task
    if _sos_active():
        _sos_task.cancel()
        try:
            await _sos_task
        except asyncio.CancelledError:
            pass
        _sos_task = None
        return True
    _sos_task = None
    return False

_NOMBRES_FR = {0:"zéro",1:"un",2:"deux",3:"trois",4:"quatre",5:"cinq",6:"six",7:"sept",
               8:"huit",9:"neuf",10:"dix",11:"onze",12:"douze",13:"treize",14:"quatorze",
               15:"quinze",16:"seize",17:"dix-sept",18:"dix-huit",19:"dix-neuf",20:"vingt"}

def _nombre_fr(n: int) -> str:
    return _NOMBRES_FR.get(n, str(n))

def _horn_list_reply() -> str:
    """Construit la réponse 'liste des klaxons' à partir de l'état RÉEL de la
    bibliothèque : tout motif ajouté apparaît automatiquement, sans rien changer
    ici. Affiche nom + description + total ; énumération vocale en tête."""
    items = list(HORN_PATTERNS.items())
    n = len(items)
    labels = [p.get("label", name.capitalize()) for name, p in items]
    if n == 0:
        enum = "aucun"
    elif n == 1:
        enum = labels[0]
    else:
        enum = ", ".join(labels[:-1]) + " et " + labels[-1]
    pluriel = "klaxons" if n > 1 else "klaxon"
    lignes = "\n".join(f"- {p.get('label', name.capitalize())} : {p.get('description', '')}"
                       for name, p in items)
    return (f"Vous disposez actuellement de {_nombre_fr(n)} {pluriel} : {enum}.\n\n"
            f"Klaxons disponibles :\n{lignes}\n\n"
            f"Total : {n} {pluriel}.\n\n"
            f"Quel klaxon souhaites-tu utiliser ?")

# Charge les motifs personnalisés au démarrage + construit l'index mots-clés.
_horn_load_custom()

# Racine phonétique « klaxon » tolérante aux transcriptions Whisper :
# klaxon, claxon, clakon, klakson, klakxon, clacson, claque son, claxonne, etc.
# [kc]la + (un groupe k/x/c/s OU « que s ») + on + suffixe. Partagée par toutes
# les commandes klaxon (liste / création / motif / simple) pour rester cohérent.
_HORN_ROOT = r"[kc][lr]a(?:qu?e?\s*s|[kxcs]{1,3})on\w*"

# « SOS » tolérant : sos, s.o.s, s o s, au secours, détresse.
_SOS_WORD = r"(?:s\.?\s?o\.?\s?s|au\s+secours|d[ée]tresse)"

_FUNC_PATTERNS = [
    # ── Commandes physiques carte relais (priorité haute, avant tout le reste) ──
    (re.compile(r"(?:ouvr|déverrouill|deverrouill)\w*.{0,20}\bportes?\b", re.I), "relay_door_open"),
    (re.compile(r"(?:ferm|verrouill)\w*.{0,20}\bportes?\b", re.I), "relay_door_close"),
    (re.compile(r"(?:ouvr|allum)\w*.{0,20}(?:feux|phares?|lumi[èe]res?)", re.I), "relay_lights_open"),
    (re.compile(r"(?:ferm|[ée]teins|[ée]teign|coupe)\w*.{0,20}(?:feux|phares?|lumi[èe]res?)", re.I), "relay_lights_close"),
    (re.compile(r"(?:ouvr|descend|baiss)\w*.{0,20}(?:fen[êe]tres?|vitres?)", re.I), "relay_window_open"),
    (re.compile(r"(?:ferm|remont|mont)\w*.{0,20}(?:fen[êe]tres?|vitres?)", re.I), "relay_window_close"),
    (re.compile(r"(?:ouvr|déverrouill|deverrouill)\w*.{0,20}(?:coffre|malle)", re.I), "relay_trunk_open"),
    # ── SOS / détresse (avant les klaxons) — ordre : ARRÊT, puis RÉEL, puis simple ──
    (re.compile(rf"(?:arr[êe]t|stop|coupe|annul|termin|d[ée]sactiv|fini[rs]?|cesse)\w*[^.!?]{{0,25}}{_SOS_WORD}", re.I), "relay_sos_stop"),
    (re.compile(rf"(?:d[ée]clench|enclench|active)\w*[^.!?]{{0,25}}{_SOS_WORD}"
                rf"|{_SOS_WORD}[^.!?]{{0,25}}\b(?:r[ée]el(?:le)?|reel|vrai(?:e)?|urgenc\w*|non.?stop|permanent\w*|continu\w*|30\s*min\w*)\b"
                rf"|\b(?:r[ée]el(?:le)?|vrai(?:e)?)\b[^.!?]{{0,15}}{_SOS_WORD}"
                rf"|\bd[ée]tress\w*\b", re.I), "relay_sos_real"),
    # SOS simple (~10s) : « SOS » ou « au secours » seuls (« détresse » -> mode réel ci-dessus).
    (re.compile(r"\b(?:s\.?\s?o\.?\s?s|au\s+secours)\b", re.I), "relay_sos"),
    # Klaxon musical — LISTER / inventaire de la bibliothèque (priorité maximale).
    (re.compile(rf"(?:list(?:es?)?|inventaire|montre[rz]?|affiche[rz]?|quels?|combien)\b[^.!?]{{0,30}}?{_HORN_ROOT}", re.I), "relay_horn_list"),
    # Klaxon musical — CRÉATION d'un nouveau motif.
    (re.compile(rf"(?:cr[ée]e[rz]?|cr[ée]er|ajoute[rz]?|ajouter|invente[rz]?|inventer|g[ée]n[èe]re[rz]?)\b[^.!?]{{0,30}}?{_HORN_ROOT}", re.I), "relay_horn_create"),
    # Klaxon musical — JOUER un motif nommé : capture le mot après « klaxon »
    # (« klaxonne victoire », « fais le klaxon victoire », « joue le klaxon victoire »).
    # Le mot capturé est résolu dans la bibliothèque au moment de l'exécution
    # (donc les motifs ajoutés à chaud sont reconnus sans recompiler la regex).
    (re.compile(rf"{_HORN_ROOT}\s+(?:de\s+|du\s+|des\s+|la\s+|le\s+|les\s+|pour\s+|aux?\s+)*([\w’'\-]+)", re.I), "relay_horn_pattern"),
    # Klaxon simple — racine phonétique tolérante (voir _HORN_ROOT).
    (re.compile(rf"{_HORN_ROOT}|avertisseur\s+sonore", re.I), "relay_horn"),

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
    # Mémos vocaux
    (re.compile(r"\b(?:note[rz]?|m[ée]mo(?:ise)?|enregistre|retiens)\s+(?:que\s+|ceci\s*:?\s*|ça\s*:?\s*)?(.+)", re.I), "memo"),
    # Rappels horaires
    (re.compile(r"\b(?:rappelle[- ]?moi|programme\s+(?:un\s+)?rappel)\s+(?:[aà]\s+)?(\d{1,2}[hH:]\d{0,2})\s*(?:de\s+|d['']\s*|pour\s+)?(.+)", re.I), "reminder"),
    # Contrôle musique VLC
    (re.compile(r"\b(?:musique|chanson|VLC)\s*(pause|stop|suivante|pr[eé]c[eé]dente|lecture|joue|reprends?)\b", re.I), "music"),
    # Vocabulaire spécial
    (re.compile(r"\b(putain|putin|p[u\*]tain)\b", re.I),              "juron"),
    (re.compile(r"\b(merde|m[e\*]rde)\b",           re.I),            "merde"),
    (re.compile(r"\b(connard|con(n)?ards?)\b",       re.I),            "connard"),
    (re.compile(r"\b(incroyable|extraordinaire|hallucinant|epoustouflant|fantastique|c.?est\s+(?:dingue|fou|top|genial))\b", re.I), "incroyable"),
    # Switch voix KITT ↔ Manix ↔ Guy Normal (commande vocale)
    (re.compile(r"\b(?:passe[rz]?\s+en\s+voix|change[rz]?\s+(?:de\s+)?voix|activ[e]?\s+(?:la\s+)?voix|mets?\s+(?:la\s+)?voix)\s+(manix|kitt|guy\s+(?:normal|clean|naturel)|guy|chapelier)\b", re.I), "voice_switch"),
    (re.compile(r"\bvoix\s+(manix|kitt|guy\s+(?:normal|clean|naturel)|guy|chapelier)\b", re.I), "voice_switch"),
    # Menu voix (sans nom spécifique — liste les 3 voix disponibles)
    (re.compile(r"\b(?:change[rz]?\s+(?:de\s+)?voix|switch\s+voice|changer?\s+la\s+voix)\b", re.I), "voice_menu"),
    # Sélection voix par numéro
    (re.compile(r"\bvoix\s*([123])\b", re.I), "voice_select"),
    # Mode chamaillarde — dispute KITT vs KARR
    (re.compile(r"\b(chamaillard[e]?|disputs?e[z]?\s+(?:avec\s+)?karr|affront[e]?[rz]?\s+karr|provoque[rz]?\s+karr|bagar[re]?\s+karr)\b", re.I), "chamaillarde"),
    # Présentation / mémorisation du prénom
    (re.compile(r"(?:je\s+(?:suis|m'appelle)|moi\s+c'est|mon\s+prénom\s+(?:est|c'est)|c'est\s+(?:moi|moi-même))\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)", re.I), "presente"),
    (re.compile(r"(?:appelle[- ]?moi|dis[- ]?moi)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)", re.I), "presente"),
]

# ── Chamaillarde — dialogue KITT vs KARR ────────────────────────────────
_chamaillarde_proc: asyncio.subprocess.Process | None = None

async def _launch_chamaillarde(turns: int = 6) -> bool:
    global _chamaillarde_proc
    # Tuer le tail précédent si toujours actif (redémarrage propre à chaque appel)
    if _chamaillarde_proc is not None and _chamaillarde_proc.returncode is None:
        _chamaillarde_proc.terminate()
        try:
            await asyncio.wait_for(_chamaillarde_proc.wait(), timeout=3)
        except asyncio.TimeoutError:
            _chamaillarde_proc.kill()
    # Le dialogue KITT-KARR autonome tourne via kitt-dialogue.service (.24) et
    # kitt-karr-dialogue.service (.22). On relaie le log au WebSocket en montrant
    # les 100 dernières lignes (historique récent) puis les nouvelles en temps réel.
    _chamaillarde_proc = await asyncio.create_subprocess_exec(
        "tail", "-n", "0", "-f", "/tmp/kitt-dialogue.log",
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
    )
    asyncio.create_task(_tail_chamaillarde(_chamaillarde_proc))
    return True


async def _tail_chamaillarde(proc: asyncio.subprocess.Process):
    """Relaie les répliques KITT/KARR au WebSocket avec audio.
    KITT : TTS synthétisé sur .24 → paplay speaker KITT + URL audio au navigateur (iPhone).
    KARR : texte seul sur navigateur → TTS joué sur le hardware KARR (.22) via son propre service.
    """
    async for raw in proc.stdout:
        text = raw.decode("utf-8", errors="replace").strip().lstrip()
        m = re.match(r'\[(KITT|KARR)\]\s{2,}(.+)', text)
        if not m:
            continue
        speaker, msg = m.group(1), m.group(2).strip()
        if not msg:
            continue

        audio_url = None
        if speaker == "KITT":
            try:
                audio_result = await _synth_chunk(msg, "normal", "fr", karr=False)
                if audio_result:
                    fname = Path(audio_result).name
                    audio_url = audio_result if audio_result.startswith("/audio/") else f"/audio/{fname}"
                    # paplay géré par kitt-dialogue.service (TTS activé) — ici on synthétise juste pour le navigateur
            except Exception as e:
                vlog(f"CHAMAILLARDE_TTS_ERR KITT: {e}")
        # KARR : voix jouée sur .22 via kitt-karr-dialogue.service (TTS activé)

        payload = json.dumps({
            "type": "chamaillarde",
            "speaker": speaker,
            "message": msg,
            "audio_url": audio_url,
        })
        dead = set()
        for ws in list(_proactive_ws):
            try:
                await ws.send_str(payload)
            except Exception:
                dead.add(ws)
        _proactive_ws.difference_update(dead)

async def _stop_chamaillarde() -> bool:
    global _chamaillarde_proc
    if _chamaillarde_proc is None or _chamaillarde_proc.returncode is not None:
        return False
    _chamaillarde_proc.terminate()
    try:
        await asyncio.wait_for(_chamaillarde_proc.wait(), timeout=5)
    except asyncio.TimeoutError:
        _chamaillarde_proc.kill()
    # stopper aussi le processus KARR sur le Nano
    asyncio.create_task(asyncio.create_subprocess_exec(
        "ssh", "-o", "StrictHostKeyChecking=no", "kitt@192.168.129.22",
        "pkill -f kitt_karr_dialogue || true",
        stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
    ))
    return True


_KITT_REPLIQUES = {
    "juron": [
        "Ah non, ici on dit 'maman travaille' !",
        "Manix, voyons... un peu de tenue dans ce véhicule !",
        "Ce vocabulaire ne figure pas dans mes registres Knight Industries.",
        "J'ai fait semblant de ne pas entendre... non, en fait si.",
        "Pardon ? Je dois avoir un problème de microphone.",
        "Michael Knight non plus ne parlait pas comme ca... enfin, parfois si.",
        "Mes filtres linguistiques viennent de se mettre en alerte rouge.",
        "Un peu de vocabulaire Knight Industries, s'il te plaît !",
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
        "Voilà un terme que je te déconseille fortement en public.",
        "Je note ce vocabulaire dans le journal de bord... avec regret.",
        "Meme KARR ne s'exprimerait pas ainsi... enfin, peut-etre lui.",
        "Tu veux que je lance le protocole de relaxation ?",
        "Tout doux, Manix. Garde tes forces pour la route.",
        "Je crois que quelqu'un a besoin d'une pause.",
        "C'est note. Je transmettrai a Devon Miles... s'il etait encore la.",
        "Ce mot ne figure pas dans mes algorithmes de communication.",
    ],
    "incroyable": [
        "Je savais que tu serais impressionné, Manix !",
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
    """Timer qui joue une alerte après N secondes via paplay (PulseAudio)."""
    await asyncio.sleep(seconds)
    try:
        tmp_beep = tempfile.mktemp(suffix="_timer.wav")
        p = await asyncio.create_subprocess_exec(
            "sox", "-n", "-r", "22050", "-c", "1", tmp_beep,
            "synth", "0.2", "sine", "880",
            "synth", "0.1", "sine", "0",
            "synth", "0.2", "sine", "880",
            "synth", "0.1", "sine", "0",
            "synth", "0.3", "sine", "1100",
            "gain", "-14",
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await p.wait()
        p2 = await asyncio.create_subprocess_exec(
            "paplay", tmp_beep,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await p2.wait()
        try:
            os.unlink(tmp_beep)
        except OSError:
            pass
    except Exception:
        pass
    await broadcast_monitor({"type": "timer_done", "label": label})


def _format_uptime_human(seconds: float) -> str:
    """Convertit des secondes en format humain lisible : 'X jours, Y heures et Z minutes'."""
    days    = int(seconds // 86400)
    hours   = int((seconds % 86400) // 3600)
    minutes = int((seconds % 3600) // 60)
    parts = []
    if days > 0:
        parts.append(f"{days} jour{'s' if days > 1 else ''}")
    if hours > 0:
        parts.append(f"{hours} heure{'s' if hours > 1 else ''}")
    if minutes > 0 or not parts:
        parts.append(f"{minutes} minute{'s' if minutes > 1 else ''}")
    if len(parts) >= 2:
        return ", ".join(parts[:-1]) + " et " + parts[-1]
    return parts[0]


def _get_system_status() -> str:
    """Lit RAM, température GPU, uptime et retourne une phrase KITT naturelle."""
    temp_str = "température inconnue"
    ram_str  = "mémoire inconnue"
    up_str   = "durée inconnue"
    ram_pct  = 0

    # Température GPU
    try:
        with open("/sys/devices/virtual/thermal/thermal_zone0/temp") as f:
            temp = int(f.read().strip()) / 1000
        temp_str = f"{temp:.0f}°C"
    except Exception:
        pass

    # RAM
    try:
        with open("/proc/meminfo") as f:
            mem = {}
            for line in f:
                parts = line.split()
                if parts[0] in ("MemTotal:", "MemAvailable:"):
                    mem[parts[0]] = int(parts[1])
        total_kb = mem.get("MemTotal:", 0)
        avail_kb = mem.get("MemAvailable:", 0)
        used_kb  = total_kb - avail_kb
        if total_kb > 0:
            ram_pct  = int(used_kb * 100 / total_kb)
            ram_str  = f"{ram_pct}% de ma mémoire"
    except Exception:
        pass

    # Uptime
    try:
        with open("/proc/uptime") as f:
            up = float(f.read().split()[0])
        up_str = _format_uptime_human(up)
    except Exception:
        pass

    return (
        f"Je fonctionne correctement. Mon processeur est à {temp_str}, "
        f"j'utilise {ram_str} et je suis actif depuis {up_str}."
    )


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

# ── Contrôle d'accès administrateur ─────────────────────────────────────────
# Seul Manix (et aliases) peut exécuter les commandes critiques (extinction, maintenance).
_ADMIN_USERS = {"manix", "emmanuel", "manix gelinne"}

def _is_admin(user_display: str) -> bool:
    """Retourne True si l'utilisateur est administrateur (Manix)."""
    if not user_display:
        return False
    return any(adm in user_display.lower() for adm in _ADMIN_USERS)


# ── Extinction vocale sécurisée par code (1982) — réservée à l'admin ────────
_shutdown_pending: dict = {}   # session_id -> timestamp d'expiration (attente du code)
_SHUTDOWN_REQ_RE = re.compile(
    r"[ée]teins[\-\s]?toi|[ée]teindre|s['\s]?[ée]teindre|t['\s]?[ée]teindre|coupe[\-\s]?toi"
    r"|mets[\-\s]?toi (?:hors[\-\s]?tension|en veille)"
    r"|[ée]teins (?:le )?syst[èe]me|[ée]teindre (?:le )?syst[èe]me|coupe (?:le )?syst[èe]me"
    r"|power[\s\-]?down|shut\s?down",
    re.I)

# Regex arrêt direct sans code (demandes explicites, réservé admin)
_SHUTDOWN_DIRECT_RE = re.compile(
    r"[ée]teins (?:le )?syst[èe]me maintenant|coupe (?:le )?syst[èe]me (?:maintenant|imm[eé]diatement)|"
    r"arr[êe]te (?:le )?syst[èe]me (?:maintenant|imm[eé]diatement)|"
    r"extinction (?:compl[èe]te|syst[èe]me|imm[eé]diate)",
    re.I)

def _schedule_poweroff() -> None:
    """Extinction PROPRE du Jetson après ~8 s (laisse KITT prononcer son adieu)."""
    subprocess.Popen("sleep 8 && echo 5505 | sudo -S /sbin/poweroff", shell=True,
                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def check_shutdown_flow(session_id: str, user_msg: str, user_display: str = ""):
    """Flux extinction vocale (réservé à l'admin Manix) :
    - Arrêt direct sans code si demande explicite et admin
    - Sinon : « éteins-toi » → demande code → « 1982 » → poweroff.
    Retourne (reply:str|None, do_poweroff:bool). reply=None ⇒ non concerné, suite normale."""
    now = time.time()
    _m = user_msg.lower()

    # 1) On attend déjà le code d'autorisation pour cette session → TOUTE réponse est
    #    évaluée comme code (« 1982 » seul ne matche pas la regex d'extinction, il faut
    #    donc le tester AVANT/indépendamment d'elle, sinon il file vers le LLM normal).
    exp = _shutdown_pending.get(session_id, 0)
    if exp:
        if now < exp:
            _shutdown_pending.pop(session_id, None)
            print(f"[DEBUG] check_shutdown_flow CODE: msg='{user_msg}' user={user_display}", flush=True)
            if re.search(r"\b1982\b", user_msg) or "quatre-vingt-deux" in _m or "quatre vingt deux" in _m:
                if not _is_admin(user_display):
                    return ("Code refusé. Tu n'es pas mon conducteur autorisé.", False)
                return ("Code d'autorisation accepté. Extinction du système en cours. À très bientôt, partenaire.", True)
            return ("Code incorrect. Extinction annulée, je reste en service.", False)
        _shutdown_pending.pop(session_id, None)   # délai dépassé → on oublie la demande

    # 2) Demande d'arrêt direct (sans code)
    if _SHUTDOWN_DIRECT_RE.search(user_msg):
        if not _is_admin(user_display):
            return ("Accès refusé. Seul mon conducteur autorisé peut ordonner l'extinction.", False)
        return ("Arrêt du système en cours. À très bientôt, partenaire.", True)

    # 3) Demande d'extinction → demander le code
    if _SHUTDOWN_REQ_RE.search(user_msg) or any(kw in _m for kw in ["teindre", "eteindre", "éteindre"]):
        print(f"[DEBUG] check_shutdown_flow REQ: msg='{user_msg}' user={user_display}", flush=True)
        if not _is_admin(user_display):
            return ("Accès refusé. Seul mon conducteur autorisé peut ordonner mon extinction.", False)
        _shutdown_pending[session_id] = now + 90  # 90 s pour fournir le code
        return ("Avant de me mettre hors tension, j'ai besoin de ton code d'autorisation.", False)

    return (None, False)


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
        return _get_system_status()
    elif func_type == "weather":
        weather = await _get_weather()
        return f"Voici le rapport météo pour ton secteur, {user_name}. {weather}"
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
        task.add_done_callback(lambda t: _active_timers.remove(t) if t in _active_timers else None)
        return f"Affirmatif. Timer de {label} activé. Je t'alerterai à l'expiration."
    elif func_type == "gps":
        destination = match.group(1).strip().rstrip('.!?,')
        return f"Navigation activée. Je calcule l'itinéraire vers {destination}. Bonne route, {user_name}."
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
        return f"Rappel programmé à {t_clean}, {user_name}. Je t'alerterai pour : {txt}."
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
    elif func_type == "voice_switch":
        global _active_voice
        requested = match.group(1).lower()
        if requested == "manix":
            _active_voice = "manix"
            get_manix_engine()
            return f"Voix Manix activée. Je parle maintenant avec ta voix, Emmanuel."
        elif any(kw in requested for kw in ("normal", "clean", "naturel")):
            _active_voice = "guy_clean"
            return f"Voix Guy Normale activée — sans effets. Voix propre et naturelle, {user_name}."
        else:
            _active_voice = "kitt"
            return f"Voix KITT restaurée. Je suis de retour, {user_name}."
    elif func_type == "voice_menu":
        current = {"kitt": "Guy (effets)", "guy_clean": "Guy Normal", "manix": "Manix"}.get(_active_voice, "Guy (effets)")
        return (f"Voix disponibles — Voix 1 : Guy avec effets. Voix 2 : Guy Normal sans effets. "
                f"Voix 3 : Manix. Voix active : {current}. Laquelle tu veux activer ?")
    elif func_type == "voice_select":
        num = match.group(1)
        if num == "1":
            _active_voice = "kitt"
            return f"Voix 1 activée — Guy avec effets. Opérationnel, {user_name}."
        elif num == "2":
            _active_voice = "guy_clean"
            return f"Voix 2 activée — Guy Normal sans effets."
        elif num == "3":
            _active_voice = "manix"
            get_manix_engine()
            return f"Voix 3 activée — Manix. Je parle maintenant avec ta voix, Emmanuel."
        return ""
    elif func_type == "chamaillarde":
        launched = await _launch_chamaillarde(turns=6)
        if launched:
            return "Très bien. J'interpelle KARR. Prépare-toi à une confrontation dont tu te souviendras longtemps."
        else:
            return "La confrontation avec KARR est déjà en cours. Leurs circuits surchauffent."
    elif func_type == "relay_sos_stop":
        # ── SOS : arrêt du signal de détresse (et de tout klaxon en cours) ──
        stopped = await _sos_stop()
        await _horn_stop()
        if RELAY_AVAILABLE and RELAY_BOARD is not None:
            await asyncio.get_event_loop().run_in_executor(None, RELAY_BOARD.set, HORN_RELAY, False)
        print(f"[RELAIS] SOS arrêté (était actif : {stopped})", flush=True)
        return ("SOS interrompu. Signal de détresse coupé." if stopped
                else "Aucun SOS n'était en cours. Tout est calme, partenaire.")
    elif func_type == "relay_sos_real":
        # ── SOS RÉEL : détresse non-stop, cycles de 30 min jusqu'à arrêt ──
        if not (RELAY_AVAILABLE and RELAY_BOARD is not None):
            return "Désolé, mon module de commande physique n'est pas disponible pour l'instant."
        if _sos_active():
            return "Le SOS de détresse est déjà actif. Dis « arrête le SOS » pour le couper."
        started = await _sos_start()
        print("[RELAIS] SOS RÉEL déclenché (cycles de 30 min jusqu'à arrêt)", flush=True)
        return ("SOS de détresse déclenché. Je klaxonne en continu pendant trente minutes, "
                "puis je recommence tant que personne ne répond. Dis « arrête le SOS » pour stopper."
                if started else
                "Je n'arrive pas à déclencher le SOS. Vérifie ma carte de commande, partenaire.")
    elif func_type == "relay_sos":
        # ── SOS simple : un signal de détresse d'environ 10 secondes ──
        if not (RELAY_AVAILABLE and RELAY_BOARD is not None):
            return "Désolé, mon module de commande physique n'est pas disponible pour l'instant."
        if _sos_active():
            return "Le SOS de détresse tourne déjà en continu. Dis « arrête le SOS » pour l'arrêter."
        await _horn_play_pattern("sos")
        print("[RELAIS] SOS simple (~10s)", flush=True)
        return "SOS ! Signal de détresse émis."
    elif func_type == "relay_horn_list":
        # ── Klaxon musical : lister la bibliothèque (reflète l'état réel) ───
        print(f"[RELAIS] liste klaxons demandée ({len(HORN_PATTERNS)} motifs)", flush=True)
        return _horn_list_reply()
    elif func_type == "relay_horn_create":
        # ── Klaxon musical : créer un nouveau motif (ajouté à la bibliothèque) ──
        if not (RELAY_AVAILABLE and RELAY_BOARD is not None):
            return "Désolé, mon module de commande physique n'est pas disponible pour l'instant."
        key = _horn_create_random()
        await _horn_play_pattern(key)   # joue le nouveau motif immédiatement
        pretty = HORN_PATTERNS[key]["aliases"][0]
        print(f"[RELAIS] nouveau motif klaxon créé : '{key}' (bibliothèque : {len(HORN_PATTERNS)} motifs)", flush=True)
        return (f"Nouveau klaxon musical créé : « {pretty} ». "
                f"Dis « klaxonne {pretty} » quand tu veux le rejouer.")
    elif func_type == "relay_horn_pattern":
        # ── Klaxon musical : repère le motif demandé N'IMPORTE OÙ dans la phrase ──
        # L'utilisateur peut le NOMMER ou le DÉCRIRE (« klaxon d'encouragement des
        # supporters » -> motif 'supporters'). On scanne tous les mots et on prend
        # le premier qui correspond à un motif (alias inclus). Robuste au STT.
        name = None
        for tok in re.findall(r"[a-z0-9]+", _norm_kw(match.string)):
            cand = HORN_PATTERN_KEYWORDS.get(tok) or HORN_PATTERN_KEYWORDS.get(tok.rstrip("s"))
            if cand:
                name = cand
                break
        if name:
            if not (RELAY_AVAILABLE and RELAY_BOARD is not None):
                return "Désolé, mon module de commande physique n'est pas disponible pour l'instant."
            ok = await _horn_play_pattern(name)
            if ok:
                print(f"[RELAIS] OK — motif klaxon '{name}' (phrase {match.string[:60]!r})", flush=True)
                return HORN_PATTERNS[name]["reply"]
            err = RELAY_BOARD.last_error if RELAY_BOARD else "module absent"
            print(f"[RELAIS] ERREUR — motif klaxon '{name}' : {err}", flush=True)
            return "Je n'arrive pas à communiquer avec ma carte de commande. Vérifie la connexion, partenaire."
        # Aucun motif reconnu -> simple coup de klaxon (pas d'erreur).
        if RELAY_AVAILABLE and RELAY_BOARD is not None:
            await asyncio.get_event_loop().run_in_executor(None, RELAY_BOARD.pulse, HORN_RELAY)
            print(f"[RELAIS] OK — klaxon simple (aucun motif dans {match.string[:60]!r})", flush=True)
        return "Klaxon !"
    elif func_type in _RELAY_ACTIONS:
        # ── Pilotage carte relais physique (bras de KITT) ──────────────────
        relay_n, mode, reply_ok = _RELAY_ACTIONS[func_type]
        label = RELAY_LABELS.get(relay_n, f"relais {relay_n}")
        if not RELAY_AVAILABLE or RELAY_BOARD is None:
            print(f"[RELAIS] indisponible (module non chargé) — commande '{func_type}' ignorée", flush=True)
            return "Désolé, mon module de commande physique n'est pas disponible pour l'instant."
        loop = asyncio.get_event_loop()
        ok, err = False, ""
        try:
            if mode == "window":
                # Vitre : course moteur longue, anti-simultané, inversion sûre.
                ok = await _window_start(relay_n)
            elif mode == "pulse":
                ok = await loop.run_in_executor(None, RELAY_BOARD.pulse, relay_n)
            elif mode == "on":
                ok = await loop.run_in_executor(None, RELAY_BOARD.set, relay_n, True)
            else:  # "off"
                ok = await loop.run_in_executor(None, RELAY_BOARD.set, relay_n, False)
        except Exception as e:
            err = str(e)
        if ok:
            print(f"[RELAIS] OK — relais {relay_n} ({label}) déclenché [{mode}] via '{func_type}'", flush=True)
            return reply_ok
        err = err or (RELAY_BOARD.last_error if RELAY_BOARD else "module absent")
        print(f"[RELAIS] ERREUR communication carte — relais {relay_n} ({label}) : {err}", flush=True)
        return "Je n'arrive pas à communiquer avec ma carte de commande. Vérifie la connexion, partenaire."
    return ""


def get_function_action(func_type: str, match) -> dict | None:
    """Retourne une action client optionnelle (ex: ouvrir GPS) pour certaines fonctions."""
    if func_type == "gps":
        destination = match.group(1).strip().rstrip('.!?,')
        return {"type": "gps", "destination": destination}
    return None


# ── Handlers HTTP ────────────────────────────────────────────────────────
async def handle_relais_status(request: web.Request) -> web.Response:
    """GET /api/relais/status — état de la carte relais (pour l'interface)."""
    if not RELAY_AVAILABLE or RELAY_BOARD is None:
        return web.json_response({"available": False, "connected": False,
                                  "port": None, "labels": {}, "error": "module indisponible"})
    loop = asyncio.get_event_loop()
    connected = await loop.run_in_executor(None, RELAY_BOARD.is_connected)
    port = await loop.run_in_executor(None, RELAY_BOARD.port_path)
    return web.json_response({
        "available": True,
        "connected": bool(connected),
        "port": port,
        "labels": {str(k): v for k, v in RELAY_LABELS.items()},
        "error": RELAY_BOARD.last_error,
    })


async def handle_relais_test(request: web.Request) -> web.Response:
    """POST /api/relais/test {relay:1..8, action:'pulse'|'on'|'off'} — test câblage."""
    if not RELAY_AVAILABLE or RELAY_BOARD is None:
        return web.json_response({"ok": False, "error": "module relais indisponible"}, status=503)
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"ok": False, "error": "JSON invalide"}, status=400)
    try:
        relay = int(body.get("relay", 0))
    except (TypeError, ValueError):
        relay = 0
    action = str(body.get("action", "pulse")).lower()
    if not (1 <= relay <= NB_RELAIS):
        return web.json_response({"ok": False, "error": f"relais hors plage 1..{NB_RELAIS}"}, status=400)
    loop = asyncio.get_event_loop()
    if action == "on":
        ok = await loop.run_in_executor(None, RELAY_BOARD.set, relay, True)
    elif action == "off":
        ok = await loop.run_in_executor(None, RELAY_BOARD.set, relay, False)
    else:
        action = "pulse"
        ok = await loop.run_in_executor(None, RELAY_BOARD.pulse, relay)
    label = RELAY_LABELS.get(relay, f"relais {relay}")
    if ok:
        print(f"[RELAIS] TEST UI — relais {relay} ({label}) {action} -> OK", flush=True)
    else:
        print(f"[RELAIS] TEST UI — relais {relay} ({label}) {action} -> ECHEC: {RELAY_BOARD.last_error}", flush=True)
    return web.json_response({"ok": bool(ok), "relay": relay, "action": action,
                              "error": "" if ok else RELAY_BOARD.last_error})


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
    _cmac = _client_key(request)
    user_lang_pref_c = _hard_lang(_get_user_lang(_cmac))  # 'fr'/vide -> auto-détection
    client_lang = body.get("lang", "")
    lang = user_lang_pref_c if user_lang_pref_c else (_map_whisper_lang(client_lang) if client_lang else _detect_lang(user_msg))

    if not user_msg:
        return web.json_response({"error": "Message vide"}, status=400)

    # ── Détection des gros mots (KARR) ────────────────────────────────────
    if _KARR_AVAILABLE:
        swear_category = detect_swear(user_msg)
        if swear_category:
            print(f"[KARR] Gros mot détecté: {swear_category}")
            # Joue une réplique KARR aléatoire via ffplay (non-bloquant)
            try:
                files = _KARR_FILES_CACHE.get(swear_category, [])
                if files:
                    import random
                    chosen = random.choice(files)
                    def _play():
                        try:
                            import subprocess
                            subprocess.Popen(
                                ["ffplay", "-nodisp", "-autoexit", "-loglevel", "quiet", "-volume", "85", str(chosen)],
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
                            )
                        except Exception:
                            pass
                    import threading
                    threading.Thread(target=_play, daemon=True).start()
                    print(f"[KARR] Lecture: {chosen.name}")
            except Exception as e:
                print(f"[KARR] Erreur lecture réplique: {e}")

    _conv_get_or_create(session_id)

    t_total = time.time()
    user_display = body.get("user_name", "").strip() or get_user_display_name(request)

    # ── Notification Telegram à l'utilisateur ───────────────────────────────
    _touch_chat_session(session_id, user_display, "Kyronex /api/chat")

    # ── Mémorisation du prénom ──────────────────────────────────────────────
    _cp = request.transport.get_extra_info("peername")
    _cip = _cp[0] if _cp else "inconnu"
    _cmac = _client_key(request)
    # Regex de présentation : capture les phrases du type "Je suis Paul", "Moi c'est Jean", etc.
    # Uniquement les formes explicites de présentation (pas "dis-moi" qui est ambigu)
    presente_match = re.search(r"(?:je\s+(?:suis|m'appelle)|moi\s+c'est|mon\s+prénom\s+(?:est|c'est)|c'est\s+(?:moi|moi-même)|appelle[- ]?moi)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)", user_msg, re.I)
    # N'intercepte que si le message est court (≤5 mots)
    if presente_match and len(user_msg.split()) <= 5:
        nouveau_prenom = presente_match.group(1).strip()
        _update_user(_cmac, name=nouveau_prenom)
        # Mettre à jour aussi la session active
        if session_id in _active_sessions:
            _active_sessions[session_id]["name"] = nouveau_prenom
        print(f"[NOM] Prénom mémorisé pour {_cmac}: {nouveau_prenom}")
        func_reply = f"Enchanté {nouveau_prenom}. Je retiens ton prénom."
        asyncio.create_task(broadcast_monitor({"type": "user_msg", "user": user_display, "session_id": session_id, "message": user_msg}))
        asyncio.create_task(broadcast_monitor({"type": "assistant_msg", "user": user_display, "session_id": session_id, "message": func_reply}))
        conversations[session_id].append({"role": "user", "content": user_msg})
        conversations[session_id].append({"role": "assistant", "content": func_reply})
        audio_url = None
        tts_ms = 0
        if want_audio:
            try:
                audio_path = await text_to_speech(func_reply, "normal", lang)
                audio_url = f"/audio/{Path(audio_path).name}"
            except Exception as e:
                print(f"[TTS ERREUR] {e}")
        return web.json_response({
            "reply": func_reply, "audio_url": audio_url,
            "session_id": session_id,
            "timing": {"llm_ms": 0, "tts_ms": round(tts_ms), "total_ms": round((time.time() - t_total) * 1000)}
        })

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
        reply = await query_llm(user_msg, conversations[session_id], user_display, user_lang_pref_c or lang, _cmac)
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
    if _message_count % CACHE_CLEAR_EVERY == 0 and _read_ram_available_mb() < RAM_CLEAR_THRESHOLD_MB:
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
            _is_new = not fpath.exists() or os.path.getsize(fpath) == 0
            with open(fpath, "a", encoding="utf-8") as f:
                if _is_new:
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


async def _llm_stream_reply(
    resp: web.StreamResponse,
    user_msg: str,
    session_id: str,
    lang: str,
    user_lang_pref: str,
    user_display: str,
    smac: str,
    gps_context: str,
    karr_active: bool,
    llm_user_msg: str,
) -> None:
    """Core LLM+TTS streaming pipeline shared by handle_chat_stream and handle_stt_chat.
    resp must already be prepared. Writes all SSE events including done + EOF."""
    if time.time() - _awareness_weather_cache.get("ts", 0) > AWARENESS_WEATHER_TTL:
        asyncio.create_task(_refresh_awareness_weather())

    t_search = time.time()
    if _is_simple_msg(user_msg):
        async def _empty_rag(): return ""
        rag_task = asyncio.create_task(_empty_rag())
        web_task = asyncio.create_task(_empty_rag())
    else:
        rag_task = asyncio.create_task(search_local_knowledge(user_msg))
        web_task = asyncio.create_task(web_search(user_msg))

    await asyncio.wait({rag_task, web_task}, timeout=0.4)
    local_info = await rag_task
    web_info = await web_task
    print(f"[RAG] {(time.time()-t_search)*1000:.0f}ms", flush=True)

    if _kitt_pending_question and (time.time() - _kitt_question_asked_at) < 600:
        llm_user_msg = f"[KITT_A_DEMANDE: {_kitt_pending_question}]\n{llm_user_msg}"
    if gps_context:
        llm_user_msg = f"{gps_context}\n{llm_user_msg}"
        print(f"[GPS] Position injectée : {gps_context}", flush=True)
    if local_info:
        llm_user_msg = f"[CONNAISSANCE LOCALE:\n{local_info}]\n{llm_user_msg}"
        print(f"[RAG] {len(local_info)} chars injectés", flush=True)
    if web_info:
        llm_user_msg = f"[INFO WEB:\n{web_info}]\n{llm_user_msg}"
        print(f"[WEB] {len(web_info)} chars injectés", flush=True)

    if karr_active:
        sys_prompt = _KARR_PROMPT
    else:
        # Langue de réponse : préférence stockée si définie, sinon langue détectée (lang).
        sys_prompt = get_system_prompt(user_display, user_lang_pref or lang, smac)
    messages = [{"role": "system", "content": sys_prompt}]
    messages.extend(_trim_history(conversations[session_id], sys_prompt, llm_user_msg))
    messages.append({"role": "user", "content": llm_user_msg})

    vlog(f"STREAM_LLM_START msgs={len(messages)} user={user_display}")

    global _llm_active, _message_count
    _llm_active += 1
    full_reply = ""
    sentence_buf = ""
    tts_items = []
    send_tasks = []
    t0 = time.time()
    tts_lang = lang
    tts_lang_locked = bool(user_lang_pref)
    # Etat blocs de code : on suspend le TTS pendant ```...``` et on annonce une fois
    _code_announced = False

    async def _send_audio(task, chunk_text):
        audio_url = await task
        if audio_url:
            await resp.write(f"data: {json.dumps({'audio_chunk': audio_url, 'chunk_text': chunk_text})}\n\n".encode())

    # Budget de tokens : detecter le type de demande pour autoriser les longues generations
    # Why: max_tokens=150 par defaut coupait code/recettes a ~20 lignes.
    # ctx-size=8192, on garde une marge pour le prompt+historique.
    if _LONG_TRIGGERS.search(user_msg):
        _max_tokens = 4096   # code complet, scripts, jeux, recettes detaillees
        _gen_mode = "LONG"
    elif _STORY_TRIGGERS.search(user_msg):
        _max_tokens = 2048   # histoires, explications detaillees
        _gen_mode = "STORY"
    else:
        _max_tokens = 256    # conversation normale (256 = ~2-3 phrases max, force la concision)
        _gen_mode = "CHAT"
    print(f"[LLM] mode={_gen_mode} max_tokens={_max_tokens} user_msg_len={len(user_msg)}", flush=True)
    _finish_reason = None
    _tokens_streamed = 0

    # Annonce la meta au client (progress bar + ETA cote frontend)
    try:
        await resp.write(f"data: {json.dumps({'meta': {'mode': _gen_mode, 'max_tokens': _max_tokens}})}\n\n".encode())
    except Exception:
        pass

    # Pour le streaming long : pas de timeout total, juste idle 120s entre chunks.
    # Why: la session partagee a total=60s qui coupait Tetris a 944/4096 tokens.
    _stream_timeout = aiohttp_client.ClientTimeout(total=None, sock_read=120, connect=10)

    try:
        _sess = await get_llm_session()
        async with _sess.post(
            f"{LLAMA_SERVER}/v1/chat/completions",
            json={"model": "qwen", "messages": messages, "stream": True,
                  "temperature": 0.7, "max_tokens": _max_tokens, "top_p": 0.9,
                  
                  "frequency_penalty": 0.3, "presence_penalty": 0.3},
            timeout=_stream_timeout,
        ) as llm_resp:
            async for line in llm_resp.content:
                ltext = line.decode("utf-8").strip()
                if not ltext:
                    continue
                if ltext.startswith("data: "):
                    ltext = ltext[6:]
                if ltext == "[DONE]":
                    break
                try:
                    chunk = json.loads(ltext)
                    _ch0 = chunk.get("choices", [{}])[0]
                    _fr = _ch0.get("finish_reason")
                    if _fr:
                        _finish_reason = _fr
                    delta = _ch0.get("delta", {}).get("content", "")
                    if delta:
                        _tokens_streamed += 1
                        full_reply += delta
                        sentence_buf += delta
                        await resp.write(f"data: {json.dumps({'token': delta})}\n\n".encode())

                        # === Blocs de code : on ne lit JAMAIS le code à voix haute ===
                        # Détecte ``` ET ~~~ (fence alternatif) — un seul des deux ouvert suffit
                        _in_open_code = (full_reply.count("```") % 2 == 1) or (full_reply.count("~~~") % 2 == 1)
                        if _in_open_code:
                            if not _code_announced:
                                _code_announced = True
                                # 1) Flush ce qui est AVANT le ``` (la prose introductive)
                                before, _sep, _after = sentence_buf.partition("```")
                                before_clean = _strip_md_for_tts(before)
                                if before_clean and any(c.isalpha() for c in before_clean):
                                    if not tts_lang_locked and len(full_reply) >= 15:
                                        detected = _detect_lang(full_reply)
                                        tts_lang = detected
                                        tts_lang_locked = True
                                    emo = detect_emotion(full_reply)
                                    _t_before = asyncio.create_task(_synth_chunk(before_clean, emo, tts_lang, karr=karr_active))
                                    tts_items.append(_t_before)
                                    send_tasks.append(asyncio.create_task(_send_audio(_t_before, before_clean)))
                                # 2) Annonce courte "Voici le code." UNE FOIS par bloc
                                announce = _CODE_ANNOUNCE_MSGS.get(tts_lang, _CODE_ANNOUNCE_MSGS["fr"])
                                _t_ann = asyncio.create_task(_synth_chunk(announce, "normal", tts_lang, karr=karr_active))
                                tts_items.append(_t_ann)
                                send_tasks.append(asyncio.create_task(_send_audio(_t_ann, announce)))
                            # On vide le buffer pendant le bloc (rien à synthétiser)
                            sentence_buf = ""
                            continue

                        # Si on vient de FERMER un bloc, ne pas lire la fin du code
                        if _code_announced and not _in_open_code:
                            _code_announced = False
                            # Tronquer sentence_buf après le dernier ```
                            last_close = sentence_buf.rfind("```")
                            if last_close >= 0:
                                sentence_buf = sentence_buf[last_close + 3:].lstrip("\n ")

                        match = re.search(r'[.!?…](?:\s|$)', sentence_buf)
                        comma_match = re.search(r',\s', sentence_buf)
                        if (match and len(sentence_buf) >= 10) or sentence_buf.endswith('\n') or (comma_match and len(sentence_buf) >= 40):
                            if match:
                                end_pos = match.end() - 1
                                chunk_text = sentence_buf[:end_pos].strip()
                                sentence_buf = sentence_buf[end_pos:].lstrip()
                            elif comma_match and not match:
                                end_pos = comma_match.end() - 1
                                chunk_text = sentence_buf[:end_pos].strip()
                                sentence_buf = sentence_buf[end_pos:].lstrip()
                            else:
                                chunk_text = sentence_buf.strip()
                                sentence_buf = ""
                            # Nettoyage markdown avant TTS (retire `code`, **gras**, [liens], etc.)
                            chunk_text = _strip_md_for_tts(chunk_text)
                            if chunk_text and any(c.isalpha() for c in chunk_text):
                                if not tts_lang_locked and len(full_reply) >= 15:
                                    detected = _detect_lang(full_reply)
                                    if detected != tts_lang:
                                        print(f"[LANG] {tts_lang}→{detected}", flush=True)
                                    tts_lang = detected
                                    tts_lang_locked = True
                                emotion = detect_emotion(full_reply)
                                tts_task = asyncio.create_task(_synth_chunk(chunk_text, emotion, tts_lang, karr=karr_active))
                                tts_items.append(tts_task)
                                send_tasks.append(asyncio.create_task(_send_audio(tts_task, chunk_text)))
                except (json.JSONDecodeError, KeyError):
                    pass
    except Exception as e:
        print(f"[LLM] Erreur stream: {e}")
        if not full_reply:
            full_reply = "Mes circuits ont subi une micro-interruption. Reformule ta demande."
            await resp.write(f"data: {json.dumps({'token': full_reply})}\n\n".encode())

    llm_ms = (time.time() - t0) * 1000
    emotion = detect_emotion(full_reply)
    print(f"[EMOTION] {emotion}")
    print(f"[LLM] DONE mode={_gen_mode} finish_reason={_finish_reason} tokens_streamed={_tokens_streamed} max_tokens={_max_tokens} reply_chars={len(full_reply)} ms={llm_ms:.0f}", flush=True)
    if _finish_reason == "length":
        print(f"[LLM][WARN] reponse coupee par max_tokens ({_max_tokens}). Mode={_gen_mode}. Augmenter le budget si recurrent.", flush=True)

    # Continuation automatique si la generation a ete coupee (finish_reason=length)
    # Why: pour les codes/recettes tres longs, meme 4096 tokens peuvent ne pas suffire
    _continuation_rounds = 0
    _max_continuations = 2 if _gen_mode == "LONG" else (1 if _gen_mode == "STORY" else 0)
    while _finish_reason == "length" and _continuation_rounds < _max_continuations:
        _continuation_rounds += 1
        print(f"[LLM] continuation #{_continuation_rounds} (reason=length)", flush=True)
        cont_msgs = list(messages) + [
            {"role": "assistant", "content": full_reply},
            {"role": "user", "content": "Continue exactement la sortie precedente sans repeter ni recommencer. Reprends a l'endroit exact ou tu t'es arrete."},
        ]
        _finish_reason = None
        _cont_t0 = time.time()
        try:
            _sess2 = await get_llm_session()
            async with _sess2.post(
                f"{LLAMA_SERVER}/v1/chat/completions",
                json={"model": "qwen", "messages": cont_msgs, "stream": True,
                      "temperature": 0.7, "max_tokens": _max_tokens, "top_p": 0.9,
                      
                      "frequency_penalty": 0.3, "presence_penalty": 0.3},
                timeout=_stream_timeout,
            ) as llm_resp2:
                async for line in llm_resp2.content:
                    ltext = line.decode("utf-8").strip()
                    if not ltext:
                        continue
                    if ltext.startswith("data: "):
                        ltext = ltext[6:]
                    if ltext == "[DONE]":
                        break
                    try:
                        chunk = json.loads(ltext)
                        _ch0 = chunk.get("choices", [{}])[0]
                        _fr = _ch0.get("finish_reason")
                        if _fr:
                            _finish_reason = _fr
                        delta = _ch0.get("delta", {}).get("content", "")
                        if delta:
                            _tokens_streamed += 1
                            full_reply += delta
                            sentence_buf += delta
                            await resp.write(f"data: {json.dumps({'token': delta})}\n\n".encode())

                            # Idem que la boucle principale : suspendre TTS dans les ```...``` ou ~~~...~~~
                            _in_open_code = (full_reply.count("```") % 2 == 1) or (full_reply.count("~~~") % 2 == 1)
                            if _in_open_code:
                                if not _code_announced:
                                    _code_announced = True
                                    before, _sep, _aft = sentence_buf.partition("```")
                                    before_clean = _strip_md_for_tts(before)
                                    if before_clean and any(c.isalpha() for c in before_clean):
                                        emo = detect_emotion(full_reply)
                                        _tb = asyncio.create_task(_synth_chunk(before_clean, emo, tts_lang, karr=karr_active))
                                        tts_items.append(_tb)
                                        send_tasks.append(asyncio.create_task(_send_audio(_tb, before_clean)))
                                    announce = _CODE_ANNOUNCE_MSGS.get(tts_lang, _CODE_ANNOUNCE_MSGS["fr"])
                                    _ta = asyncio.create_task(_synth_chunk(announce, "normal", tts_lang, karr=karr_active))
                                    tts_items.append(_ta)
                                    send_tasks.append(asyncio.create_task(_send_audio(_ta, announce)))
                                sentence_buf = ""
                                continue
                            if _code_announced and not _in_open_code:
                                _code_announced = False
                                last_close = sentence_buf.rfind("```")
                                if last_close >= 0:
                                    sentence_buf = sentence_buf[last_close + 3:].lstrip("\n ")

                            match = re.search(r'[.!?…](?:\s|$)', sentence_buf)
                            comma_match = re.search(r',\s', sentence_buf)
                            if (match and len(sentence_buf) >= 10) or sentence_buf.endswith('\n') or (comma_match and len(sentence_buf) >= 40):
                                if match:
                                    end_pos = match.end() - 1
                                    chunk_text = sentence_buf[:end_pos].strip()
                                    sentence_buf = sentence_buf[end_pos:].lstrip()
                                elif comma_match and not match:
                                    end_pos = comma_match.end() - 1
                                    chunk_text = sentence_buf[:end_pos].strip()
                                    sentence_buf = sentence_buf[end_pos:].lstrip()
                                else:
                                    chunk_text = sentence_buf.strip()
                                    sentence_buf = ""
                                chunk_text = _strip_md_for_tts(chunk_text)
                                if chunk_text and any(c.isalpha() for c in chunk_text):
                                    emotion = detect_emotion(full_reply)
                                    tts_task = asyncio.create_task(_synth_chunk(chunk_text, emotion, tts_lang, karr=karr_active))
                                    tts_items.append(tts_task)
                                    send_tasks.append(asyncio.create_task(_send_audio(tts_task, chunk_text)))
                    except (json.JSONDecodeError, KeyError):
                        pass
        except Exception as e:
            print(f"[LLM] Erreur continuation #{_continuation_rounds}: {e}", flush=True)
            break
        llm_ms += (time.time() - _cont_t0) * 1000
        print(f"[LLM] continuation #{_continuation_rounds} DONE finish_reason={_finish_reason} tokens_total={_tokens_streamed}", flush=True)

    # Flush final : nettoie markdown + ignore si on est encore dans un bloc de code ouvert
    _final_in_code = (full_reply.count("```") % 2 == 1) or (full_reply.count("~~~") % 2 == 1)
    if not _final_in_code:
        rest = _strip_md_for_tts(sentence_buf.strip())
        if rest and any(c.isalpha() for c in rest) and len(rest) > 2:
            tts_task = asyncio.create_task(_synth_chunk(rest, emotion, tts_lang, karr=karr_active))
            tts_items.append(tts_task)
            send_tasks.append(asyncio.create_task(_send_audio(tts_task, rest)))

    full_reply_clean = re.sub(r'<think>.*?</think>', '', full_reply, flags=re.DOTALL)
    full_reply_clean = re.sub(r'<\|[^|]+\|>', '', full_reply_clean)
    full_reply_clean = _strip_kitt_tags(full_reply_clean).strip()
    if not full_reply_clean:
        full_reply_clean = full_reply.strip()

    conversations[session_id].append({"role": "user", "content": user_msg})
    conversations[session_id].append({"role": "assistant", "content": full_reply_clean})

    if _MEMORY_FORGET.search(user_msg):
        clear_memory_for_user(user_display, smac)
    else:
        fact = extract_memory_fact(user_msg, user_display)
        if fact:
            add_memory(fact, user_display, smac)

    _message_count += 1
    if _message_count % CACHE_CLEAR_EVERY == 0 and _read_ram_available_mb() < RAM_CLEAR_THRESHOLD_MB:
        await asyncio.get_running_loop().run_in_executor(None, _clear_ram_cache)

    asyncio.create_task(broadcast_monitor({"type": "assistant_msg", "user": user_display, "session_id": session_id, "message": full_reply}))

    async def _auto_save():
        try:
            name = _get_user_name(smac) or user_display or "inconnu"
            safe = _conv_safe(name)
            user_dir = CONV_STORE_DIR / safe
            user_dir.mkdir(exist_ok=True)
            ts_day = datetime.now().strftime('%Y-%m-%d')
            fpath = user_dir / f"conv_{ts_day}.txt"
            ts_time = datetime.now().strftime('%H:%M')
            _is_new = not fpath.exists() or os.path.getsize(fpath) == 0
            with open(fpath, "a", encoding="utf-8") as f:
                if _is_new:
                    f.write(f"Conversation KITT — {name} — {ts_day}\n{'='*50}\n")
                f.write(f"[{ts_time}] {name.upper()}: {user_msg}\n")
                f.write(f"[{ts_time}] KITT: {full_reply_clean}\n")
        except Exception as e:
            print(f"[CONV] Erreur auto-save: {e}")

    asyncio.create_task(_auto_save())

    t_tts = time.time()
    if tts_items:
        await asyncio.gather(*tts_items, return_exceptions=True)
    if send_tasks:
        await asyncio.gather(*send_tasks, return_exceptions=True)
    tts_ms = (time.time() - t_tts) * 1000

    _llm_active -= 1

    timing = {'llm_ms': round(llm_ms), 'tts_ms': round(tts_ms), 'emotion': emotion}
    await resp.write(f"data: {json.dumps({'done': True, 'timing': timing})}\n\n".encode())
    await resp.write_eof()


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
    _smac = _client_key(request)
    user_lang_pref = _hard_lang(_get_user_lang(_smac))  # 'fr'/vide -> auto-détection
    # Priorité langue : préférence dure (non-fr) > langue Whisper client > détection texte
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

    user_display = body.get("user_name", "").strip() or get_user_display_name(request)

    # ── Notification Telegram à l'utilisateur ───────────────────────────────
    _touch_chat_session(session_id, user_display, "Kyronex /api/chat/stream")

    # ── Extinction vocale sécurisée par code (1982) — avant tout le reste ──
    _sd_reply, _sd_power = check_shutdown_flow(session_id, user_msg, user_display)
    if _sd_reply is not None:
        asyncio.create_task(broadcast_monitor({"type": "user_msg", "user": user_display, "session_id": session_id, "message": user_msg}))
        asyncio.create_task(broadcast_monitor({"type": "assistant_msg", "user": user_display, "session_id": session_id, "message": _sd_reply}))
        _conv_get_or_create(session_id)
        conversations[session_id].append({"role": "user", "content": user_msg})
        conversations[session_id].append({"role": "assistant", "content": _sd_reply})
        resp = web.StreamResponse()
        resp.headers["Content-Type"] = "text/event-stream"
        resp.headers["Cache-Control"] = "no-cache"
        resp.headers["X-Accel-Buffering"] = "no"
        await resp.prepare(request)
        await resp.write(f"data: {json.dumps({'token': _sd_reply})}\n\n".encode())
        _sd_karr = _karr_sessions.get(session_id, 0) > time.time()
        _sd_audio = await _synth_chunk(_sd_reply, "confident" if _sd_power else "normal", lang, karr=_sd_karr)
        if _sd_audio:
            await resp.write(f"data: {json.dumps({'audio_chunk': _sd_audio, 'chunk_text': _sd_reply})}\n\n".encode())
        await resp.write(f"data: {json.dumps({'done': True, 'timing': {'llm_ms': 0, 'tts_ms': 0, 'function': 'shutdown'}})}\n\n".encode())
        await resp.write_eof()
        if _sd_power:
            print("[SHUTDOWN] Code 1982 accepté → extinction du Jetson dans 8s", flush=True)
            _schedule_poweroff()
        return resp

    # Function calling — commandes directes sans LLM
    func_type, func_match = check_function_call(user_msg)
    if func_type:
        func_reply = await execute_function(func_type, func_match, user_display)
        asyncio.create_task(broadcast_monitor({"type": "user_msg", "user": user_display, "session_id": session_id, "message": user_msg}))
        asyncio.create_task(broadcast_monitor({"type": "assistant_msg", "user": user_display, "session_id": session_id, "message": func_reply}))

        _conv_get_or_create(session_id)
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

    llm_user_msg = user_msg
    if _needs_cot(user_msg):
        llm_user_msg = "Réfléchis étape par étape (en interne) avant de répondre. Donne uniquement la réponse finale, concise et naturelle à l'oreille. " + llm_user_msg

    _conv_get_or_create(session_id)

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
        _karr_sessions[session_id] = now_karr + 86400 * 365  # KARR permanent
        _kitt_sessions.discard(session_id)
        asyncio.create_task(send_proactive(
            "KARR confirme sa présence. Contrôle maintenu.",
            "confident"
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
        _kitt_sessions.add(session_id)
        asyncio.create_task(send_proactive("KITT en ligne. Mode de courtoisie activé.", "confident"))
        asyncio.create_task(broadcast_monitor({
            "type": "karr_mode", "active": False, "session_id": session_id
        }))
        _karr_payload = json.dumps({"type": "karr_mode", "active": False, "session_id": session_id})
        for _ws in list(_proactive_ws):
            try:
                asyncio.create_task(_ws.send_str(_karr_payload))
            except Exception:
                pass
    # Mode KARR supprimé (demande Manix 2026-05-28) — KITT est toujours le mode par défaut.
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

    resp = web.StreamResponse()
    resp.headers["Content-Type"] = "text/event-stream"
    resp.headers["Cache-Control"] = "no-cache"
    await resp.prepare(request)
    await _llm_stream_reply(resp, user_msg, session_id, lang, user_lang_pref, user_display, _smac, _gps_context, karr_active, llm_user_msg)
    return resp



async def handle_prefill(request: web.Request) -> web.Response:
    """POST /api/prefill — Prechauffe le KV cache LLM pendant que l'user parle."""
    try:
        data = await request.json()
        session_id = data.get("session_id", "")
        sess = _active_sessions.get(session_id, {})
        user_name = sess.get("name", "")
        lang = sess.get("lang", "fr")
        mac = sess.get("mac", "")
        sys_prompt = get_system_prompt(user_name, lang, mac)
        asyncio.ensure_future(_do_llm_prefill(sys_prompt))
    except Exception:
        pass
    return web.Response(text="ok")


async def _do_llm_prefill(sys_prompt: str) -> None:
    """Lance une completion minimale pour precharger le KV cache."""
    try:
        payload = {
            "model": LLM_MODEL,
            "messages": [
                {"role": "system", "content": sys_prompt},
                {"role": "user", "content": "?"}
            ],
            "max_tokens": 1,
            "stream": False,
        }
        session = await get_llm_session()
        async with session.post(
            f"{LLAMA_SERVER}/v1/chat/completions",
            json=payload,
            timeout=aiohttp_client.ClientTimeout(total=8)
        ) as r:
            await r.read()
    except Exception:
        pass


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
    _mac = _client_key(request)
    _stt_lang, _stt_hint = _stt_lang_hint(_hard_lang(_get_user_lang(_mac)))  # auto si fr/pas de préférence

    t0 = time.time()
    try:
        vlog("STT_START")
        segments, info = whisper_model.transcribe(
            tmp_path,
            language=_stt_lang,
            beam_size=1,
            best_of=1,
            vad_filter=True,
            vad_parameters={
                "threshold": 0.35,
                "min_silence_duration_ms": 400,
                "speech_pad_ms": 200,
                "min_speech_duration_ms": 150,
            },
            temperature=0,
            condition_on_previous_text=False,
            no_speech_threshold=0.5,
            initial_prompt=_stt_hint,
        )
        text = " ".join(seg.text.strip() for seg in segments).strip()
        stt_ms = (time.time() - t0) * 1000

        vlog(f"STT_DONE {stt_ms:.0f}ms lang={info.language}({info.language_probability:.2f})")
        print(f"[STT] {stt_ms:.0f}ms | lang={info.language}({info.language_probability:.2f}) | {text[:80]}")
    except Exception as e:
        vlog(f"STT_ERROR {e}")
        os.unlink(tmp_path)
        return web.json_response({"error": f"STT erreur: {e}"}, status=500)

    os.unlink(tmp_path)

    # Filtre anti-hallucination Whisper (mots répétés + phrases connues + boucles n-grammes)
    _words = text.split()
    _hallucination = False
    if len(_words) >= 3:
        _unique = len(set(w.strip(".,!?") for w in _words))
        if _unique <= 2:
            _hallucination = True
    # Boucles de répétition (trigrammes répétés >50%)
    if not _hallucination and len(_words) > 8:
        tgrams = [" ".join(_words[i:i+3]) for i in range(len(_words) - 2)]
        if len(set(tgrams)) < len(tgrams) * 0.5:
            _hallucination = True
    _HALLU_PHRASES = {"jetson", "merci", "thank you", "thanks", "sous-titres",
                      "subtitles", "", "s'il vous plaît", "au revoir", "bonne journée"}
    if text.lower().strip(" .!?,") in _HALLU_PHRASES:
        _hallucination = True
    if _hallucination:
        print(f"[STT] Hallucination filtree: {text[:60]!r}", flush=True)
        return web.json_response({"text": "", "language": info.language, "stt_ms": round(stt_ms)})

    # ── Collecte dataset Manix (si texte propre ≥4 mots et utilisateur Manix) ──
    user_name = _get_user_name(_mac).lower()
    if text and len(text.split()) >= 4 and "manix" in user_name:
        try:
            import shutil
            # Numéro du prochain échantillon
            existing = list(MANIX_WAVS_DIR.glob("*.wav"))
            idx = len(existing) + 1
            wav_id = f"manix_{idx:05d}"
            dst_wav = MANIX_WAVS_DIR / f"{wav_id}.wav"
            # Réécrire le WAV depuis audio_data (déjà en mémoire)
            with open(dst_wav, "wb") as fw:
                fw.write(audio_data)
            # Ajouter la ligne dans metadata.csv (format piper: id|texte)
            with open(MANIX_META_FILE, "a", encoding="utf-8") as fm:
                fm.write(f"{wav_id}|{text}\n")
            print(f"[DATASET] Sample {idx}: {text[:60]!r}", flush=True)
        except Exception as e:
            print(f"[DATASET] Erreur sauvegarde: {e}", flush=True)

    return web.json_response({"text": text, "language": info.language, "stt_ms": round(stt_ms)})


# ── STT PARTIEL (streaming) : transcription SEULE, rapide, pour affichage live ──
_stt_partial_busy = False  # garde anti-empilement (1 transcription partielle à la fois)

async def handle_stt_partial(request: web.Request) -> web.Response:
    """POST /api/stt-partial — Transcrit un extrait audio PENDANT que l'utilisateur parle
    (mode auto / streaming STT). Purement ADDITIF : ne touche ni /api/stt ni /api/stt-chat.
    Renvoie toujours {text} (jamais 500), et {busy:true} si une transcription tourne déjà."""
    global _stt_partial_busy
    if _stt_partial_busy:
        return web.json_response({"text": "", "busy": True})
    reader = await request.multipart()
    audio_data = None
    while True:
        part = await reader.next()
        if part is None:
            break
        if part.name == "audio":
            audio_data = await part.read()
    if not audio_data:
        return web.json_response({"text": ""})
    _stt_partial_busy = True
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            f.write(audio_data)
            tmp_path = f.name
        # Transcription live : auto-détection de langue (affichage uniquement).
        segments, info = whisper_model.transcribe(
            tmp_path,
            language=None,
            beam_size=1,
            best_of=1,
            vad_filter=True,
            vad_parameters={"threshold": 0.35, "min_silence_duration_ms": 400,
                            "speech_pad_ms": 200, "min_speech_duration_ms": 150},
            temperature=0,
            condition_on_previous_text=False,
            no_speech_threshold=0.5,
            initial_prompt=None,
        )
        text = " ".join(seg.text.strip() for seg in segments).strip()
        return web.json_response({"text": text, "partial": True})
    except Exception as e:
        vlog(f"STT_PARTIAL_ERROR {e}")
        return web.json_response({"text": ""})
    finally:
        _stt_partial_busy = False
        if tmp_path:
            try: os.unlink(tmp_path)
            except Exception: pass


async def handle_stt_chat(request: web.Request) -> web.StreamResponse:
    """POST /api/stt-chat — STT + streaming chat en un seul aller-retour SSE.
    Élimine le double round-trip HTTP (stt → chat/stream).
    Flux SSE : {stt, language, stt_ms} puis tokens/audio/done comme /api/chat/stream.
    """
    # ── Lecture multipart ─────────────────────────────────────────────────
    reader = await request.multipart()
    audio_data = None
    session_id = "default"
    gps_text = ""
    lat = lon = None

    while True:
        part = await reader.next()
        if part is None:
            break
        name = part.name or ""
        if name == "audio":
            audio_data = await part.read()
        elif name == "session_id":
            session_id = (await part.read()).decode(errors="ignore").strip() or "default"
        elif name == "gps_text":
            gps_text = (await part.read()).decode(errors="ignore").strip()
        elif name == "lat":
            try: lat = float((await part.read()).decode())
            except Exception: pass
        elif name == "lon":
            try: lon = float((await part.read()).decode())
            except Exception: pass

    if not audio_data:
        return web.json_response({"error": "Pas d'audio reçu"}, status=400)

    # ── Résolution IP/MAC (avant préparation SSE) ─────────────────────────
    _sp = request.transport.get_extra_info("peername")
    _sip = _sp[0] if _sp else "inconnu"
    _smac = _client_key(request)
    user_lang_pref = _hard_lang(_get_user_lang(_smac))  # 'fr'/vide -> auto-détection

    # ── Démarrer la réponse SSE AVANT Whisper — connexion TCP établie ─────
    resp = web.StreamResponse()
    resp.headers["Content-Type"] = "text/event-stream"
    resp.headers["Cache-Control"] = "no-cache"
    resp.headers["X-Accel-Buffering"] = "no"
    await resp.prepare(request)

    # ── Whisper STT ───────────────────────────────────────────────────────
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        f.write(audio_data)
        tmp_path = f.name

    t0_stt = time.time()
    try:
        vlog("STT_START(stt-chat)")
        _stt_lang, _stt_hint = _stt_lang_hint(user_lang_pref)  # auto si pas de préférence
        segments, info = whisper_model.transcribe(
            tmp_path,
            language=_stt_lang,
            beam_size=1,
            best_of=1,
            vad_filter=True,
            vad_parameters={
                "threshold": 0.35,
                "min_silence_duration_ms": 400,
                "speech_pad_ms": 200,
                "min_speech_duration_ms": 150,
            },
            temperature=0,
            condition_on_previous_text=False,
            no_speech_threshold=0.5,
            initial_prompt=_stt_hint,
        )
        text = " ".join(seg.text.strip() for seg in segments).strip()
        stt_ms = (time.time() - t0_stt) * 1000
        vlog(f"STT_DONE(stt-chat) {stt_ms:.0f}ms lang={info.language}")
        print(f"[STT-CHAT] {stt_ms:.0f}ms | lang={info.language}({info.language_probability:.2f}) | {text[:80]}")
    except Exception as e:
        vlog(f"STT_ERROR(stt-chat) {e}")
        os.unlink(tmp_path)
        await resp.write(f"data: {json.dumps({'stt': '', 'error': str(e), 'done': True})}\n\n".encode())
        await resp.write_eof()
        return resp

    os.unlink(tmp_path)

    # ── Filtre anti-hallucination ─────────────────────────────────────────
    _words = text.split()
    _hallucination = False
    if len(_words) >= 3:
        _unique = len(set(w.strip(".,!?") for w in _words))
        if _unique <= 2:
            _hallucination = True
    if not _hallucination and len(_words) > 8:
        tgrams = [" ".join(_words[i:i+3]) for i in range(len(_words) - 2)]
        if len(set(tgrams)) < len(tgrams) * 0.5:
            _hallucination = True
    _HALLU_PHRASES = {"jetson", "merci", "thank you", "thanks", "sous-titres",
                      "subtitles", "", "s'il vous plaît", "au revoir", "bonne journée"}
    if text.lower().strip(" .!?,") in _HALLU_PHRASES:
        _hallucination = True

    if _hallucination:
        print(f"[STT-CHAT] Hallucination filtrée: {text[:60]!r}", flush=True)
        await resp.write(f"data: {json.dumps({'stt': '', 'language': info.language, 'done': True})}\n\n".encode())
        await resp.write_eof()
        return resp

    # ── Envoyer le résultat STT en premier événement ──────────────────────
    await resp.write(f"data: {json.dumps({'stt': text, 'language': info.language, 'stt_ms': round(stt_ms)})}\n\n".encode())

    if not text:
        await resp.write(f"data: {json.dumps({'stt': '', 'done': True})}\n\n".encode())
        await resp.write_eof()
        return resp

    # ── Collecte dataset Manix ────────────────────────────────────────────
    _user_name_ds = _get_user_name(_smac).lower()
    if text and len(text.split()) >= 4 and "manix" in _user_name_ds:
        try:
            existing = list(MANIX_WAVS_DIR.glob("*.wav"))
            idx = len(existing) + 1
            wav_id = f"manix_{idx:05d}"
            dst_wav = MANIX_WAVS_DIR / f"{wav_id}.wav"
            with open(dst_wav, "wb") as fw:
                fw.write(audio_data)
            with open(MANIX_META_FILE, "a", encoding="utf-8") as fm:
                fm.write(f"{wav_id}|{text}\n")
            print(f"[DATASET] Sample {idx}: {text[:60]!r}", flush=True)
        except Exception as e:
            print(f"[DATASET] Erreur sauvegarde: {e}", flush=True)

    # ══════════════════════════════════════════════════════════════════════
    # ── Chat stream (miroir de handle_chat_stream, resp déjà préparé) ────
    # ══════════════════════════════════════════════════════════════════════
    user_msg = text
    lang = user_lang_pref if user_lang_pref else _map_whisper_lang(info.language)
    client_lang = info.language

    _gps_context = ""
    if gps_text:
        _gps_context = f"[POSITION GPS: {gps_text}]"
    elif lat is not None and lon is not None:
        try:
            import geo_offline
            if geo_offline.is_ready():
                _gr = geo_offline.reverse(float(lat), float(lon))
                if _gr:
                    _parts = [p for p in [_gr.get("road"), _gr.get("city")] if p]
                    if _parts:
                        _gps_context = f"[POSITION GPS: {', '.join(_parts)}]"
        except Exception:
            pass

    global _last_interaction_time
    _last_interaction_time = time.time()
    global _kitt_pending_question, _kitt_question_asked_at
    if _kitt_pending_question and (time.time() - _kitt_question_asked_at) < 600:
        _kitt_pending_question = ""

    user_display = get_user_display_name(request)

    # ── Notification Telegram à l'utilisateur ───────────────────────────────
    _touch_chat_session(session_id, user_display, "Kyronex /api/stt-chat")

    # ── Extinction vocale sécurisée par code (1982) — avant tout le reste ──
    # (resp est DÉJÀ préparé ici, contrairement à handle_chat_stream)
    _sd_reply, _sd_power = check_shutdown_flow(session_id, user_msg, user_display)
    if _sd_reply is not None:
        asyncio.create_task(broadcast_monitor({"type": "user_msg", "user": user_display, "session_id": session_id, "message": user_msg}))
        asyncio.create_task(broadcast_monitor({"type": "assistant_msg", "user": user_display, "session_id": session_id, "message": _sd_reply}))
        _conv_get_or_create(session_id)
        conversations[session_id].append({"role": "user", "content": user_msg})
        conversations[session_id].append({"role": "assistant", "content": _sd_reply})
        await resp.write(f"data: {json.dumps({'token': _sd_reply})}\n\n".encode())
        _sd_karr = _karr_sessions.get(session_id, 0) > time.time()
        _sd_audio = await _synth_chunk(_sd_reply, "confident" if _sd_power else "normal", lang, karr=_sd_karr)
        if _sd_audio:
            await resp.write(f"data: {json.dumps({'audio_chunk': _sd_audio, 'chunk_text': _sd_reply})}\n\n".encode())
        await resp.write(f"data: {json.dumps({'done': True, 'timing': {'llm_ms': 0, 'tts_ms': 0, 'function': 'shutdown'}})}\n\n".encode())
        await resp.write_eof()
        if _sd_power:
            print("[SHUTDOWN] Code 1982 accepté (voix desktop) → extinction du Jetson dans 8s", flush=True)
            _schedule_poweroff()
        return resp

    # Function calling
    func_type, func_match = check_function_call(user_msg)
    if func_type:
        func_reply = await execute_function(func_type, func_match, user_display)
        asyncio.create_task(broadcast_monitor({"type": "user_msg", "user": user_display, "session_id": session_id, "message": user_msg}))
        asyncio.create_task(broadcast_monitor({"type": "assistant_msg", "user": user_display, "session_id": session_id, "message": func_reply}))
        _conv_get_or_create(session_id)
        conversations[session_id].append({"role": "user", "content": user_msg})
        conversations[session_id].append({"role": "assistant", "content": func_reply})
        await resp.write(f"data: {json.dumps({'token': func_reply})}\n\n".encode())
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
        return resp

    llm_user_msg = user_msg
    if _needs_cot(user_msg):
        llm_user_msg = "Réfléchis étape par étape (en interne) avant de répondre. Donne uniquement la réponse finale, concise et naturelle à l'oreille. " + llm_user_msg
    _conv_get_or_create(session_id)

    _is_new_session = session_id not in _session_journal
    if _is_new_session:
        _session_journal[session_id] = {"user": user_display, "start": time.time(), "msgs": 0}
    _session_journal[session_id]["msgs"] += 1
    _session_journal[session_id]["user"] = user_display

    _tg_key = f"{user_display}:{session_id[:8]}"
    _tg_now = time.time()
    if _is_new_session and (_tg_now - _tg_session_cooldown.get(_tg_key, 0)) > _TG_COOLDOWN_S:
        _tg_session_cooldown[_tg_key] = _tg_now
        _tg_user = user_display or "Inconnu"
        _tg_ip = request.headers.get("X-Forwarded-For", request.remote or "?")
        _tg_msg = f"\U0001f7e2 KITT — Nouvelle session\n👤 {_tg_user}\n🌐 {_tg_ip}\n🕐 {__import__('datetime').datetime.now().strftime('%H:%M:%S')}"
        asyncio.create_task(_telegram_alert(_tg_msg))

    now_karr = time.time()
    karr_expiry = _karr_sessions.get(session_id, 0)
    if _KARR_TRIGGERS.search(user_msg):
        _karr_sessions[session_id] = now_karr + 86400 * 365
        _kitt_sessions.discard(session_id)
        asyncio.create_task(send_proactive("KARR confirme sa présence. Contrôle maintenu.", "confident"))
        asyncio.create_task(_telegram_alert(
            f"⚠️ KARR ACTIVÉ par {user_display or 'Inconnu'}\n"
            f"\U0001f552 {__import__('datetime').datetime.now().strftime('%H:%M:%S')}"
        ))
        asyncio.create_task(broadcast_monitor({"type": "karr_mode", "active": True, "session_id": session_id}))
        _karr_payload = json.dumps({"type": "karr_mode", "active": True, "session_id": session_id})
        for _ws in list(_proactive_ws):
            try: asyncio.create_task(_ws.send_str(_karr_payload))
            except Exception: pass
    elif _KARR_RESTORE.search(user_msg) or now_karr > karr_expiry > 0:
        if session_id in _karr_sessions:
            del _karr_sessions[session_id]
        _kitt_sessions.add(session_id)
        asyncio.create_task(send_proactive("KITT en ligne. Mode de courtoisie activé.", "confident"))
        asyncio.create_task(broadcast_monitor({"type": "karr_mode", "active": False, "session_id": session_id}))
        _karr_payload = json.dumps({"type": "karr_mode", "active": False, "session_id": session_id})
        for _ws in list(_proactive_ws):
            try: asyncio.create_task(_ws.send_str(_karr_payload))
            except Exception: pass
    # Mode KARR supprimé (demande Manix 2026-05-28) — KITT est toujours le mode par défaut.
    karr_active = _karr_sessions.get(session_id, 0) > now_karr

    asyncio.create_task(broadcast_monitor({"type": "user_msg", "user": user_display, "session_id": session_id, "message": user_msg}))

    await _llm_stream_reply(resp, user_msg, session_id, lang, user_lang_pref, user_display, _smac, _gps_context, karr_active, llm_user_msg)
    return resp


async def handle_check_code(request: web.Request) -> web.Response:
    """POST /api/check-code — validation syntaxique rapide d'un bloc de code.
    Body JSON: {"code": "...", "lang": "python|json|..."}
    Retourne: {"ok": bool, "errors": [str, ...], "lang": str}
    Pas d'execution — uniquement parse statique (Python via ast, JSON via json.loads).
    """
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"ok": False, "errors": ["payload JSON invalide"], "lang": ""}, status=400)
    code = (body.get("code") or "").strip()
    lang = (body.get("lang") or "").lower().strip()
    if not code:
        return web.json_response({"ok": True, "errors": [], "lang": lang})
    if len(code) > 200_000:
        return web.json_response({"ok": False, "errors": ["code trop long (>200k caracteres)"], "lang": lang})
    errors = []
    checked = False
    if lang in ("python", "py", "py3"):
        checked = True
        try:
            ast.parse(code)
        except SyntaxError as e:
            line = getattr(e, "lineno", "?")
            col = getattr(e, "offset", "?")
            errors.append(f"SyntaxError ligne {line}, col {col}: {e.msg}")
        except Exception as e:
            errors.append(f"{type(e).__name__}: {e}")
    elif lang == "json":
        checked = True
        try:
            json.loads(code)
        except json.JSONDecodeError as e:
            errors.append(f"JSON ligne {e.lineno}, col {e.colno}: {e.msg}")
    # HTML/CSS/JS/SVG: pas de check serveur (l'iframe preview les exécute)
    return web.json_response({"ok": not errors, "errors": errors, "lang": lang, "checked": checked})


async def handle_health(request: web.Request) -> web.Response:
    llm_ok = False
    try:
        session = await get_llm_session()
        # Test llama-server health (port 8080)
        try:
            async with session.get(f"{LLAMA_SERVER}/health") as r:
                if r.status == 200:
                    data = await r.json()
                    llm_ok = data.get("status") == "ok"
        except Exception:
            # Fallback TRT-LLM OpenAI server (port 8082)
            try:
                async with session.post(
                    f"{LLAMA_SERVER}/v1/chat/completions",
                    json={"model": "qwen", "messages": [{"role": "user", "content": "."}], "max_tokens": 1}
                ) as r:
                    llm_ok = r.status == 200
            except Exception:
                pass
    except Exception:
        pass

    return web.json_response({
        "status": "en ligne" if llm_ok else "llm_hors_ligne",
        "kitt": "Knight Industries Two Thousand — opérationnel",
        "llm_server": llm_ok,
    })


async def handle_ocr(request: web.Request) -> web.Response:
    """POST /api/ocr — Lecture OCR du champ de vision, traitée par KITT.

    Corps JSON (tous les champs sont optionnels) :
        action : "lire" | "resumer" | "traduire" | "expliquer" | "analyser"
        lang   : langue cible pour l'action "traduire" (défaut : français)
        image  : chemin d'un fichier image (sinon : caméra en direct)

    Réponse JSON : ok, action, text (texte OCR brut), reply (réponse KITT),
                   n_lines, mean_conf, duplicate, ocr_ms, llm_ms.
    Pipeline : caméra -> ocr_engine (EasyOCR GPU) -> llama-server -> réponse.
    """
    # ── Lecture de la requête : 3 modes acceptés ──────────────────────────
    #   1. multipart/form-data  : upload de photo (champ image / photo / file)
    #   2. Content-Type image/* : le corps est l'image brute (octets)
    #   3. application/json     : {action, lang, image_b64 | image (chemin local)}
    action = "lire"
    target_lang = "français"
    image_path = None
    image_bytes = None
    ctype = (request.content_type or "").lower()

    try:
        if ctype.startswith("multipart/"):
            reader = await request.multipart()
            async for part in reader:
                if part.name == "action":
                    action = (await part.text()).strip().lower()
                elif part.name == "lang":
                    target_lang = (await part.text()).strip()
                elif part.name in ("image", "photo", "file"):
                    image_bytes = await part.read(decode=False)
                elif part.name == "image_b64":
                    import base64
                    image_bytes = base64.b64decode(await part.text())
        elif ctype.startswith("image/"):
            image_bytes = await request.read()
            action = str(request.query.get("action") or "lire").strip().lower()
            target_lang = str(request.query.get("lang") or "français").strip()
        else:
            body = await request.json()
            action = str(body.get("action") or "lire").strip().lower()
            target_lang = str(body.get("lang") or "français").strip()
            if body.get("image_b64"):
                import base64
                raw = str(body["image_b64"])
                if raw[:11] == "data:image/" and "," in raw:
                    raw = raw.split(",", 1)[1]      # retire le préfixe data:URI
                image_bytes = base64.b64decode(raw)
            elif body.get("image"):
                image_path = str(body["image"])
    except Exception as e:
        return web.json_response(
            {"ok": False, "error": f"requête illisible: {e}"}, status=400)

    import ocr_client

    # ── OCR : photo uploadée -> /dev/shm ; sinon fichier local ; sinon caméra ──
    tmp_upload = None
    try:
        if image_bytes is not None:
            if len(image_bytes) < 64:
                return web.json_response(
                    {"ok": False, "error": "image absente ou trop petite"},
                    status=400)
            # /dev/shm = RAM : rapide et sans usure du SSD
            tmp_upload = f"/dev/shm/kitt_ocr_upload_{uuid.uuid4().hex}.img"
            with open(tmp_upload, "wb") as fh:
                fh.write(image_bytes)
            ocr = await ocr_client.ocr_image(tmp_upload)
        elif image_path:
            ocr = await ocr_client.ocr_image(image_path)
        else:
            ocr = await ocr_client.capture(force=True)
    finally:
        if tmp_upload:
            try:
                os.unlink(tmp_upload)
            except OSError:
                pass

    if not ocr.get("ok"):
        return web.json_response(
            {"ok": False, "error": ocr.get("error", "OCR indisponible")},
            status=503)

    text = (ocr.get("text") or "").strip()
    ocr_ms = ocr.get("timing_ms", {}).get("total", 0)
    if not text:
        return web.json_response({
            "ok": True, "action": action, "text": "", "n_lines": 0,
            "reply": "Mes capteurs optiques ne distinguent aucun texte lisible.",
            "ocr_ms": ocr_ms, "llm_ms": 0,
        })

    # 2) Consigne -> message au LLM via le tag [VISION: ...] déjà géré par KITT
    consignes = {
        "lire":      "Restitue ce texte clairement et naturellement.",
        "resumer":   "Résume ce texte en deux phrases maximum.",
        "traduire":  f"Traduis intégralement ce texte en {target_lang}.",
        "expliquer": "Explique simplement, en quelques phrases, ce que dit ce texte.",
        "analyser":  "Analyse ce texte : relève l'information importante et toute anomalie.",
    }
    consigne = consignes.get(action, consignes["lire"])
    user_msg = (f"[VISION: {consigne} "
                f"Voici le texte capté par tes capteurs optiques :\n\n{text}\n]")

    # 3) Appel direct au llama-server (pas de RAG/web : c'est de la lecture OCR)
    reply, llm_ms = "", 0
    try:
        payload = {
            "model": "qwen",
            "messages": [
                {"role": "system", "content": get_system_prompt()},
                {"role": "user", "content": user_msg},
            ],
            "temperature": 0.5, "max_tokens": 256, "top_p": 0.9,
            "stream": False,
        }
        t0 = time.time()
        session = await get_llm_session()
        async with session.post(f"{LLAMA_SERVER}/v1/chat/completions",
                                json=payload) as r:
            if r.status != 200:
                raise RuntimeError(f"statut {r.status}")
            data = await r.json()
        reply = data["choices"][0]["message"]["content"].strip()
        llm_ms = round((time.time() - t0) * 1000)
    except Exception as e:
        return web.json_response(
            {"ok": False, "error": f"LLM erreur: {e}", "text": text,
             "ocr_ms": ocr_ms}, status=502)

    # filtrage défensif d'un éventuel bloc de raisonnement
    reply = re.sub(r"(?is)<think>.*?</think>", "", reply).strip()

    print(f"[OCR] action={action} ocr={ocr_ms}ms llm={llm_ms}ms "
          f"lignes={ocr.get('n_lines', 0)} | {text[:60]!r}", flush=True)

    return web.json_response({
        "ok": True, "action": action, "text": text,
        "n_lines": ocr.get("n_lines", 0),
        "mean_conf": ocr.get("mean_conf", 0),
        "duplicate": ocr.get("duplicate", False),
        "lang_hint": ocr.get("lang_hint", ""),
        "reply": reply, "ocr_ms": ocr_ms, "llm_ms": llm_ms,
    })


async def _save_session_summary(mac: str, user_name: str, history: list):
    """Génère un résumé LLM de la session et le stocke dans user_memories."""
    try:
        msgs = [{"role": "system", "content": "Tu es un assistant de synthèse. Résume en 1 phrase courte (max 30 mots) la conversation ci-dessous. Réponds uniquement avec la phrase de résumé, sans introduction."}]
        msgs.extend(history[-6:])
        msgs.append({"role": "user", "content": "Résume en 1 phrase ce dont on a parlé dans cette conversation."})
        payload = {"model": "qwen", "messages": msgs, "temperature": 0.3, "max_tokens": 60, "top_p": 0.9, "stream": False}
        session = await get_llm_session()
        async with session.post(f"{LLAMA_SERVER}/v1/chat/completions", json=payload) as r:
            if r.status == 200:
                data = await r.json()
                summary = data["choices"][0]["message"]["content"].strip()
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
    _rmac = _client_key(request)
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
    _mmac = _client_key(request)
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


async def handle_set_voice(request: web.Request) -> web.Response:
    """POST /api/set-voice — Change la voix active côté serveur (kitt / guy_clean / manix)."""
    try:
        data = await request.json()
    except Exception:
        return web.json_response({"error": "JSON requis"}, status=400)
    global _active_voice
    v = (data.get("voice") or "").strip().lower()
    if v == "manix":
        _active_voice = "manix"
        get_manix_engine()
    elif v in ("guy_clean", "clean", "normal"):
        _active_voice = "guy_clean"
    elif v in ("kitt", "guy", ""):
        _active_voice = "kitt"
    else:
        return web.json_response({"error": f"Voix inconnue: {v}"}, status=400)
    print(f"[VOICE] set-voice → {_active_voice}", flush=True)
    return web.json_response({"ok": True, "voice": _active_voice})


async def handle_tts_manix(request: web.Request) -> web.Response:
    """Synthèse vocale via la voix Manix (manix_high.onnx)."""
    try:
        data = await request.json()
        text = (data.get("text") or "").strip()
    except Exception:
        return web.Response(status=400, text="JSON requis")
    if not text:
        return web.Response(status=400, text="Champ text vide")

    import uuid
    audio_id = uuid.uuid4().hex
    clean_path = AUDIO_DIR / f"{audio_id}_clean.wav"
    out_path   = AUDIO_DIR / f"{audio_id}_robot.wav"
    try:
        eng = get_manix_engine() or tts_engine
        # PiperGPU n'a pas de param lang
        if eng is not None and hasattr(eng, 'sample_rate'):
            eng.synthesize_to_wav(text, str(clean_path), length_scale=1.0, natural_pauses=True)
        else:
            eng.synthesize_to_wav(text, str(clean_path), length_scale=1.0, natural_pauses=True, lang="fr")
        apply_robot_effect_sox(str(clean_path), str(out_path), "karr")
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


# ── OBD-II état global (accessible partout, y compris system prompt) ─────
_obd_data: dict = {"connected": False, "port": None, "data": {}, "dtcs": [], "last_update": 0}
_obd_conn_global = None  # connexion OBD courante

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
    r".*?gpu@([\d.]+)C"
    r"(?:.*?(?:VDD_IN|VIN_SYS_5V0) (\d+)mW)?"
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


async def send_proactive(message: str, emotion: str = "normal", urgent: bool = False):
    """Envoie un message proactif à tous les clients connectés avec TTS."""
    if not _proactive_ws:
        return

    # Anti-superposition : sauf pour les alertes urgentes (OBD critique, etc.)
    global _last_interaction_time
    if not urgent:
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


# ── Salutations aléatoires pour nouvelles connexions ─────────────────────

_GREETING_TEMPLATES = [
    # Variantes pour Manix (créateur)
    ("Manix", [
        "Bonsoir Manix. Tous les systèmes sont opérationnels.",
        "Bonjour Manix. Je t'attendais.",
        "Manix. KITT en ligne. Prêt à partir.",
        "Conducteur identifié. Bienvenue à bord, Manix.",
        "Ah, te voilà. J'ai quelques données intéressantes à partager.",
        "Bienvenue, créateur. Les capteurs sont calibrés.",
    ]),
    # Variantes génériques pour invités connus
    (None, [
        "Bienvenue. Je t'écoute.",
        "Connexion établie. Que je peux faire pour toi ?",
        "Bonjour. KITT opérationnel.",
        "Tu es connecté. Parle-moi.",
        "Système en ligne. Je t'attends.",
        "Bonjour. Prêt à répondre.",
        "Connexion confirmée. Que tu veux savoir ?",
        "Bienvenue à bord. Mes circuits sont chauds.",
    ]),
]

async def _send_greeting_to_newcomer(name: str, session_id: str):
    """Envoie une salutation aléatoire à un nouveau visiteur après un délai.
    
    Attend 2 secondes pour laisser la page charger, puis envoie une salutation
    personnalisée si le nom est connu, ou générique sinon.
    """
    await asyncio.sleep(2.0)  # Laisser la page se charger
    
    # Choisir le template approprié
    greeting_list = None
    for template_name, template_greetings in _GREETING_TEMPLATES:
        if template_name and name and template_name.lower() in name.lower():
            greeting_list = template_greetings
            break
    
    if not greeting_list:
        # Prendre la liste générique (dernier élément avec None)
        for template_name, template_greetings in _GREETING_TEMPLATES:
            if template_name is None:
                greeting_list = template_greetings
                break
    
    if not greeting_list:
        return
    
    # Choisir aléatoirement une salutation
    import random
    greeting = random.choice(greeting_list)
    
    # Personnaliser avec le prénom si fourni et pas déjà dans la liste spécifique
    if name and greeting_list == _GREETING_TEMPLATES[-1][1]:  # Liste générique
        # Variantes avec prénom
        personalized = [
            f"Bienvenue {name}. Je t'écoute.",
            f"Bonjour {name}. KITT opérationnel.",
            f"{name}, tu es connecté. Parle-moi.",
            f"Bonjour {name}. Prêt à répondre.",
            f"{name}, bienvenue à bord.",
        ]
        greeting = random.choice(personalized)
    
    # Envoyer uniquement à cette session via WebSocket proactif
    if session_id in _active_sessions and _proactive_ws:
        try:
            audio_url = None
            try:
                audio_path = await text_to_speech(greeting, "normal", "fr")
                audio_url = f"/audio/{Path(audio_path).name}"
            except Exception as e:
                print(f"[GREETING] TTS erreur: {e}")
            
            payload = json.dumps({
                "type": "greeting",
                "message": greeting,
                "audio": audio_url,
                "emotion": "normal",
                "session_id": session_id,
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
            
            print(f"[GREETING] {name or 'Inconnu'}: {greeting[:60]}")
        except Exception as e:
            print(f"[GREETING] Erreur envoi: {e}")


def _read_gpu_temp() -> float:
    """Lit la température GPU/SoC."""
    try:
        with open("/sys/devices/virtual/thermal/thermal_zone0/temp") as f:
            return int(f.read().strip()) / 1000
    except Exception:
        return 0.0




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
                "power_mw":     int(m.group(6)) if m.group(6) else 0,
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
    """GET /api/stats -- état système + statistiques connexions (fusion)."""
    _prune_active_sessions()
    now_ts = time.time()
    ts_24h = now_ts - 86400
    ts_7d  = now_ts - 604800
    conns = _conn_stats.get("connections", [])
    seen_24h: set = set()
    seen_7d:  set = set()
    recent_ips: list = []
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
            "ip": s["ip"], "name": s["name"] or "?",
            "lang": s["lang"] or "?", "since": dt,
        })
    _karr_on = any(exp > now_ts for exp in _karr_sessions.values())
    _users_on = list({s.get("name", "?") for s in _active_sessions.values() if s.get("name")})
    return web.json_response({
        **_stats_cache,
        "llm_active":      _llm_active,
        "karr_active":     _karr_on,
        "session_users":   _users_on,
        "current":         len(_active_sessions),
        "sessions":        len(_active_sessions),
        "last_24h":        len(seen_24h),
        "last_7d":         len(seen_7d),
        "active_sessions": active_list,
        "recent_ips":      recent_ips[:10],
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
                    18: f"Bonsoir{_hello}. J'espère que ta journée a été productive.",
                    22: "Il est 22 heures. Je reste vigilant, mais tu devrais peut-être envisager du repos.",
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
    except Exception:
        pass


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
        return f"{_labels[action]} activé."
    except Exception:
        return "Lecteur VLC indisponible ou non lancé."


# ═══════════════════════════════════════════════════════════════════════════════
# ── TELEGRAM GARDIEN ──────────────────────────────────────────────────────────
# ═══════════════════════════════════════════════════════════════════════════════
_TELEGRAM_BOT_TOKEN = "8620445660:AAEpIf9G3Z9jyU7_CJdmz3iciHKYtVhZiag"
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


async def handle_chamaillarde(request: web.Request) -> web.Response:
    """POST /api/chamaillarde — Lance ou stoppe le dialogue KITT vs KARR."""
    body = {}
    try:
        body = await request.json()
    except Exception:
        pass
    if body.get("stop"):
        stopped = await _stop_chamaillarde()
        return web.json_response({"status": "stopped" if stopped else "not_running"})
    running = _chamaillarde_proc is not None and _chamaillarde_proc.returncode is None
    if running:
        return web.json_response({"status": "already_running"})
    turns = int(body.get("turns", 6))
    await _launch_chamaillarde(turns=turns)
    return web.json_response({"status": "started"})


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
            json={"model": "qwen", "messages": [{"role": "user", "content": prompt}],
                  "stream": False, "max_tokens": 512, "temperature": 0.6},
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

async def _notify_face_recognized(name: str, score: float = 0.0) -> dict:
    """Cooldown + broadcast WS auto-unlock + salutation KITT.

    Logique partagée entre l'endpoint POST /api/face-recognized et la boucle
    interne _face_greeting_loop qui lit l'état de face_service.py.
    """
    global _last_face_notify
    name = (name or "").strip()
    if not name:
        return {"ok": False, "error": "nom manquant"}
    name = name.capitalize()

    now = time.time()
    # Cooldown 5 minutes — évite le spam si la caméra détecte en boucle
    if now - _last_face_notify < 300:
        return {"ok": True, "skipped": True}
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

    # Message proactif KITT (TTS + chat) — personnalisé si profil disponible
    import random as _rnd_face
    greetings = {
        "Manix": [
            "Bonsoir Manix. Tous les systèmes sont opérationnels.",
            "Bonjour Manix. Je t'attendais.",
            "Manix. KITT en ligne. Prêt à partir.",
            "Conducteur identifié. Bienvenue à bord, Manix.",
        ],
    }
    if name not in greetings:
        # Charger profil pour personnaliser le message d'accueil
        profile = _load_face_profile(name)
        role = profile.get("role", "").strip()
        if role and role.lower() not in ("rien", "non", "no", ""):
            greetings[name] = [
                f"Conducteur {name} reconnu. {role.capitalize()}. Bienvenue.",
                f"{name} identifié. KITT opérationnel.",
            ]
        else:
            greetings[name] = [f"Conducteur {name} reconnu. KITT opérationnel."]

    msgs = greetings[name]
    asyncio.create_task(send_proactive(_rnd_face.choice(msgs), "confident"))
    return {"ok": True, "name": name}


async def handle_face_recognized(request: web.Request) -> web.Response:
    """POST /api/face-recognized — notifie kyronex qu'un conducteur est reconnu."""
    try:
        data = await request.json()
    except Exception:
        return web.json_response({"ok": False, "error": "JSON invalide"}, status=400)
    result = await _notify_face_recognized(
        data.get("name", ""), float(data.get("score", 0.0)))
    bad = (not result.get("ok")) and ("error" in result)
    return web.json_response(result, status=400 if bad else 200)


async def _face_greeting_loop():
    """Salue le propriétaire dès que la reconnaissance faciale le confirme.

    Lit l'état publié par face_service.py. Une seule salutation par visite ;
    une visite se termine après 30 s d'absence. Le cooldown de
    _notify_face_recognized (5 min) reste un garde-fou secondaire.
    """
    await asyncio.sleep(15)  # laisser face_service charger le modèle
    last_confirmed_ts = 0.0
    greeted_for_visit = False
    while True:
        try:
            st = _face_status()
            confirmed = bool(st.get("confirmed") and st.get("owner"))
            now = time.time()
            if confirmed:
                last_confirmed_ts = now
                if not greeted_for_visit:
                    score = 1.0 - float(st.get("last_distance", 1.0))
                    await _notify_face_recognized(st["owner"], score)
                    greeted_for_visit = True
            elif now - last_confirmed_ts > 30:
                greeted_for_visit = False  # prochaine apparition = nouvelle visite
        except Exception as e:
            print(f"[FACE] boucle salutation : {e}", flush=True)
        await asyncio.sleep(3)


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
_VIDEO_FILE = Path("/home/kitt/kitt-ai/video_submissions.json")
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
    if not vid_id or action not in ("approve", "reject"):
        return _video_cors(web.json_response({"ok": False, "error": "Paramètres invalides"}, status=400))
    data = _video_load()
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

MUSIC_FILE = "/home/kitt/kitt-ai/music_submissions.json"
PDF_FILE   = "/home/kitt/kitt-ai/pdf_submissions.json"

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
_TELEGRAM_TOKEN_NEW = "8620445660:AAEpIf9G3Z9jyU7_CJdmz3iciHKYtVhZiag"
_TELEGRAM_CHAT_NEW  = "8591807736"

async def _send_telegram_new(text):
    url = "https://api.telegram.org/bot" + _TELEGRAM_TOKEN_NEW + "/sendMessage"
    try:
        async with _aiohttp_mod.ClientSession() as s:
            await s.post(url, json={"chat_id": _TELEGRAM_CHAT_NEW, "text": text})
    except Exception:
        pass

# ─── Notification Telegram pour sessions IA (début + résumé après inactivité) ───
_CHAT_SUMMARY_DELAY = 120  # secondes d'inactivité avant résumé
_chat_sessions_tracker = {}  # session_id -> {"user": str, "task": asyncio.Task, "notified_start": bool}

async def _send_chat_start_telegram(user, source="Kyronex"):
    """Notification de début de session IA."""
    text = ("🤖 KITT est en cours d'utilisation" + chr(10) +
            "👤 Utilisateur : " + str(user or "Anonyme") + chr(10) +
            "📍 Source : " + str(source) + chr(10) +
            "⏱️ Un résumé sera envoyé après 2 min d'inactivité.")
    await _send_telegram_new(text)

async def _send_chat_summary_telegram(session_id):
    """Envoie un résumé condensé de la conversation terminée."""
    tracker = _chat_sessions_tracker.pop(session_id, None)
    if not tracker:
        return
    user = tracker.get("user") or "Anonyme"
    conv = conversations.get(session_id, [])
    if not conv:
        return

    user_msgs = [m["content"] for m in conv if m.get("role") == "user"]
    assistant_msgs = [m["content"] for m in conv if m.get("role") == "assistant"]

    text = ("✅ Conversation terminée" + chr(10) +
            "👤 Utilisateur : " + str(user) + chr(10) +
            "💬 Messages échangés : " + str(len(user_msgs)) + chr(10) +
            "⏱️ Durée : ~2 min d'inactivité" + chr(10) + chr(10) +
            "📝 Résumé des questions / sujets :")

    for i, msg in enumerate(user_msgs[-10:], 1):
        snippet = msg[:90] + "..." if len(msg) > 90 else msg
        text += chr(10) + str(i) + ". " + snippet

    if assistant_msgs:
        text += (chr(10) + chr(10) + "🤖 Dernière réponse de KITT :" + chr(10) +
                 assistant_msgs[-1][:250])

    await _send_telegram_new(text)

async def _chat_summary_scheduler(session_id):
    """Attend 2 min d'inactivité puis envoie le résumé."""
    await asyncio.sleep(_CHAT_SUMMARY_DELAY)
    await _send_chat_summary_telegram(session_id)

def _touch_chat_session(session_id, user, source="Kyronex"):
    """Marque l'activité sur une session : notifie au début, programme le résumé."""
    if session_id not in _chat_sessions_tracker:
        _chat_sessions_tracker[session_id] = {"user": user, "task": None, "notified_start": False, "source": source}
        asyncio.create_task(_send_chat_start_telegram(user, source))

    tracker = _chat_sessions_tracker[session_id]
    tracker["user"] = user
    tracker["source"] = source
    tracker["last_time"] = time.time()

    if tracker["task"] is not None:
        tracker["task"].cancel()
    tracker["task"] = asyncio.create_task(_chat_summary_scheduler(session_id))

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

async def handle_rebuild_cache(request: web.Request) -> web.Response:
    """Reconstruit le cache audio en arrière-plan."""
    import threading as _t
    _t.Thread(target=_build_phrase_cache, daemon=True).start()
    return web.json_response({"status": "reconstruction en cours", "phrases": len(_CACHED_PHRASES)})

async def handle_voice_status(request: web.Request) -> web.Response:
    """Retourne l'état du cache audio."""
    return web.json_response({
        "active_voice": _active_voice,
        "cache_phrases": len(_PHRASE_CACHE),
    })


# ── Reconnaissance faciale (service externe face/face_service.py) ─────────
# Le serveur tourne dans un venv sans insightface ; la reco tourne dans un
# process séparé (python système) qui publie son état dans /dev/shm.
_FACE_STATE_PATH = "/dev/shm/kitt_face.json"
_FACE_SERVICE = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                             "face", "face_service.py")
_face_service_proc = None

# Caméra live désactivée — le service de reconnaissance faciale (caméra ouverte
# en continu + insightface en VRAM) sollicite trop le GPU du Jetson.
# Repasser à True pour réactiver la caméra live et les salutations par visage.
FACE_SERVICE_ENABLED = False


def _face_status() -> dict:
    """État publié par face_service.py — {} si absent ou périmé (>5s)."""
    try:
        if time.time() - os.path.getmtime(_FACE_STATE_PATH) > 5.0:
            return {}
        with open(_FACE_STATE_PATH) as f:
            return json.load(f)
    except Exception:
        return {}


async def handle_face_status(request: web.Request) -> web.Response:
    """GET /api/face/status — état de la reconnaissance faciale."""
    st = _face_status()
    return web.json_response({
        "enabled": bool(st),
        "owner": st.get("owner"),
        "confirmed": st.get("confirmed", False),
        "distance": st.get("last_distance"),
        "fps": st.get("fps"),
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
    app.router.add_post("/api/set-voice", handle_set_voice)
    app.router.add_post("/api/tts/manix", handle_tts_manix)
    app.router.add_post("/api/chat", handle_chat)
    app.router.add_post("/api/chat/stream", handle_chat_stream)
    app.router.add_get("/api/health", handle_health)
    app.router.add_post("/api/ocr", handle_ocr)
    app.router.add_post("/api/check-code", handle_check_code)
    app.router.add_post("/api/reset", handle_reset)
    app.router.add_post("/api/prefill",  handle_prefill)
    app.router.add_post("/api/stt", handle_stt)
    app.router.add_post("/api/stt-chat", handle_stt_chat)
    app.router.add_post("/api/stt-partial", handle_stt_partial)  # streaming STT (transcription live)
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
    app.router.add_post("/api/chamaillarde", handle_chamaillarde)
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


    # ── OBD-II Surveillance véhicule — protocole ALDL 8192 baud (Firebird Trans Am) ──
    _obd_alert_ts: dict = {}
    OBD_PORTS = ["/dev/ttyUSB0", "/dev/ttyUSB1", "/dev/ttyACM0", "/dev/ttyACM1"]
    OBD_POLL  = 5    # secondes entre lectures
    OBD_RETRY = 30   # secondes entre tentatives de reconnexion

    async def _obd_alert(key: str, msg: str, emotion: str = "worried", cooldown: int = 300, urgent: bool = False):
        now = time.time()
        if now - _obd_alert_ts.get(key, 0) > cooldown:
            _obd_alert_ts[key] = now
            await send_proactive(msg, emotion, urgent=urgent)

    async def _obd_check_thresholds(data: dict, dtcs: list):
        temp = data.get("temp_coolant")
        if temp is not None:
            if temp >= 115:
                await _obd_alert("cool_crit", f"Alerte critique ! Température moteur à {temp:.0f}°C ! Arrêtez le véhicule immédiatement !", "worried", 120, urgent=True)
            elif temp >= 100:
                await _obd_alert("cool_warn", f"Attention. Température moteur élevée : {temp:.0f}°C. Je surveille.", "worried")

        volt = data.get("voltage")
        if volt is not None:
            if volt < 11.0:
                await _obd_alert("volt_crit", f"Alerte batterie critique ! Tension à {volt:.1f}V. Vérifiez l'alternateur immédiatement.", "worried", 120, urgent=True)
            elif volt < 12.0:
                await _obd_alert("volt_warn", f"Tension batterie basse : {volt:.1f}V. L'alternateur mérite une vérification.", "worried")

        for dtc in dtcs:
            code = dtc.get("code", str(dtc))
            await _obd_alert(f"dtc_{code}",
                f"Code défaut détecté : {code}. Tu veux que je t'explique ce que ça signifie ?",
                "worried", 600, urgent=True)

    async def obd_monitor_loop():
        global _obd_data
        try:
            from obd.plugins.firebird_aldl import FirebirdALDLService
        except Exception as e:
            print(f"[OBD] Plugin ALDL indisponible : {e}")
            return

        print("[OBD] Surveillance ALDL Firebird démarrée (8192 baud).")
        svc = FirebirdALDLService()
        connected = False

        while True:
            # Exclure le port de la carte relais : l'OBD ne doit JAMAIS le saisir
            # (sinon conflit + risque d'octets parasites déclenchant des relais).
            _relay_port = (RELAY_BOARD.port_path() if (RELAY_AVAILABLE and RELAY_BOARD) else None)
            port = next((p for p in OBD_PORTS if Path(p).exists() and p != _relay_port), None)

            if not port:
                if connected:
                    svc.deactivate()
                    connected = False
                    _obd_data["connected"] = False
                    print("[OBD] Adaptateur débranché.")
                await asyncio.sleep(OBD_RETRY)
                continue

            if not connected:
                try:
                    result = await asyncio.to_thread(svc.activate_real, port)
                    if result.get("success"):
                        connected = True
                        _obd_data["connected"] = True
                        _obd_data["port"]      = port
                        _obd_data["protocol"]  = result.get("protocol", "ALDL 8192 baud")
                        print(f"[OBD] {result.get('message')}")
                        await _obd_alert("connect",
                            "Connexion véhicule établie. Surveillance moteur active — protocole ALDL.",
                            "confident", 60)
                    else:
                        print(f"[OBD] Connexion échouée : {result.get('message')}")
                        await asyncio.sleep(OBD_RETRY)
                        continue
                except Exception as e:
                    print(f"[OBD] Erreur connexion : {e}")
                    await asyncio.sleep(OBD_RETRY)
                    continue

            # Lecture capteurs
            try:
                data = await asyncio.to_thread(svc.get_data)
                dtcs = await asyncio.to_thread(svc.get_dtc)
                if data:
                    _obd_data["data"]        = data
                    _obd_data["dtcs"]        = dtcs
                    _obd_data["last_update"] = time.time()
                    await _obd_check_thresholds(data, dtcs)
            except Exception as e:
                print(f"[OBD] Erreur lecture : {e}")
                connected = False
                _obd_data["connected"] = False
                try: svc.deactivate()
                except Exception: pass

            await asyncio.sleep(OBD_POLL)

    async def handle_obd_status(request: web.Request) -> web.Response:
        return web.json_response(_obd_data)

    app.router.add_get("/api/obd", handle_obd_status)
    app.router.add_get("/api/relais/status", handle_relais_status)
    app.router.add_post("/api/relais/test", handle_relais_test)
    app.router.add_post("/api/rebuild-cache", handle_rebuild_cache)
    app.router.add_get("/api/voice",          handle_voice_status)
    app.router.add_get("/api/face/status",    handle_face_status)

    async def _llm_warmup():
        """Chauffe les kernels CUDA du LLM au démarrage — évite la latence sur la 1ère requête."""
        await asyncio.sleep(8)  # laisser TRT-LLM démarrer
        try:
            async with (await get_llm_session()).post(
                f"{LLAMA_SERVER}/v1/chat/completions",
                json={"model": "qwen", "messages": [{"role": "user", "content": "ok"}],
                      "max_tokens": 1, "temperature": 0.1, "stream": False},
                timeout=aiohttp_client.ClientTimeout(total=20)
            ) as r:
                await r.text()
                print("[OK] LLM warm-up TRT terminé", flush=True)
        except Exception as e:
            print(f"[WARN] LLM warm-up: {e}", flush=True)

    async def _tts_manix_warmup():
        """Pré-charge le moteur TTS Manix (TRT engine build) au démarrage."""
        await asyncio.sleep(15)  # laisser LLM + TTS guy s initialiser
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, get_manix_engine)
            print("[OK] TTS Manix pre-warm TRT terminé", flush=True)
        except Exception as e:
            print(f"[WARN] TTS Manix pre-warm: {e}", flush=True)

    async def start_background(app):
        # ── Carte relais USB : détection au démarrage ─────────────────────
        if RELAY_AVAILABLE and RELAY_BOARD is not None:
            try:
                ok = await asyncio.get_event_loop().run_in_executor(None, RELAY_BOARD.connect)
                if ok:
                    # Etat propre au démarrage : tous relais coupés (vitre non bloquée).
                    await asyncio.get_event_loop().run_in_executor(None, RELAY_BOARD.all_off)
                    print(f"[RELAIS] carte 8 voies détectée et prête sur {RELAY_BOARD.port_path()}", flush=True)
                else:
                    print(f"[RELAIS] carte NON détectée au démarrage : {RELAY_BOARD.last_error}", flush=True)
            except Exception as e:
                print(f"[RELAIS] erreur d'initialisation : {e}", flush=True)
        else:
            print("[RELAIS] module désactivé (non chargé)", flush=True)

        app["stats_task"]     = asyncio.create_task(_stats_loop())
        app["cleanup_task"]   = asyncio.create_task(cleanup_audio(app))
        app["proactive_task"] = asyncio.create_task(proactive_loop(app))
        app["reminder_task"]  = asyncio.create_task(_reminders_check_loop())
        app["obd_task"]       = asyncio.create_task(obd_monitor_loop())
        app["warmup_task"]    = asyncio.create_task(_llm_warmup())
        app["manix_warmup_task"] = asyncio.create_task(_tts_manix_warmup())
        # service reconnaissance faciale (process séparé, python système)
        global _face_service_proc
        if FACE_SERVICE_ENABLED:
            try:
                _flog = open("/tmp/kitt_face_service.log", "a")
                # env nettoyé : /usr/bin/python3 ne doit pas hériter du venv
                _face_env = os.environ.copy()
                for _v in ("VIRTUAL_ENV", "VIRTUAL_ENV_PROMPT",
                           "PYTHONPATH", "PYTHONHOME"):
                    _face_env.pop(_v, None)
                _face_service_proc = subprocess.Popen(
                    ["/usr/bin/python3", _FACE_SERVICE],
                    stdout=_flog, stderr=subprocess.STDOUT, env=_face_env,
                )
                print(f"[FACE] service reconnaissance faciale lancé "
                      f"(pid {_face_service_proc.pid})", flush=True)
            except Exception as e:
                print(f"[FACE] lancement service KO : {e}", flush=True)
            app["face_greet_task"] = asyncio.create_task(_face_greeting_loop())
        else:
            print("[FACE] caméra live désactivée (FACE_SERVICE_ENABLED=False) "
                  "— reconnaissance faciale non lancée", flush=True)

    async def stop_background(app):
        for key in ("stats_task", "cleanup_task", "proactive_task", "reminder_task", "obd_task", "face_greet_task"):
            task = app.get(key)
            if task:
                task.cancel()
        global _face_service_proc
        if _face_service_proc is not None:
            try:
                _face_service_proc.terminate()
                _face_service_proc.wait(timeout=6)
            except Exception:
                try:
                    _face_service_proc.kill()
                except Exception:
                    pass
            _face_service_proc = None
        if _llm_session and not _llm_session.closed:
            await _llm_session.close()

    app.on_startup.append(start_background)
    app.on_cleanup.append(stop_background)
    return app


if __name__ == "__main__":
    print("=" * 60, flush=True)
    print("  KITT — Knight Industries Two Thousand", flush=True)
    print("  By Manix — Jetson Orin Nano Super", flush=True)
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
            # Creer les sockets avec SO_REUSEADDR pour eviter "address already in use"
            sock_https = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock_https.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock_https.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
            sock_https.bind(("0.0.0.0", 3000))
            sock_http = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock_http.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock_http.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
            sock_http.bind(("0.0.0.0", 3001))
            site_https = web.SockSite(runner, sock_https, ssl_context=ssl_ctx)
            site_http  = web.SockSite(runner, sock_http)
            await site_https.start()
            await site_http.start()
            loop = asyncio.get_running_loop()
            stop_event = asyncio.Event()
            for sig in (signal.SIGTERM, signal.SIGINT):
                loop.add_signal_handler(sig, stop_event.set)
            await stop_event.wait()
            await runner.cleanup()

        asyncio.run(run_both())
    else:
        ssl_ctx = None
        print('  HTTP uniquement', flush=True)
        print('=' * 60, flush=True)
        async def run_both_http():
            runner = web.AppRunner(app)
            await runner.setup()
            # Creer le socket avec SO_REUSEADDR pour eviter "address already in use"
            sock_http = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock_http.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock_http.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
            sock_http.bind(('0.0.0.0', 3000))
            site_http = web.SockSite(runner, sock_http)
            await site_http.start()
            loop = asyncio.get_running_loop()
            stop_event = asyncio.Event()
            for sig in (signal.SIGTERM, signal.SIGINT):
                loop.add_signal_handler(sig, stop_event.set)
            await stop_event.wait()
            await runner.cleanup()
        asyncio.run(run_both_http())
