"""v11: emergency is split into LIFE-THREAT (direct safety reply) vs
GEO-FACILITY needs (agents: verified emergency dataset + live OSM)."""
from __future__ import annotations

import importlib

from app.pipeline import safety


def test_safety_geo_exempt_routes_to_agents():
    importlib.reload(safety)  # drop any cached policy compiled earlier

    # geographic facility need -> NOT the safety gate (reaches brain/agents)
    assert safety.detect("emergency hospital near birla mandir") is False
    assert safety.detect("is there a hospital nearby?") is False

    # bare emergency / life-threat -> safety gate always
    assert safety.detect("emergency") is True
    assert safety.detect("I am having chest pain") is True
    assert safety.detect("ambulance needed now") is True
    assert safety.detect("there is a fire emergency") is True
    assert safety.detect("accident on the highway") is True

    # reply comes from the policy file (no hardcoded strings in code)
    payload = safety.response()
    assert payload["status"] == "EMERGENCY"
    assert "112" in payload["reply"]


def test_emergency_sections_mapping():
    from app.agents.travel import _emergency_sections

    assert _emergency_sections("hospitals near x", "hospital") == ["hospitals"]
    assert "police" in _emergency_sections("police station near x", None)
    assert "pharmacies" in _emergency_sections("chemist near x", None)
    assert _emergency_sections("ambulance near x", None) == [
        "ambulance_services"
    ]
    assert "fire_rescue" in _emergency_sections("fire station near x", None)
    assert _emergency_sections("best tourist places near x", None) == []


def test_run_nearby_uses_verified_emergency_dataset(monkeypatch):
    from app.agents import travel as travel_module

    monkeypatch.setattr(
        travel_module,
        "_overpass_search",
        lambda kind, lat, lng: ([], "overpass down"),
    )

    result = travel_module.run(
        {
            "category": "travel_nearby",
            "question": "emergency hospital near birla mandir",
            "origin": None,
            "destination": "Birla Mandir",
            "entities": ["Birla Mandir"],
            "temple_ids": None,
        }
    )

    assert result["status"] == "COMPLETED"
    emergency = [
        e for e in result["evidence"]
        if e.get("source") == "temple_emergency"
    ]
    names = " ".join(e["name"] for e in emergency).lower()
    assert emergency, "verified emergency dataset must be present"
    assert "nims" in names or "hospital" in names
    # distance numbers come from the verified dataset
    assert any(e.get("distance_km") is not None for e in emergency)
    # OSM failure note + regular dataset layer still present
    assert any(e.get("key") == "osm_status" for e in result["evidence"])
    assert any(
        e.get("field_name") in {"nearby_places", "nearby_infrastructure"}
        for e in result["evidence"]
    )


def test_ingest_lock_prints_actionable_message(monkeypatch, capsys):
    import app.scripts.ingest_temples as script

    def locked(*args, **kwargs):
        raise RuntimeError(
            "Storage folder ... is already accessed by another instance"
        )

    monkeypatch.setattr(script, "ingest_documents", locked)

    try:
        script.main()
    except SystemExit as exc:
        message = str(exc)
    else:
        raise AssertionError("SystemExit expected")

    assert "Stop uvicorn" in message
    assert "ingest_temples" in message
    out = capsys.readouterr().out
    assert "Chunks:" in out  # loader still ran; only indexing blocked
