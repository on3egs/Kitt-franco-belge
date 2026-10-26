"""Uploads audio communautaires modérés, indépendants du lecteur CD local."""
from __future__ import annotations

import asyncio
import logging
import struct
import time
import uuid
from pathlib import Path, PurePosixPath, PureWindowsPath
from typing import Callable
from urllib.parse import unquote

from aiohttp import ClientPayloadError, web

MAX_AUDIO_BYTES = 64 * 1024 * 1024
CHUNK_SIZE = 64 * 1024
MAX_METADATA_BYTES = 8192
TRANSCODE_TIMEOUT = 300
ALLOWED_EXTENSIONS = {".mp3", ".wav", ".ogg", ".flac", ".m4a"}
METADATA_FIELDS = {"titre", "artiste", "pseudo", "message", "theme", "creation_type", "rights_confirmed", "license_note", "theme_note"}
CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Expose-Headers": "Accept-Ranges,Content-Range,Content-Length,Content-Type",
    "X-Content-Type-Options": "nosniff",
}
_log = logging.getLogger(__name__)


class UploadError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def _json_error(message: str, status: int) -> web.Response:
    return web.json_response({"ok": False, "error": message}, status=status, headers=CORS)


def _metadata(fields: dict[str, str]) -> dict:
    if fields.get("theme") != "knight-rider":
        raise UploadError("Thème invalide")
    if fields.get("creation_type") not in ("original", "ai", "licensed"):
        raise UploadError("Type de création invalide")
    if fields.get("rights_confirmed") != "true":
        raise UploadError("Confirmation des droits requise")
    for name, label in (("license_note", "l’origine ou la licence"), ("theme_note", "le lien avec le thème")):
        if not 8 <= len(fields.get(name, "").strip()) <= 500:
            raise UploadError(f"Précise {label} (8 à 500 caractères)")
    return {
        "titre": (fields.get("titre", "").strip() or "Sans titre")[:80],
        "artiste": (fields.get("artiste", "").strip() or "Inconnu")[:80],
        "pseudo": (fields.get("pseudo", "").strip() or "Anonyme")[:50],
        "message": fields.get("message", "").strip()[:300],
        "theme": "knight-rider", "creation_type": fields["creation_type"],
        "rights_confirmed": True, "license_note": fields["license_note"].strip(),
        "theme_note": fields["theme_note"].strip(),
    }


def _wav_signature(stream, size: int) -> bool:
    stream.seek(0)
    head = stream.read(12)
    if len(head) != 12 or head[:4] != b"RIFF" or head[8:] != b"WAVE":
        return False
    end = struct.unpack("<I", head[4:8])[0] + 8
    if not 12 <= end <= size:
        return False
    fmt = data = False
    for _ in range(4096):
        if stream.tell() + 8 > end:
            break
        chunk = stream.read(8)
        length = struct.unpack("<I", chunk[4:])[0]
        start = stream.tell()
        if start + length > end:
            return False
        if chunk[:4] == b"fmt " and length >= 16:
            encoding, channels, rate, _, align, _ = struct.unpack("<HHIIHH", stream.read(16))
            fmt = encoding != 0 and 0 < channels <= 64 and rate > 0 and align > 0
        elif chunk[:4] == b"data":
            data = length > 0
        if fmt and data:
            return True
        stream.seek(start + length + (length & 1))
    return False


def _mp3_signature(stream, size: int) -> bool:
    stream.seek(0)
    head = stream.read(10)
    offset = 0
    tagged = head[:3] == b"ID3"
    if tagged:
        if len(head) < 10 or head[3] not in (2, 3, 4) or any(value & 128 for value in head[6:10]):
            return False
        offset = 10 + sum(head[6 + index] << (7 * (3 - index)) for index in range(4))
        if head[3] == 4 and head[5] & 16:
            offset += 10
    if offset + 4 > size:
        return False
    stream.seek(offset)
    frame = stream.read(min(4096 if tagged else 4, size - offset))
    for index in range(max(0, len(frame) - 3)):
        a, b, c, _ = frame[index:index + 4]
        version = (b >> 3) & 3
        bitrate_index, sample_index = c >> 4, (c >> 2) & 3
        if a != 255 or b & 224 != 224 or version == 1 or (b >> 1) & 3 != 1 or not 1 <= bitrate_index <= 14 or sample_index == 3:
            continue
        bitrate = ([32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320] if version == 3 else [8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160])[bitrate_index - 1]
        rate = [44100, 48000, 32000][sample_index] // (1 if version == 3 else 2 if version == 2 else 4)
        length = (144000 if version == 3 else 72000) * bitrate // rate + ((c >> 1) & 1)
        if offset + index + length <= size:
            return True
    return False


def _ogg_signature(stream, size: int) -> bool:
    stream.seek(0)
    head = stream.read(27)
    if len(head) < 27 or head[:5] != b"OggS\x00" or not head[5] & 2 or not head[26]:
        return False
    segments = stream.read(head[26])
    if len(segments) != head[26] or 27 + head[26] + sum(segments) > size:
        return False
    packet = stream.read(min(sum(segments), 64))
    return ((packet.startswith(b"OpusHead") and len(packet) >= 19 and packet[9] > 0)
            or (packet.startswith(b"\x01vorbis") and len(packet) >= 30 and packet[11] > 0)
            or (packet.startswith(b"\x7fFLAC") and len(packet) >= 13))


def _flac_signature(stream, size: int) -> bool:
    stream.seek(4)
    offset = 4
    for index in range(1024):
        header = stream.read(4)
        if len(header) != 4 or header[0] & 127 == 127:
            return False
        length = int.from_bytes(header[1:], "big")
        if index == 0 and (header[0] & 127 != 0 or length != 34):
            return False
        offset += 4 + length
        if offset >= size:
            return False
        stream.seek(offset)
        if header[0] & 128:
            return True
    return False


def _m4a_signature(stream, size: int) -> bool:
    audio = video = data = brand = False
    boxes = 0

    def visit(start, end, depth=0):
        nonlocal audio, video, data, brand, boxes
        if depth > 6:
            return False
        position = start
        while position + 8 <= end:
            boxes += 1
            if boxes > 4096:
                return False
            stream.seek(position)
            header = stream.read(8)
            if len(header) < 8:
                return False
            length, kind = struct.unpack(">I4s", header)
            header_length = 8
            if length == 1:
                extended = stream.read(8)
                if len(extended) != 8:
                    return False
                length, header_length = int.from_bytes(extended, "big"), 16
            elif length == 0:
                length = end - position
            if length < header_length or position + length > end:
                return False
            payload = position + header_length
            if kind == b"ftyp":
                stream.seek(payload)
                brands = stream.read(min(length - header_length, 256))
                brand = any(value in brands for value in (b"M4A ", b"M4B ", b"isom", b"iso2", b"mp41", b"mp42", b"qt  "))
            elif kind == b"mdat":
                data = length > header_length
            elif kind == b"hdlr":
                stream.seek(payload)
                handler = stream.read(12)
                audio |= len(handler) == 12 and handler[8:] == b"soun"
                video |= len(handler) == 12 and handler[8:] == b"vide"
            elif kind in (b"moov", b"trak", b"mdia"):
                if not visit(payload, position + length, depth + 1):
                    return False
            position += length
        return position == end

    return visit(0, size) and brand and audio and data and not video


def detect_audio(path: Path) -> tuple[str, str]:
    """Vérifie des structures audio réelles ; ne croit jamais le MIME envoyé."""
    size = path.stat().st_size
    with path.open("rb") as stream:
        header = stream.read(12)
        if header[:4] == b"RIFF" and _wav_signature(stream, size):
            return ".wav", "audio/wav"
        if (header[:3] == b"ID3" or header[:1] == b"\xff") and _mp3_signature(stream, size):
            return ".mp3", "audio/mpeg"
        if header[:4] == b"OggS" and _ogg_signature(stream, size):
            return ".ogg", "audio/ogg"
        if header[:4] == b"fLaC" and _flac_signature(stream, size):
            return ".flac", "audio/flac"
        if header[4:8] == b"ftyp" and _m4a_signature(stream, size):
            return ".m4a", "audio/mp4"
    raise UploadError("Fichier audio invalide ou non reconnu : utilise un vrai MP3, WAV, OGG, FLAC ou M4A")


async def encode_audio_for_web(source: Path, target: Path, *, timeout: float = TRANSCODE_TIMEOUT) -> None:
    """Écrit un MP3 réseau léger dans un temporaire appartenant à cet upload."""
    process = await asyncio.create_subprocess_exec(
        "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
        "-threads", "2", "-i", str(source), "-map", "0:a:0", "-vn",
        "-map_metadata", "-1", "-c:a", "libmp3lame", "-b:a", "128k",
        "-ac", "2", "-ar", "44100", "-threads", "2", "-f", "mp3", str(target),
        stdin=asyncio.subprocess.DEVNULL, stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    try:
        return_code = await asyncio.wait_for(process.wait(), timeout=timeout)
    except BaseException:
        if process.returncode is None:
            try:
                process.kill()
            except ProcessLookupError:
                pass
        await process.wait()
        raise
    if return_code != 0:
        raise RuntimeError("Conversion audio indisponible")


def setup_community_music(
    app: web.Application, *, media_dir: Path, load_music: Callable,
    save_music: Callable, is_admin: Callable, notify: Callable | None = None,
    max_audio_bytes: int = MAX_AUDIO_BYTES,
    encode_audio: Callable = encode_audio_for_web, transcode_timeout: float = TRANSCODE_TIMEOUT,
) -> None:
    """Branche les routes sur le stockage/modérateur existants, sans secret propre."""
    media_dir = Path(media_dir).resolve()
    media_dir.mkdir(parents=True, exist_ok=True, mode=0o750)
    mutation_lock = asyncio.Lock()
    encode_lock = asyncio.Semaphore(1)

    async def upload(request: web.Request) -> web.Response:
        partial = final = None
        committed = partial_owned = final_owned = False
        playback_partial = playback_final = None
        playback_partial_owned = playback_final_owned = False
        try:
            if request.content_length and request.content_length > max_audio_bytes + 32768:
                raise UploadError("Fichier trop volumineux : 64 Mio maximum", 413)
            if request.content_type != "multipart/form-data":
                raise UploadError("Envoie un formulaire multipart avec un fichier audio")
            reader = await request.multipart()
            fields, filename, filesize, metadata_size = {}, None, 0, 0
            entry_id = str(uuid.uuid4())
            async for part in reader:
                if part.name in ("audio", "file") and part.filename is not None:
                    if filename is not None:
                        raise UploadError("Un seul fichier audio est autorisé")
                    filename = PurePosixPath(PureWindowsPath(unquote(part.filename, errors="strict")).name).name
                    if not filename or len(filename) > 255 or any(ord(char) < 32 for char in filename) or Path(filename).suffix.lower() not in ALLOWED_EXTENSIONS:
                        raise UploadError("Extension non prise en charge : MP3, WAV, OGG, FLAC ou M4A requis")
                    if part.headers.get("Content-Encoding") or part.headers.get("Content-Transfer-Encoding"):
                        raise UploadError("Envoie le fichier audio brut sans encodage supplémentaire")
                    partial = media_dir / f"{entry_id}.part"
                    with partial.open("xb") as output:
                        partial_owned = True
                        while chunk := await part.read_chunk(CHUNK_SIZE):
                            filesize += len(chunk)
                            if filesize > max_audio_bytes:
                                raise UploadError("Fichier trop volumineux : 64 Mio maximum", 413)
                            output.write(chunk)
                    if not filesize:
                        raise UploadError("Le fichier audio est vide")
                else:
                    if part.name not in METADATA_FIELDS or part.name in fields or part.filename is not None:
                        raise UploadError("Champ de formulaire inconnu ou répété")
                    value = bytearray()
                    while chunk := await part.read_chunk(2048):
                        metadata_size += len(chunk)
                        if metadata_size > MAX_METADATA_BYTES or len(value) + len(chunk) > 2048:
                            raise UploadError("Métadonnées trop volumineuses", 413)
                        value.extend(chunk)
                    fields[part.name] = value.decode("utf-8")
            if partial is None:
                raise UploadError("Sélectionne un fichier audio")
            metadata = _metadata(fields)
            extension, content_type = detect_audio(partial)
            final = media_dir / f"{entry_id}{extension}"
            if final.exists():
                raise OSError("Collision de nom de stockage")
            partial.rename(final)
            partial_owned, final_owned = False, True
            playback = {"playback_status": "failed"}
            try:
                # Le délai comprend l'attente d'un encodeur libre ; un seul
                # ffmpeg à deux threads évite de concurrencer tous les uploads.
                async with asyncio.timeout(transcode_timeout):
                    async with encode_lock:
                        playback_partial = media_dir / f"{entry_id}.web.mp3.part"
                        playback_final = media_dir / f"{entry_id}.web.mp3"
                        if playback_final.exists():
                            raise OSError("Copie de lecture déjà présente")
                        with playback_partial.open("xb"):
                            playback_partial_owned = True
                        await encode_audio(final, playback_partial, timeout=transcode_timeout)
                        if detect_audio(playback_partial) != (".mp3", "audio/mpeg"):
                            raise RuntimeError("Copie de lecture invalide")
                        if playback_final.exists():
                            raise OSError("Copie de lecture déjà présente")
                        playback_partial.rename(playback_final)
                        playback_partial_owned, playback_final_owned = False, True
                        playback = {
                            "playback_status": "ready", "playback_filename": playback_final.name,
                            "playback_content_type": "audio/mpeg", "playback_filesize": playback_final.stat().st_size,
                        }
            except Exception:
                # L'original de l'utilisateur reste soumis à la modération ;
                # un problème de conversion ne doit jamais le faire perdre.
                _log.warning("Copie MP3 indisponible pour une nouvelle musique ; original conservé en attente")
            entry = {
                **metadata, "id": entry_id, "url": f"/api/music/file/{entry_id}",
                "ts": int(time.time()), "plays": 0, "hosted": True,
                "filename": filename, "storage_filename": final.name,
                "content_type": content_type, "filesize": filesize,
                **playback,
            }
            async with mutation_lock:
                data = load_music()
                data.setdefault("pending", []).append(entry)
                save_music(data)
                committed = True
            if notify is not None:
                try:
                    await notify(f"[KITT] Nouvelle musique envoyée\nTitre : {entry['titre']}\nArtiste : {entry['artiste']}\nPar : {entry['pseudo']}")
                except Exception:
                    _log.warning("Notification d’une soumission musicale indisponible")
            return web.json_response({"ok": True, "id": entry_id, "status": "pending", "url": entry["url"], "hosted": True, "playback_status": entry["playback_status"]}, status=201, headers=CORS)
        except UploadError as error:
            return _json_error(str(error), error.status)
        except (ValueError, AssertionError, UnicodeError, ClientPayloadError, ConnectionError):
            return _json_error("Formulaire incomplet ou invalide", 400)
        except OSError:
            _log.exception("Échec du stockage d’un upload musical")
            return _json_error("Impossible d’enregistrer ce fichier pour le moment", 500)
        finally:
            if partial is not None and partial_owned:
                partial.unlink(missing_ok=True)
            if final is not None and final_owned and not committed:
                final.unlink(missing_ok=True)
            if playback_partial is not None and playback_partial_owned:
                playback_partial.unlink(missing_ok=True)
            if playback_final is not None and playback_final_owned and not committed:
                playback_final.unlink(missing_ok=True)

    async def serve_file(request: web.Request) -> web.StreamResponse:
        entry_id = request.match_info["id"]
        try:
            if str(uuid.UUID(entry_id)) != entry_id:
                raise ValueError
        except ValueError:
            return _json_error("Fichier introuvable ou non publié", 404)
        data = load_music()
        entries = list(data.get("approved", []))
        if is_admin(request):
            entries += data.get("pending", [])
        entry = next((item for item in entries if item.get("id") == entry_id and item.get("hosted") is True), None)
        stored = entry.get("storage_filename", "") if entry else ""
        content_type = entry.get("content_type", "application/octet-stream") if entry else "application/octet-stream"
        optimized = f"{entry_id}.web.mp3"
        optimized_path = media_dir / optimized
        if (entry and entry.get("playback_filename") == optimized
                and optimized_path.resolve().parent == media_dir and optimized_path.is_file()):
            return web.FileResponse(optimized_path, headers={
                **CORS, "Content-Type": "audio/mpeg", "Cache-Control": "private, no-store",
                "Vary": "X-Admin-Token", "Content-Disposition": f'inline; filename="{optimized}"',
            })
        path = media_dir / stored
        if (not stored or Path(stored).name != stored or Path(stored).stem != entry_id
                or Path(stored).suffix not in ALLOWED_EXTENSIONS or path.resolve().parent != media_dir or not path.is_file()):
            return _json_error("Fichier introuvable ou non publié", 404)
        return web.FileResponse(path, headers={
            **CORS, "Content-Type": content_type, "Cache-Control": "private, no-store",
            "Vary": "X-Admin-Token", "Content-Disposition": f'inline; filename="{stored}"',
        })

    async def options(_request: web.Request) -> web.Response:
        return web.Response(headers={**CORS, "Access-Control-Allow-Methods": "GET,HEAD,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,X-Admin-Token,Range"})

    app.router.add_post("/api/music-upload", upload)
    app.router.add_route("OPTIONS", "/api/music-upload", options)
    app.router.add_get("/api/music/file/{id}", serve_file)
    app.router.add_route("OPTIONS", "/api/music/file/{id}", options)
