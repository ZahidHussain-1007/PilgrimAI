"""POST /chat - thin entry point: safety -> brain -> agents -> composer."""
from __future__ import annotations

import logging
import time
import uuid

from fastapi import APIRouter, HTTPException

from app.models.query import ChatRequest
from app.pipeline import safety
from app.pipeline.brain import DIRECT_CATEGORIES, understand
from app.pipeline.compose import answer as compose_answer
from app.pipeline.compose import clarify as compose_clarify
from app.pipeline.run import execute
from app.pipeline.validator import (
    collect_evidence,
    find_misattributed_numbers,
    find_missing_numbers,
    render_structured,
)
from app.services.llm import LLMUnavailable
from app.services.session import get_session, save_session

router = APIRouter()

logger = logging.getLogger(__name__)

MAX_FEEDBACK_ROUNDS = 2

DIRECT_STATUS = "DIRECT"


def _append_turn(history: list, user: str, reply: str, category: str) -> list:
    history = list(history or [])
    history.append(
        {
            "user": str(user)[:500],
            "reply": str(reply)[:500],
            "category": category,
        }
    )
    return history[-10:]


def _persist(session_id: str, history: list) -> None:
    save_session(
        session_id,
        {"session_id": session_id, "history": history},
    )


def _response(
    *,
    session_id: str,
    category: str,
    reply: str,
    status: str,
    clarification: str | None = None,
    evidence: list | None = None,
    budget: dict | None = None,
    follow_ups: list | None = None,
) -> dict:
    return {
        "session_id": session_id,
        "category": category,
        "intent": category,  # backward-compat alias for old clients
        "reply": reply,
        "clarification": clarification,
        "status": status,
        "evidence": evidence or [],
        "budget": budget,  # structured budget block (budget category only)
        "follow_ups": [str(f) for f in (follow_ups or [])][:3],
    }


def _emergency_reply(session_id: str, history: list, user: str) -> dict:
    # v14 (audit D04): language-aware policy reply (same 112/108).
    policy = safety.response(user)
    # v14 (audit D05): deterministic reply, no Redis read/write — an
    # emergency must never wait on session storage.
    return _response(
        session_id=session_id,
        category="emergency",
        reply=policy["reply"],
        status="EMERGENCY",
    )


@router.post("/chat")
def chat(request: ChatRequest) -> dict:
    started_at = time.monotonic()
    message = request.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    session_id = request.session_id or str(uuid.uuid4())

    # ---- STAGE 0: safety gate FIRST (audit D05) — BEFORE get_session:
    # an emergency reply must never wait on Redis. Session I/O is skipped
    # entirely on this path; the deterministic policy reply goes out now.
    # ----
    if safety.detect(message):
        return _emergency_reply(session_id, [], message)

    existing = get_session(session_id) or {}
    history = existing.get("history", [])

    # ---- STAGE 1: brain (LLM #1) ----
    try:
        brain = understand(message=message, history=history[-6:])
    except LLMUnavailable as exc:
        _persist(
            session_id,
            _append_turn(history, message, "", "unavailable"),
        )
        raise HTTPException(
            status_code=503,
            detail="Query understanding service is temporarily unavailable.",
        ) from exc

    category = brain.category

    if category == "emergency":
        reply = (brain.direct_reply or "").strip() or safety.response()["reply"]
        _persist(
            session_id,
            _append_turn(history, message, reply, category),
        )
        return _response(
            session_id=session_id,
            category=category,
            reply=reply,
            status="EMERGENCY",
        )

    # ---- direct categories answered by the brain itself ----
    if category in DIRECT_CATEGORIES:
        reply = brain.direct_reply or ""
        _persist(
            session_id,
            _append_turn(history, message, reply, category),
        )
        return _response(
            session_id=session_id,
            category=category,
            reply=reply,
            status=DIRECT_STATUS,
        )

    if not brain.subqueries:
        raise HTTPException(
            status_code=503,
            detail="Could not understand the request. Please try again.",
        )

    # ---- STAGE 3: agents ----
    results = execute(brain.subqueries)

    # ---- clarification from ambiguous places ----
    clarification_step = next(
        (
            r
            for r in results
            if r.get("status") == "NEEDS_CLARIFICATION"
        ),
        None,
    )
    if clarification_step is not None:
        try:
            question = compose_clarify(
                query=str(clarification_step.get("query") or ""),
                candidates=clarification_step.get("candidates", []),
                language=brain.language,
            )
        except LLMUnavailable as exc:
            raise HTTPException(
                status_code=503,
                detail="Query understanding service is temporarily unavailable.",
            ) from exc

        _persist(
            session_id,
            _append_turn(history, message, question, category),
        )

        # Offer the candidate place names as one-tap options: a naive user
        # picks "Birla Mandir Hyderabad" instead of retyping the question.
        option_names: list[str] = []
        for candidate in (clarification_step.get("candidates") or [])[:3]:
            name = ""
            if isinstance(candidate, dict):
                name = str(
                    candidate.get("display_name")
                    or candidate.get("name")
                    or candidate.get("canonical_name")
                    or ""
                ).strip()
            elif isinstance(candidate, str):
                name = candidate.strip()
            if name:
                option_names.append(name[:100])

        return _response(
            session_id=session_id,
            category=category,
            reply=question,
            status="NEEDS_CLARIFICATION",
            clarification=question,
            evidence=[],
            follow_ups=option_names,
        )

    # ---- STAGE 4: composer (LLM #2) + deterministic number validation ----
    rounds = 0  # feedback rounds taken (stays 0 if the composer fails early)
    follow_ups: list[str] = []

    def _composed(value) -> tuple[str, list[str]]:
        # compose.answer returns {"reply", "follow_ups"}; tolerate plain str
        # (older mocks/tests).
        if isinstance(value, dict):
            return str(value.get("reply") or ""), [
                str(f) for f in (value.get("follow_ups") or []) if str(f).strip()
            ]
        return str(value), []

    try:
        reply, follow_ups = _composed(
            compose_answer(
                question=brain.rewritten_query,
                language=brain.language,
                results=results,
                history=history[-2:],
            )
        )

        missing = find_missing_numbers(reply, results)
        # v15 (audit C17): numbers attributed to the WRONG record (e.g.
        # Hotel A priced with Hotel B's figure) are flagged the same way
        missing += [
            n for n in find_misattributed_numbers(reply, results)
            if n not in missing
        ]
        rounds = 0
        if missing:
            logger.warning("number validation flagged: %s", missing)
        while missing and rounds < MAX_FEEDBACK_ROUNDS:
            rounds += 1
            reply, follow_ups = _composed(
                compose_answer(
                    question=brain.rewritten_query,
                    language=brain.language,
                    results=results,
                    feedback=missing,
                    history=history[-2:],
                )
            )
            missing = find_missing_numbers(reply, results)
            missing += [
                n for n in find_misattributed_numbers(reply, results)
                if n not in missing
            ]
            if missing:
                logger.warning(
                    "number validation after round %d flagged: %s",
                    rounds,
                    missing,
                )

        status = "COMPLETED"
        if missing:
            reply = render_structured(results)
            status = "DEGRADED"

    except LLMUnavailable:
        reply = render_structured(results)
        status = "DEGRADED"
    except Exception as exc:  # noqa: BLE001 - degrade honestly, but log why
        logging.getLogger(__name__).warning(
            "compose failed, serving structured fallback: %s: %s",
            type(exc).__name__,
            exc,
        )
        reply = render_structured(results)
        status = "DEGRADED"

    # ---- STAGE 5: persist + respond ----
    _persist(
        session_id,
        _append_turn(history, message, reply, category),
    )

    total_ms = int((time.monotonic() - started_at) * 1000)
    if total_ms > 30_000:
        logging.getLogger(__name__).warning(
            "slow chat: total=%dms category=%s status=%s feedback_rounds=%d",
            total_ms,
            category,
            status,
            rounds,
        )

    return _response(
        session_id=session_id,
        category=category,
        reply=reply,
        status=status,
        evidence=collect_evidence(results),
        follow_ups=follow_ups,
        budget=next(
            (r.get("budget") for r in results if r.get("category") == "budget"),
            None,
        ),
    )
