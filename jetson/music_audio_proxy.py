"""Relais audio HTTP : plages réelles, type détecté et lecture sans durée limite."""
from __future__ import annotations

import asyncio
from collections import OrderedDict
import hashlib
from pathlib import Path
import re
import time
from urllib.parse import urlsplit

import aiohttp
from aiohttp import web

_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)
_TIMEOUT = aiohttp.ClientTimeout(total=None, connect=10, sock_connect=10, sock_read=30)
_RANGE_RE = re.compile(r"bytes=(?:\d+-\d*|-\d+)")
_CONTENT_RANGE_RE = re.compile(r"bytes (\d+)-(\d+)/(\d+|\*)")
_MIME_CACHE: OrderedDict[str, tuple[float, str]] = OrderedDict()
_MIME_CACHE_SIZE = 128
_MIME_CACHE_SECONDS = 3600
_PLAYBACK_CACHE_DIR = Path(__file__).resolve().parent / "data" / "music_playback_cache"
_CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges, ETag, Last-Modified",
    "X-Content-Type-Options": "nosniff",
}


def _known_mime(url: str) -> str | None:
    item = _MIME_CACHE.get(url)
    if item is None:
        return None
    timestamp, mime = item
    if time.monotonic() - timestamp >= _MIME_CACHE_SECONDS:
        _MIME_CACHE.pop(url, None)
        return None
    _MIME_CACHE.move_to_end(url)
    return mime


def _remember_mime(url: str, mime: str) -> None:
    _MIME_CACHE[url] = (time.monotonic(), mime)
    _MIME_CACHE.move_to_end(url)
    while len(_MIME_CACHE) > _MIME_CACHE_SIZE:
        _MIME_CACHE.popitem(last=False)


def _sniff_audio(data: bytes) -> str | None:
    if data.startswith(b"RIFF") and data[8:12] == b"WAVE":
        return "audio/wav"
    if data.startswith(b"fLaC"):
        return "audio/flac"
    if data.startswith(b"OggS"):
        return "audio/ogg"
    if data[4:8] == b"ftyp":
        return "audio/mp4"
    if data.startswith(b"ID3"):
        return "audio/mpeg"
    if len(data) >= 2 and data[0] == 0xFF and data[1] & 0xE0 == 0xE0:
        # Une trame MPEG comporte une couche non nulle ; ADTS/AAC utilise 00.
        return "audio/mpeg" if data[1] & 0x06 else "audio/aac"
    return None


def _declared_mime(header: str) -> str:
    mime = header.partition(";")[0].strip().lower()
    if mime.startswith("audio/") or mime in ("application/ogg", "application/octet-stream"):
        return mime
    return "application/octet-stream"


async def _prefix(response: aiohttp.ClientResponse) -> bytes:
    try:
        return await response.content.readexactly(64)
    except asyncio.IncompleteReadError as exc:
        return exc.partial


async def _probe_mime(session: aiohttp.ClientSession, url: str) -> str | None:
    """Une plage courte suffit pour une requête initiale à un offset non nul."""
    try:
        async with session.get(url, headers={"Range": "bytes=0-63", "User-Agent": _USER_AGENT, "Accept-Encoding": "identity"}) as response:
            if response.status not in (200, 206):
                return None
            if response.status == 206:
                match = _CONTENT_RANGE_RE.fullmatch(response.headers.get("Content-Range", ""))
                if not match or int(match.group(1)) != 0:
                    return None
            mime = _sniff_audio(await _prefix(response))
            if mime:
                _remember_mime(url, mime)
            return mime
    except (aiohttp.ClientError, asyncio.TimeoutError):
        return None


def audio_proxy_options() -> web.Response:
    return web.Response(headers={
        **_CORS,
        "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
        "Access-Control-Allow-Headers": "Range, If-Range, If-None-Match, If-Modified-Since",
        "Access-Control-Max-Age": "600",
    })


async def handle_audio_proxy(request: web.Request) -> web.StreamResponse:
    url = request.rel_url.query.get("url", "").strip()
    try:
        parsed = urlsplit(url)
        valid_url = (
            0 < len(url) <= 4096 and parsed.scheme.lower() in ("http", "https")
            and parsed.hostname and not parsed.username and not parsed.password
        )
        parsed.port  # Déclenche ValueError si le port est invalide.
    except ValueError:
        valid_url = False
    if not valid_url:
        return web.Response(status=400, text="Adresse audio HTTP(S) invalide.", headers=_CORS)

    if request.method == "OPTIONS":
        return audio_proxy_options()
    if request.method not in ("GET", "HEAD"):
        return web.Response(status=405, headers={**_CORS, "Allow": "GET, HEAD, OPTIONS"})
    requested_range = request.headers.get("Range")
    if requested_range and (len(requested_range) > 100 or not _RANGE_RE.fullmatch(requested_range)):
        return web.Response(status=416, text="Plage audio invalide.", headers=_CORS)

    # Ces fichiers sont préparés à part à partir des morceaux approuvés.
    # Aucun téléchargement ni transcodage ne se déclenche pendant la lecture.
    cache_file = _PLAYBACK_CACHE_DIR / (hashlib.sha256(url.encode("utf-8")).hexdigest() + ".mp3")
    try:
        if cache_file.is_file() and cache_file.stat().st_size > 0:
            return web.FileResponse(cache_file, headers={
                **_CORS,
                "Content-Type": "audio/mpeg",
                "Cache-Control": "public, max-age=3600",
            })
    except OSError:
        # Un cache absent ou inaccessible conserve le relais d'origine.
        pass

    is_head = request.method == "HEAD"
    head_probe = is_head and not requested_range
    headers = {"User-Agent": _USER_AGENT, "Accept-Encoding": "identity"}
    if requested_range:
        headers["Range"] = requested_range
    elif head_probe:
        # Certains hébergeurs renvoient une fausse taille nulle sur HEAD.
        headers["Range"] = "bytes=0-63"
    for name in ("If-Range", "If-None-Match", "If-Modified-Since"):
        if name in request.headers:
            headers[name] = request.headers[name]

    downstream: web.StreamResponse | None = None
    try:
        async with aiohttp.ClientSession(timeout=_TIMEOUT, auto_decompress=False) as session:
            # GET borné sur HEAD permet d'obtenir type et taille sans transférer le fichier.
            async with session.get(url, headers=headers) as upstream:
                output_headers = {**_CORS, "Cache-Control": "public, max-age=3600"}
                for name in ("Content-Length", "Content-Range", "Accept-Ranges", "ETag", "Last-Modified", "Content-Encoding"):
                    if name in upstream.headers:
                        output_headers[name] = upstream.headers[name]
                status = upstream.status
                if status == 304:
                    return web.Response(status=304, headers=output_headers)
                if status not in (200, 206):
                    # Aucun corps HTML d'un hébergeur n'est publié sous l'origine KITT.
                    error_headers = {**_CORS}
                    for name in ("Content-Range", "Retry-After"):
                        if name in upstream.headers:
                            error_headers[name] = upstream.headers[name]
                    return web.Response(status=status, text="Le fichier audio demandé est indisponible.", headers=error_headers)

                prefix = await _prefix(upstream)
                content_range = _CONTENT_RANGE_RE.fullmatch(upstream.headers.get("Content-Range", ""))
                starts_at_zero = status == 200 or bool(content_range and int(content_range.group(1)) == 0)
                mime = _sniff_audio(prefix) if starts_at_zero else _known_mime(url)
                if mime:
                    _remember_mime(url, mime)
                elif not starts_at_zero:
                    mime = await _probe_mime(session, url)
                output_headers["Content-Type"] = mime or _declared_mime(upstream.headers.get("Content-Type", ""))

                if head_probe and status == 206 and content_range and content_range.group(3) != "*":
                    status = 200
                    output_headers["Content-Length"] = content_range.group(3)
                    output_headers.pop("Content-Range", None)
                downstream = web.StreamResponse(status=status, headers=output_headers)
                await downstream.prepare(request)
                if not is_head:
                    if prefix:
                        await downstream.write(prefix)
                    async for chunk in upstream.content.iter_chunked(64 * 1024):
                        await downstream.write(chunk)
                await downstream.write_eof()
                return downstream
    except asyncio.CancelledError:
        raise
    except (aiohttp.ClientError, asyncio.TimeoutError, ConnectionError, RuntimeError):
        if downstream is not None:
            # Après prepare(), une nouvelle réponse 502 corromprait le flux audio.
            downstream.force_close()
            transport = request.transport
            if transport is not None and not transport.is_closing():
                transport.close()
            return downstream
        return web.Response(status=502, text="Le flux audio ne répond pas. Réessayez.", headers=_CORS)
