#!/usr/bin/env python3
import subprocess, requests, io, wave, os, urllib3, time, threading, json
import queue as _q
import numpy as np
from collections import Counter
urllib3.disable_warnings()
API = "https://127.0.0.1:3000"
SR = 16000
FRAME_SAMPLES = int(SR * 30 / 1000)   # 480 samples / 30 ms
FB = FRAME_SAMPLES * 2                 # bytes (s16le)
SINK = "combined_sink"
SRC = "alsa_input.usb-CF-IC_HK-MIC_2025-0825-1200-00.analog-stereo"
AUDIO_DIR = "/home/karr/kitt-ai/audio_cache"
THRESH = 300.0      # seuil RMS (int16) pour detecter la parole (evite le bruit de fond)
PREROLL = 10        # frames gardes avant le declenchement (~0.3 s)
SIL_LIMIT = 12      # frames de silence pour finir une phrase (~0.36 s)
MIN_VOICED = 12     # frames mini pour considerer une vraie phrase

# Environnement PulseAudio explicite (necessaire depuis un service systemd sans session graphique)
PULSE_ENV = {**os.environ,
             "XDG_RUNTIME_DIR": "/run/user/1000",
             "PULSE_SERVER": "unix:/run/user/1000/pulse/native"}

SETUP_AUDIO = "/home/karr/kitt-ai/setup_audio.sh"


def fix_hk_pcm():
    """Force PCM HK materiel 100% + sortie PulseAudio 80% + interne 115% — play ET watchdog."""
    try:
        _sp.run(["amixer","-c","HKMIC","set","PCM","100%","unmute"],
                capture_output=True, timeout=3)
        _sp.run(["amixer","-c","HKMIC","set","Mic","100%","cap","unmute"],
                capture_output=True, timeout=3)
        _sp.run(["pactl","set-sink-volume","alsa_output.usb-CF-IC_HK-MIC_2025-0825-1200-00.analog-stereo","80%"], env=PULSE_ENV, capture_output=True, timeout=3)
        _sp.run(["pactl","set-sink-volume","alsa_output.hw_1_3","115%"], env=PULSE_ENV, capture_output=True, timeout=3)
        _sp.run(["pactl","set-sink-volume","combined_sink","100%"], env=PULSE_ENV, capture_output=True, timeout=3)
    except Exception:
        pass

def _hk_pcm_watchdog():
    """Thread daemon : force PCM HK materiel 100% + sortie PulseAudio 80% + interne 115% toutes les 5s."""
    while True:
        fix_hk_pcm()
        time.sleep(5)

def ensure_combined():
    """Recrée le sink combined s il a disparu (ex. apres redemarrage PA)."""
    try:
        r = subprocess.run(["pactl", "list", "sinks", "short"],
                           capture_output=True, text=True, env=PULSE_ENV, timeout=5)
        if "combined_sink" not in r.stdout:
            print("[AUDIO] sink combined absent, relancement setup_audio.sh...", flush=True)
            subprocess.run(["bash", SETUP_AUDIO], env=PULSE_ENV, timeout=60)
    except Exception as e:
        print("[AUDIO] ensure_combined erreur:", e, flush=True)


def start_rec():
    return subprocess.Popen(
        ["parecord", "--rate=16000", "--channels=1", "--format=s16le", "--raw",
         "--device=" + SRC],
        stdout=subprocess.PIPE, env=PULSE_ENV)


def rms(frame_bytes):
    a = np.frombuffer(frame_bytes, dtype=np.int16).astype(np.float32)
    if a.size == 0:
        return 0.0
    return float(np.sqrt(np.mean(a * a)))


def to_wav(frames):
    buf = io.BytesIO()
    w = wave.open(buf, "wb")
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(b"".join(frames))
    w.close()
    return buf.getvalue()


def stt(wav):
    try:
        r = requests.post(API + "/api/stt", files={"audio": ("a.wav", wav, "audio/wav")},
                          verify=False, timeout=30)
        return r.json().get("text", "").strip()
    except Exception as e:
        print("[STT ERR]", e, flush=True)
        return ""


def chat(txt):
    # Retry 3 fois si le serveur n est pas encore pret (ex. au boot)
    for attempt in range(3):
        try:
            r = requests.post(API + "/api/chat",
                              json={"message": txt, "audio": True},
                              verify=False, timeout=120)
            j = r.json()
            return j.get("reply", ""), j.get("audio_url")
        except Exception as e:
            print(f"[CHAT ERR] tentative {attempt+1}/3: {e}", flush=True)
            if attempt < 2:
                time.sleep(3)
    return "", None



def chat_stream(txt, rec_proc):
    """Streaming /api/chat/stream - joue chaque phrase des qu elle est prete."""
    play_q = _q.Queue()
    mic_stopped = threading.Event()
    full_reply = [""]

    def player():
        while True:
            item = play_q.get()
            if item is None:
                break
            if not mic_stopped.is_set():
                rec_proc.terminate()
                rec_proc.wait()
                mic_stopped.set()
            play(item)
            play_q.task_done()

    t = threading.Thread(target=player, daemon=True)
    t.start()

    for attempt in range(3):
        try:
            with requests.post(API + "/api/chat/stream",
                               json={"message": txt, "audio": True},
                               verify=False, timeout=120, stream=True) as r:
                for line in r.iter_lines():
                    if not line:
                        continue
                    if line.startswith(b"data: "):
                        try:
                            data = json.loads(line[6:])
                        except Exception:
                            continue
                        if "chunk_text" in data:
                            full_reply[0] += data.get("chunk_text", "")
                        if "audio_chunk" in data:
                            play_q.put(data["audio_chunk"])
                        if data.get("done"):
                            break
            break
        except Exception as e:
            print(f"[CHAT ERR] tentative {attempt+1}/3: {e}", flush=True)
            if attempt < 2:
                time.sleep(3)

    play_q.put(None)
    t.join()

    if not mic_stopped.is_set():
        rec_proc.terminate()
        rec_proc.wait()

    return full_reply[0]


PROMPT_WORDS = {"kitt", "manix", "kyronex", "virginie", "intelligence",
                "artificielle", "knight", "industries", "two", "thousand"}


def is_hallucination(txt):
    # Whisper repete ses mots-cles (initial_prompt) sur du silence/bruit
    w = [x.strip(".,!?;:") for x in txt.lower().split()]
    w = [x for x in w if x]
    if len(w) < 3:
        return False
    if Counter(w).most_common(1)[0][1] >= len(w) * 0.4:
        return True
    pc = sum(1 for x in w if x in PROMPT_WORDS)
    if pc >= len(w) * 0.6:
        return True
    return False


def play(url):
    if not url:
        return
    p = os.path.join(AUDIO_DIR, os.path.basename(url))
    if not os.path.exists(p):
        return
    ensure_combined()
    fix_hk_pcm()
    r = subprocess.run(["paplay", "--device=" + SINK, p], env=PULSE_ENV)
    if r.returncode != 0:
        # Dernier recours : sink par defaut
        print("[AUDIO] combined echoue, essai sink par defaut...", flush=True)
        subprocess.run(["paplay", p], env=PULSE_ENV)


# Verifier combined au demarrage
ensure_combined()
# Forcer les niveaux finaux apres la restauration PulseAudio
import subprocess as _sp
fix_hk_pcm()
print("[AUDIO] Volumes forces: materiel HK=100%, HK Pulse=80%, interne=115%, combine=100%", flush=True)

# Watchdog PCM HK — surveille toutes les 5s pour toujours
_t = threading.Thread(target=_hk_pcm_watchdog, daemon=True)
_t.start()
print("[WATCHDOG] PCM HK watchdog demarre", flush=True)

print("[VOICE] KARR ecoute le micro HK (VAD energie, seuil %.0f)..." % THRESH, flush=True)
rec = start_rec()
triggered = False
voiced = []
preroll = []
silence = 0
while True:
    frame = rec.stdout.read(FB)
    if len(frame) < FB:
        time.sleep(1)
        rec = start_rec()
        continue
    speech = rms(frame) > THRESH
    if not triggered:
        preroll.append(frame)
        if len(preroll) > PREROLL:
            preroll.pop(0)
        if speech:
            triggered = True
            voiced = list(preroll)
            silence = 0
    else:
        voiced.append(frame)
        if speech:
            silence = 0
        else:
            silence += 1
            if silence > SIL_LIMIT:
                if len(voiced) >= MIN_VOICED:
                    txt = stt(to_wav(voiced))
                    print("[USER]", txt, flush=True)
                    if txt and len(txt) > 1 and not is_hallucination(txt):
                        reply = chat_stream(txt, rec)
                        print("[KARR]", reply, flush=True)
                        rec = start_rec()
                triggered = False
                voiced = []
                preroll = []
                silence = 0