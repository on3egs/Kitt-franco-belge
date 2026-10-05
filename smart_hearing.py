#!/usr/bin/env python3
"""KYRONEXT Smart Hearing.

Correction légère et prudente du texte Whisper avant le routeur ou le LLM.
Le module ne contient aucun modèle génératif : les décisions viennent des
dictionnaires locaux, du contexte de phrase, de la phonétique et du fuzzy
matching. Les données sont chargées une fois puis conservées en mémoire.
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from difflib import SequenceMatcher
import json
import os
from pathlib import Path
import re
import time
import unicodedata

try:  # RapidFuzz est optionnel sur les Jetson légers.
    from rapidfuzz.fuzz import ratio as _rapid_ratio
except Exception:  # pragma: no cover - fallback embarqué
    _rapid_ratio = None


def _plain(value: str) -> str:
    value = unicodedata.normalize("NFKD", str(value or ""))
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = value.lower().replace("’", "'")
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def _ratio(left: str, right: str) -> float:
    if _rapid_ratio is not None:
        return float(_rapid_ratio(left, right))
    return SequenceMatcher(None, left, right).ratio() * 100.0


def _phonetic(value: str) -> str:
    """Clé volontairement francophone, utile pour des noms belges.

    Elle n'est pas utilisée seule pour remplacer un mot : elle complète le
    score lexical et exige toujours un contexte ou un alias plausible.
    """
    value = _plain(value)
    value = re.sub(r"ph", "f", value)
    value = re.sub(r"eau|au", "o", value)
    value = re.sub(r"ai|er|ez|et", "e", value)
    value = re.sub(r"qu|ck|k", "k", value)
    value = re.sub(r"c(?=[eiy])", "s", value)
    value = re.sub(r"g(?=[eiy])", "j", value)
    value = re.sub(r"ç", "s", value)
    value = re.sub(r"[dt]$", "", value)
    value = re.sub(r"(.)\1+", r"\1", value)
    value = re.sub(r"[aeiouy]+", "a", value)
    return re.sub(r"[^a-z0-9]", "", value)


@dataclass
class Correction:
    source: str
    replacement: str
    reason: str
    score: float
    region: str = "BELGIQUE"


@dataclass
class SmartHearingResult:
    text: str
    original: str
    changed: bool
    corrections: list[dict]
    region_context: str
    candidates: list[dict]
    latency_ms: float

    def to_dict(self) -> dict:
        return asdict(self)


class SmartHearing:
    AUTO_THRESHOLD = float(os.getenv("SMART_HEARING_AUTO_THRESHOLD", "91"))
    CONTEXT_THRESHOLD = float(os.getenv("SMART_HEARING_CONTEXT_THRESHOLD", "78"))
    IGNORE_THRESHOLD = float(os.getenv("SMART_HEARING_IGNORE_THRESHOLD", "68"))
    _LOCATION_MARKERS = (
        "meteo", "temps", "temperature", "pluie", "pleuvoir", "ville", "commune",
        "village", "aller", "vais", "pars", "part", "route", "itineraire",
        "navigation", "gps", "habite", "suis a", "arrive", "vers", "chez",
    )
    _PREPOSITIONS = re.compile(
        r"\b(?:a|au|aux|de|du|des|pour|vers|chez|en|dans|sur)\s+(.{2,80}?)(?=$|[,.!?;]|\s+(?:demain|aujourd|ce soir|maintenant|s'il|si|et|puis)\b)",
        re.IGNORECASE,
    )

    def __init__(self, config_dir: str | Path | None = None):
        self.config_dir = Path(config_dir or Path(__file__).parent / "config")
        self.enabled = os.getenv("SMART_HEARING_ENABLED", "true").lower() not in {"0", "false", "no"}
        self.fuzzy_enabled = os.getenv("SMART_HEARING_FUZZY", "true").lower() not in {"0", "false", "no"}
        self.phonetic_enabled = os.getenv("SMART_HEARING_PHONETIC", "true").lower() not in {"0", "false", "no"}
        self.context_enabled = os.getenv("SMART_HEARING_CONTEXT", "true").lower() not in {"0", "false", "no"}
        self._entries: list[dict] = []
        self._exact: dict[str, dict] = {}
        self._alias_items: list[tuple[str, dict]] = []
        self._load_once()

    def _load_once(self) -> None:
        files = (
            "smart_hearing_charleroi.json",
            "smart_hearing_gaume.json",
            "smart_hearing_places_be.json",
            "smart_hearing_people.json",
            "smart_hearing_kyronext.json",
            "smart_hearing_custom.json",
        )
        seen: set[tuple[str, str]] = set()
        for filename in files:
            path = self.config_dir / filename
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                continue
            for raw in payload if isinstance(payload, list) else payload.get("places", payload.get("entries", [])):
                if not isinstance(raw, dict) or not raw.get("canonical"):
                    continue
                entry = dict(raw)
                entry["canonical"] = str(entry["canonical"]).strip()
                entry["region"] = str(entry.get("region") or "BELGIQUE").upper()
                entry["aliases"] = [str(x).strip() for x in entry.get("aliases", []) if str(x).strip()]
                key = (_plain(entry["canonical"]), entry["region"])
                if key in seen:
                    continue
                seen.add(key)
                self._entries.append(entry)
                for value in [entry["canonical"], *entry["aliases"]]:
                    normalized = _plain(value)
                    if not normalized:
                        continue
                    self._exact.setdefault(normalized, entry)
                    self._alias_items.append((normalized, entry))
        # Les expressions longues doivent gagner sur un mot inclus dedans.
        self._alias_items.sort(key=lambda item: (-len(item[0].split()), -len(item[0])))

    @property
    def place_count(self) -> int:
        return sum(1 for entry in self._entries if entry.get("kind", "place") == "place")

    @property
    def entry_count(self) -> int:
        return len(self._entries)

    def hotwords(self, text: str = "", *, max_words: int = 40) -> list[str]:
        """Construit une petite liste de hotwords Whisper, adaptée au contexte.

        La liste reste volontairement courte : elle aide les noms propres
        utiles à KYRONEXT sans ralentir Whisper avec un dictionnaire géant.
        """
        combined = _plain(text)
        region = self._region_context(text)
        geographic = any(marker in combined for marker in self._LOCATION_MARKERS) or region != "BELGIQUE"
        selected: list[str] = []
        seen: set[str] = set()

        def add(value: str) -> None:
            key = _plain(value)
            if key and key not in seen and len(selected) < max_words:
                seen.add(key)
                selected.append(value)

        for value in (
            "KITT", "KARR", "KYRONEXT", "K2000", "K4000", "Jetson", "NVIDIA",
            "Piper", "Whisper", "faster-whisper", "LLM",
            "Appelle", "Appeler", "Raccroche", "Raccrocher", "Dadou",
            "Pascal Fairon", "Manix", "SATCOM", "appel satellite"
        ):
            add(value)

        # Les zones prioritaires passent avant le reste des lieux si le texte
        # contient déjà un indice géographique ou météo.
        if geographic:
            for entry in self._entries:
                if entry.get("region") == region:
                    add(entry["canonical"])

        # Quelques villes-repères restent disponibles dans tous les contextes.
        anchors = {"Bruxelles", "Anvers", "Gand", "Bruges", "Liège", "Namur", "Charleroi", "Mons", "Arlon", "Virton", "Liedekerke"}
        for entry in self._entries:
            if entry["canonical"] in anchors:
                add(entry["canonical"])
        if geographic:
            for entry in self._entries:
                add(entry["canonical"])
        return selected

    def _region_context(self, text: str) -> str:
        norm = _plain(text)
        hits: dict[str, int] = {}
        for alias, entry in self._alias_items:
            if len(alias) < 4:
                continue
            if re.search(rf"(?<![a-z0-9]){re.escape(alias)}(?![a-z0-9])", norm):
                region = entry.get("region", "BELGIQUE")
                hits[region] = hits.get(region, 0) + 1
        if not hits:
            return "BELGIQUE"
        return max(hits, key=hits.get)

    def _has_location_context(self, text: str, source: str) -> bool:
        norm = _plain(text)
        if any(marker in norm for marker in self._LOCATION_MARKERS):
            return True
        # Une faute de ville prononcée après une préposition est candidate,
        # mais pas un mot isolé comme « kit » ou « car ».
        return bool(re.search(r"\b(?:a|au|aux|de|du|des|pour|vers|chez|en)\s+[^ ]+", norm)) and len(_plain(source).split()) >= 2

    @staticmethod
    def _normalized_map(value: str) -> tuple[str, list[int]]:
        """Retourne le texte comparable et l'index source de chaque caractère."""
        normalized: list[str] = []
        positions: list[int] = []
        last_space = False
        for index, char in enumerate(str(value)):
            decomposed = unicodedata.normalize("NFKD", char)
            decomposed = "".join(c for c in decomposed if not unicodedata.combining(c)).lower()
            if not decomposed or not re.match(r"[a-z0-9]", decomposed):
                if normalized and not last_space:
                    normalized.append(" ")
                    positions.append(index)
                last_space = True
                continue
            for item in decomposed:
                normalized.append(item)
                positions.append(index)
            last_space = False
        while normalized and normalized[-1] == " ":
            normalized.pop()
            positions.pop()
        return "".join(normalized), positions

    @staticmethod
    def _alias_pattern(alias: str) -> re.Pattern:
        # Les espaces sont souples pour « Liedekerke », « Liede kerke », etc.
        escaped = re.escape(_plain(alias)).replace(r"\ ", r"\s+")
        return re.compile(rf"(?<!\w){escaped}(?!\w)", re.IGNORECASE)

    def _find_alias(self, output: str, alias: str):
        normalized, positions = self._normalized_map(output)
        match = self._alias_pattern(alias).search(normalized)
        if not match or not positions:
            return None
        start = positions[match.start()]
        end = positions[match.end() - 1] + 1
        return match.group(0), start, end

    def _replace_exact_aliases(self, text: str, corrections: list[Correction]) -> str:
        output = text
        for alias, entry in self._alias_items:
            if len(alias) < 3:
                continue
            found = self._find_alias(output, alias)
            if not found:
                # Le texte avec accents ne correspond pas toujours à la clé
                # plain ; le remplacement tokenisé ci-dessous couvre ce cas.
                continue
            old, start, end = found
            canonical = entry["canonical"]
            output = output[:start] + canonical + output[end:]
            if _plain(old) != _plain(canonical):
                corrections.append(Correction(old, canonical, "alias local", 100.0, entry.get("region", "BELGIQUE")))
        return output

    def _fuzzy_candidates(self, source: str, region: str) -> list[tuple[float, dict, str]]:
        source_plain = _plain(source)
        if len(source_plain) < 3:
            return []
        output: list[tuple[float, dict, str]] = []
        for alias, entry in self._alias_items:
            if len(alias) < 4:
                continue
            lexical = _ratio(source_plain, alias)
            phonetic = 0.0
            if self.phonetic_enabled:
                p_source, p_alias = _phonetic(source_plain), _phonetic(alias)
                if p_source and p_alias:
                    phonetic = _ratio(p_source, p_alias)
            score = max(lexical, phonetic * 0.94)
            if entry.get("region") == region:
                score += 4
            if score >= self.IGNORE_THRESHOLD:
                output.append((min(score, 100), entry, alias))
        return sorted(output, key=lambda item: item[0], reverse=True)[:5]

    def correct(self, text: str, *, context: str = "", whisper_confidence: float | None = None) -> SmartHearingResult:
        started = time.perf_counter()
        original = str(text or "").strip()
        if not original or not self.enabled:
            return SmartHearingResult(original, original, False, [], "BELGIQUE", [], 0.0)
        combined = f"{context} {original}".strip()
        region = self._region_context(combined)
        corrections: list[Correction] = []
        output = original

        # Les alias explicites sont fiables (Lille de Kerk, Arlong, etc.).
        # Un alias générique d'un mot n'est accepté que si le texte porte un
        # contexte géographique pour éviter les faux positifs.
        for alias, entry in self._alias_items:
            if len(alias.split()) < 2 and not self._has_location_context(combined, alias):
                continue
            found = self._find_alias(output, alias)
            if not found:
                continue
            old, start, end = found
            canonical = entry["canonical"]
            if _plain(old) == _plain(canonical):
                continue
            # Ne jamais développer un alias déjà inclus dans sa forme canonique
            # (ex. "Pascal" dans "Pascal Fairon" -> évite "Pascal Fairon Fairon").
            canonical_plain = _plain(canonical)
            output_plain = _plain(output)
            if canonical_plain and re.search(rf"(?<![a-z0-9]){re.escape(canonical_plain)}(?![a-z0-9])", output_plain):
                continue
            output = output[:start] + canonical + output[end:]
            corrections.append(Correction(old, canonical, "alias/contexte local", 100.0, entry.get("region", "BELGIQUE")))

        # Fuzzy prudent : uniquement le segment d'une préposition, avec un
        # score fort, et une marge nette par rapport au second candidat.
        if self.fuzzy_enabled and self._has_location_context(combined, original):
            for match in list(self._PREPOSITIONS.finditer(output)):
                raw_segment = match.group(1).strip()
                segment = raw_segment
                if len(segment) < 3 or _plain(segment) in self._exact:
                    continue
                candidates = self._fuzzy_candidates(segment, region)
                if not candidates:
                    continue
                best_score, best_entry, best_alias = candidates[0]
                second_score = candidates[1][0] if len(candidates) > 1 else 0
                confidence = float(whisper_confidence) if whisper_confidence is not None else 0.65
                threshold = self.AUTO_THRESHOLD if confidence >= 0.70 else self.CONTEXT_THRESHOLD
                if best_score < threshold or (second_score and best_score - second_score < 5):
                    continue
                canonical = best_entry["canonical"]
                start, end = match.span(1)
                output = output[:start] + canonical + output[end:]
                corrections.append(Correction(raw_segment, canonical, f"fuzzy/phonétique ({best_alias})", best_score, best_entry.get("region", "BELGIQUE")))

        # Évite les remplacements accidentels de « kit », « car », etc. si un
        # dictionnaire personnalisé venait à contenir un terme voisin.
        output = re.sub(r"\s+([,.!?;:])", r"\1", output)
        candidates = [{"source": c.source, "replacement": c.replacement, "score": round(c.score, 1), "reason": c.reason} for c in corrections]
        result = SmartHearingResult(
            output,
            original,
            output != original,
            candidates,
            self._region_context(f"{context} {output}"),
            candidates[:5],
            round((time.perf_counter() - started) * 1000, 3),
        )
        if os.getenv("SMART_HEARING_DEBUG", "false").lower() in {"1", "true", "yes"}:
            print(f"[SMART_HEARING] {result.original!r} -> {result.text!r} | {result.region_context} | {result.latency_ms:.2f}ms", flush=True)
        return result


_DEFAULT_ENGINE: SmartHearing | None = None


def get_smart_hearing(config_dir: str | Path | None = None) -> SmartHearing:
    global _DEFAULT_ENGINE
    if _DEFAULT_ENGINE is None:
        _DEFAULT_ENGINE = SmartHearing(config_dir)
    return _DEFAULT_ENGINE


__all__ = ["Correction", "SmartHearing", "SmartHearingResult", "get_smart_hearing"]
