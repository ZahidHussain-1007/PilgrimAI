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

# A geographic qualifier turns a bare "emergency" mention into a NEAREST-
# FACILITY question (which the agents answer from verified data + OSM).
# Life-threatening phrases (chest pain, ambulance, accident...) are listed
# in `patterns` and always win.
_GEO_HINT = re.compile(r"\b(near|nearby|nearest|closest|around)\b", re.IGNORECASE)


def _load() -> None:
    global _COMPILED, _GEO_EXEMPT, _REPLY

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


def response() -> dict:
    _load()
    assert _REPLY is not None
    return {"status": "EMERGENCY", "reply": _REPLY, "clarification": None}
