#!/usr/bin/env python3
"""Private, bounded job API around the existing offline Seed-VC installation."""
from __future__ import annotations

import argparse
import array
import collections
import dataclasses
import email.policy
import hashlib
import ipaddress
import json
import logging
import math
import os
from pathlib import Path
import queue
import re
import secrets
import shutil
import signal
import socket
import subprocess
import threading
import time
from email.parser import BytesParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit
import wave

PREFIX = "/api/voice-studio"
ID_PATTERN = re.compile(r"^[A-Za-z0-9_-]{43}$")
MAX_FILE_BYTES = 20 * 1024 * 1024
MAX_BODY_BYTES = 2 * MAX_FILE_BYTES + 128 * 1024
MAX_TEXT = 400
TTL_SECONDS = 86400
MAX_JOBS = 4
MAX_STORED_JOBS = 100
MAX_REFERENCE_SECONDS = 30
MAX_SOURCE_SECONDS = 30
LOGGER = logging.getLogger("manix-voice-studio")


class UserError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


class Cancelled(Exception):
    pass


@dataclasses.dataclass
class Config:
    seed_root: Path
    data_root: Path
    piper_binary: Path
    piper_model: Path
    host: str = "127.0.0.1"
    port: int = 8796
    steps: int = 40
    max_queue: int = MAX_JOBS
    timeout: int = 900
    per_hour: int = 3
    allowed_origins: tuple[str, ...] = (
        "https://kitt-franco-belge.be", "https://www.kitt-franco-belge.be",
        "https://kitt.kitt-franco-belge.be",
    )

    @property
    def python(self) -> Path:
        return self.seed_root / "venv/bin/python"

    @property
    def app(self) -> Path:
        return self.seed_root / "app"

    @classmethod
    def from_env(cls) -> "Config":
        seed = Path(os.environ.get("VOICE_STUDIO_SEED_ROOT", "/media/kitt/61866b44-3823-48c5-8c62-a74a85111d911/manix-seedvc-bench-20261027"))
        origins = os.environ.get("VOICE_STUDIO_ALLOWED_ORIGINS")
        return cls(
            seed_root=seed,
            data_root=Path(os.environ.get("VOICE_STUDIO_DATA_ROOT", str(seed / "voice-studio-data"))),
            piper_binary=Path(os.environ.get("VOICE_STUDIO_PIPER", "/home/kitt/kitt-ai/piper/piper/piper")),
            piper_model=Path(os.environ.get("VOICE_STUDIO_PIPER_MODEL", "/home/kitt/kitt-ai/models/fr_FR-tom-medium.onnx")),
            port=int(os.environ.get("VOICE_STUDIO_PORT", "8796")),
            steps=max(20, min(100, int(os.environ.get("VOICE_STUDIO_STEPS", "40")))),
            per_hour=max(1, int(os.environ.get("VOICE_STUDIO_PER_HOUR", "3"))),
            allowed_origins=tuple(s.strip() for s in origins.split(",") if s.strip()) if origins else cls.__dataclass_fields__["allowed_origins"].default,
        )


@dataclasses.dataclass
class Job:
    id: str
    mode: str
    created_at: float
    status: str = "queued"
    progress: int = 0
    stage: str = "En attente du moteur vocal"
    error: str | None = None
    duration_seconds: float | None = None
    cancel: threading.Event = dataclasses.field(default_factory=threading.Event, repr=False)
    process: subprocess.Popen | None = dataclasses.field(default=None, repr=False)

    def metadata(self) -> dict:
        return {key: getattr(self, key) for key in ("id", "mode", "created_at", "status", "progress", "stage", "error", "duration_seconds")}


def iso_time(timestamp: float) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(timestamp))


def parse_multipart(content_type: str, body: bytes) -> tuple[dict[str, str], dict[str, bytes]]:
    if not content_type.lower().startswith("multipart/form-data;"):
        raise UserError("Envoyez les fichiers avec un formulaire multipart/form-data.", 415)
    message = BytesParser(policy=email.policy.default).parsebytes(
        f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode("ascii", "strict") + body)
    if not message.is_multipart():
        raise UserError("Formulaire incomplet ou délimiteur multipart invalide.")
    fields: dict[str, str] = {}
    files: dict[str, bytes] = {}
    parts = list(message.iter_parts())
    if len(parts) > 8:
        raise UserError("Le formulaire contient trop de champs.")
    for part in parts:
        name = part.get_param("name", header="content-disposition")
        if not name or name not in {"reference", "source", "text", "mode", "consent"}:
            raise UserError("Un champ du formulaire n’est pas reconnu.")
        if name in fields or name in files:
            raise UserError("Un champ est présent plusieurs fois.")
        payload = part.get_payload(decode=True)
        if not isinstance(payload, bytes):
            raise UserError("Contenu du formulaire invalide.")
        if name in {"reference", "source"}:
            if not payload or len(payload) > MAX_FILE_BYTES:
                raise UserError("Chaque fichier doit contenir des données et faire au maximum 20 Mo.", 413)
            files[name] = payload
        else:
            if len(payload) > 4096:
                raise UserError("Un champ texte est trop long.", 413)
            try:
                fields[name] = payload.decode("utf-8").strip()
            except UnicodeDecodeError as exc:
                raise UserError("Le texte doit être encodé en UTF-8.") from exc
    if fields.get("consent", "").lower() != "true":
        raise UserError("Confirmez que cette voix vous appartient ou que vous avez son autorisation explicite.", 403)
    mode = fields.get("mode")
    if mode not in {"audio", "text"}:
        raise UserError("Choisissez le mode audio ou texte.")
    if "reference" not in files:
        raise UserError("Ajoutez une référence de votre voix entre 5 et 30 secondes.")
    if mode == "audio" and ("source" not in files or fields.get("text")):
        raise UserError("Le mode audio attend une source audio et aucun texte.")
    if mode == "text":
        text = fields.get("text", "")
        if not text or len(text) > MAX_TEXT or "source" in files:
            raise UserError("Le mode texte attend 1 à 400 caractères et aucun fichier source.")
        if any(ord(char) < 32 and char not in "\n\r\t" for char in text):
            raise UserError("Le texte contient des caractères de contrôle non pris en charge.")
    return fields, files


class Studio:
    def __init__(self, config: Config):
        self.config = config
        if not config.seed_root.is_dir():
            raise RuntimeError("SSD Seed-VC absent : le service ne crée pas de dossier de remplacement.")
        config.data_root.mkdir(mode=0o700, parents=True, exist_ok=True)
        os.chmod(config.data_root, 0o700)
        self.lock = threading.RLock()
        self.jobs: dict[str, Job] = {}
        self.queue: queue.Queue[str] = queue.Queue(maxsize=config.max_queue)
        self.rates: dict[str, collections.deque[float]] = {}
        self.rate_salt = secrets.token_bytes(32)
        self.stopping = threading.Event()
        self._restore()
        threading.Thread(target=self._worker, name="voice-worker", daemon=True).start()
        threading.Thread(target=self._janitor, name="voice-cleanup", daemon=True).start()

    def ready(self) -> bool:
        return all(path.is_file() for path in (self.config.python, self.config.app / "inference.py", self.config.piper_binary, self.config.piper_model)) and bool(shutil.which("ffmpeg"))

    def health(self) -> dict:
        with self.lock:
            pending = sum(job.status == "queued" for job in self.jobs.values())
            active = sum(job.status == "processing" for job in self.jobs.values())
        return {
            "ok": True, "ready": self.ready() and shutil.disk_usage(self.config.data_root).free > 2 * 1024**3,
            "engine": "Seed-VC + Piper · AGX", "beta": True,
            "queue": {"pending": pending, "processing": active, "capacity": self.config.max_queue},
            "limits": {"reference_min_seconds": 5, "reference_max_seconds": MAX_REFERENCE_SECONDS,
                       "source_max_seconds": MAX_SOURCE_SECONDS, "file_max_bytes": MAX_FILE_BYTES,
                       "text_max_characters": MAX_TEXT, "retention_hours": 24, "jobs_per_hour": self.config.per_hour},
        }

    def _directory(self, job_id: str) -> Path:
        if not ID_PATTERN.fullmatch(job_id):
            raise UserError("Création introuvable ou expirée.", 404)
        return self.config.data_root / job_id

    def _persist(self, job: Job):
        directory = self._directory(job.id)
        if job.cancel.is_set() or not directory.is_dir():
            return
        temporary = directory / "job.json.tmp"
        temporary.write_text(json.dumps(job.metadata(), ensure_ascii=False), encoding="utf-8")
        temporary.replace(directory / "job.json")

    def _restore(self):
        now = time.time()
        for directory in self.config.data_root.iterdir():
            if not directory.is_dir() or not ID_PATTERN.fullmatch(directory.name):
                continue
            try:
                data = json.loads((directory / "job.json").read_text(encoding="utf-8"))
                if data.get("id") != directory.name or now - float(data["created_at"]) >= TTL_SECONDS:
                    shutil.rmtree(directory)
                    continue
                job = Job(**{key: data[key] for key in ("id", "mode", "created_at", "status", "progress", "stage", "error", "duration_seconds") if key in data})
                if job.status in {"queued", "processing"}:
                    job.status = "failed"; job.stage = "Interrompu"; job.error = "Le service a redémarré pendant cette création. Réessayez."
                    self._discard_inputs(directory)
                self.jobs[job.id] = job
                self._persist(job)
            except (OSError, ValueError, KeyError, TypeError):
                shutil.rmtree(directory, ignore_errors=True)

    def rate_limit(self, client: str):
        now = time.monotonic()
        key = hashlib.sha256(self.rate_salt + client.encode("utf-8")).hexdigest()
        with self.lock:
            # Bound memory even if a proxy receives many distinct visitors.
            for old in [item for item, values in self.rates.items() if not values or now - values[-1] > 3600]:
                self.rates.pop(old, None)
            if key not in self.rates and len(self.rates) >= 5000:
                raise UserError("Le studio est très sollicité. Réessayez plus tard.", 429)
            values = self.rates.setdefault(key, collections.deque())
            while values and now - values[0] > 3600:
                values.popleft()
            if len(values) >= self.config.per_hour:
                raise UserError(f"Limite de {self.config.per_hour} créations par heure atteinte. Réessayez plus tard.", 429)
            values.append(now)

    def create(self, fields: dict[str, str], files: dict[str, bytes]) -> Job:
        if not self.health()["ready"]:
            raise UserError("Le moteur vocal est temporairement indisponible ou le SSD manque d’espace.", 503)
        with self.lock:
            active = sum(job.status in {"queued", "processing"} for job in self.jobs.values())
            if active >= self.config.max_queue or self.queue.full() or len(self.jobs) >= MAX_STORED_JOBS:
                raise UserError("La file du studio est pleine. Réessayez après quelques minutes.", 429)
            job = Job(secrets.token_urlsafe(32), fields["mode"], time.time())
            directory = self._directory(job.id)
            directory.mkdir(mode=0o700)
            try:
                for name, payload in files.items():
                    (directory / f"{name}.upload").write_bytes(payload)
                if job.mode == "text":
                    (directory / "text.txt").write_text(fields["text"], encoding="utf-8")
                self.jobs[job.id] = job
                self._persist(job)
                self.queue.put_nowait(job.id)
            except Exception:
                self.jobs.pop(job.id, None)
                shutil.rmtree(directory, ignore_errors=True)
                raise
            return job

    def public_job(self, job_id: str) -> dict:
        self._directory(job_id)
        with self.lock:
            job = self.jobs.get(job_id)
            if not job or job.cancel.is_set() or time.time() - job.created_at >= TTL_SECONDS:
                raise UserError("Création introuvable ou expirée.", 404)
            result = {key: value for key, value in job.metadata().items() if key != "created_at"}
            result.update({"created_at": iso_time(job.created_at), "expires_at": iso_time(job.created_at + TTL_SECONDS),
                           "status_url": f"{PREFIX}/jobs/{job.id}", "audio_url": f"{PREFIX}/jobs/{job.id}/audio" if job.status == "completed" else None})
            if job.status == "queued":
                result["queue_position"] = 1 + sum(other.status == "queued" and other.created_at < job.created_at for other in self.jobs.values())
            return result

    def delete(self, job_id: str):
        directory = self._directory(job_id)
        with self.lock:
            job = self.jobs.pop(job_id, None)
            if not job:
                raise UserError("Création introuvable ou expirée.", 404)
            job.cancel.set()
            process = job.process
        if process and process.poll() is None:
            self._terminate(process)
        # Active worker owns cleanup after process termination.
        if job.status != "processing":
            shutil.rmtree(directory, ignore_errors=True)

    def _update(self, job: Job, status: str, progress: int, stage: str):
        if job.cancel.is_set():
            raise Cancelled()
        with self.lock:
            job.status = status; job.progress = progress; job.stage = stage
            self._persist(job)

    @staticmethod
    def _terminate(process: subprocess.Popen):
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except (ProcessLookupError, PermissionError):
            return
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass

    def _run(self, job: Job, command: list[str], *, cwd: Path | None = None, input_text: str | None = None, timeout: int = 90):
        if job.cancel.is_set():
            raise Cancelled()
        directory = self._directory(job.id)
        env = os.environ.copy()
        env.update({"HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1", "HF_HOME": str(self.config.seed_root / "checkpoints/hf_cache"),
                    "TMPDIR": str(directory), "OMP_NUM_THREADS": "3", "OPENBLAS_NUM_THREADS": "3", "MKL_NUM_THREADS": "3", "PYTHONUNBUFFERED": "1"})
        with (directory / "engine.log").open("ab") as log:
            process = subprocess.Popen(command, cwd=cwd, env=env, stdin=subprocess.PIPE if input_text is not None else subprocess.DEVNULL,
                                       stdout=log, stderr=log, start_new_session=True, shell=False)
            with self.lock:
                job.process = process
            try:
                process.communicate(input=input_text.encode("utf-8") if input_text is not None else None, timeout=timeout)
                if job.cancel.is_set():
                    raise Cancelled()
                if process.returncode:
                    raise UserError("Le moteur n’a pas pu traiter cet audio. Essayez une voix seule, claire, sans musique ni silence prolongé.")
            except subprocess.TimeoutExpired as exc:
                self._terminate(process)
                raise UserError("Cette création a dépassé le temps disponible. Réessayez avec un extrait plus court.") from exc
            finally:
                with self.lock:
                    job.process = None

    def _decode(self, job: Job, kind: str) -> float:
        directory = self._directory(job.id)
        # Permit media containers only; playlists and external protocols are not input formats.
        self._run(job, ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-max_alloc", "67108864",
                        "-protocol_whitelist", "file,pipe", "-format_whitelist", "wav,mp3,flac,ogg,mov,matroska,webm,aac,amr,aiff",
                        "-probesize", "5000000", "-analyzeduration", "5000000", "-i", str(directory / f"{kind}.upload"),
                        "-map", "0:a:0", "-vn", "-sn", "-dn", "-t", "31", "-ac", "1", "-ar", "22050", "-c:a", "pcm_s16le", str(directory / f"{kind}.wav")])
        with wave.open(str(directory / f"{kind}.wav"), "rb") as audio:
            duration = audio.getnframes() / audio.getframerate()
            samples = array.array("h", audio.readframes(audio.getnframes()))
        if not samples or math.sqrt(sum(sample * sample for sample in samples) / len(samples)) < 20:
            raise UserError("Cet enregistrement est silencieux ou trop faible. Enregistrez une voix claire, plus près du micro.")
        if kind == "reference" and not 5 <= duration <= MAX_REFERENCE_SECONDS + 0.5:
            raise UserError("La référence doit durer entre 5 et 30 secondes.")
        if kind == "source" and not 0.5 <= duration <= MAX_SOURCE_SECONDS + 0.5:
            raise UserError("La source doit durer entre 0,5 et 30 secondes dans cette bêta.")
        if duration > 30:
            # MediaRecorder may append a few Opus/AAC frames after the 30s timer.
            # Accept up to 0.5s of codec/timer margin, but give the engine at most 30s.
            with wave.open(str(directory / f"{kind}.wav"), "wb") as output:
                output.setnchannels(1); output.setsampwidth(2); output.setframerate(22050)
                output.writeframes(samples[:30 * 22050].tobytes())
            duration = 30.0
        return duration

    @staticmethod
    def _discard_inputs(directory: Path):
        for name in ("reference.upload", "source.upload", "reference.wav", "source.wav", "text.txt"):
            (directory / name).unlink(missing_ok=True)
        shutil.rmtree(directory / "conversion", ignore_errors=True)

    def _convert(self, job: Job):
        directory = self._directory(job.id)
        self._update(job, "processing", 5, "Vérification de la référence vocale")
        self._decode(job, "reference")
        if job.mode == "text":
            self._update(job, "processing", 15, "Préparation de la lecture en français")
            text = (directory / "text.txt").read_text(encoding="utf-8")
            self._run(job, [str(self.config.piper_binary), "--model", str(self.config.piper_model), "--output_file", str(directory / "source.wav"),
                            "--length_scale", "1.0", "--sentence_silence", "0.15", "--quiet"], input_text=" ".join(text.split()) + "\n")
            with wave.open(str(directory / "source.wav"), "rb") as audio:
                duration = audio.getnframes() / audio.getframerate()
            if duration > MAX_SOURCE_SECONDS + 0.15:
                raise UserError("Ce texte produit plus de 30 secondes de voix. Raccourcissez-le et réessayez.")
        else:
            self._update(job, "processing", 15, "Préparation de la source audio")
            duration = self._decode(job, "source")
        self._update(job, "processing", 30, "Conversion du timbre sur le GPU AGX")
        # Acquire a process lock so accidental second instances cannot run a second GPU job.
        import fcntl
        with (self.config.data_root / "gpu.lock").open("a") as gpu_lock:
            fcntl.flock(gpu_lock, fcntl.LOCK_EX)
            if job.cancel.is_set():
                raise Cancelled()
            self._run(job, [str(self.config.python), str(self.config.app / "inference.py"),
                            "--source", str(directory / "source.wav"), "--target", str(directory / "reference.wav"), "--output", str(directory / "conversion"),
                            "--diffusion-steps", str(self.config.steps), "--length-adjust", "1.0", "--inference-cfg-rate", "0.7",
                            "--f0-condition", "True" if job.mode == "audio" else "False", "--auto-f0-adjust", "False", "--fp16", "True"],
                      cwd=self.config.seed_root, timeout=self.config.timeout)
        outputs = list((directory / "conversion").glob("*.wav"))
        if len(outputs) != 1:
            raise UserError("Le moteur n’a pas produit de fichier audio exploitable.")
        self._update(job, "processing", 90, "Création des fichiers WAV et MP3")
        self._run(job, ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", str(outputs[0]), "-map_metadata", "-1",
                        "-af", "alimiter=limit=0.95:level=false", "-c:a", "pcm_s16le", str(directory / "result.wav")])
        self._run(job, ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", str(directory / "result.wav"), "-map_metadata", "-1",
                        "-c:a", "libmp3lame", "-b:a", "256k", str(directory / "result.mp3")])
        with wave.open(str(directory / "result.wav"), "rb") as audio:
            result_duration = audio.getnframes() / audio.getframerate()
            if not math.isfinite(result_duration) or result_duration < 0.2 or result_duration > 35:
                raise UserError("La durée du résultat est incorrecte. Réessayez avec un autre extrait.")
        self._discard_inputs(directory)
        job.duration_seconds = round(result_duration, 3)
        self._update(job, "completed", 100, "Votre voix est prête")

    def _worker(self):
        while not self.stopping.is_set():
            try:
                job_id = self.queue.get(timeout=1)
            except queue.Empty:
                continue
            with self.lock:
                job = self.jobs.get(job_id)
            if not job:
                self.queue.task_done(); continue
            try:
                self._convert(job)
            except Cancelled:
                pass
            except Exception as exc:
                LOGGER.warning("Création interrompue (%s).", type(exc).__name__)
                if not job.cancel.is_set():
                    job.error = str(exc) if isinstance(exc, UserError) else "Le moteur vocal a rencontré une erreur. Réessayez avec un extrait plus court."
                    try:
                        self._update(job, "failed", 0, "Création interrompue")
                    except Cancelled:
                        pass
                    self._discard_inputs(self._directory(job.id))
            finally:
                if job.cancel.is_set():
                    shutil.rmtree(self._directory(job.id), ignore_errors=True)
                self.queue.task_done()

    def _janitor(self):
        while not self.stopping.wait(60):
            with self.lock:
                expired = [job.id for job in self.jobs.values() if time.time() - job.created_at >= TTL_SECONDS]
            for job_id in expired:
                try:
                    self.delete(job_id)
                except UserError:
                    pass

    def close(self):
        self.stopping.set()
        with self.lock:
            active = [job for job in self.jobs.values() if job.status == "processing"]
        for job in active:
            job.cancel.set()
            if job.process:
                self._terminate(job.process)


class StudioServer(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 8

    def __init__(self, address: tuple[str, int], studio: Studio):
        self.studio = studio
        self.slots = threading.BoundedSemaphore(8)
        super().__init__(address, Handler)

    def process_request(self, request, client_address):
        if not self.slots.acquire(blocking=False):
            try:
                request.sendall(b"HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n")
            finally:
                self.shutdown_request(request)
            return
        super().process_request(request, client_address)

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.slots.release()


class Handler(BaseHTTPRequestHandler):
    server_version = "ManixVoiceStudio/1.0"
    protocol_version = "HTTP/1.0"

    @property
    def studio(self) -> Studio:
        return self.server.studio

    def setup(self):
        super().setup()
        self.connection.settimeout(35)

    def log_message(self, format, *args):
        # Capability tokens and filenames must never enter access logs.
        LOGGER.info("HTTP %s", self.command)

    def _headers(self):
        self.send_header("Cache-Control", "no-store, private")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        origin = self.headers.get("Origin", "")
        if origin in self.studio.config.allowed_origins:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")

    def _json(self, status: int, result: dict):
        payload = json.dumps(result, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        if status == 429:
            self.send_header("Retry-After", "3600")
        self.end_headers()
        self.wfile.write(payload)

    def _route(self):
        split = urlsplit(self.path)
        path = split.path.rstrip("/")
        if path == PREFIX + "/health" and self.command == "GET":
            self._json(200, self.studio.health()); return
        if path == PREFIX + "/jobs" and self.command == "POST":
            origin = self.headers.get("Origin", "")
            if origin and origin not in self.studio.config.allowed_origins:
                raise UserError("Cette origine n’est pas autorisée à utiliser le studio.", 403)
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError as exc:
                raise UserError("Taille du formulaire invalide.") from exc
            if length <= 0 or length > MAX_BODY_BYTES:
                raise UserError("Le formulaire est vide ou dépasse 40 Mo.", 413)
            # Headers are trusted only on the loopback socket. The proxy MUST overwrite them.
            forwarded = self.headers.get("CF-Connecting-IP") or self.headers.get("X-Voice-Studio-Client-IP")
            try:
                client = str(ipaddress.ip_address(forwarded)) if forwarded else self.client_address[0]
            except ValueError:
                client = self.client_address[0]
            self.studio.rate_limit(client)
            body = self.rfile.read(length)
            if len(body) != length:
                raise UserError("L’envoi a été interrompu. Réessayez.")
            fields, files = parse_multipart(self.headers.get("Content-Type", ""), body)
            job = self.studio.create(fields, files)
            self._json(202, self.studio.public_job(job.id)); return
        match = re.fullmatch(re.escape(PREFIX) + r"/jobs/([A-Za-z0-9_-]{43})(/audio)?", path)
        if not match:
            raise UserError("Cette adresse du studio est introuvable.", 404)
        job_id, audio_suffix = match.groups()
        if self.command == "DELETE" and not audio_suffix:
            self.studio.delete(job_id); self._json(200, {"deleted": True}); return
        if self.command != "GET":
            raise UserError("Méthode non autorisée.", 405)
        job = self.studio.public_job(job_id)
        if not audio_suffix:
            self._json(200, job); return
        if job["status"] != "completed":
            raise UserError("Le résultat audio n’est pas encore disponible.", 409)
        format = parse_qs(split.query).get("format", ["wav"])[0]
        if format not in {"wav", "mp3"}:
            raise UserError("Choisissez le format wav ou mp3.")
        try:
            with (self.studio._directory(job_id) / f"result.{format}").open("rb") as audio:
                self.send_response(200); self._headers()
                self.send_header("Content-Type", "audio/wav" if format == "wav" else "audio/mpeg")
                self.send_header("Content-Disposition", f'inline; filename="ma-voix-by-manix.{format}"')
                self.send_header("Content-Length", str(os.fstat(audio.fileno()).st_size))
                self.end_headers()
                shutil.copyfileobj(audio, self.wfile, length=64 * 1024)
        except FileNotFoundError as exc:
            raise UserError("Le résultat a été supprimé ou a expiré.", 404) from exc

    def _handle(self):
        try:
            self._route()
        except UserError as exc:
            self._json(exc.status, {"error": str(exc)})
        except (BrokenPipeError, ConnectionResetError, socket.timeout):
            pass
        except Exception as exc:
            LOGGER.error("Requête interrompue (%s).", type(exc).__name__)
            self._json(500, {"error": "Le studio a rencontré une erreur temporaire."})

    do_GET = _handle
    do_POST = _handle
    do_DELETE = _handle

    def do_OPTIONS(self):
        origin = self.headers.get("Origin", "")
        if origin not in self.studio.config.allowed_origins:
            self._json(403, {"error": "Origine non autorisée."}); return
        self.send_response(204); self._headers()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Content-Length", "0"); self.end_headers()


def main():
    parser = argparse.ArgumentParser(description="Manix Voice Studio AGX API")
    parser.add_argument("--check", action="store_true", help="Valide la configuration sans lancer de calcul GPU")
    args = parser.parse_args()
    os.umask(0o077)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    config = Config.from_env()
    studio = Studio(config)
    if args.check:
        print(json.dumps(studio.health(), ensure_ascii=False)); studio.close(); return
    server = StudioServer((config.host, config.port), studio)
    def stop(*_):
        studio.close()
        threading.Thread(target=server.shutdown, daemon=True).start()
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    LOGGER.info("Studio vocal prêt sur le port loopback %s.", config.port)
    try:
        server.serve_forever(poll_interval=0.5)
    finally:
        studio.close(); server.server_close()


if __name__ == "__main__":
    main()
