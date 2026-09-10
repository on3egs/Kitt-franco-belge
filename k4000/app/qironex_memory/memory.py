"""Mémoire locale légère de Qironex.

SQLite est utilisé comme index durable; aucune donnée ne sort de la machine.
Le module reste volontairement indépendant du serveur HTTP et du LLM.
"""
from __future__ import annotations

import os
import re
import sqlite3
import threading
import unicodedata
from datetime import datetime, timezone
from pathlib import Path


_WORD_RE = re.compile(r"[\wÀ-ÿŒœ]+", re.UNICODE)
_APOSTROPHES = "'’‘ʼ＇`´"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _norm(value: str) -> str:
    value = str(value or "").lower().translate(str.maketrans({c: "'" for c in _APOSTROPHES}))
    return "".join(ch for ch in unicodedata.normalize("NFKD", value) if not unicodedata.combining(ch))


def _tokens(value: str) -> set[str]:
    return {x for x in _WORD_RE.findall(_norm(value)) if len(x) > 2}


class QironexMemory:
    def __init__(self, db_path: str | Path, debug: bool | None = None):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.debug = bool(os.getenv("MEMORY_DEBUG", "").lower() in ("1", "true", "yes", "on")) if debug is None else debug
        self._lock = threading.RLock()
        self._init_db()

    def _connect(self):
        conn = sqlite3.connect(self.db_path, timeout=5)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")
        return conn

    def _init_db(self):
        with self._connect() as db:
            db.executescript("""
            CREATE TABLE IF NOT EXISTS memories (
              id INTEGER PRIMARY KEY, text TEXT NOT NULL, category TEXT NOT NULL,
              importance INTEGER NOT NULL DEFAULT 50, confidence INTEGER NOT NULL DEFAULT 70,
              created_at TEXT NOT NULL, last_used_at TEXT, use_count INTEGER NOT NULL DEFAULT 0,
              tags TEXT NOT NULL DEFAULT '', person TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active',
              source TEXT NOT NULL DEFAULT 'conversation', session_id TEXT NOT NULL DEFAULT '',
              conflict TEXT NOT NULL DEFAULT ''
            );
            CREATE INDEX IF NOT EXISTS idx_memories_status ON memories(status);
            CREATE INDEX IF NOT EXISTS idx_memories_person ON memories(person);
            CREATE TABLE IF NOT EXISTS people (name TEXT PRIMARY KEY, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '');
            CREATE TABLE IF NOT EXISTS relations (subject TEXT NOT NULL, relation TEXT NOT NULL, object TEXT NOT NULL, confidence INTEGER NOT NULL DEFAULT 70, status TEXT NOT NULL DEFAULT 'active', updated_at TEXT NOT NULL, PRIMARY KEY(subject, relation));
            CREATE TABLE IF NOT EXISTS personality (key TEXT PRIMARY KEY, value INTEGER NOT NULL, updated_at TEXT NOT NULL);
            """)
            defaults = {"familiarity": 50, "humor": 40, "verbosity": 45, "technical_style": 60, "warmth": 55, "confidence": 50}
            for key, value in defaults.items():
                db.execute("INSERT OR IGNORE INTO personality VALUES (?, ?, ?)", (key, value, _now()))

    def _log(self, message):
        if self.debug:
            print(f"[MEMORY] {message}", flush=True)

    def remember(self, text: str, category="user", importance=50, confidence=70, tags=(), person="", source="conversation", session_id="", explicit=False):
        text = re.sub(r"\s+", " ", str(text)).strip()
        if not text:
            return None
        importance = max(0, min(100, int(importance + (20 if explicit else 0))))
        confidence = max(0, min(100, int(confidence)))
        now = _now(); new_tokens = _tokens(text)
        with self._lock, self._connect() as db:
            rows = db.execute("SELECT * FROM memories WHERE status IN ('active','conflict') AND category=?", (category,)).fetchall()
            best = None; best_score = 0.0
            for row in rows:
                overlap = len(new_tokens & _tokens(row["text"])) / max(1, len(new_tokens | _tokens(row["text"])))
                if person and _norm(person) == _norm(row["person"]): overlap += .25
                if overlap > best_score: best, best_score = row, overlap
            merge_limit = .72 if person and category == "relational" else .48
            if best is not None and best_score >= merge_limit:
                merged_conf = min(100, max(best["confidence"], confidence) + 3)
                merged_imp = min(100, max(best["importance"], importance) + (2 if explicit else 0))
                db.execute("UPDATE memories SET text=?, importance=?, confidence=?, last_used_at=?, use_count=use_count+1, tags=?, person=?, status='active', source=? WHERE id=?", (text if explicit else best["text"], merged_imp, merged_conf, now, ",".join(tags), person or best["person"], source, best["id"]))
                self._log(f"fusion id={best['id']} score={best_score:.2f}")
                return best["id"]
            if person:
                for row in rows:
                    if row["person"] and _norm(row["person"]) == _norm(person) and len(new_tokens & _tokens(row["text"])) >= 1:
                        db.execute("UPDATE memories SET status='conflict', conflict=? WHERE id=?", (f"remplacé par: {text}", row["id"]))
            cur = db.execute("INSERT INTO memories(text,category,importance,confidence,created_at,last_used_at,tags,person,source,session_id) VALUES(?,?,?,?,?,?,?,?,?,?)", (text, category, importance, confidence, now, now, ",".join(tags), person, source, session_id))
            self._log(f"nouvelle mémoire id={cur.lastrowid}: {text}")
            return cur.lastrowid

    def retrieve(self, query: str, limit=6):
        q = _tokens(query)
        with self._lock, self._connect() as db:
            rows = db.execute("SELECT * FROM memories WHERE status='active' ORDER BY importance DESC, created_at DESC LIMIT 200").fetchall()
            scored = []
            for row in rows:
                overlap = len(q & _tokens(row["text"] + " " + row["tags"] + " " + row["person"]))
                score = overlap * 25 + row["importance"] * .35 + row["confidence"] * .15 + min(row["use_count"], 10)
                if overlap or row["importance"] >= 85:
                    scored.append((score, row))
            scored.sort(key=lambda item: item[0], reverse=True)
            selected = [row for _, row in scored[:max(1, min(8, limit))]]
            for row in selected:
                db.execute("UPDATE memories SET last_used_at=?, use_count=use_count+1 WHERE id=?", (_now(), row["id"]))
            self._log("récupérées: " + "; ".join(row["text"] for row in selected))
            return [dict(row) for row in selected]

    def set_personality(self, key: str, delta: int):
        with self._lock, self._connect() as db:
            row = db.execute("SELECT value FROM personality WHERE key=?", (key,)).fetchone()
            if row is None: return
            value = max(0, min(100, row["value"] + max(-2, min(2, int(delta)))))
            db.execute("UPDATE personality SET value=?, updated_at=? WHERE key=?", (value, _now(), key))
            self._log(f"personnalité {key}: {value}")

    def personality_context(self):
        with self._connect() as db:
            values = {row["key"]: row["value"] for row in db.execute("SELECT key,value FROM personality")}
        return ", ".join(f"{key}={values[key]}" for key in sorted(values))

    def deactivate_session(self, session_id: str):
        if not session_id: return
        with self._lock, self._connect() as db:
            db.execute("UPDATE memories SET status='inactive' WHERE session_id=? AND source='conversation'", (session_id,))

    def deactivate_matching(self, query: str):
        q = _tokens(query)
        with self._lock, self._connect() as db:
            rows = db.execute("SELECT id,text FROM memories WHERE status='active'").fetchall()
            for row in rows:
                if len(q & _tokens(row["text"])) >= max(1, min(3, len(q))): db.execute("UPDATE memories SET status='inactive' WHERE id=?", (row["id"],))

    def consolidate(self):
        with self._lock, self._connect() as db:
            db.execute("UPDATE memories SET status='inactive' WHERE status='active' AND importance < 20 AND last_used_at < datetime('now','-180 days')")
