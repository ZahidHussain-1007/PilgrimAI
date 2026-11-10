"""POST /temple-suggest — plan-page chat restricted to the23-temple catalog.

This is the small "suggest me a temple" brain behind the discovery chat on
/plans: one strict-JSON LLM call with the real catalog in the system prompt,
server-side validation of suggested names (the model can only ever name
temples that exist in data/temples), session memory for follow-ups, and a
deterministic keyword fallback so the chat keeps answering even when no LLM
key works.
"""
from __future__ import annotations

import json
import logging
import re
import uuid
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import TimeoutError as FuturesTimeout
from pathlib import Path
from typing import Any, Callable, TypeVar

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services.llm import LLMUnavailable, complete_json
from app.services.session import get_session, save_session

router = APIRouter()
logger = logging.getLogger(__name__)

# Hard time budgets: the upstream LLM allows 90s per call and redis up to
# 2s per op — but the Next proxy gives up at25s. Every step below is
# bounded so this endpoint ALWAYS replies (with the deterministic fallback)
# well before the proxy timeout.
_EXEC = ThreadPoolExecutor(max_workers=4, thread_name_prefix="temple-suggest")
_T = TypeVar("_T")

LLM_BUDGET_S = 17.0
SESSION_BUDGET_S = 1.5


def _timed(fn: Callable[[], _T], seconds: float) -> _T:
    future = _EXEC.submit(fn)
    try:
        return future.result(timeout=seconds)
    except FuturesTimeout as exc:
        raise LLMUnavailable(f"step timed out after {seconds}s") from exc

TEMPLES_DIR = Path(__file__).resolve().parents[2] / "data" / "temples"

MAX_HISTORY = 8
_HISTORY_KEY = "temple_history"


def _load_catalog() -> list[dict[str, Any]]:
    """Real records only — mirrors the Next.js loadTemples() mapping."""
    entries: list[dict[str, Any]] = []
    if not TEMPLES_DIR.is_dir():
        return entries
    for path in sorted(TEMPLES_DIR.glob("T*.json")):
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        loc = raw.get("location") or {}
        deity = raw.get("deity") or {}
        if isinstance(deity, dict):
            deity_name = str(deity.get("presiding_deity") or "")
        else:
            deity_name = str(deity or "")
        reviews = raw.get("reviews") or {}
        rating_raw = str(reviews.get("average_rating") or "")
        match = re.search(r"(\d(?:\.\d)?)", rating_raw)
        entries.append(
            {
                "id": str(raw.get("temple_id") or path.stem),
                "name": str(raw.get("name") or "").strip(),
                "city": str(loc.get("town") or loc.get("village") or "").strip(),
                "district": str(loc.get("district") or "").replace(" District", "").strip(),
                "deity": deity_name.split("(")[0].split(",")[0].strip(),
                "category": str(raw.get("category") or raw.get("temple_type") or "").strip(),
                "rating": float(match.group(1)) if match else None,
                "summary": str(raw.get("summary") or "").strip(),
            }
        )
    return [e for e in entries if e["name"]]


CATALOG = _load_catalog()
_BY_NAME = {e["name"].lower(): e for e in CATALOG}

_SYSTEM = """You are PilgrimAI's temple guide on the Plan page of a Telangana pilgrimage app.
You help travellers pick temples for their trip from a CATALOG of exactly {count} temples given below.

Rules (strict):
1. Suggest ONLY temples whose name appears in the catalog. NEVER invent, merge, or rename temples.
2. Recommend 2-4 temples per reply (or fewer if the request implies one), each with one short concrete reason (deity, district, drive from Hyderabad, darshan type, architecture...).
3. Keep the reply under 90 words, warm and practical, plain text (no markdown, no bullet symbols - use short lines).
4. If the traveller asks something unrelated to choosing a Telangana temple from this list, briefly steer them back.
5. Answer in the requested language code when given (en / te / hi), otherwise English.
6. "suggestions" MUST list the exact catalog name of every temple you recommended (copy the name character-for-character), and nothing else.

Catalog (id | name | city | district | deity | category | rating | summary):
{catalog}
"""

_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "reply": {"type": "string"},
        "suggestions": {"type": "array", "items": {"type": "string"}},
    },
}

_PROXIMAL_DISTRICTS = {
    "ranga reddy",
    "medchal-malkajgiri",
    "sangareddy",
    "yadadri-bhuvanagiri",
    "hyderabad",
    "secunderabad",
}

_STOPWORDS = {
    "temple", "temples", "mandir", "mandira", "god", "gods", "please", "suggest",
    "which", "what", "where", "give", "show", "tell", "about", "trip", "plan",
    "visit", "near", "nearby", "one", "day", "days", "from", "and", "the",
    "for", "with", "have", "good", "best", "famous", "want", "need", "some",
    "make", "with", "list", "telangana", "pilgrimai",
}


def _keywords(message: str) -> list[str]:
    words = re.findall(r"[a-z][a-z'-]{3,}", message.lower())
    return [w for w in words if w not in _STOPWORDS]


def _fallback(message: str, language: str) -> tuple[str, list[str]]:
    """No-LLM path: deterministic keyword scoring over the real catalog."""
    if not CATALOG:
        return (
            "Our temple list is loading right now - please try again in a moment.",
            [],
        )
    keys = _keywords(message)
    wants_near = any(t in message.lower() for t in ("near", "close", "one day", "one-day", "day trip", "weekend", "hyderabad"))
    scored: list[tuple[float, dict[str, Any]]] = []
    for entry in CATALOG:
        haystack = " ".join(
            str(entry.get(k) or "") for k in ("name", "category", "deity", "city", "district", "summary")
        ).lower()
        score = float(sum(1.5 for k in keys if k in haystack))
        if wants_near and entry["district"].lower() in _PROXIMAL_DISTRICTS:
            score += 2.0
        scored.append((score, entry))
    # keep positive matches; otherwise fall back to the three best-rated
    positive = [e for s, e in scored if s > 0]
    if positive:
        positive.sort(key=lambda e: e["rating"] or 0, reverse=True)
        picks = positive[:3]
    else:
        picks = sorted(CATALOG, key=lambda e: e["rating"] or 0, reverse=True)[:3]
    names = [p["name"] for p in picks]

    lines = {
        "en": "Here are temples from our23-temple Telangana list that fit:",
        "te": "మా 23 ఆలయాల జాబితా నుండి మీకు సరిపోయే ఆలయాలు ఇవే:",
        "hi": "हमारी 23 मंदिरों की सूची से आपके लिए ये मंदिर उपयुक्त हैं:",
    }
    lead = lines.get(language, lines["en"])
    body = []
    for p in picks:
        where = ", ".join(x for x in (p["city"], p["district"]) if x)
        deity = f" - {p['deity']}" if p["deity"] else ""
        body.append(f"{p['name']} ({where}){deity}")
    return lead + "\n" + "\n".join(f"- {b}" for b in body), names


def _safe_save_session(session_id: str, state: dict) -> None:
    try:
        save_session(session_id, state)
    except Exception:  # session persistence is best-effort
        pass


class TempleSuggestRequest(BaseModel):
    message: str = Field(min_length=1, max_length=800)
    sessionId: str | None = None
    language: str = "en"


class TempleSuggestResponse(BaseModel):
    content: str
    suggestions: list[str]
    sessionId: str


_SYSTEM_CACHE: str | None = None


def _build_system() -> str:
    global _SYSTEM_CACHE
    if _SYSTEM_CACHE:
        return _SYSTEM_CACHE
    lines = []
    for e in CATALOG:
        bits = [e["id"], e["name"], e["city"], e["district"], e["deity"], e["category"]]
        if e["rating"] is not None:
            bits.append(f"{e['rating']}★")
        summary = e["summary"][:140]
        if summary:
            bits.append(summary)
        lines.append(" | ".join(str(b) for b in bits if b))
    _SYSTEM_CACHE = _SYSTEM.format(count=len(CATALOG), catalog="\n".join(lines))
    return _SYSTEM_CACHE


@router.post("/temple-suggest", response_model=TempleSuggestResponse)
def temple_suggest(body: TempleSuggestRequest) -> TempleSuggestResponse:
    session_id = (body.sessionId or "").strip() or f"ts-{uuid.uuid4().hex[:16]}"

    history: list[dict[str, str]] = []
    try:
        state = _timed(lambda: get_session(session_id), SESSION_BUDGET_S) or {}
        history = list(state.get(_HISTORY_KEY) or [])[-MAX_HISTORY:]
    except Exception:  # session store is best-effort (slow redis → no history)
        history = []

    content = ""
    suggestions: list[str] = []

    try:
        payload: dict[str, Any] = {
            "message": body.message,
            "language": body.language,
            "recent_history": [
                {"user": t.get("user", ""), "reply": t.get("reply", "")} for t in history
            ],
        }
        raw = _timed(
            lambda: complete_json(
                system=_build_system(),
                payload=payload,
                schema_name="pilgrim_temple_suggest",
                schema=_SCHEMA,
            ),
            LLM_BUDGET_S,
        )
        reply = str(raw.get("reply") or "").strip()
        raw_names = raw.get("suggestions") or []
        if isinstance(raw_names, list):
            # server-side truth: only exact catalog names may leave this API
            suggestions = [
                n for n in (str(x).strip() for x in raw_names) if n.lower() in _BY_NAME
            ][:4]
        suggestions = [_BY_NAME[n.lower()]["name"] for n in suggestions]
        content = reply or (", ".join(suggestions) if suggestions else "")
    except LLMUnavailable as exc:
        logger.warning("temple-suggest LLM unavailable, using fallback: %s", exc)
        content, suggestions = _fallback(body.message, body.language)
    except Exception:
        logger.exception("temple-suggest failed, using fallback")
        content, suggestions = _fallback(body.message, body.language)

    try:
        history.append({"user": body.message[:500], "reply": content[:500]})
        state = {_HISTORY_KEY: history[-MAX_HISTORY:]}
        # never block the reply on redis — persist in the background
        _EXEC.submit(_safe_save_session, session_id, state)
    except Exception:
        pass

    return TempleSuggestResponse(
        content=content, suggestions=suggestions, sessionId=session_id
    )
