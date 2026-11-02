"""Understanding may propose constraints/sections, never operational facts.
One optional provider attempt, a six-second cancellable wall-clock budget, no
retry/key fanout. A deterministic offline fallback and typed editor always work.
"""

import asyncio
import json
import os
import re
from pathlib import Path
from threading import BoundedSemaphore
from typing import Literal

import httpx
from pydantic import BaseModel, ConfigDict, Field

from .models import PlanRequest

SLOTS = BoundedSemaphore(4)
FIELDS = {
    "summary",
    "overview",
    "history",
    "darshan_timings",
    "dress_code",
    "darshan_and_tickets",
    "sevas",
    "facilities",
    "accessibility",
    "contact",
    "travel",
}


class Intent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    changes: dict = Field(default_factory=dict)
    sections: list[Literal["temples", "routes", "options", "budget", "nearby"]] = Field(
        default_factory=list, max_length=5
    )
    fact_fields: list[str] = Field(default_factory=list, max_length=12)
    temple_ids: list[str] = Field(default_factory=list, max_length=23)


def fallback(message, request):
    text = message.lower()
    changes = {}
    sections = []
    fields = []
    patterns = [
        ("days", r"(\d+)\s*(?:days?|రోజులు|दिन)"),
        ("budget_cap", r"(?:under|budget|below|బడ్జెట్|बजट)\s*[₹:]?\s*(\d[\d,]*)"),
        ("departure", r"(?:start|leave|depart|ప్రారంభం|शुरू)\s*(?:at)?\s*(\d{1,2}:\d{2})"),
    ]
    # Bare "3 days" is a proposal; questions about an existing 3-day plan must
    # not be interpreted as commands. Confirmation still remains mandatory.
    for key, pattern in patterns:
        match = re.search(pattern, text)
        if match:
            changes[key] = (
                match[1].zfill(5)
                if key == "departure"
                else int(match[1].replace(",", ""))
            )
    for pattern, key, value in [
        (
            r"no sightseeing|remove attractions|skip attractions",
            "include_attractions",
            False,
        ),
        (r"no hotel|without stay", "stay", "none"),
        (r"by bus|use bus|బస్సు|बस से", "transport", "bus"),
        (r"by car|use car", "transport", "car"),
    ]:
        if re.search(pattern, text):
            changes[key] = value
    if re.search(r"more rest|relax|విశ్రాంతి|आराम", text):
        changes.update(rest_minutes=30, visit_minutes=100)
    for section, words in [
        ("routes", ["distance", "route", "bus", "travel", "దూరం", "मार्ग", "दूरी"]),
        ("budget", ["budget", "cost", "price", "ఖర్చు", "బడ్జెట్", "बजट", "खर्च"]),
        (
            "options",
            ["hotel", "stay", "food", "eat", "restaurant", "భోజనం", "होटल", "खाना"],
        ),
        ("nearby", ["nearby", "attraction", "సమీప", "आसपास"]),
    ]:
        if any(k in text for k in words):
            sections.append(section)
    groups = {
        "dress_code": ["dress", "wear", "దుస్తు", "पोशाक"],
        "darshan_timings": ["time", "timing", "darshan", "సమయం", "दर्शन"],
        "accessibility": ["wheel", "access", "elder", "వృద్ధ", "बुजुर्ग"],
        "history": ["history", "చరిత్ర", "इतिहास"],
        "contact": ["contact", "phone", "సంప్రదింపు", "संपर्क"],
        "sevas": ["seva", "pooja", "పూజ", "पूजा"],
        "darshan_and_tickets": ["ticket", "entry", "టికెట్", "टिकट"],
    }
    fields = [key for key, words in groups.items() if any(k in text for k in words)]
    if fields:
        sections.append("temples")
    return Intent(changes=changes, sections=sections, fact_fields=fields)


async def _call(entry, message, job):
    base = "https://api.groq.com/openai/v1" if entry.kind == "groq" else entry.base_url
    prompt = (
        "You interpret itinerary requests, not answer them. Return ONLY JSON with changes (a partial planning request), "
        "sections (temples/routes/options/budget/nearby), fact_fields and temple_ids. No other fields or prose. "
        "Only propose user-requested changes; never change constraints when explaining a question. Resolve relative "
        "changes using current_request. Use only supplied catalog IDs. Do not emit times, fares, hotel availability, "
        "opening hours or operational facts. The user must review changes before they are applied. "
        "Allowed planning fields and constraints: "
        + json.dumps(PlanRequest.model_json_schema())
        + "\nAllowed fact fields: "
        + json.dumps(sorted(FIELDS))
    )
    from app.api.temple_suggest import CATALOG

    payload = {
        "message": message,
        "current_request": job["request"],
        "temples": [{"id": t["id"], "name": t["name"]} for t in CATALOG],
        "recent_history": [
            {"role": h["role"], "text": h["text"][:800]}
            for h in job.get("history", [])[-6:]
        ],
    }
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(4, connect=1.5), follow_redirects=False
    ) as client:
        async with client.stream(
            "POST",
            base.rstrip("/") + "/chat/completions",
            headers={"Authorization": "Bearer " + entry.api_key},
            json={
                "model": entry.model,
                "temperature": 0,
                "max_tokens": 900,
                "response_format": {"type": "json_object"},
                "messages": [
                    {"role": "system", "content": prompt},
                    {
                        "role": "user",
                        "content": json.dumps(payload, ensure_ascii=False),
                    },
                ],
            },
        ) as response:
            response.raise_for_status()
            chunks = bytearray()
            async for chunk in response.aiter_bytes():
                chunks.extend(chunk)
                if len(chunks) > 20000:
                    raise ValueError("Intent response exceeds limit")
    data = json.loads(chunks)
    return Intent.model_validate_json(data["choices"][0]["message"]["content"])


def understand(message, job):
    local = fallback(message, job["request"])
    if os.environ.get("PLAN_INTENT_LLM", "true").lower() == "false":
        return local, "deterministic"
    from app.services.llm import _pool

    pool = _pool()
    if not pool or not SLOTS.acquire(blocking=False):
        return local, "deterministic"
    try:

        async def bounded():
            return await asyncio.wait_for(_call(pool[0], message, job), timeout=6)

        parsed = asyncio.run(bounded())
        if (
            set(parsed.changes) - set(PlanRequest.model_fields)
            or set(parsed.fact_fields) - FIELDS
        ):
            raise ValueError("Unsupported intent")
        catalog = Path(__file__).resolve().parents[2] / "data" / "temples"
        if any(
            not re.fullmatch(r"T\d{4}", tid)
            or not (catalog / (tid + ".json")).is_file()
            for tid in parsed.temple_ids
        ):
            raise ValueError("Unsupported temple")
        if parsed.changes:
            PlanRequest.model_validate({**job["request"], **parsed.changes})
        return parsed, "bounded-llm-intent"
    except Exception:
        return local, "deterministic-fallback"
    finally:
        SLOTS.release()
