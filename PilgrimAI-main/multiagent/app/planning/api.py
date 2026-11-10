"""Signed Next-only planning API. Owner IDs are never accepted from browser JSON."""

import hashlib
import hmac
import json
import os
import re
import time
from typing import Literal

from app.pipeline import safety
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from . import evidence, jobs
from .models import PlanRequest, RevisionRequest

router = APIRouter(prefix="/planning", tags=["planning"])
from collections import deque
from threading import Lock

_LIMITS = {}
_LIMIT_LOCK = Lock()


def _rate_limit(principal, action):
    now = time.monotonic()
    with _LIMIT_LOCK:
        for key in list(_LIMITS):
            if not _LIMITS[key] or _LIMITS[key][-1] < now - 60:
                del _LIMITS[key]
        key = (principal, action)
        if key not in _LIMITS and len(_LIMITS) >= 4096:
            raise HTTPException(429, "Please retry shortly.")
        values = _LIMITS.setdefault(key, deque())
        while values and values[0] < now - 60:
            values.popleft()
        if len(values) >= (20 if action == "discover" else 30):
            raise HTTPException(429, "Too many planning requests. Retry in a minute.")
        values.append(now)


def _secret():
    key = os.environ.get("PLAN_SERVICE_SECRET", "")
    if key:
        if len(key) < 32:
            raise RuntimeError(
                "PLAN_SERVICE_SECRET must contain at least 32 characters"
            )
        return key.encode()
    if os.environ.get("APP_ENV") == "production":
        raise RuntimeError("PLAN_SERVICE_SECRET is required in production")
    path = jobs.ROOT / "proxy.key"
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as stream:
            stream.write(os.urandom(32).hex())
    except FileExistsError:
        pass
    return path.read_bytes()


async def owner(
    request: Request,
    x_plan_owner: str = Header(default=""),
    x_plan_time: str = Header(default=""),
    x_plan_signature: str = Header(default=""),
):
    try:
        if abs(time.time() - int(x_plan_time)) > 60 or not re.fullmatch(
            r"[a-f0-9]{64}", x_plan_owner
        ):
            raise ValueError()
        body = await request.body()
        value = "\n".join(
            [
                x_plan_time,
                x_plan_owner,
                request.method,
                request.url.path,
                hashlib.sha256(body).hexdigest(),
            ]
        )
        expected = hmac.new(_secret(), value.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, x_plan_signature):
            raise ValueError()
        return x_plan_owner
    except (ValueError, RuntimeError):
        raise HTTPException(403, "Invalid planning proxy signature") from None


def clean(job):
    return {k: v for k, v in job.items() if k not in {"owner", "fingerprint"}}


@router.post("/jobs", status_code=202)
def create(body: PlanRequest, principal=Depends(owner)):
    try:
        return clean(jobs.create(body, principal))
    except RuntimeError as exc:
        raise HTTPException(429, str(exc)) from exc


@router.get("/jobs")
def listing(principal=Depends(owner)):
    return jobs.list_jobs(principal)


@router.get("/jobs/{job_id}")
def get(job_id: str, principal=Depends(owner)):
    try:
        return clean(jobs.get(job_id, principal))
    except KeyError:
        raise HTTPException(404, "Itinerary not found") from None


@router.delete("/jobs/{job_id}")
def cancel(job_id: str, principal=Depends(owner)):
    try:
        return clean(jobs.cancel(job_id, principal))
    except KeyError:
        raise HTTPException(404, "Itinerary not found") from None


def _emergency(text):
    return bool(
        re.search(
            r"chest pain|cannot breathe|can.t breathe|unconscious|గుండె నొప్పి|ఊపిరి|सीने में दर्द|सांस नहीं",
            text,
            re.I,
        )
    ) or safety.detect(text)


@router.post("/jobs/{job_id}/chat")
def chat(job_id: str, body: RevisionRequest, principal=Depends(owner)):
    _rate_limit(principal, "chat")
    try:
        job = jobs.get(job_id, principal)
    except KeyError:
        raise HTTPException(404, "Itinerary not found") from None
    if _emergency(body.message):
        return {"kind": "answer", "content": safety.response(body.message)["reply"]}
    if body.base_version != job["version"]:
        raise HTTPException(409, "Itinerary version changed; reload before revising.")
    if not job.get("result"):
        raise HTTPException(409, "Wait for planning to complete.")
    from .intent import Intent, understand

    intent, mode = (
        (Intent(changes=body.changes), "typed-editor")
        if body.changes
        else understand(body.message, job)
    )
    changes = dict(intent.changes)
    if set(changes) - set(PlanRequest.model_fields):
        raise HTTPException(400, "Unsupported revision fields")
    changes = {k: v for k, v in changes.items() if v != job["request"].get(k)}

    def respond(reply):
        reply["intent_mode"] = mode
        jobs.append_chat(job_id, principal, body.message, reply)
        return reply

    if changes:
        try:
            req = PlanRequest.model_validate({**job["request"], **changes})
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        if not body.confirm:
            return respond(
                {"kind": "proposal", "changes": changes, "content": "proposal"}
            )
        try:
            revised = jobs.create(req, principal, parent=job_id)
        except RuntimeError as exc:
            raise HTTPException(429, str(exc)) from exc
        return respond(
            {"kind": "revision", "job": clean(revised), "content": "revisionCreated"}
        )
    result = job["result"]
    temples = result["temples"]
    matched = [
        t
        for t in temples
        if t["id"] in intent.temple_ids or t["name"].lower() in body.message.lower()
    ] or temples
    parts = {}
    for section in intent.sections:
        if section == "routes":
            # Actual used legs first; don't dump a 552-edge matrix into the chat.
            used = {
                (item.get("from_id"), item.get("to_id"))
                for day in result["days"]
                for item in day["items"]
                if item["type"] == "travel"
            }
            routes = [
                r
                for r in result["routes"].values()
                if (r["from"], r["to"]) in used or not used
            ]
            parts["routes"] = routes[:24]
            parts["platforms"] = evidence.platform_links(
                job["request"]["origin"], matched[0]["name"]
            )
        elif section == "budget":
            parts["budget"] = result["budget"]
        elif section == "options":
            parts["options"] = result["options"]
        elif section == "nearby":
            parts["nearby"] = result.get('attractions') or [
                {"name": t["name"], "places": t["nearby"]} for t in matched
            ]
        elif section == "temples":
            parts["temples"] = [
                {
                    "name": t["name"],
                    "facts": {
                        f: t["facts"].get(f) for f in intent.fact_fields or ["summary"]
                    },
                    "sources": t["facts"].get("sources"),
                }
                for t in matched
            ]
    return respond(
        {
            "kind": "answer",
            "content": "evidenceReply" if parts else "chatHint",
            "evidence": parts or None,
        }
    )


class DiscoverRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = Field(min_length=1, max_length=800)
    origin: str | None = Field(default=None, max_length=160)
    language: Literal["en", "te", "hi"] = "en"


@router.post("/discover")
def discover(body: DiscoverRequest, principal=Depends(owner)):
    _rate_limit(principal, "discover")
    if _emergency(body.message):
        return {"content": safety.response(body.message)["reply"], "suggestions": []}
    from app.agents.temple import _TEMPLE_DIR
    from app.api.temple_suggest import CATALOG

    text = body.message.lower()
    origin = body.origin
    # Never assume Hyderabad is the user's location. Explicit city mentions count.
    if not origin:
        match = re.search(r"(?:from|near)\s+([a-z ]{2,50})", text)
        if match and match[1].strip() not in {"me", "my location", "my place", "here"}:
            origin = match[1].strip()
    terms = []
    for variants, term in [
        (["shiva", "శివ", "शिव"], "shiva"),
        (["saras", "సరస్వ", "सरस्व"], "saras"),
        (["narasim", "నరసింహ", "नरसिंह"], "narasim"),
        (["devi", "దేవి", "देवी"], "devi"),
    ]:
        if any(v in text for v in variants):
            terms.append(term)
    picks = [
        t
        for t in CATALOG
        if not terms
        or any(
            k in (t["name"] + " " + t["deity"] + " " + t["summary"]).lower()
            for k in terms
        )
    ]
    if not origin:
        lead = {
            "en": "Enter your starting location to calculate road distances. These are catalog matches, not nearest-temple claims.",
            "te": "రహదారి దూరాల కోసం ప్రారంభ స్థలాన్ని నమోదు చేయండి. ఇవి జాబితా సరిపోలికలు మాత్రమే.",
            "hi": "सड़क दूरी के लिए अपना शुरुआती स्थान दर्ज करें। ये सूची के मिलान हैं, निकटतम होने का दावा नहीं।",
        }.get(body.language, "Enter your starting location.")
        return {
            "content": lead,
            "suggestions": [t["name"] for t in picks[:4]],
            "routes": [],
        }
    try:
        home = evidence.origin_point(origin)
    except Exception:
        raise HTTPException(
            422, "Starting location could not be resolved. Enter a precise city/area."
        ) from None
    points = []
    for t in picks:
        d = json.loads((_TEMPLE_DIR / (t["id"] + ".json")).read_text(encoding="utf-8"))
        loc = d["location"]
        points.append(
            {
                "id": t["id"],
                "name": t["name"],
                "lat": float(loc["latitude"]),
                "lng": float(loc["longitude"]),
            }
        )
    points.sort(key=lambda p: evidence._distance(home, p))
    points = points[:6]
    from concurrent.futures import ThreadPoolExecutor

    deadline = time.monotonic() + 6
    with ThreadPoolExecutor(max_workers=6) as pool:
        routes = list(
            pool.map(
                lambda p: {
                    **evidence.route_pair(home, p, False, deadline),
                    "name": p["name"],
                },
                points,
            )
        )
    routes.sort(
        key=lambda r: r["minutes"] if r["minutes"] is not None else float("inf")
    )
    routes = routes[:4]
    lead = {
        "en": "Road estimates from your supplied origin (not live traffic).",
        "te": "మీరు ఇచ్చిన ప్రారంభ స్థలం నుండి రహదారి అంచనాలు (ప్రత్యక్ష ట్రాఫిక్ కాదు).",
        "hi": "आपके दिए स्थान से सड़क अनुमान (लाइव ट्रैफ़िक नहीं)।",
    }.get(body.language, "Road estimates:")
    lines = [
        r["name"]
        + (
            f" — {r['km']} km / {r['minutes']} min"
            if r["minutes"] is not None
            else " — road route unavailable"
        )
        for r in routes
    ]
    return {
        "content": lead + "\n" + "\n".join(lines),
        "suggestions": [r["name"] for r in routes],
        "routes": routes,
    }
