"""Offline planning contracts. Provider calls are mocked explicitly; these are
not certifications of live fares, hours, room availability or accessibility."""

import hashlib
import hmac
import json
import time
from datetime import date, timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest
from app.planning import api, calendar, evidence, intent, jobs
from app.planning.models import PlanRequest
from app.planning.solver import solve, validate
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

OWNER = "a" * 64
OTHER = "b" * 64
SECRET = "unit-test-only-shared-planning-secret"


@pytest.fixture
def req():
    return PlanRequest(
        temple_ids=["T0009", "T0010"],
        origin="Hyderabad",
        start_date=date.today() + timedelta(days=2),
    )


def matrix(ids, travel=10):
    return {
        a + ">" + b: {
            "from": a,
            "to": b,
            "km": 10.0,
            "minutes": travel,
            "source": "fixture",
            "estimated": False,
            "url": "https://maps.google.com/",
        }
        for a in ["origin"] + ids
        for b in ["origin"] + ids
        if a != b
    }


def temples(req, windows=None):
    return [
        {
            "id": tid,
            "name": tid,
            "url": "https://maps.google.com/",
            "windows": {
                (req.start_date + timedelta(days=i)).isoformat(): windows
                or [[360, 1260]]
                for i in range(req.days)
            },
        }
        for tid in req.temple_ids
    ]


@pytest.mark.parametrize(
    "change",
    [
        {"origin": "  "},
        {"temple_ids": ["T9999"]},
        {"temple_ids": ["T0009", "T0009"]},
        {"days": 8},
        {"adults": 30, "children": 1},
        {"departure": "21:00"},
        {"finish": "24:00"},
        {"visit_minutes": 5},
        {"budget_cap": float("nan")},
        {"owner": "forged"},
        {"start_date": "2000-01-01"},
    ],
)
def test_request_rejects_invalid_constraints(req, change):
    with pytest.raises(ValidationError):
        PlanRequest.model_validate({**req.model_dump(), **change})


def test_catalog_normalization_all_23_all_weekdays_and_digest_fail_closed():
    root = Path(__file__).resolve().parents[1] / "data" / "temples"
    for path in root.glob("T*.json"):
        record = json.loads(path.read_text(encoding="utf-8"))
        tid = record["temple_id"]
        for i in range(7):
            windows = calendar.opening_windows(
                record, date(2026, 11, 2) + timedelta(days=i)
            )
            assert bool(windows) == (tid != "T0021"), tid
            assert all(0 <= a < b <= 1440 for a, b in windows)
        record["darshan_timings"][0]["morning"] += " changed"
        assert calendar.opening_windows(record, date(2026, 11, 2)) == []


def test_weekday_closures_and_general_darshan():
    ts = {
        t["id"]: t
        for t in evidence.catalog(
            ["T0001", "T0002", "T0010", "T0019", "T0021", "T0023"], date(2026, 11, 2), 7
        )
    }
    assert ts["T0010"]["windows"]["2026-11-03"] == [[480, 780], [960, 1200]]
    assert ts["T0010"]["windows"]["2026-11-08"] == [[480, 1200]]
    assert ts["T0002"]["windows"]["2026-11-08"] == [
        [300, 720],
        [900, 1080],
        [1110, 1260],
    ]
    assert ts["T0021"]["windows"]["2026-11-02"] == []
    assert ts["T0019"]["windows"]["2026-11-02"] == [[390, 750], [900, 1230]]
    assert ts["T0023"]["windows"]["2026-11-02"] == [[390, 750], [870, 1230]]
    assert all(
        not (a < 600 and b > 540) for a, b in ts["T0001"]["windows"]["2026-11-02"]
    )


def test_complete_schedule_and_independent_validator(req):
    ts = temples(req)
    m = matrix(req.temple_ids)
    r = solve(req, ts, m)
    assert r["feasible"] and validate(req, ts, r, m) == []
    assert sorted(
        i["place_id"] for d in r["days"] for i in d["items"] if i["type"] == "visit"
    ) == sorted(req.temple_ids)
    assert r["days"][-1]["items"][-1]["to_id"] == "origin"
    assert solve(req, ts, m) == r


def test_multi_day_required_coverage(req):
    req = req.model_copy(update={"days": 2, "finish": "10:00"})
    ts = temples(req)
    m = matrix(req.temple_ids)
    r = solve(req, ts, m)
    assert r["feasible"] and len(r["days"]) == 2
    assert validate(req, ts, r, m) == []


def test_later_day_opening_not_silently_shifted(req):
    req = req.model_copy(update={"temple_ids": ["T0009"], "days": 2})
    ts = temples(req)
    ts[0]["windows"][req.start_date.isoformat()] = []
    r = solve(req, ts, matrix(req.temple_ids))
    assert not r["feasible"] and len(r["days"]) == 2 and not r["days"][0]["items"]
    assert "DAY_UNPLANNED" in {e["code"] for e in r["conflicts"]}


def test_infeasible_and_missing_route_never_drop_a_mandatory_stop(req):
    ts = temples(req, [[420, 450]])
    r = solve(req, ts, matrix(req.temple_ids))
    assert not r["feasible"] and not r["days"]
    r = solve(req, temples(req), {})
    assert not r["feasible"] and not r["days"]


def test_estimate_requires_consent(req):
    m = matrix(req.temple_ids)
    for leg in m.values():
        leg["estimated"] = True
    assert not solve(req, temples(req), m)["feasible"]
    assert solve(req.model_copy(update={"allow_estimates": True}), temples(req), m)[
        "feasible"
    ]


def test_meals_and_long_driving_breaks(req):
    req = req.model_copy(update={"temple_ids": ["T0009"], "visit_minutes": 120})
    ts = temples(req)
    m = matrix(req.temple_ids, travel=240)
    r = solve(req, ts, m)
    assert r["feasible"], r
    items = r["days"][0]["items"]
    assert any(x["type"] == "meal" for x in items)
    assert any(x["title"] == "enroute_rest" for x in items)
    assert validate(req, ts, r, m) == []
    assert sum(x["duration_minutes"] for x in items if x["type"] == "travel") == 480
    assert sum(
        x["distance_km"] for x in items if x["type"] == "travel"
    ) == pytest.approx(20)


@pytest.mark.parametrize(
    "mutation,code",
    [
        ("return", "RETURN_MISSING"),
        ("route", "ROUTE_TOTAL_INVALID"),
        ("window", "CLOSED_DURING_VISIT"),
        ("location", "VISIT_LOCATION_INVALID"),
        ("date", "DATE_INVALID"),
        ("rest", "REST_MISSING"),
    ],
)
def test_validator_rejects_tampering(req, mutation, code):
    ts = temples(req)
    m = matrix(req.temple_ids)
    r = solve(req, ts, m)
    items = r["days"][0]["items"]
    if mutation == "return":
        items.pop()
    elif mutation == "route":
        items[0]["distance_km"] += 10
    elif mutation == "location":
        next(x for x in items if x["type"] == "visit")["place_id"] = "T0001"
    elif mutation == "date":
        r["days"][0]["date"] = "2001-01-01"
    elif mutation == "rest":
        next(x for x in items if x["type"] == "rest")["type"] = "wait"
    else:
        for tm in ts:
            tm["windows"] = {}
    assert code in {e["code"] for e in validate(req, ts, r, m)}


def test_route_provider_units_and_outage(monkeypatch):
    a = {"id": "a", "lat": 17.3, "lng": 78.4}
    b = {"id": "b", "lat": 17.4, "lng": 78.5}
    monkeypatch.setattr(
        evidence,
        "route_osrm",
        lambda *a, **kw: [
            SimpleNamespace(key="distance", value=12.3),
            SimpleNamespace(key="duration", value=22.1),
        ],
    )
    r = evidence.route_pair(a, b, False, time.monotonic() + 1)
    assert (r["km"], r["minutes"], r["estimated"]) == (12.3, 23, False)

    def fail(*a, **kw):
        raise TimeoutError()

    monkeypatch.setattr(evidence, "route_osrm", fail)
    assert evidence.route_pair(a, b, False, time.monotonic() + 1)["minutes"] is None
    assert evidence.route_pair(a, b, True, time.monotonic() + 1)["estimated"]


def test_budget_explicit_units_missing_quotes_and_room_nights(req):
    from app.planning.costing import calculate

    req = req.model_copy(
        update={
            "days": 3,
            "adults": 3,
            "children": 1,
            "rooms": 2,
            "stay": "hotel",
            "stay_mode": "overnight",
        }
    )
    hotel = {
        "id": "H_FIXTURE",
        "price_low": 1000,
        "price_high": 2000,
        "source_record": "TEST_FIXTURE",
    }
    options = {"hotels": [hotel], "restaurants": [], "selected_hotel": hotel}
    days = [
        {"date": (req.start_date + timedelta(days=i)).isoformat(), "items": []}
        for i in range(3)
    ]
    b = calculate(req, days, options, [])
    stay = next(c for c in b["categories"] if c["category"] == "stay")
    assert stay["low"] == 2 * 2 * 1000 and stay["high"] == 2 * 2 * 2000
    assert not b["complete"] and b["missing"]
    daily = calculate(
        req.model_copy(update={"stay_mode": "daily_return"}), days, options, []
    )
    assert next(c for c in daily["categories"] if c["category"] == "stay")["high"] == 0
    bus = calculate(req.model_copy(update={"transport": "bus"}), days, options, [])
    assert "transport_fare" in bus["missing"] and bus["within_cap"] is None


def test_diet_does_not_invent_jain_nonveg_and_options_bound_to_temple(req):
    ts = evidence.catalog(req.temple_ids, req.start_date, 1)
    assert (
        evidence.stay_food(req.model_copy(update={"food": "jain"}), ts)["restaurants"]
        == []
    )
    nonveg = evidence.stay_food(req.model_copy(update={"food": "nonveg"}), ts)[
        "restaurants"
    ]
    assert all(r["diet_evidence"] == "nonveg" for r in nonveg)
    opts = evidence.stay_food(req.model_copy(update={"days": 2, "stay": "hotel"}), ts)
    assert all(
        o["temple_id"] in req.temple_ids
        for group in ["hotels", "restaurants"]
        for o in opts[group]
    )
    assert all(
        o["availability"] == "unverified"
        for group in ["hotels", "restaurants"]
        for o in opts[group]
    )


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(jobs, "ROOT", tmp_path)
    monkeypatch.setenv("PLAN_SERVICE_SECRET", SECRET)
    monkeypatch.setenv("PLAN_INTENT_LLM", "false")
    monkeypatch.setattr(jobs, "POOL", SimpleNamespace(submit=lambda *args: None))
    monkeypatch.setattr(evidence, "locate_options", lambda req, opts, places: opts)
    jobs.ACTIVE.clear()
    api._LIMITS.clear()
    app = FastAPI()
    app.include_router(api.router)
    with TestClient(app) as c:
        yield c
    for _ in list(jobs.ACTIVE):
        jobs.SLOTS.release()
    jobs.ACTIVE.clear()


def signed(client, method, path, body=None, owner=OWNER):
    payload = json.dumps(body, ensure_ascii=False) if body is not None else ""
    stamp = str(int(time.time()))
    digest = hashlib.sha256(payload.encode()).hexdigest()
    signature = hmac.new(
        SECRET.encode(),
        "\n".join([stamp, owner, method, path, digest]).encode(),
        hashlib.sha256,
    ).hexdigest()
    return client.request(
        method,
        path,
        content=payload,
        headers={
            "content-type": "application/json",
            "x-plan-owner": owner,
            "x-plan-time": stamp,
            "x-plan-signature": signature,
        },
    )


def complete(client, req, monkeypatch):
    monkeypatch.setattr(
        evidence, "route_matrix", lambda points, allow: matrix(req.temple_ids)
    )
    response = signed(client, "POST", "/planning/jobs", req.model_dump(mode="json"))
    assert response.status_code == 202, response.text
    jid = response.json()["id"]
    jobs._run(jid, OWNER)
    return signed(client, "GET", "/planning/jobs/" + jid).json()


def test_unsigned_rejected_body_tampering_and_path_ownership(client, req):
    assert client.get("/planning/jobs").status_code == 403
    j = signed(client, "POST", "/planning/jobs", req.model_dump(mode="json")).json()
    assert "owner" not in j and "fingerprint" not in j
    assert (
        signed(client, "GET", "/planning/jobs/" + j["id"], owner=OTHER).status_code
        == 404
    )
    assert signed(client, "GET", "/planning/jobs/not-a-uuid").status_code == 404
    assert signed(client, "GET", "/planning/jobs").json()[0]["id"] == j["id"]
    assert signed(client, "GET", "/planning/jobs", owner=OTHER).json() == []


def test_idempotency_cancel_restart_and_queue_bound(client, req):
    body = req.model_dump(mode="json")
    j = signed(client, "POST", "/planning/jobs", body).json()
    assert signed(client, "POST", "/planning/jobs", body).json()["id"] == j["id"]
    assert (
        signed(client, "DELETE", "/planning/jobs/" + j["id"]).json()["status"]
        == "cancelled"
    )
    jobs._run(j["id"], OWNER)
    j2 = signed(client, "POST", "/planning/jobs", body).json()
    assert j2["id"] != j["id"]
    jobs.ACTIVE.discard(j2["id"])
    jobs.SLOTS.release()
    assert (
        signed(client, "GET", "/planning/jobs/" + j2["id"]).json()["stage"]
        == "interrupted"
    )


def test_pipeline_result_revision_confirmation_history_and_stale_version(
    client, req, monkeypatch
):
    j = complete(client, req, monkeypatch)
    assert j["status"] == "completed", j
    jid = j["id"]
    path = "/planning/jobs/" + jid + "/chat"
    proposal = signed(
        client, "POST", path, {"message": "3 days", "base_version": 1}
    ).json()
    assert proposal["kind"] == "proposal" and proposal["changes"]["days"] == 3
    assert jobs.get(jid, OWNER)["request"]["days"] == 1
    bad = signed(
        client,
        "POST",
        path,
        {
            "message": "change",
            "base_version": 1,
            "changes": {"facts": {"timing": "fake"}},
        },
    )
    assert bad.status_code == 400
    new = signed(
        client,
        "POST",
        path,
        {
            "message": "apply",
            "base_version": 1,
            "changes": proposal["changes"],
            "confirm": True,
        },
    ).json()["job"]
    assert new["version"] == 2 and new["parent"] == jid and new["request"]["days"] == 3
    assert jobs.get(jid, OWNER)["history"]
    assert (
        signed(
            client,
            "POST",
            "/planning/jobs/" + new["id"] + "/chat",
            {"message": "hello", "base_version": 1},
        ).status_code
        == 409
    )
    jobs._run(new["id"], OWNER)


def test_chat_decomposes_capabilities_and_emergency_wins(client, req, monkeypatch):
    j = complete(client, req, monkeypatch)
    path = "/planning/jobs/" + j["id"] + "/chat"
    reply = signed(
        client,
        "POST",
        path,
        {"message": "timings, dress, hotels, routes and budget", "base_version": 1},
    ).json()
    assert {"temples", "options", "routes", "budget"} <= set(reply["evidence"])
    emergency = signed(
        client,
        "POST",
        path,
        {"message": "chest pain, make it 3 days", "base_version": 1},
    ).json()
    assert emergency["kind"] == "answer" and "108" in emergency["content"]
    assert jobs.get(j["id"], OWNER)["request"]["days"] == 1


def test_bus_cap_and_mobility_are_not_falsely_certified(client, req, monkeypatch):
    req = req.model_copy(
        update={"transport": "bus", "budget_cap": 10000, "special": "wheel"}
    )
    j = complete(client, req, monkeypatch)
    assert j["status"] == "needs_changes" and not j["result"]["feasible"]
    assert {
        "SERVICE_TIMETABLE_UNVERIFIED",
        "BUDGET_NOT_FULLY_PRICED",
        "ACCESS_REQUIREMENTS_UNVERIFIED",
    } <= set(x["code"] for x in j["result"]["conflicts"])


def test_discovery_no_origin_means_no_distance_no_hyderabad_assumption(
    client, monkeypatch
):
    monkeypatch.setattr(
        evidence,
        "origin_point",
        lambda _: pytest.fail("Must not geocode absent origin"),
    )
    j = signed(
        client,
        "POST",
        "/planning/discover",
        {"message": "temples near me", "language": "en"},
    ).json()
    assert j["routes"] == [] and "starting location" in j["content"]
    assert j["suggestions"]


def test_discovery_uses_explicit_origin_and_catalog_names(client, monkeypatch):
    seen = []

    def home(text):
        seen.append(text)
        return {"id": "origin", "lat": 18, "lng": 79}

    monkeypatch.setattr(evidence, "origin_point", home)
    monkeypatch.setattr(
        evidence,
        "route_pair",
        lambda a, b, *args: {
            "name": b["name"],
            "minutes": 10,
            "km": 12,
            "estimated": False,
            "url": "https://maps.google.com/",
        },
    )
    j = signed(
        client,
        "POST",
        "/planning/discover",
        {"message": "nearest temples", "origin": "Warangal", "language": "te"},
    ).json()
    assert seen == ["Warangal"] and len(j["routes"]) == 4
    assert all(
        n
        in {
            t["name"]
            for t in __import__("app.api.temple_suggest", fromlist=["CATALOG"]).CATALOG
        }
        for n in j["suggestions"]
    )


def test_intent_timeout_invalid_facts_and_no_keys_fall_back(req, monkeypatch):
    from app.services import llm

    monkeypatch.setenv("PLAN_INTENT_LLM", "true")
    monkeypatch.setattr(llm, "_pool", lambda: [SimpleNamespace()])
    job = {
        "request": req.model_dump(mode="json"),
        "result": {"temples": []},
        "history": [],
    }

    async def fail(*args):
        raise TimeoutError("bounded")

    monkeypatch.setattr(intent, "_call", fail)
    value, mode = intent.understand("by bus", job)
    assert mode == "deterministic-fallback" and value.changes["transport"] == "bus"

    async def unsafe(*args):
        return intent.Intent(changes={"opening_hours": "invented"})

    monkeypatch.setattr(intent, "_call", unsafe)
    assert intent.understand("by bus", job)[0].changes == {"transport": "bus"}
    monkeypatch.setattr(llm, "_pool", lambda: [])
    assert intent.understand("by bus", job)[1] == "deterministic"


def test_requested_days_without_activity_are_incomplete_not_success(req):
    req = req.model_copy(update={"days": 3})
    ts = temples(req)
    m = matrix(req.temple_ids)
    result = solve(req, ts, m)
    assert not result["feasible"] and len(result["days"]) == 3
    assert sum(bool(d["items"]) for d in result["days"]) == 2
    assert result["days"][-1]["items"] == []
    assert "DAY_UNPLANNED" in {e["code"] for e in validate(req, ts, result, m)}


def test_daily_coverage_is_not_sacrificed_for_cheaper_empty_days(req):
    req = req.model_copy(update={"days": 2, "budget_cap": 300})
    ts = temples(req)
    m = matrix(req.temple_ids)
    # Two origin-return days are 40 km; a combined loop is 30 km.
    result = solve(req, ts, m)
    assert result["feasible"]
    assert sum(bool(d["items"]) for d in result["days"]) == 2


def test_clock_rejects_invalid_values():
    for text in ["25:00", "12:61", "-1:00"]:
        with pytest.raises(ValueError):
            calendar.minutes(text)


def test_forged_hmac_and_expired_signature_rejected(client):
    headers = {
        "x-plan-owner": OWNER,
        "x-plan-time": str(int(time.time())),
        "x-plan-signature": "0" * 64,
    }
    assert client.get("/planning/jobs", headers=headers).status_code == 403
    headers["x-plan-time"] = "1"
    assert client.get("/planning/jobs", headers=headers).status_code == 403


def test_per_owner_active_job_limit(client, req):
    for days in [1, 2]:
        body = {**req.model_dump(mode="json"), "days": days}
        assert signed(client, "POST", "/planning/jobs", body).status_code == 202
    body = {**req.model_dump(mode="json"), "days": 3}
    assert signed(client, "POST", "/planning/jobs", body).status_code == 429


def test_bounded_llm_transport_returns_only_typed_intent(req, monkeypatch):
    import asyncio
    import httpx

    real_client = httpx.AsyncClient

    def respond(request):
        body = json.loads(request.content)
        assert body["max_tokens"] == 900 and body["temperature"] == 0
        assert "operational facts" in body["messages"][0]["content"]
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {
                                    "changes": {"days": 3},
                                    "sections": ["routes", "budget"],
                                    "fact_fields": [],
                                    "temple_ids": [],
                                }
                            )
                        }
                    }
                ]
            },
        )

    monkeypatch.setattr(
        intent.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(transport=httpx.MockTransport(respond), **kwargs),
    )
    entry = SimpleNamespace(
        kind="groq", api_key="not-a-real-key", model="fixture-model"
    )
    job = {"request": req.model_dump(mode="json"), "result": {"temples": []}}
    value = asyncio.run(intent._call(entry, "spread across three days", job))
    assert value.changes == {"days": 3} and value.sections == ["routes", "budget"]


def test_catalog_normalization_with_windows_cp1252_default(monkeypatch):
    """Simulate Windows' non-UTF8 locale without changing production encoding."""
    original = Path.read_text

    def windows_read(path, *args, **kwargs):
        if not args and kwargs.get("encoding") is None:
            kwargs["encoding"] = "cp1252"
        return original(path, *args, **kwargs)

    monkeypatch.setattr(Path, "read_text", windows_read)
    test_catalog_normalization_all_23_all_weekdays_and_digest_fail_closed()
