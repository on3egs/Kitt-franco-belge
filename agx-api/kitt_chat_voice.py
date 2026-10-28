"""Voice providers for the KITT community chat.

This module deliberately uses the already-loaded Guy Piper engine and
faster-whisper model supplied by the host server. It does not own or mutate
the host's active voice selection and never posts transcripts to chat.
"""

from __future__ import annotations

import asyncio
import os
import subprocess
import tempfile
import wave
from pathlib import Path
from typing import Any, Callable


_MAX_AUDIO_BYTES = 5 * 1024 * 1024
_MAX_AUDIO_SECONDS = 20.5
_NORMALIZE_AUDIO_SECONDS = 21
_MAX_TTS_CHARS = 1200
_SUPPORTED_SUFFIXES = {
    ".wav", ".webm", ".ogg", ".oga", ".opus", ".mp3", ".m4a",
    ".mp4", ".mpeg", ".mpga", ".flac",
}


def _audio_suffix(filename: str) -> str:
    suffix = Path(str(filename or "")).suffix.lower()
    return suffix if suffix in _SUPPORTED_SUFFIXES else ".webm"


def _duration_seconds(path: str) -> float:
    """Read the normalized WAV duration without invoking Whisper."""
    try:
        with wave.open(path, "rb") as wav:
            if wav.getframerate() <= 0:
                raise ValueError
            return wav.getnframes() / float(wav.getframerate())
    except (wave.Error, OSError, ZeroDivisionError) as exc:
        raise ValueError("audio normalisé illisible") from exc


def _normalize_audio(source_path: str, wav_path: str) -> None:
    """Decode browser media to bounded PCM before model inference."""
    try:
        subprocess.run(
            ["ffmpeg", "-nostdin", "-y", "-v", "error", "-i", source_path,
             "-t", str(_NORMALIZE_AUDIO_SECONDS), "-map", "0:a:0", "-vn",
             "-ac", "1", "-ar", "16000", "-f", "wav", wav_path],
            check=True,
            capture_output=True,
            timeout=10,
        )
    except FileNotFoundError as exc:
        raise RuntimeError("ffmpeg indisponible pour décoder l'audio") from exc
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        raise ValueError("fichier audio illisible ou décodage trop long") from exc


def create_voice_providers(
    get_guy_engine: Callable[[], Any],
    clean_text: Callable[[str], str],
    apply_robot_effect_sox: Callable[[str, str, str], Any],
    get_whisper_model: Callable[[], Any],
) -> tuple[Callable[[str, str], Any], Callable[[bytes, str], Any]]:
    """Return async `(speech, transcribe)` providers for chat routes.

    KITT speaks with the cached Guy v3 engine plus the existing KITT robot
    effect. KARR uses that same cached voice cleanly; neither provider changes
    global voice state. Work is serialized per engine to avoid concurrent Piper
    synthesis corrupting temporary/intermediate state.
    """
    speech_lock = asyncio.Lock()
    transcription_lock = asyncio.Lock()

    async def speech(text: str, speaker: str) -> bytes:
        spoken = str(text or "").strip()
        if not spoken:
            raise ValueError("texte vocal vide")
        if len(spoken) > _MAX_TTS_CHARS:
            spoken = spoken[:_MAX_TTS_CHARS].rsplit(" ", 1)[0].rstrip(" ,;:")
        speaker_key = str(speaker or "KITT").strip().casefold()
        if speaker_key not in {"kitt", "karr"}:
            raise ValueError("voix inconnue")

        async with speech_lock:
            engine = await asyncio.to_thread(get_guy_engine)
            if engine is None:
                raise RuntimeError("moteur Guy v3 indisponible")
            tts_text = clean_text(spoken)
            if not tts_text:
                raise ValueError("texte vocal vide après nettoyage")

            clean_file = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
            clean_path = clean_file.name
            clean_file.close()
            output_path = clean_path
            robot_path = None
            try:
                await asyncio.to_thread(
                    engine.synthesize_to_wav,
                    tts_text,
                    clean_path,
                    length_scale=0.85,
                    natural_pauses=True,
                )
                if speaker_key == "kitt":
                    robot_file = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
                    robot_path = robot_file.name
                    robot_file.close()
                    await asyncio.to_thread(
                        apply_robot_effect_sox, clean_path, robot_path, "karr"
                    )
                    output_path = robot_path
                return await asyncio.to_thread(Path(output_path).read_bytes)
            finally:
                for path in (clean_path, robot_path):
                    if path:
                        try:
                            os.unlink(path)
                        except FileNotFoundError:
                            pass

    async def transcribe(data: bytes, filename: str) -> dict[str, str]:
        if not isinstance(data, (bytes, bytearray)) or not data:
            raise ValueError("aucun audio reçu")
        if len(data) > _MAX_AUDIO_BYTES:
            raise ValueError("audio supérieur à 5 Mo")
        suffix = _audio_suffix(filename)
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as audio_file:
            audio_file.write(data)
            audio_path = audio_file.name
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as wav_file:
            wav_path = wav_file.name
        try:
            await asyncio.to_thread(_normalize_audio, audio_path, wav_path)
            duration = await asyncio.to_thread(_duration_seconds, wav_path)
            if duration > _MAX_AUDIO_SECONDS:
                raise ValueError("message vocal limité à 20 secondes")
            model = await asyncio.to_thread(get_whisper_model)
            if model is None:
                raise RuntimeError("modèle Whisper non chargé")

            def run_whisper():
                segments, info = model.transcribe(
                    wav_path,
                    language="fr",
                    beam_size=1,
                    vad_filter=True,
                    condition_on_previous_text=False,
                    temperature=0,
                    initial_prompt="Conversation en français : KITT, KARR, Knight Rider, Manix, Pontiac Trans Am, électronique.",
                )
                recognized = " ".join(
                    str(segment.text).strip() for segment in segments
                    if str(getattr(segment, "text", "")).strip()
                ).strip()
                # Keep this a pure transcription result. The route must decide
                # whether to display it; it is never appended or sent to chat.
                return {"text": recognized[:2000], "language": str(getattr(info, "language", "fr"))}

            async with transcription_lock:
                return await asyncio.to_thread(run_whisper)
        finally:
            for path in (audio_path, wav_path):
                try:
                    os.unlink(path)
                except FileNotFoundError:
                    pass

    return speech, transcribe
