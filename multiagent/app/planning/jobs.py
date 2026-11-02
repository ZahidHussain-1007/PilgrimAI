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
from .solver import solve

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
        temples = evidence.catalog(req.temple_ids, req.start_date, req.days)
        _stage(job_id, owner, "routes")
        origin = evidence.origin_point(req.origin)
        matrix = evidence.route_matrix([origin] + temples, req.allow_estimates)
        _stage(job_id, owner, "stay_food")
        options = evidence.stay_food(req, temples)
        _stage(job_id, owner, "schedule")
        fixed_cost = evidence.calculate_budget(req, [], options)["high"]
        schedule = solve(req, temples, matrix, known_fixed_cost=fixed_cost)
        _stage(job_id, owner, "budget")
        cost = evidence.calculate_budget(req, schedule["days"], options)
        _stage(job_id, owner, "validate")
        warnings = [
            "Catalog hours and charges are not live availability. Confirm date-specific changes with the temple.",
            "Visit length includes a user-selected planning allowance, not a measured queue forecast.",
            schedule.get(
                "base_policy", "Each day is a return journey to the supplied origin."
            ),
            "Hotel, meal and nearby-attraction listings are options; their transfers/opening times are not scheduled or confirmed.",
        ]
        if any(r["estimated"] for r in matrix.values()):
            warnings.append(
                "Some routes are unavailable or straight-line scenarios; do not treat them as verified road times."
            )
        if req.transport in {"bus", "train"}:
            warnings.append(
                "Timeline uses a road-based scenario, NOT a bus/train timetable. Confirm service, boarding point, transfers and fares before travel."
            )
        if req.transport == "taxi":
            warnings.append(
                "Taxi availability and fare are unverified; obtain a quote."
            )
        if req.special != "none" or req.elderly:
            warnings.append(
                "Accessibility / medical suitability is not certified. Contact each venue; extra visit time alone does not prove access."
            )
        if req.food in {"jain", "nonveg"}:
            warnings.append(
                "No verified matching dietary options are returned by this adapter. Confirm directly; unknown diet is not a match."
            )
        if req.include_attractions:
            warnings.append(
                "Nearby attractions are listed with map links but not inserted into the timed route; their hours and visit duration need confirmation."
            )
        if req.days > 1 and req.stay != "none":
            warnings.append(
                "Accommodation category, room capacity, nightly availability and hotel transfers require confirmation. Daily routing still uses your origin as base."
            )
        if cost["within_cap"] is False:
            schedule["conflicts"].append(
                {
                    "code": "KNOWN_COSTS_EXCEED_CAP",
                    "details": [str(cost["high"]), str(req.budget_cap)],
                }
            )
        elif req.budget_cap is not None and not cost["complete"]:
            schedule["conflicts"].append(
                {"code": "BUDGET_NOT_FULLY_PRICED", "details": cost["missing"]}
            )
        if req.special in {"wheel", "medical"}:
            schedule["conflicts"].append(
                {
                    "code": "ACCESS_REQUIREMENTS_UNVERIFIED",
                    "details": ["Contact the venues before accepting this draft."],
                }
            )
        if req.transport in {"bus", "train"}:
            schedule["conflicts"].append(
                {
                    "code": "SERVICE_TIMETABLE_UNVERIFIED",
                    "details": [
                        "Road scenario only; confirm services and transfer times."
                    ],
                }
            )
        if schedule["conflicts"]:
            schedule["feasible"] = False
        result = {
            **schedule,
            "request": req.model_dump(mode="json"),
            "temples": temples,
            "routes": matrix,
            "options": options,
            "budget": cost,
            "warnings": warnings,
            "title": " → ".join(t["name"] for t in temples),
            "timezone": "Asia/Kolkata",
            "review_required": True,
            "agent_trace": [
                {"agent": a, "mode": m}
                for a, m in [
                    ("temple", "catalog evidence"),
                    ("travel", "OSRM matrix / explicit estimates"),
                    (
                        "accommodation",
                        "catalog normalization and hard-constraint filter",
                    ),
                    ("restaurant", "catalog dietary filter"),
                    ("calendar", "catalog window extraction"),
                    ("itinerary", "bounded deterministic beam search"),
                    ("budget", "existing money parser + explicit-unit arithmetic"),
                    (
                        "validator",
                        "independent dates/route continuity/leg totals/windows/coverage/meals/rest checks",
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
