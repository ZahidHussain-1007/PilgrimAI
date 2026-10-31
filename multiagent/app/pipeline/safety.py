"""Stage 0 - safety gate. Regex over data file; never depends on the LLM."""
from __future__ import annotations

import json
import re
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
POLICY_FILE = PROJECT_ROOT / "data" / "emergency" / "emergency_policy.json"

_COMPILED: list[re.Pattern[str]] | None = None
_GEO_EXEMPT: list[re.Pattern[str]] | None = None
_REPLY: str | None = None
_REPLIES: dict[str, str] | None = None

_DEVANAGARI = re.compile(r"[\u0900-\u097F]")
_TELUGU = re.compile(r"[\u0C00-\u0C7F]")


def _detect_language(message: str) -> str:
    """Script detection: Hindi / Telugu / else English (audit D04)."""
    if not message:
        return "en"
    if _DEVANAGARI.search(message):
        return "hi"
    if _TELUGU.search(message):
        return "te"
    return "en"

# A geographic qualifier turns a bare "emergency" mention into a NEAREST-
# FACILITY question (which the agents answer from verified data + OSM).
# Life-threatening phrases (chest pain, ambulance, accident...) are listed
# in `patterns` and always win.
_GEO_HINT = re.compile(r"\b(near|nearby|nearest|closest|around)\b", re.IGNORECASE)


def _load() -> None:
    global _COMPILED, _GEO_EXEMPT, _REPLY, _REPLIES

    if _COMPILED is not None:
        return

    if not POLICY_FILE.exists():
        raise RuntimeError(f"Emergency policy file missing: {POLICY_FILE}")

    data = json.loads(POLICY_FILE.read_text(encoding="utf-8"))

    patterns = data.get("patterns", [])
    if not isinstance(patterns, list) or not patterns:
        raise RuntimeError("Emergency policy has no patterns")

    _COMPILED = [re.compile(p, re.IGNORECASE) for p in patterns]

    exempt = data.get("geo_exempt_patterns", [])
    if not isinstance(exempt, list):
        exempt = []
    _GEO_EXEMPT = [re.compile(p, re.IGNORECASE) for p in exempt]

    _REPLY = str(
        data.get("reply")
        or "This may be an emergency. Contact your local emergency services immediately (112 in India)."
    )

    replies = data.get("replies")
    _REPLIES = (
        {str(k): str(v) for k, v in replies.items()}
        if isinstance(replies, dict)
        else {}
    )


def detect(message: str) -> bool:
    """True = life-threat -> direct safety reply (never reaches the LLM)."""
    if not message:
        return False

    _load()
    assert _COMPILED is not None and _GEO_EXEMPT is not None

    if any(pattern.search(message) for pattern in _COMPILED):
        return True

    # bare "emergency"-class words: geo phrasing routes to the agents
    # ("emergency hospital near Birla Mandir"), otherwise still an emergency
    if any(pattern.search(message) for pattern in _GEO_EXEMPT):
        return not _GEO_HINT.search(message)

    return False


def response(message: str | None = None) -> dict:
    """Emergency reply. v14 (audit D04): language follows the caller's
    script (Hindi/Telugu/English) from policy JSON — every language
    carries the SAME numbers (112 police, 108 ambulance)."""
    _load()
    assert _REPLY is not None
    lang = _detect_language(message or "")
    reply = (_REPLIES or {}).get(lang) or _REPLY
    return {
        "status": "EMERGENCY",
        "reply": reply,
        "language": lang,
        "clarification": None,
    }
