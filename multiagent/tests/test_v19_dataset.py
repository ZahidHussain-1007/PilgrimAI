"""v19 — temple video mapping + language request field (landing pack)."""
from __future__ import annotations

import json
from pathlib import Path

TEMPLES = Path(__file__).resolve().parents[1] / "data" / "temples"

EXPECTED = {
    "T0009": "8XBPsZNL35U",   # Birla Mandir
    "T0001": "17ZGsk35W8U",   # Yadadri
    "T0006": "AMYpwaQwFKo",   # Jogulamba
    "T0010": "RSulQ8fr8oI",   # Sanghi
    "T0011": "G7E-GiI3k9k",   # Keesaragutta
    "T0014": "yjRxKWxewqM",   # Ramappa
}


def test_six_temples_have_their_youtube_links():
    for temple_id, video_id in EXPECTED.items():
        record = json.loads((TEMPLES / f"{temple_id}.json").read_text("utf-8"))
        assert record.get("video_url") == f"https://youtu.be/{video_id}", temple_id


def test_remaining_temples_have_no_placeholder_in_dataset():
    """Dummy video is a FRONTEND fallback — dataset stays clean."""
    for path in TEMPLES.glob("T*.json"):
        record = json.loads(path.read_text("utf-8"))
        tid = record.get("temple_id")
        if tid in EXPECTED:
            continue
        assert "video_url" not in record, tid


def test_all_dataset_jsons_still_parse():
    for path in TEMPLES.glob("T*.json"):
        json.loads(path.read_text("utf-8"))


def test_chat_request_accepts_language_override():
    from app.models.query import ChatRequest

    plain = ChatRequest(message="hello")
    assert plain.language is None
    telugu = ChatRequest(message="hello", language="te")
    assert telugu.language == "te"
