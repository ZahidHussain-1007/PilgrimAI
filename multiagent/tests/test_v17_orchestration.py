"""v17 — orchestration pack: dependency result-passing, stale-subquery
guard, temple discovery, anonymous-history contract."""
from __future__ import annotations

import pytest

from app.pipeline import brain, run as run_mod
from app.agents.registry import AGENT_REGISTRY


class _SQ:
    """Mimics BrainSubquery (pydantic: model_copy used by endpoint binding)."""

    def __init__(self, **fields):
        self.__dict__.update(fields)

    def model_copy(self, update):
        return _SQ(**{**self.__dict__, **update})


def _sq(id, category, question, depends_on=None, origin=None, destination=None, entities=None):
    return _SQ(
        id=id,
        category=category,
        question=question,
        depends_on=depends_on or [],
        origin=origin,
        destination=destination,
        mode="driving",
        entities=entities or [],
    )


# ------------------------------------------------------- A02 result passing
def test_dependent_task_receives_predecessor_output(monkeypatch):
    """budget q2 (destination null, depends_on q1) must inherit the temple
    the temple_info step selected — the exact 'destination missing' bug."""
    seen: dict = {}

    def fake_temple(sq, ctx):
        return {
            "status": "COMPLETED",
            "evidence": [
                {"source": "temple_rag", "kind": "rag", "temple_id": "T0001",
                 "temple_name": "Birla Mandir Hyderabad"}
            ],
        }

    def fake_budget(sq, ctx):
        seen["destination"] = sq.destination
        seen["origin"] = sq.origin
        seen["temple_ids"] = ctx.get("temple_ids")
        return {"status": "COMPLETED", "evidence": []}

    monkeypatch.setitem(AGENT_REGISTRY, "temple_info", fake_temple)
    monkeypatch.setitem(AGENT_REGISTRY, "budget", fake_budget)

    results = run_mod.execute([
        _sq("q1", "temple_info", "Tell me about Birla Mandir."),
        _sq("q2", "budget", "What will it cost?", depends_on=["q1"],
            origin="Hyderabad"),
    ])
    assert results[1]["status"] == "COMPLETED"
    assert seen["destination"] == "Birla Mandir Hyderabad", (
        "predecessor output not bound into the dependent task (A02)"
    )
    assert seen["temple_ids"] == ["T0001"]


def test_failed_prerequisite_blocks_instead_of_blind_run(monkeypatch):
    called = {"budget": 0}

    def failing_temple(sq, ctx):
        return {"status": "ERROR", "error": "boom", "evidence": []}

    def fake_budget(sq, ctx):
        called["budget"] += 1
        return {"status": "COMPLETED", "evidence": []}

    monkeypatch.setitem(AGENT_REGISTRY, "temple_info", failing_temple)
    monkeypatch.setitem(AGENT_REGISTRY, "budget", fake_budget)

    results = run_mod.execute([
        _sq("q1", "temple_info", "broken"),
        _sq("q2", "budget", "cost", depends_on=["q1"]),
    ])
    assert results[1]["status"] == "BLOCKED"
    assert "prerequisite" in results[1]["error"]
    assert called["budget"] == 0, "budget ran despite failed prerequisite"


# ------------------------------------------------- stale-subquery guard
def test_stale_history_subquery_is_dropped():
    result = brain.BrainResult(
        language="en",
        category="multi",
        rewritten_query=(
            "Compare AmruthaVanam Agrifarm Resort and GreenAcres Farmstay "
            "Retreat near Dharmapuri and recommend the better option."
        ),
        subqueries=[
            brain.BrainSubquery(
                id="q1", category="travel_nearby",
                question="Which ambulance stations are near Yadadri Temple?",
            ),
            brain.BrainSubquery(
                id="q2", category="accommodation",
                question="Compare AmruthaVanam Agrifarm Resort and GreenAcres "
                         "Farmstay Retreat near Dharmapuri.",
            ),
        ],
    )
    out = brain._drop_stale_subqueries(
        result, "compare both and give me the best option"
    )
    assert [s.id for s in out.subqueries] == ["q2"]


def test_all_stale_falls_back_to_rewrite():
    result = brain.BrainResult(
        language="en",
        category="multi",
        rewritten_query="Compare both stays near Dharmapuri.",
        subqueries=[
            brain.BrainSubquery(
                id="q1", category="travel_nearby",
                question="Which ambulance stations are near Yadadri?",
            ),
        ],
    )
    out = brain._drop_stale_subqueries(result, "compare both")
    assert len(out.subqueries) == 1
    assert out.subqueries[0].question == "Compare both stays near Dharmapuri."


def test_legitimate_subqueries_survive():
    result = brain.BrainResult(
        language="en",
        category="multi",
        rewritten_query="Budget for a two-day trip from Hyderabad to Yadadri.",
        subqueries=[
            brain.BrainSubquery(
                id="q1", category="budget",
                question="What is the estimated budget for a 2-day trip "
                         "from Hyderabad to Yadadri?",
            ),
        ],
    )
    out = brain._drop_stale_subqueries(result, "and how much will it cost?")
    assert [s.id for s in out.subqueries] == ["q1"]


# ------------------------------------------------- temple_discover
def test_discover_ranks_registry_by_road(monkeypatch):
    """Offline discovery: resolver+router faked, ranking + honesty real."""
    from app.agents import temple as temple_agent
    from app.travel.schemas import Coordinate, ResolvedPlace
    from app.travel.schemas import TravelResult, TravelFact

    monkeypatch.setattr(
        "app.travel.resolver.resolve_place",
        lambda value: ResolvedPlace(
            query=str(value),
            display_name="Hyderabad",
            coordinates=Coordinate(latitude=17.3850, longitude=78.4867),
            source="test",
        ),
    )

    def fake_route(origin, destination, **kwargs):
        return TravelResult(
            status="COMPLETED",
            facts=[
                TravelFact(key="distance", value=10.0, unit="km",
                           provider="test", source_tier="test",
                           fetched_at="2026-10-31T00:00:00Z"),
                TravelFact(key="duration", value=20.0, unit="min",
                           provider="test", source_tier="test",
                           fetched_at="2026-10-31T00:00:00Z"),
            ],
            metadata={"selected_provider": "osrm"},
        )

    monkeypatch.setattr(
        "app.travel.providers.route_chain.route_with_fallbacks", fake_route
    )
    temple_agent._GEO_INDEX = None  # rebuild against real dataset
    index = temple_agent._temple_geo_index()
    assert len(index) == 23

    result = temple_agent.discover("Hyderabad", "temples near hyderabad")
    assert result["status"] == "COMPLETED"
    candidates = [
        e for e in result["evidence"] if e.get("kind") == "temple_candidate"
    ]
    assert candidates, "no candidates emitted"
    assert all(c["road_km"] == 10.0 for c in candidates)
    straights = [c["straight_km"] for c in candidates]
    assert straights == sorted(straights), "candidates not nearest-first"
    notes = [e for e in result["evidence"] if e.get("kind") == "note"]
    assert any("registry" in n["error"] for n in notes)


def test_discover_needs_origin():
    from app.agents import temple as temple_agent
    result = temple_agent.discover("", "temples near me")
    assert result["status"] == "NEEDS_CLARIFICATION"


def test_discover_registered_category():
    assert "temple_discover" in AGENT_REGISTRY
    assert "temple_discover" in brain.BrainResult.model_json_schema()[
        "properties"]["category"]["enum"]
