"""Opt-in real GPU smoke test. Use only an explicitly authorized private voice."""
import argparse
import io
import json
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.request import Request, urlopen
import wave

parser = argparse.ArgumentParser()
parser.add_argument("--reference", type=Path, required=True)
parser.add_argument("--base", default="http://127.0.0.1:8796/api/voice-studio")
parser.add_argument("--text", default="Bonjour Manix, voici ma voix.")
parser.add_argument("--source", type=Path, help="When supplied, exercise audio conversion instead of text synthesis")
parser.add_argument("--debug-data-root", type=Path, help="Admin local only: show private engine failure log before deletion")
args = parser.parse_args()
boundary = "ManixVoiceStudioSmoke"
body = bytearray()
fields = {"mode": "audio" if args.source else "text", "consent": "true"}
if not args.source:
    fields["text"] = args.text
for name, value in fields.items():
    body.extend(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
body.extend(f'--{boundary}\r\nContent-Disposition: form-data; name="reference"; filename="private-reference.wav"\r\nContent-Type: audio/wav\r\n\r\n'.encode())
body.extend(args.reference.read_bytes())
if args.source:
    body.extend(f'\r\n--{boundary}\r\nContent-Disposition: form-data; name="source"; filename="private-source.audio"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode())
    body.extend(args.source.read_bytes())
body.extend(f"\r\n--{boundary}--\r\n".encode())
started = time.monotonic()
with urlopen(Request(args.base + "/jobs", data=bytes(body), headers={"Content-Type": f"multipart/form-data; boundary={boundary}"}), timeout=45) as response:
    job = json.load(response)
job_url = args.base + "/jobs/" + job["id"]
try:
    previous = None
    while time.monotonic() - started < 1000:
        with urlopen(job_url, timeout=15) as response:
            job = json.load(response)
        marker = (job["status"], job["stage"])
        if marker != previous:
            print(json.dumps({"status": job["status"], "stage": job["stage"], "elapsed_seconds": round(time.monotonic() - started, 1)}, ensure_ascii=False), flush=True)
            previous = marker
        if job["status"] == "failed":
            if args.debug_data_root:
                log = args.debug_data_root / job["id"] / "engine.log"
                if log.is_file():
                    print(log.read_text(errors="replace")[-8000:], flush=True)
            raise RuntimeError(job["error"])
        if job["status"] == "completed":
            break
        time.sleep(2)
    else:
        raise TimeoutError("GPU job timeout")
    with tempfile.TemporaryDirectory(prefix="manix-voice-smoke-") as temporary:
        for format in ("wav", "mp3"):
            with urlopen(job_url + "/audio?format=" + format, timeout=30) as response:
                data = response.read()
            assert len(data) > 1000
            path = Path(temporary) / ("result." + format)
            path.write_bytes(data)
            subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-i", str(path), "-f", "null", "-"], check=True, timeout=30)
            if format == "wav":
                with wave.open(io.BytesIO(data), "rb") as audio:
                    assert audio.getnframes() > 0
        print(json.dumps({"completed": True, "elapsed_seconds": round(time.monotonic() - started, 1), "duration_seconds": job["duration_seconds"], "wav_and_mp3_full_decode": True}), flush=True)
finally:
    with urlopen(Request(job_url, method="DELETE"), timeout=15) as response:
        assert json.load(response)["deleted"] is True
    print("PRIVATE_TEST_JOB_DELETED", flush=True)
