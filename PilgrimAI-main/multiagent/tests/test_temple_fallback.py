"""v7/v8: named-temple questions must answer from the verified dataset files
even when the vector store cannot load (naive fresh machine, blocked torch,
ingest not run). v8c adds keyword routing: every JSON section stays
reachable from a simple question."""
from __future__ import annotations

import sys
import types

from app.agents import temple as temple_agent


def test_timings_question_pulls_timing_sections(monkeypatch):
    # Make the heavy retrieval module fail to import: simulates a machine
    # where sentence-transformers/torch cannot load.
    monkeypatch.setitem(
        sys.modules, "app.services.temple_vector_store", None
    )

    result = temple_agent.run(
        "birla mandir timings",
        temple_ids=["T0009"],
    )

    assert result["status"] == "COMPLETED"
    assert result["evidence"]
    assert all(
        e["source"] == "temple_dataset" for e in result["evidence"]
    )
    assert any(
        e.get("field_name") == "darshan_timings"
        for e in result["evidence"]
    )
    # actual dataset digits (T0009: 7:00 AM - 12:00 PM, 3:00 PM - 9:00 PM)
    assert any(
        "7:00 AM" in e["text"] for e in result["evidence"]
    )
    # tight answer: nearby sections are NOT loaded for a timings question
    assert not any(
        e.get("field_name") == "nearby_places"
        for e in result["evidence"]
    )


def test_nearby_question_pulls_nearby_sections(monkeypatch):
    monkeypatch.setitem(
        sys.modules, "app.services.temple_vector_store", None
    )

    result = temple_agent.run(
        "near by attractions of birla mandir",
        temple_ids=["T0009"],
    )

    assert result["status"] == "COMPLETED"
    fields = [e.get("field_name") for e in result["evidence"]]
    assert "nearby_places" in fields
    assert any(
        "Hussain Sagar" in e["text"] for e in result["evidence"]
    )
    # core context always present
    assert "summary" in fields


def test_infrastructure_question_pulls_infrastructure_section(monkeypatch):
    monkeypatch.setitem(
        sys.modules, "app.services.temple_vector_store", None
    )

    result = temple_agent.run(
        "are there ATMs and hospitals near the temple",
        temple_ids=["T0009"],
    )

    assert result["status"] == "COMPLETED"
    fields = [e.get("field_name") for e in result["evidence"]]
    assert "nearby_infrastructure" in fields
    assert any("hospital" in e["text"].lower() for e in result["evidence"])


def test_default_fields_include_nearby_for_place_anchored_calls():
    # travel_nearby calls _dataset_evidence with no question -> defaults
    evidence = temple_agent._dataset_evidence(["T0009"])
    fields = [e.get("field_name") for e in evidence]
    assert "nearby_places" in fields
    assert "nearby_infrastructure" in fields


def test_fallback_unknown_id_stays_an_error(monkeypatch):
    monkeypatch.setitem(
        sys.modules, "app.services.temple_vector_store", None
    )

    result = temple_agent.run("zzunknown", temple_ids=["T9999"])
    assert result["status"] == "ERROR"
    assert result["evidence"] == []


def test_keyword_routing_covers_new_sections():
    # v9 full-pipeline audit additions
    fields = [f for f, _ in temple_agent._select_fallback_fields(
        "reviews of birla mandir"
    )]
    assert "reviews" in fields
    fields = [f for f, _ in temple_agent._select_fallback_fields(
        "history of temple"
    )]
    assert "history" in fields
    fields = [f for f, _ in temple_agent._select_fallback_fields(
        "contact number of birla mandir"
    )]
    assert "contact" in fields
    fields = [f for f, _ in temple_agent._select_fallback_fields(
        "which deity is worshipped"
    )]
    assert "deity" in fields


def test_reviews_question_returns_reviews_evidence(monkeypatch):
    monkeypatch.setitem(
        sys.modules, "app.services.temple_vector_store", None
    )

    result = temple_agent.run(
        "reviews of birla mandir",
        temple_ids=["T0009"],
    )
    assert result["status"] == "COMPLETED"
    fields = [e.get("field_name") for e in result["evidence"]]
    assert "reviews" in fields
    assert any("4.5" in e["text"] for e in result["evidence"])


def test_contact_question_returns_phone_numbers(monkeypatch):
    monkeypatch.setitem(
        sys.modules, "app.services.temple_vector_store", None
    )

    result = temple_agent.run(
        "contacts of birla mandir",
        temple_ids=["T0009"],
    )
    assert result["status"] == "COMPLETED"
    fields = [e.get("field_name") for e in result["evidence"]]
    assert "contact" in fields
    assert any("040-2323-5081" in e["text"] for e in result["evidence"])


def test_section_completeness_guard_fills_dropped_contact(monkeypatch):
    """RAG top-k drops the contact chunk -> the guard fills it from the
    dataset so 'contacts of X' ALWAYS answers with phones."""
    import sys

    monkeypatch.setitem(
        sys.modules, "app.services.temple_vector_store", None
    )
    # simulate a RAG run that returned only an FAQ chunk
    import app.agents.temple as agent

    faq_only = [
        {
            "source": "temple_rag",
            "kind": "chunk",
            "text": "FAQ: Where is Birla Mandir located?",
            "temple_id": "T0009",
            "name": "Birla Mandir Hyderabad",
            "field_name": "faq",
        }
    ]

    fake_module = types.SimpleNamespace(
        similarity_search=lambda *a, **k: [
            type("D", (), {"page_content": faq_only[0]["text"],
                           "metadata": faq_only[0]})()
        ]
    )
    monkeypatch.setitem(
        sys.modules, "app.services.temple_vector_store", fake_module
    )

    result = agent.run("contacts of birla mandir", temple_ids=["T0009"])
    assert result["status"] == "COMPLETED"
    fields = [e.get("field_name") for e in result["evidence"]]
    assert "contact" in fields
    assert any("040-2323-5081" in e["text"] for e in result["evidence"])
