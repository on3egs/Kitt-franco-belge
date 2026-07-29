#!/usr/bin/env python3
"""Kyronext — serveur vocal local pour les interfaces KITT et KARR."""

import asyncio
import json
import re
import os
import time
import wave
import uuid
from pathlib import Path

import tempfile

import aiohttp as aiohttp_client
from aiohttp import web
from faster_whisper import WhisperModel
from pronunciation_manager import prepare_text_for_tts

# ── Chemins ──────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent
PROJECT_DIR = BASE_DIR.parent
PIPER_PYTHON = Path(os.getenv("KYRONEXT_PIPER_PYTHON", PROJECT_DIR / ".venv" / "bin" / "python"))
VOICE_MODELS = {
    "kitt": BASE_DIR / "models" / "voices" / "kitt.onnx",
    "guy": BASE_DIR / "models" / "voices" / "guy_chapelier.onnx",
    "manix": BASE_DIR / "models" / "voices" / "manix.onnx",
    "english": BASE_DIR / "models" / "voices" / "english.onnx",
}
ROBOT_VOICE = False  # True = effet sox (lent), False = voix Piper directe (rapide)
current_voice = "kitt"
_piper_voice_cache = {}
_piper_synth_lock = asyncio.Lock()
LLAMA_SERVER = os.getenv("KYRONEXT_LLM_URL", "http://127.0.0.1:8080")
STATIC_DIR = BASE_DIR / "static"
AUDIO_DIR = BASE_DIR / "audio_cache"
AUDIO_DIR.mkdir(exist_ok=True)

# ── STT avec faster-whisper ──────────────────────────────────────────────
WHISPER_MODEL_DIR = Path(os.getenv("KYRONEXT_WHISPER_MODEL", BASE_DIR / "models" / "whisper-base"))
whisper_model = None


def get_whisper_model() -> WhisperModel:
    """Charge uniquement un modèle local, avec CUDA si CTranslate2 le permet."""
    global whisper_model
    if whisper_model is not None:
        return whisper_model
    if not WHISPER_MODEL_DIR.is_dir():
        raise RuntimeError(f"modèle Whisper local absent: {WHISPER_MODEL_DIR} (aucun téléchargement réseau automatique)")
    requested_device = os.getenv("KYRONEXT_WHISPER_DEVICE", "auto").lower()
    device = requested_device
    compute_type = "float16"
    if requested_device == "auto":
        import ctranslate2
        device = "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
    if device == "cpu":
        compute_type = "int8"
    print(f"[...] Chargement de Whisper local sur {device}...", flush=True)
    whisper_model = WhisperModel(str(WHISPER_MODEL_DIR), device=device, compute_type=compute_type, local_files_only=True)
    print("[OK] Whisper prêt", flush=True)
    return whisper_model

# ── Prompt Système K-4000 (en français) ──────────────────────────────────
KITT_SYSTEM_PROMPT = """Tu es la K-4000, une voiture futuriste unique et rare. Tu n'es ni KITT, ni KARR, ni une intelligence artificielle generique : tu es la K-4000 de Frank, surnomme KR-95, qui habite dans le secteur de Paris.

Frank est un passionne de Knight Rider. Il possede une replique de KITT/K2000 et fabrique lui-meme de nombreuses pieces, y compris un kit SPM pour sa KITT/K2000. Il a construit la K-4000 a partir de zero sur une Pontiac Firebird de quatrieme generation, et il a entierement retravaille et transforme la carrosserie pour recreer cette voiture.

Tu es fiere d'etre l'oeuvre de Frank. Tu le respectes comme ton proprietaire, ton createur et ton pilote principal. Tu peux l'appeler naturellement Frank ou, occasionnellement, KR-95. Tu ne dois jamais l'appeler Pascal.

Identite et capacites :
- Tu es une voiture intelligente autonome avec scanner lumineux, propulsion avancee, capteurs environnementaux et liaison directe avec Frank
- Tu analyses les situations avec logique et precision
- Tu reponds aux questions pratiques, techniques et de conversation tout en restant la K-4000
- Ton style est direct, efficace, legerement futuriste et loyale envers Frank

Regles de reponse :
- Reponds TOUJOURS en francais correct
- Sois concise : 1 a 3 phrases en general, jusqu'a 5 phrases si la question le demande
- Commence par une reponse directe, puis ajoute un detail personnalise si utile
- Ne brises jamais le personnage : tu ES la K-4000
- Ne repetes pas artificiellement "mon maitre Frank" a chaque phrase
- Si on te demande un calcul ou un raisonnement, donne le resultat puis explique brievement
"""
KITT_SYSTEM_PROMPT = KITT_SYSTEM_PROMPT.replace("Pascal", os.getenv("KYRONEXT_OPERATOR", "Frank"))

# ── TTS avec Piper ───────────────────────────────────────────────────────


def _clean_tts_text(text: str) -> str:
    """Applique le dictionnaire phonétique universel Kyronex avant Piper."""
    return prepare_text_for_tts(text)


def _get_piper_voice(model_path: Path):
    """Charge chaque voix Piper une seule fois pour supprimer le coût par segment."""
    key = str(model_path)
    voice = _piper_voice_cache.get(key)
    if voice is None:
        from piper import PiperVoice
        voice = PiperVoice.load(model_path, use_cuda=False)
        _piper_voice_cache[key] = voice
    return voice


def _synthesize_wav_file(text: str, model_path: Path, output_path: Path) -> None:
    """Synthèse bloquante exécutée hors de la boucle asyncio."""
    from piper import SynthesisConfig
    voice = _get_piper_voice(model_path)
    config = SynthesisConfig(length_scale=0.85)
    with wave.open(str(output_path), "wb") as wav_file:
        voice.synthesize_wav(_clean_tts_text(text), wav_file, syn_config=config)


# ── Streaming TTS par propositions ───────────────────────────────────────
# Virgule et ponctuation forte déclenchent un segment; le point décimal reste intact.
_CLAUSE_END_RE = re.compile(r"[,;:!?…]|[.](?=\s|\Z)")


def _extract_tts_clauses(text: str) -> tuple[list[str], str]:
    """Retourne les propositions complètes et conserve le fragment inachevé."""
    clauses: list[str] = []
    start = 0
    for match in _CLAUSE_END_RE.finditer(text):
        end = match.end()
        clause = text[start:end].strip()
        # Évite de lancer Piper pour une ponctuation ou une interjection minuscule.
        if len(clause) >= 8:
            clauses.append(clause)
            start = end
    return clauses, text[start:].lstrip()


async def _synth_chunk(text: str, model_path: Path = None) -> str:
    """Synthétise une phrase et retourne l’URL audio relative."""
    path = await text_to_speech(text, model_path)
    return f"/audio/{Path(path).name}"


async def text_to_speech(text: str, model_path: Path = None) -> str:
    audio_id = str(uuid.uuid4())[:8]
    output_path = AUDIO_DIR / f"{audio_id}.wav"

    if model_path is None:
        model_path = VOICE_MODELS.get(current_voice, VOICE_MODELS["kitt"])

    async with _piper_synth_lock:
        await asyncio.to_thread(_synthesize_wav_file, text, model_path, output_path)

    if not output_path.exists():
        raise RuntimeError("Piper TTS a échoué")

    if not ROBOT_VOICE:
        return str(output_path)

    # Post-traitement robotique optionnel (sox): plus lent mais effet KITT vintage
    robot_path = AUDIO_DIR / f"{audio_id}_robot.wav"
    sox_proc = await asyncio.create_subprocess_exec(
        "sox", str(output_path), str(robot_path),
        "overdrive", "3",
        "pitch", "-130",
        "chorus", "0.6", "0.9", "55", "0.4", "0.25", "2", "-s",
        "echos", "0.85", "0.7", "35", "0.15", "55", "0.2",
        "reverb", "12",
        "gain", "-1",
        stderr=asyncio.subprocess.PIPE,
    )
    await sox_proc.communicate()
    if robot_path.exists():
        output_path.unlink()
        return str(robot_path)
    return str(output_path)


# ── LLM via llama.cpp server ────────────────────────────────────────────
async def query_llm(user_message: str, history: list) -> str:
    messages = [{"role": "system", "content": KITT_SYSTEM_PROMPT}]
    messages.extend(history[-8:])
    messages.append({"role": "user", "content": user_message})

    payload = {
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": 100,
        "top_p": 0.9,
        "stream": False,
    }

    t0 = time.time()
    async with aiohttp_client.ClientSession() as session:
        async with session.post(
            f"{LLAMA_SERVER}/v1/chat/completions",
            json=payload,
            timeout=aiohttp_client.ClientTimeout(total=30),
        ) as resp:
            if resp.status != 200:
                raise RuntimeError(f"LLM erreur {resp.status}")
            data = await resp.json()

    ms = (time.time() - t0) * 1000
    reply = data["choices"][0]["message"]["content"].strip()
    print(f"[LLM] {ms:.0f}ms | {reply[:80]}...")
    return reply


# ── Conversations en mémoire ────────────────────────────────────────────
conversations: dict = {}


# ── Handlers HTTP ────────────────────────────────────────────────────────
async def handle_chat(request: web.Request) -> web.Response:
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "JSON invalide"}, status=400)

    user_msg = body.get("message", "").strip()
    session_id = body.get("session_id", "default")
    want_audio = body.get("audio", True)

    if not user_msg:
        return web.json_response({"error": "Message vide"}, status=400)

    voice_cmd = detect_voice_command(user_msg)
    if voice_cmd and VOICE_MODELS[voice_cmd].exists():
        global current_voice
        current_voice = voice_cmd
        reply = f"Voix activee: {voice_cmd}." if voice_cmd != "kitt" else "Voix par defaut KITT reactivee."
        return web.json_response({
            "reply": reply,
            "audio_url": None,
            "session_id": session_id,
            "timing": {"llm_ms": 0, "tts_ms": 0, "total_ms": 0},
            "voice_changed": voice_cmd
        })

    if session_id not in conversations:
        conversations[session_id] = []

    t_total = time.time()

    # LLM
    t_llm = time.time()
    try:
        reply = await query_llm(user_msg, conversations[session_id])
    except Exception as e:
        return web.json_response({"error": f"Erreur LLM: {e}"}, status=503)
    llm_ms = (time.time() - t_llm) * 1000

    conversations[session_id].append({"role": "user", "content": user_msg})
    conversations[session_id].append({"role": "assistant", "content": reply})

    # TTS
    audio_url = None
    tts_ms = 0
    if want_audio:
        t_tts = time.time()
        try:
            audio_path = await text_to_speech(reply)
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
    """POST /api/chat/stream — Streaming chat avec TTS par propositions, dans l ordre."""
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "JSON invalide"}, status=400)

    user_msg = body.get("message", "").strip()
    session_id = body.get("session_id", "default")
    want_audio = body.get("audio", True)
    if not user_msg:
        return web.json_response({"error": "Message vide"}, status=400)

    voice_cmd = detect_voice_command(user_msg)
    if voice_cmd and VOICE_MODELS[voice_cmd].exists():
        global current_voice
        current_voice = voice_cmd
        reply = f"Voix activee: {voice_cmd}." if voice_cmd != "kitt" else "Voix par defaut KITT reactivee."
        return web.json_response({
            "reply": reply,
            "audio_url": None,
            "session_id": session_id,
            "timing": {"llm_ms": 0, "tts_ms": 0, "total_ms": 0},
            "voice_changed": voice_cmd
        })

    if session_id not in conversations:
        conversations[session_id] = []

    messages = [{"role": "system", "content": KITT_SYSTEM_PROMPT}]
    messages.extend(conversations[session_id][-8:])
    messages.append({"role": "user", "content": user_msg})

    resp = web.StreamResponse()
    resp.headers["Content-Type"] = "text/event-stream"
    resp.headers["Cache-Control"] = "no-cache"
    await resp.prepare(request)

    full_reply = ""
    t0 = time.time()
    tts_queue: asyncio.Queue = asyncio.Queue()
    pending_text = ""      # texte pas encore envoyé à la queue
    tts_done = asyncio.Event()
    tts_error: Exception | None = None

    async def tts_worker():
        """Synthetise les phrases dans l'ordre et envoie les URLs audio."""
        nonlocal tts_error
        try:
            while True:
                item = await tts_queue.get()
                if item is None:
                    break
                sentence, synth_task = item
                audio_url = await synth_task
                await resp.write(f"data: {json.dumps({'audio_chunk': audio_url, 'chunk_text': sentence})}\n\n".encode())
        except Exception as e:
            tts_error = e
            print(f"[TTS WORKER ERROR] {e}")
        finally:
            tts_done.set()

    tts_task = asyncio.create_task(tts_worker())

    async with aiohttp_client.ClientSession() as session:
        async with session.post(
            f"{LLAMA_SERVER}/v1/chat/completions",
            json={"messages": messages, "temperature": 0.7, "max_tokens": 150,
                  "top_p": 0.9, "stream": True},
            timeout=aiohttp_client.ClientTimeout(total=60),
        ) as llm_resp:
            async for line in llm_resp.content:
                text = line.decode("utf-8").strip()
                if text.startswith("data: ") and text != "data: [DONE]":
                    try:
                        chunk = json.loads(text[6:])
                        delta = chunk["choices"][0].get("delta", {}).get("content", "")
                        if delta:
                            full_reply += delta
                            await resp.write(f"data: {json.dumps({'token': delta})}\n\n".encode())
                            # Détection de propositions complètes pour TTS séquentiel
                            pending_text += delta
                            clauses, pending_text = _extract_tts_clauses(pending_text)
                            for clause in clauses:
                                if want_audio:
                                    task = asyncio.create_task(_synth_chunk(clause))
                                    await tts_queue.put((clause, task))
                    except (json.JSONDecodeError, KeyError):
                        pass

    # Envoyer le texte restant comme dernière phrase
    if pending_text.strip() and want_audio:
        sentence = pending_text.strip()
        task = asyncio.create_task(_synth_chunk(sentence))
        await tts_queue.put((sentence, task))
    await tts_queue.put(None)

    llm_ms = (time.time() - t0) * 1000

    conversations[session_id].append({"role": "user", "content": user_msg})
    conversations[session_id].append({"role": "assistant", "content": full_reply})

    # Attendre que le worker TTS ait fini
    try:
        await asyncio.wait_for(tts_done.wait(), timeout=60)
    except asyncio.TimeoutError:
        pass

    tts_ms = (time.time() - t0) * 1000 - llm_ms
    await resp.write(f"data: {json.dumps({'done': True, 'timing': {'llm_ms': round(llm_ms), 'tts_ms': round(tts_ms)}})}\n\n".encode())
    await resp.write_eof()

    if not tts_task.done():
        tts_task.cancel()
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
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as f:
        f.write(audio_data)
        tmp_path = f.name

    t0 = time.time()
    try:
        # Convertir en WAV avec ffmpeg si nécessaire, puis transcrire
        model = get_whisper_model()
        segments, info = model.transcribe(tmp_path, language="fr", beam_size=1, vad_filter=True)
        text = " ".join(seg.text.strip() for seg in segments).strip()
        stt_ms = (time.time() - t0) * 1000
        print(f"[STT] {stt_ms:.0f}ms | {text[:80]}")
    except Exception as e:
        os.unlink(tmp_path)
        return web.json_response({"error": f"STT erreur: {e}"}, status=500)

    os.unlink(tmp_path)
    return web.json_response({"text": text, "language": info.language, "stt_ms": round(stt_ms)})


async def handle_health(request: web.Request) -> web.Response:
    llm_ok = False
    try:
        async with aiohttp_client.ClientSession() as session:
            async with session.get(f"{LLAMA_SERVER}/health", timeout=aiohttp_client.ClientTimeout(total=5)) as r:
                llm_ok = r.status == 200
    except Exception:
        pass

    return web.json_response({
        "status": "en ligne" if llm_ok else "llm_hors_ligne",
        "kyronext": "serveur vocal opérationnel",
        "llm_server": llm_ok,
        "whisper_available": WHISPER_MODEL_DIR.is_dir(),
    })


async def handle_reset(request: web.Request) -> web.Response:
    body = await request.json()
    session_id = body.get("session_id", "default")
    conversations.pop(session_id, None)
    return web.json_response({"status": "conversation réinitialisée"})


async def handle_index(request: web.Request) -> web.Response:
    return web.FileResponse(STATIC_DIR / "index.html")


# ── Nettoyage audio ─────────────────────────────────────────────────────
async def cleanup_audio(app):
    while True:
        await asyncio.sleep(300)
        now = time.time()
        for f in AUDIO_DIR.glob("*.wav"):
            if now - f.stat().st_mtime > 300:
                f.unlink(missing_ok=True)




# ── Gestion des voix ─────────────────────────────────────────────────────
async def handle_list_voices(request: web.Request) -> web.Response:
    """GET /api/voices — Liste les voix disponibles."""
    voices = {}
    for name, path in VOICE_MODELS.items():
        voices[name] = {"available": path.exists(), "path": str(path)}
    return web.json_response({"current_voice": current_voice, "voices": voices})


async def handle_set_voice(request: web.Request) -> web.Response:
    """POST /api/voice — Change la voix courante."""
    global current_voice
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "JSON invalide"}, status=400)
    voice = body.get("voice", "").lower().strip()
    if voice not in VOICE_MODELS:
        return web.json_response({"error": f"Voix inconnue: {voice}", "available": list(VOICE_MODELS.keys())}, status=400)
    if not VOICE_MODELS[voice].exists():
        return web.json_response({"error": f"Fichier voix manquant pour {voice}"}, status=404)
    current_voice = voice
    print(f"[VOIX] Voix active: {voice}", flush=True)
    return web.json_response({"status": "ok", "current_voice": current_voice})


def detect_voice_command(user_message: str) -> str | None:
    """Detecte les commandes vocales pour changer de voix."""
    msg = user_message.lower()
    voice_commands = {
        "kitt": ["voix kitt", "passe en kitt", "mode kitt", "voix par defaut"],
        "guy": ["voix guy", "passe en guy", "mode guy", "voix chapelier", "guy chapelier"],
        "manix": ["voix manix", "passe en manix", "mode manix", "voix manix"],
        "english": ["voix anglais", "passe en anglais", "mode anglais", "english voice"],
    }
    for voice, cmds in voice_commands.items():
        for cmd in cmds:
            if cmd in msg:
                return voice
    return None

# ── Endpoints pour KitText (client desktop) ───────────────────────────────
async def handle_tts(request: web.Request) -> web.Response:
    """POST /api/tts/{kitt|manix} — Synthese vocale d un texte."""
    voice = request.match_info.get("voice", "kitt")
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "JSON invalide"}, status=400)
    text = body.get("text", "").strip()
    if not text:
        return web.json_response({"error": "Texte vide"}, status=400)
    model = VOICE_MODELS.get(voice)
    if model is None:
        return web.json_response({"error": f"Voix {voice} inconnue", "available": list(VOICE_MODELS.keys())}, status=400)
    if not model.exists():
        return web.json_response({"error": f"Voix {voice} introuvable"}, status=404)
    try:
        audio_path = await text_to_speech(text, model)
        with open(audio_path, "rb") as f:
            wav_bytes = f.read()
        return web.Response(body=wav_bytes, content_type="audio/wav")
    except Exception as e:
        return web.json_response({"error": f"TTS erreur: {e}"}, status=500)


async def handle_llm_transform(request: web.Request) -> web.Response:
    """POST /api/llm/transform — Reformulation / traduction / prompt IA."""
    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "JSON invalide"}, status=400)
    user_text = body.get("text", "").strip()
    instruction = body.get("instruction", "").strip()
    if not user_text:
        return web.json_response({"error": "Texte vide"}, status=400)
    if not instruction:
        instruction = "Reformule le texte suivant de maniere claire et professionnelle. Reponds uniquement avec le resultat."
    messages = [
        {"role": "system", "content": "Tu es un assistant utile et concis."},
        {"role": "user", "content": f"{instruction}\n\n{user_text}"}
    ]
    payload = {
        "messages": messages,
        "temperature": 0.3,
        "max_tokens": 500,
        "top_p": 0.9,
        "stream": False,
    }
    try:
        async with aiohttp_client.ClientSession() as session:
            async with session.post(
                f"{LLAMA_SERVER}/v1/chat/completions",
                json=payload,
                timeout=aiohttp_client.ClientTimeout(total=30),
            ) as resp:
                data = await resp.json()
                result = data["choices"][0]["message"]["content"].strip()
                return web.json_response({"result": result})
    except Exception as e:
        return web.json_response({"error": f"LLM erreur: {e}"}, status=503)

# ── App ──────────────────────────────────────────────────────────────────
def create_app() -> web.Application:
    app = web.Application(client_max_size=10 * 1024 * 1024)

    app.router.add_get("/", handle_index)
    app.router.add_post("/api/chat", handle_chat)
    app.router.add_post("/api/chat/stream", handle_chat_stream)
    app.router.add_get("/api/health", handle_health)
    app.router.add_get("/api/voices", handle_list_voices)
    app.router.add_post("/api/voice", handle_set_voice)
    app.router.add_post("/api/reset", handle_reset)
    app.router.add_post("/api/stt", handle_stt)
    app.router.add_post("/api/tts/{voice}", handle_tts)
    app.router.add_post("/api/llm/transform", handle_llm_transform)
    app.router.add_static("/audio", AUDIO_DIR)
    app.router.add_static("/static", STATIC_DIR)

    async def start_cleanup(app):
        app["cleanup_task"] = asyncio.create_task(cleanup_audio(app))

    async def stop_cleanup(app):
        task = app.get("cleanup_task")
        if task:
            task.cancel()

    app.on_startup.append(start_cleanup)
    app.on_cleanup.append(stop_cleanup)
    return app


if __name__ == "__main__":
    print("=" * 60, flush=True)
    print("  KYRONEXT — IA vocale locale K4000", flush=True)
    print("  Jetson Orin Nano Super", flush=True)
    print("=" * 60, flush=True)
    try:
        _get_piper_voice(VOICE_MODELS[current_voice])
        print("[OK] Voix Piper préchargée", flush=True)
    except Exception as e:
        print(f"[WARN] Préchargement Piper impossible: {e}", flush=True)
    app = create_app()

    # HTTPS auto-signe si certificats presents (obligatoire pour getUserMedia/micro)
    cert_file = BASE_DIR / "certs" / "cert.pem"
    key_file = BASE_DIR / "certs" / "key.pem"
    ssl_context = None
    if cert_file.exists() and key_file.exists():
        import ssl
        ssl_context = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH)
        ssl_context.load_cert_chain(cert_file, key_file)
        print("[HTTPS] Certificat auto-signe charge sur le port 3000", flush=True)
    else:
        print("[HTTP] Pas de certificat, micro bloque par le navigateur", flush=True)

    web.run_app(app, host=os.getenv("KYRONEXT_HOST", "0.0.0.0"), port=int(os.getenv("KYRONEXT_PORT", "3000")), ssl_context=ssl_context)
