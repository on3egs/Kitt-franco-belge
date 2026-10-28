"""Bounded shared AGX speech and manual dictation routes for the chat room."""
from __future__ import annotations

import asyncio
import hashlib
import json
import time
from collections import OrderedDict, defaultdict, deque
from collections.abc import Awaitable, Callable
from typing import Any

from aiohttp import web


def register_chat_audio_routes(
    app: web.Application, *,
    authenticate: Callable[[web.Request], Awaitable[str | None]],
    cors: Callable[[web.Response], web.Response],
    public_speech: Callable[[str, str, str], bool],
    speech_provider: Callable[[str, str], Awaitable[bytes]] | None,
    transcription_provider: Callable[[bytes, str], Awaitable[dict[str, Any]]] | None,
) -> None:
    cache: OrderedDict[str, bytes] = OrderedDict()
    pending: dict[str, asyncio.Task[bytes]] = {}
    attempts: dict[tuple[str, str], deque[float]] = defaultdict(deque)
    speech_slot = asyncio.Semaphore(1)
    transcription_slot = asyncio.Lock()
    cache_bytes = 0

    def limited(identity: str, kind: str, maximum: int) -> bool:
        now = time.monotonic()
        # Retire inactive client buckets so anonymous access cannot grow forever.
        for key, stamps in list(attempts.items()):
            if not stamps or stamps[-1] < now - 60:
                attempts.pop(key, None)
        bucket = attempts[(identity, kind)]
        while bucket and bucket[0] < now - 60:
            bucket.popleft()
        if len(bucket) >= maximum:
            return True
        bucket.append(now)
        return False

    def error(message: str, status: int) -> web.Response:
        return cors(web.json_response({"error": message}, status=status))

    async def speech(request: web.Request) -> web.Response:
        if speech_provider is None:
            return error("Les voix Guy de l’AGX ne sont pas disponibles.", 503)
        if request.content_length and request.content_length > 4096:
            return error("Texte vocal trop long.", 413)
        try:
            raw = bytearray()
            while not request.content.at_eof():
                raw.extend(await request.content.read(4097 - len(raw)))
                if len(raw) > 4096:
                    return error("Texte vocal trop long.", 413)
            body = json.loads(raw)
            if not isinstance(body, dict):
                raise ValueError
            text = body.get("text")
            speaker = body.get("speaker", "KITT")
            message_id = body.get("messageId", "")
            if not isinstance(text, str) or not text.strip() or len(text) > 600 or speaker not in ("KITT", "KARR"):
                raise ValueError
            text = " ".join(text.split())
        except (ValueError, TypeError):
            return error("Texte et personnage KITT ou KARR requis.", 400)
        owner = await authenticate(request)
        if owner is None:
            if request.headers.get("Authorization") or not isinstance(message_id, str) or not public_speech(message_id, text, speaker):
                return error("Connecte-toi au salon pour utiliser cette voix.", 401)
        identity = owner or request.remote or "guest"
        key = hashlib.sha256((speaker + "|guy-v1|" + text).encode()).hexdigest()

        async def generate() -> bytes:
            nonlocal cache_bytes
            try:
                async with speech_slot:
                    data = await speech_provider(text, speaker)
                if not isinstance(data, bytes) or len(data) < 44 or data[:4] != b"RIFF" or data[8:12] != b"WAVE" or len(data) > 4 * 1024 * 1024:
                    raise ValueError("Invalid speech output")
                cache[key] = data
                cache_bytes += len(data)
                while len(cache) > 64 or cache_bytes > 16 * 1024 * 1024:
                    _, previous = cache.popitem(last=False)
                    cache_bytes -= len(previous)
                return data
            finally:
                pending.pop(key, None)

        data = cache.get(key)
        if data is not None:
            cache.move_to_end(key)
        else:
            task = pending.get(key)
            if task is None:
                # Listening to an existing or shared synthesis costs no GPU job.
                # Count producers, so visitors behind one relay can all listen.
                if limited(identity, "speech", 40 if owner else 20):
                    return error("Trop de nouvelles lectures vocales. Patiente un instant.", 429)
                if len(pending) >= 6:
                    return error("La voix prépare déjà plusieurs réponses. Réessaie dans un instant.", 429)
                task = asyncio.create_task(generate())
                pending[key] = task
                task.add_done_callback(lambda done: done.exception() if not done.cancelled() else None)
            try:
                data = await asyncio.wait_for(asyncio.shield(task), timeout=45)
            except asyncio.CancelledError:
                raise
            except Exception:
                return error("La voix Guy n’a pas pu être produite. Réessaie dans un instant.", 503)
        return cors(web.Response(body=data, content_type="audio/wav", headers={
            "Cache-Control": "private, max-age=1800", "X-Kitt-Voice": "Guy KITT" if speaker == "KITT" else "Guy HD",
        }))

    async def transcribe(request: web.Request) -> web.Response:
        owner = await authenticate(request)
        if owner is None:
            return error("Connecte-toi au salon pour utiliser le micro.", 401)
        if transcription_provider is None:
            return error("La transcription AGX n’est pas disponible.", 503)
        if limited(owner, "transcribe", 10):
            return error("Trop de dictées. Patiente un instant.", 429)
        if request.content_length and request.content_length > 5 * 1024 * 1024 + 65536:
            return error("Enregistrement trop volumineux (5 Mo maximum).", 413)
        try:
            reader = await request.multipart()
            audio = bytearray()
            filename = "recording.webm"
            seen = False
            while True:
                part = await reader.next()
                if part is None:
                    break
                if part.name != "audio" or seen:
                    return error("Un seul enregistrement audio est attendu.", 400)
                seen = True
                filename = str(part.filename or filename)
                while True:
                    chunk = await part.read_chunk()
                    if not chunk:
                        break
                    audio.extend(chunk)
                    if len(audio) > 5 * 1024 * 1024:
                        return error("Enregistrement trop volumineux (5 Mo maximum).", 413)
            if not audio:
                return error("Aucun son reçu. Maintiens le bouton micro pour parler.", 400)
        except (ValueError, AssertionError):
            return error("Enregistrement audio invalide.", 400)
        if transcription_slot.locked():
            return error("L’AGX transcrit déjà une dictée. Réessaie dans un instant.", 429)
        try:
            async with transcription_slot:
                result = await transcription_provider(bytes(audio), filename)
            raw = str(result.get("text", "")).strip()
            text = " ".join(raw.split())
            return cors(web.json_response({"text": text[:500], "language": result.get("language", "fr"), "truncated": len(text) > 500}, headers={"Cache-Control": "no-store"}))
        except ValueError:
            return error("Audio illisible ou trop long : parle pendant 20 secondes maximum.", 400)
        except Exception:
            return error("La transcription n’a pas abouti. Vérifie ton micro puis réessaie.", 503)

    async def options(_request: web.Request) -> web.Response:
        return cors(web.Response(status=204))

    async def cleanup(_app: web.Application) -> None:
        tasks = list(pending.values())
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        cache.clear()

    app.on_cleanup.append(cleanup)

    app.router.add_post("/api/kitt-chat/speech", speech)
    app.router.add_post("/api/kitt-chat/transcribe", transcribe)
    app.router.add_route("OPTIONS", "/api/kitt-chat/speech", options)
    app.router.add_route("OPTIONS", "/api/kitt-chat/transcribe", options)
