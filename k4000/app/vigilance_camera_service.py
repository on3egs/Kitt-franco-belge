#!/usr/bin/env python3
"""Processus caméra isolé de Qironex (caméra USB UVC + FFmpeg)."""
from __future__ import annotations
import argparse, json, os, signal, shutil, subprocess, sys, time
from datetime import datetime
from pathlib import Path

BASE = Path(__file__).resolve().parent
RECORDINGS = Path(os.getenv("KYRONEXT_VIGILANCE_DIR", BASE / "recordings" / "vigilance"))
PIDFILE = RECORDINGS / ".vigilance.pid"
STATUSFILE = RECORDINGS / ".vigilance.json"
DEVICE = os.getenv("KYRONEXT_VIGILANCE_DEVICE", "/dev/video0")
MAX_BYTES = int(float(os.getenv("KYRONEXT_VIGILANCE_MAX_GB", "10")) * 1024**3)


def _pid():
    try: return int(PIDFILE.read_text().strip())
    except (OSError, ValueError): return None


def _alive(pid):
    if not pid: return False
    try: os.kill(pid, 0); return True
    except OSError: return False


def _write_status(**values):
    RECORDINGS.mkdir(parents=True, exist_ok=True)
    STATUSFILE.write_text(json.dumps(values, ensure_ascii=False), encoding="utf-8")


def _rotate_storage():
    RECORDINGS.mkdir(parents=True, exist_ok=True)
    files = sorted((p for p in RECORDINGS.glob("vigilance_*.mp4") if p.is_file()), key=lambda p: p.stat().st_mtime)
    total = sum(p.stat().st_size for p in files)
    for path in files:
        if total <= MAX_BYTES: break
        size = path.stat().st_size
        try: path.unlink(); total -= size
        except OSError: pass


def start():
    if not Path(DEVICE).exists():
        _write_status(active=False, recording=False, error=f"Caméra absente: {DEVICE}")
        return {"active": False, "recording": False, "error": "camera_absente"}
    old = _pid()
    if _alive(old): return status()
    if not shutil.which("ffmpeg"):
        return {"active": False, "recording": False, "error": "ffmpeg_absent"}
    _rotate_storage()
    RECORDINGS.mkdir(parents=True, exist_ok=True)
    try: (RECORDINGS / "latest.jpg").unlink()
    except OSError: pass
    output = str(RECORDINGS / "vigilance_%Y-%m-%d_%H-%M-%S.mp4")
    preview = str(RECORDINGS / "latest.jpg")
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "warning", "-nostdin", "-y",
           "-f", "v4l2", "-input_format", "mjpeg", "-video_size", "640x480", "-framerate", "30", "-i", DEVICE,
           "-filter_complex", "[0:v]fps=5,split=2[rec][preview]",
           "-map", "[rec]", "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency", "-b:v", "700k",
           "-pix_fmt", "yuv420p", "-f", "segment", "-segment_time", "300", "-segment_format_options", "movflags=+frag_keyframe+empty_moov+default_base_moof", "-reset_timestamps", "1", "-strftime", "1", output,
           "-map", "[preview]", "-c:v", "mjpeg", "-q:v", "7", "-f", "image2", "-update", "1", preview]
    log = open(RECORDINGS / "vigilance_ffmpeg.log", "ab", buffering=0)
    proc = subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
    PIDFILE.write_text(str(proc.pid), encoding="ascii")
    _write_status(active=True, recording=True, pid=proc.pid, device=DEVICE, width=640, height=480, fps=5, encoder="libx264-ultrafast", preview=preview)
    return status()


def stop():
    pid = _pid()
    clean = True
    if _alive(pid):
        try: os.killpg(pid, signal.SIGINT)
        except OSError: pass
        for _ in range(50):
            if not _alive(pid): break
            time.sleep(.2)
        if _alive(pid):
            clean = False
            try: os.killpg(pid, signal.SIGTERM)
            except OSError: pass
            for _ in range(15):
                if not _alive(pid): break
                time.sleep(.2)
        if _alive(pid):
            try: os.killpg(pid, signal.SIGKILL)
            except OSError: pass
            for _ in range(10):
                if not _alive(pid): break
                time.sleep(.1)
    try: PIDFILE.unlink()
    except OSError: pass
    _rotate_storage()
    _write_status(active=False, recording=False, device=DEVICE, clean_shutdown=clean)
    result = status(); result["clean_shutdown"] = clean and not result["active"]
    return result


def status():
    pid = _pid(); alive = _alive(pid)
    if not alive and pid:
        try: PIDFILE.unlink()
        except OSError: pass
    data = {"active": alive, "recording": alive, "device": DEVICE, "fps": 5, "width": 640, "height": 480, "encoder": "libx264-ultrafast"}
    if STATUSFILE.exists():
        try: data.update(json.loads(STATUSFILE.read_text(encoding="utf-8")))
        except (OSError, ValueError): pass
    data["active"] = alive; data["recording"] = alive
    return data


if __name__ == "__main__":
    parser = argparse.ArgumentParser(); parser.add_argument("action", choices=("start", "stop", "status")); args = parser.parse_args()
    result = {"start": start, "stop": stop, "status": status}[args.action]()
    print(json.dumps(result, ensure_ascii=False))
