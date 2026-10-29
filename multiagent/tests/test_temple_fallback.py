"""v7: named-temple questions must answer from the verified dataset files
even when the vector store cannot load (naive fresh machine, blocked torch,
ingest not run)."""
from __future__ import annotations

import sys

from app.agents import temple as temple_agent


def test_named_temple_answer_falls_back_to_dataset(monkeypatch):
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
        "Darshan timings" in e["text"] for e in result["evidence"]
    )
    # actual dataset digits (T0009: 7:00 AM - 12:00 PM, 3:00 PM - 9:00 PM)
    assert any("7:00 AM" in e["text"] for e in result["evidence"])
    # nearby attractions are part of the fallback answer set (v8)
    assert any(
        e.get("field_name") == "nearby_places" for e in result["evidence"]
    )
    assert any(
        "Hussain Sagar" in e["text"] for e in result["evidence"]
    )


def test_fallback_unknown_id_stays_an_error():
    result = temple_agent.run("zzunknown", temple_ids=["T9999"])
    assert result["status"] == "ERROR"
    assert result["evidence"] == []
