"""Durable single-host jobs with atomic snapshots, bounded work and owned revisions.
Run one backend worker with persistent .planning-runtime storage. Multi-host deployment
requires replacing this store/queue; a background thread is not a distributed queue.
"""

import hashlib
import json
import os
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from threading import BoundedSemaphore, RLock

from . import evidence
from .models import PlanRequest
from . import discovery, engine

ROOT = Path(__file__).resolve().parents[3] / ".planning-runtime"
LOCK = RLock()
POOL = ThreadPoolExecutor(max_workers=2, thread_name_prefix="itinerary")
SLOTS = BoundedSemaphore(8)
ACTIVE = set()


def _path(job_id):
    if str(uuid.UUID(job_id)) != job_id:
        raise ValueError("Invalid job ID")
    return ROOT / "jobs" / f"{job_id}.json"


def save(job):
    path = _path(job["id"])
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix("." + uuid.uuid4().hex + ".tmp")
    tmp.write_text(
        json.dumps(job, ensure_ascii=False, allow_nan=False), encoding="utf-8"
    )
    os.replace(tmp, path)


def get(job_id, owner):
    with LOCK:
        try:
            job = json.loads(_path(job_id).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            raise KeyError("Itinerary not found") from None
        if job["owner"] != owner:
            raise KeyError("Itinerary not found")
        if job["status"] in {"queued", "running"} and job_id not in ACTIVE:
            job.update(
                status="failed",
                stage="interrupted",
                error="Worker restarted. Retry this plan; no completed itinerary was lost.",
            )
            save(job)
        return job


def list_jobs(owner):
    result = []
    for path in sorted(
        (ROOT / "jobs").glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True
    ):
        try:
            j = get(path.stem, owner)
            result.append(
                {
                    k: j.get(k)
                    for k in ["id", "status", "stage", "created_at", "version", "title"]
                }
            )
        except KeyError:
            pass
        if len(result) >= 50:
            break
    return result


def create(req: PlanRequest, owner: str, parent=None):
    payload = req.model_dump(mode="json")
    digest = hashlib.sha256(
        json.dumps([owner, payload, parent], sort_keys=True).encode()
    ).hexdigest()
    with LOCK:
        for summary in list_jobs(owner):
            old = get(summary["id"], owner)
            if old.get("fingerprint") == digest and old["status"] not in {
                "failed",
                "cancelled",
            }:
                return old
        if (
            sum(
                get(x["id"], owner)["status"] in {"queued", "running"}
                for x in list_jobs(owner)
            )
            >= 2
        ):
            raise RuntimeError(
                "Two planning jobs are already active. Wait or cancel one."
            )
        version = get(parent, owner)["version"] + 1 if parent else 1
        if not SLOTS.acquire(blocking=False):
            raise RuntimeError("Planning queue is full. Please retry shortly.")
        job = {
            "id": str(uuid.uuid4()),
            "owner": owner,
            "request": payload,
            "status": "queued",
            "stage": "queued",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "version": version,
            "title": req.origin,
            "fingerprint": digest,
            "result": None,
            "history": [],
            "parent": parent,
        }
        try:
            ACTIVE.add(job["id"])
            save(job)
            POOL.submit(_run, job["id"], owner)
        except Exception:
            ACTIVE.discard(job["id"])
            SLOTS.release()
            raise
        return job


def append_chat(job_id, owner, message, reply):
    with LOCK:
        job = get(job_id, owner)
        records = job.get("history", []) + [
            {"role": "user", "text": message},
            {
                "role": "assistant",
                "text": reply.get("content", ""),
                "evidence": reply.get("evidence"),
            },
        ]
        job["history"] = records[-20:]
        save(job)


def cancel(job_id, owner):
    with LOCK:
        job = get(job_id, owner)
        if job["status"] not in {"queued", "running"}:
            return job
        job.update(status="cancelled", stage="cancelled")
        save(job)
        return job


def _stage(job_id, owner, stage):
    with LOCK:
        job = get(job_id, owner)
        if job["status"] == "cancelled":
            raise InterruptedError("Cancelled")
        job.update(status="running", stage=stage)
        save(job)
        return job


def _run(job_id, owner):
    started = time.monotonic()
    try:
        job = _stage(job_id, owner, "temples")
        req = PlanRequest.model_validate(job["request"])
        # Independent origin lookup and local temple/calendar evidence retrieval.
        with ThreadPoolExecutor(
            max_workers=2, thread_name_prefix="planning-retrieval"
        ) as retrieval:
            origin_future = retrieval.submit(evidence.origin_point, req.origin)
            temples = evidence.catalog(req.temple_ids, req.start_date, req.days)
            candidates, classifications = discovery.discover(req, temples)
            _stage(job_id, owner, "stay_food")
            options = evidence.stay_food(req, temples + candidates)
            options = evidence.locate_options(req, options, temples + candidates)
            origin = origin_future.result()
        _stage(job_id, owner, "routes")
        hotels = engine.hotel_candidates(req, options)
        located_food = [
            r for r in options.get("restaurants", []) if r.get("lat") is not None
        ][:3]
        points = [origin] + temples + candidates + hotels + located_food
        matrix = engine.buffered_routes(
            req, evidence.route_matrix(points, req.allow_estimates)
        )
        _stage(job_id, owner, "schedule")
        schedule, cost, classifications = engine.plan(
            req,
            temples,
            candidates,
            classifications,
            matrix,
            options,
            origin,
            progress=lambda stage: _stage(job_id, owner, stage),
        )
        hotel = options.get("selected_hotel")
        if hotel:
            leg = matrix.get(hotel["id"] + ">" + req.primary_temple_id, {})
            hotel["distance_to_primary_km"] = leg.get("km")
            hotel["distance_source"] = leg.get("source")
        warnings = [
            "Catalog hours, fees, meal prices and hotel listings are not live availability; confirm date-specific changes.",
            "Visit and queue duration is a planning allowance, not a crowd prediction.",
            "Road times are OSRM estimates without live traffic; configurable traffic and parking buffers are added.",
            "Anonymous meal breaks are reserved time, not a confirmed restaurant visit. Named venues require coordinates, both road transfers and dated opening windows.",
            "Unknown prices are excluded from the displayed subtotal; it is not a maximum trip price.",
        ]
        if req.stay_mode == "daily_return" and req.stay != "none":
            warnings.append(
                "Daily return selected: hotel discoveries are not used or charged."
            )
        if req.special != "none" or req.elderly:
            warnings.append(
                "Catalog accessibility notes are not an accessibility or medical-suitability certification."
            )
        if any(
            i.get("estimated")
            for d in schedule["days"]
            for i in d["items"]
            if i["type"] == "travel"
        ):
            warnings.append(
                "Selected route uses explicitly allowed straight-line scenarios, not verified road times."
            )
        if req.transport != "car":
            warnings.append(
                "Public transport/taxi availability and fares require confirmation; road timing is not a published service timetable."
            )
        if not cost["complete"]:
            warnings.append(
                "Budget is partial; unresolved categories are listed explicitly."
            )
        result = {
            **schedule,
            "schema_version": 21,
            "request": req.model_dump(mode="json"),
            "temples": temples,
            "destinations": temples + candidates,
            "attractions": classifications,
            "origin": origin,
            "routes": matrix,
            "options": options,
            "budget": cost,
            "warnings": warnings,
            "title": " → ".join(t["name"] for t in temples),
            "timezone": req.timezone,
            "date_contract": {
                "requested_dates": engine.requested_dates(req),
                "start_date": req.start_date.isoformat(),
                "end_date": engine.requested_dates(req)[-1],
                "timezone": req.timezone,
            },
            "review_required": True,
            "agent_trace": [
                {"agent": agent, "mode": mode}
                for agent, mode in [
                    (
                        "temple",
                        "catalog facts/source/last-verified; primary is mandatory",
                    ),
                    (
                        "discovery",
                        "rank bounded catalog candidates; unresolved prose remains optional",
                    ),
                    (
                        "travel",
                        "origin retrieval parallel with catalog; deduplicated bounded OSRM matrix; explicit buffers",
                    ),
                    ("calendar", "source-pinned dated windows; whole visit must fit"),
                    (
                        "accommodation",
                        "existing normalization; separate discovery/match/availability/booking; no capacity assumption",
                    ),
                    (
                        "restaurant",
                        "existing normalization; diet/windows/prices; named venue requires both road transfers",
                    ),
                    (
                        "itinerary",
                        "bounded candidate combinations and deterministic beam search",
                    ),
                    (
                        "budget",
                        "eight-category day-wise unit ledger; selected activities only; unknowns excluded",
                    ),
                    (
                        "validator",
                        "independent acceptance gate; rejected candidates trigger bounded retry; critical errors cannot complete",
                    ),
                    (
                        "composition",
                        "deterministic structured response; no LLM-generated times",
                    ),
                ]
            ],
            "elapsed_seconds": round(time.monotonic() - started, 2),
        }
        with LOCK:
            job = get(job_id, owner)
            if job["status"] != "cancelled":
                job.update(
                    status="completed"
                    if schedule["feasible"] and not schedule["conflicts"]
                    else "needs_changes",
                    stage="saved",
                    result=result,
                    title=result["title"],
                )
                save(job)
    except InterruptedError:
        pass
    except Exception as exc:
        with LOCK:
            job = get(job_id, owner)
            if job["status"] != "cancelled":
                job.update(status="failed", stage="failed", error=str(exc)[:350])
                save(job)
    finally:
        with LOCK:
            ACTIVE.discard(job_id)
        SLOTS.release()
