"""Occasional, quiet meal notices for active KITT chat rooms."""
from __future__ import annotations

import asyncio
import hashlib
import json
import math
import os
from collections.abc import Awaitable, Callable, Iterable
from dataclasses import dataclass
from datetime import datetime, time as wall_time, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

_BRUSSELS = ZoneInfo("Europe/Brussels")
_COOLDOWN_SECONDS = 90 * 60
_RETENTION_SECONDS = 30 * 86400
_WINDOWS = {
    "lunch": (wall_time(12, 0), wall_time(13, 30)),
    "dinner": (wall_time(18, 30), wall_time(20, 0)),
}
_MESSAGES = {
    "lunch": {
        "KITT": (
            "Petite pause de midi, les Chevaliers. Le garage peut attendre quelques minutes. Bon appétit !",
            "Il est temps de penser au repas de midi. Je garde un œil sur le salon pendant votre pause. Bon appétit !",
        ),
        "KARR": (
            "Pause repas. Même KITT ne sait pas faire le plein à votre place. Bon appétit, les Chevaliers.",
            "L’heure du repas approche. Je reste opérationnel pendant que KITT compte les couverts. Bon appétit.",
        ),
    },
    "dinner": {
        "KITT": (
            "Une petite pause pour le repas du soir, les Chevaliers. Les projets seront toujours là après. Bon appétit !",
            "Le repas du soir mérite aussi sa place au programme. Profitez de votre pause, je veille sur le salon.",
        ),
        "KARR": (
            "C’est la pause repas du soir. Je laisse à KITT la mission de surveiller les miettes. Bon appétit.",
            "Les Chevaliers ont aussi besoin de carburant le soir. KITT peut patienter sans dramatiser. Bon appétit.",
        ),
    },
}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class MealNotice:
    key: str
    room: str
    day: str
    slot: str
    speaker: str
    text: str
    at: float


class MealNotices:
    """Select notices without side effects, then persist an at-most-once reservation."""

    def __init__(
        self, data_dir: Path, *, seed: str = "kyronext-meals-v1",
        clock: Callable[[], datetime] = _utc_now,
    ):
        self.path = data_dir.resolve() / "meal-notices.json"
        self.seed = seed
        self.clock = clock
        self.records: dict[str, dict[str, object]] = {}
        self._tick_lock = asyncio.Lock()
        try:
            if self.path.stat().st_size > 1024 * 1024:
                raise ValueError("Meal notice history too large")
            stored = json.loads(self.path.read_text(encoding="utf-8"))
            records = stored.get("notices", {}) if isinstance(stored, dict) else {}
            cutoff = self._now().timestamp() - _RETENTION_SECONDS
            if isinstance(records, dict):
                for key, record in list(records.items())[:4096]:
                    if not isinstance(key, str) or not isinstance(record, dict):
                        continue
                    room, day, slot, at = (record.get(name) for name in ("room", "day", "slot", "at"))
                    if not isinstance(room, str) or not 0 < len(room) <= 80 or not isinstance(day, str) or not isinstance(slot, str) or slot not in _WINDOWS:
                        continue
                    if not isinstance(at, (int, float)) or not math.isfinite(at) or at < cutoff:
                        continue
                    try:
                        datetime.strptime(day, "%Y-%m-%d")
                    except ValueError:
                        continue
                    if key == self._key(room, day, str(slot)):
                        self.records[key] = {"room": room, "day": day, "slot": slot, "at": float(at)}
        except (OSError, ValueError):
            pass

    def _now(self, now: datetime | None = None) -> datetime:
        current = now if now is not None else self.clock()
        if current.tzinfo is None or current.utcoffset() is None:
            raise ValueError("A timezone-aware meal notice clock is required")
        return current.astimezone(_BRUSSELS)

    @staticmethod
    def _key(room: str, day: str, slot: str) -> str:
        # A JSON key, never a filename or a filesystem path.
        return json.dumps([room, day, slot], ensure_ascii=True, separators=(",", ":"))

    def schedule(self, room: str, day: str, slot: str) -> tuple[bool, int, str, str]:
        """Stable daily choice: half the windows, offset within the first hour."""
        if slot not in _WINDOWS:
            raise ValueError("Unknown meal window")
        digest = hashlib.sha256(f"{self.seed}|{day}|{slot}|{room}".encode()).digest()
        enabled = digest[0] % 2 == 0
        offset_seconds = int.from_bytes(digest[1:5], "big") % 3601
        speaker = "KITT" if digest[5] % 2 == 0 else "KARR"
        text = _MESSAGES[slot][speaker][digest[6] % 2]
        return enabled, offset_seconds, speaker, text

    def due(self, now: datetime | None, rooms: Iterable[str]) -> list[MealNotice]:
        """Pure selection; an inactive room never receives a delayed reminder."""
        current = self._now(now)
        day = current.date().isoformat()
        timestamp = current.timestamp()
        notices: list[MealNotice] = []
        # The application normally has four rooms. Bound arbitrary callback output.
        names = list(dict.fromkeys(room for room in rooms if isinstance(room, str) and 0 < len(room) <= 80))[:64]
        for room in names:
            for slot, (start_clock, end_clock) in _WINDOWS.items():
                start = datetime.combine(current.date(), start_clock, tzinfo=_BRUSSELS)
                end = datetime.combine(current.date(), end_clock, tzinfo=_BRUSSELS)
                if not start <= current < end:
                    continue
                key = self._key(room, day, slot)
                if key in self.records:
                    continue
                enabled, offset, speaker, text = self.schedule(room, day, slot)
                if not enabled or current < start + timedelta(seconds=offset):
                    continue
                last_sent = max((float(value["at"]) for value in self.records.values() if value.get("room") == room), default=0.0)
                if timestamp - last_sent < _COOLDOWN_SECONDS:
                    continue
                notices.append(MealNotice(key, room, day, slot, speaker, text, timestamp))
        return notices

    def mark_sent(self, notice: MealNotice) -> bool:
        """Reserve before broadcasting so a restart cannot repeat an announcement."""
        if notice.key in self.records:
            return False
        last_sent = max((float(value["at"]) for value in self.records.values() if value.get("room") == notice.room), default=0.0)
        if notice.at - last_sent < _COOLDOWN_SECONDS:
            return False
        updated = {key: value for key, value in self.records.items() if float(value["at"]) >= notice.at - _RETENTION_SECONDS}
        updated[notice.key] = {"room": notice.room, "day": notice.day, "slot": notice.slot, "at": notice.at}
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        temporary = self.path.with_suffix(".tmp")
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump({"version": 1, "notices": updated}, handle, ensure_ascii=False)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, self.path)
        self.records = updated
        return True

    async def tick(
        self, rooms: Iterable[str],
        post_notice: Callable[[str, str, str], Awaitable[None]],
        now: datetime | None = None,
    ) -> list[MealNotice]:
        sent: list[MealNotice] = []
        async with self._tick_lock:
            for notice in self.due(now, rooms):
                if await asyncio.to_thread(self.mark_sent, notice):
                    await post_notice(notice.room, notice.speaker, notice.text)
                    sent.append(notice)
        return sent


def register_chat_meal_notices(
    app, *, data_dir: Path,
    eligible_rooms: Callable[[], list[str]],
    post_notice: Callable[[str, str, str], Awaitable[None]],
) -> MealNotices:
    """Run one quiet check per minute; caller owns activity and preference filters."""
    scheduler = MealNotices(data_dir)

    async def lifecycle(_app):
        async def run() -> None:
            while True:
                try:
                    await scheduler.tick(eligible_rooms(), post_notice)
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    print(f"[KITT_CHAT_MEALS] Notice deferred: {type(exc).__name__}", flush=True)
                await asyncio.sleep(60)

        task = asyncio.create_task(run())
        try:
            yield
        finally:
            task.cancel()
            await asyncio.gather(task, return_exceptions=True)

    app.cleanup_ctx.append(lifecycle)
    return scheduler
