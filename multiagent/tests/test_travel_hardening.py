from __future__ import annotations

import uuid

import pytest

from app.core.config import settings
from app.services.session import redis_client
from app.travel.cache import _cache_key, get_fact, set_fact, set_negative
from app.travel.providers import route_chain, routing
from app.travel.schemas import Coordinate


def _coordinates() -> tuple[Coordinate, Coordinate]:
    token = uuid.uuid4().int % 100000
    origin = Coordinate(
        latitude=17.0 + (token / 1_000_000),
        longitude=78.0 + (token / 1_000_000),
    )
    destination = Coordinate(
        latitude=17.5 + (token / 1_000_000),
        longitude=78.5 + (token / 1_000_000),
    )
    return origin, destination


def _require_redis() -> None:
    try:
        redis_client.ping()
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"redis unavailable: {exc}")


def test_provider_order_osrm_then_haversine(monkeypatch):
    """OSRM failure falls back to Haversine (PARTIAL). Google was removed
    (keyless deployment) - OSRM is the only live provider now."""
    origin, destination = _coordinates()
    calls: list[str] = []

    monkeypatch.setattr(settings, "osrm_enabled", True)

    def fake_osrm(*args, **kwargs):
        calls.append("osrm")
        raise RuntimeError("osrm down")

    monkeypatch.setattr(route_chain, "route_osrm", fake_osrm)

    result = route_chain.route_with_fallbacks(
        origin, destination, mode="driving"
    )

    assert result.status == "PARTIAL"
    assert result.metadata["selected_provider"] == "haversine"
    assert calls == ["osrm"]


def test_walking_uses_foot_endpoint(monkeypatch):
    """Walking must hit osrm_foot_url: the public OSRM demo answers
    'walking' with car data (identical distance for driving and foot)."""
    origin, destination = _coordinates()
    seen: dict[str, str] = {}

    def fake_request(url, *, headers=None, timeout_seconds):
        seen["url"] = url
        return {
            "code": "Ok",
            "routes": [{"distance": 47894.0, "duration": 38320.0}],
        }

    monkeypatch.setattr(settings, "osrm_enabled", True)
    monkeypatch.setattr(routing, "_request_json", fake_request)

    facts = routing.route_osrm(origin, destination, mode="walking")

    assert settings.osrm_foot_url.rstrip("/") in seen["url"]
    assert "/route/v1/walking/" in seen["url"]
    distance = next(f for f in facts if f.key == "distance")
    assert distance.value == 47.89


def test_haversine_when_everything_disabled(monkeypatch):
    origin, destination = _coordinates()

    monkeypatch.setattr(settings, "osrm_enabled", False)

    result = route_chain.route_with_fallbacks(
        origin, destination, mode="driving"
    )

    assert result.status == "PARTIAL"
    assert result.metadata["selected_provider"] == "haversine"
    assert result.metadata["approximate"] is True


def test_haversine_math():
    origin = Coordinate(latitude=17.385, longitude=78.4867)
    destination = Coordinate(latitude=17.385, longitude=79.4867)

    facts = routing.route_haversine(origin, destination)
    distance = next(f for f in facts if f.key == "distance")

    # 1 degree longitude at ~17.3N ≈ 106 km
    assert 95.0 < distance.value < 115.0
    assert distance.approximate is True


def test_travel_cache_roundtrip_and_negative():
    _require_redis()

    kind = "route"
    parts = ("test", str(uuid.uuid4().int % 10000))
    key = _cache_key(kind, *parts)

    assert get_fact(kind, *parts) is None

    set_fact(kind, *parts, payload={"status": "COMPLETED", "value": 42})
    assert get_fact(kind, *parts) == {"status": "COMPLETED", "value": 42}

    set_negative(kind, *parts, error={"status": "FAILED"})
    # negative entries read as a miss
    assert get_fact(kind, *parts) is None

    redis_client.delete(key)


def test_negative_cache_ttl_is_short():
    _require_redis()

    kind = "route"
    parts = ("neg", str(uuid.uuid4().int % 10000))
    key = _cache_key(kind, *parts)

    set_negative(kind, *parts, error={"status": "FAILED"})
    ttl = redis_client.ttl(key)

    assert 0 < ttl <= settings.ttl_negative_s
    redis_client.delete(key)


def test_missing_end_still_presents_known_place():
    """One endpoint given -> resolve & present it + honest note, instead of
    a bare 'missing' error (answer-first behavior)."""
    from app.agents import travel as travel_agent

    result = travel_agent.run(
        {
            "category": "travel_route",
            "question": "How do I reach Warangal?",
            "origin": "Warangal",
            "destination": None,
            "mode": "driving",
        }
    )

    assert result["status"] == "COMPLETED"
    kinds = [e.get("kind") for e in result["evidence"]]
    assert "place" in kinds
    note = next(e for e in result["evidence"] if e.get("kind") == "note")
    assert note["key"] == "route_end_missing"
    assert "destination" in note["error"]


def test_both_ends_missing_is_still_an_error():
    from app.agents import travel as travel_agent

    result = travel_agent.run(
        {
            "category": "travel_route",
            "question": "How do I reach it?",
            "origin": None,
            "destination": None,
            "mode": "driving",
        }
    )
    assert result["status"] == "ERROR"


# --- v7: Telangana scope + naive-user query matching ---------------------

def test_registry_matches_when_user_appends_generic_word():
    """Naive user types 'birla mandir temple' -> must resolve to the
    canonical Birla Mandir (Hyderabad) entity, not miss the registry."""
    from app.services.entity_registry import get_entity_registry

    result = get_entity_registry().resolve(
        mention="birla mandir temple"
    )
    assert result.get("status") == "RESOLVED"
    assert "T0009" in str(result)


def test_scope_filter_drops_places_outside_telangana(monkeypatch):
    from app.travel import resolver as resolver_module
    from app.travel.schemas import PlaceCandidate

    kolkata = PlaceCandidate(
        display_name="Birla Mandir, Kolkata",
        latitude=22.5852,
        longitude=88.3639,
        source="nominatim",
    )
    monkeypatch.setattr(
        resolver_module,
        "nominatim_search",
        lambda _q, limit=5: [kolkata],
    )

    with pytest.raises(resolver_module.TravelResolverError) as exc:
        resolver_module.resolve_place("zzunknown qqq place")

    assert "Telangana" in str(exc.value)


def test_scope_filter_keeps_places_inside_telangana(monkeypatch):
    from app.travel import resolver as resolver_module
    from app.travel.schemas import PlaceCandidate

    hyderabad = PlaceCandidate(
        display_name="Birla Mandir, Hyderabad",
        latitude=17.4061,
        longitude=78.469,
        source="nominatim",
    )
    monkeypatch.setattr(
        resolver_module,
        "nominatim_search",
        lambda _q, limit=5: [hyderabad],
    )

    place = resolver_module.resolve_place("zzunknown qqq place")
    assert place.coordinates.latitude == pytest.approx(17.4061)
    assert place.coordinates.longitude == pytest.approx(78.469)


# --- v8: travel_nearby answers from OUR temple dataset -------------------

def test_nearby_uses_entity_anchor_and_dataset():
    """'best tourist places near by birla mandir' with null endpoints must
    resolve via the entity mention and answer from the verified
    nearby_places dataset - no place_missing, no world places."""
    from app.agents import travel as travel_agent

    result = travel_agent.run(
        {
            "category": "travel_nearby",
            "question": "Best tourist places near by birla mandir",
            "origin": None,
            "destination": None,
            "entities": ["birla mandir"],
            "temple_ids": None,
        }
    )

    assert result["status"] == "COMPLETED"
    kinds = [e.get("kind") for e in result["evidence"]]
    assert "place" in kinds
    nearby = [
        e
        for e in result["evidence"]
        if e.get("field_name") == "nearby_places"
    ]
    assert nearby, result["evidence"]
    assert all(e.get("source") == "temple_dataset" for e in nearby)
    assert any("Hussain Sagar" in e.get("text", "") for e in nearby)


def test_nearby_without_any_anchor_is_place_missing():
    from app.agents import travel as travel_agent

    result = travel_agent.run(
        {
            "category": "travel_nearby",
            "question": "what is nearby?",
            "origin": None,
            "destination": None,
            "entities": [],
            "temple_ids": None,
        }
    )
    assert result["status"] == "ERROR"
    assert result["error"] == "place_missing"


def test_travel_nearby_gets_registry_resolution():
    from app.agents.registry import REGISTRY_RESOLVED_CATEGORIES

    assert "travel_nearby" in REGISTRY_RESOLVED_CATEGORIES
