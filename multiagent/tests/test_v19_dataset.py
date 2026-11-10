"""v19 — temple video mapping + language request field (landing pack).

v23.1: the dataset now carries the channel owner's FINAL 23-temple map —
one link per temple, every title verified against YouTube oEmbed and each
title carrying its own Txxxx id. The old Ramappa second clip
(yjRxKWxewqM) was reassigned to T0007 Kaleshwara, where it belongs.
"""
from __future__ import annotations

import json
from pathlib import Path

TEMPLES = Path(__file__).resolve().parents[1] / "data" / "temples"

# Final mapping — one YouTube link per temple, all 23.
EXPECTED = {
    "T0001": "17ZGsk35W8U",   # Yadadri
    "T0002": "OcLyXBVdJwg",   # Bhadrachalam
    "T0003": "7Ba5NjWPnyI",   # Vemulawada
    "T0004": "1AmuDUHBsf4",   # Basara
    "T0005": "ytdLlHj6Juc",   # Kondagattu
    "T0006": "AMYpwaQwFKo",   # Jogulamba
    "T0007": "yjRxKWxewqM",   # Kaleshwara (reassigned from Ramappa)
    "T0008": "iv9OcbTxG3s",   # Chilkur Balaji
    "T0009": "8XBPsZNL35U",   # Birla Mandir
    "T0010": "RSulQ8fr8oI",   # Sanghi
    "T0011": "G7E-GiI3k9k",   # Keesaragutta
    "T0012": "FsgVOInmn48",   # Bhadrakali
    "T0013": "uei0Dn2X_F4",   # Thousand Pillar (Rudreshwara)
    "T0014": "YflzmixmTKc",   # Ramappa
    "T0015": "uaGrubVDiio",   # Komuravelli
    "T0016": "2-Y6BWgPJ4w",   # Edupayala
    "T0017": "O4NFcdwijyg",   # Dharmapuri
    "T0018": "WBP5etmIiMU",   # Jamalapuram
    "T0019": "aNInk-5uK38",   # Manyamkonda
    "T0020": "Xq09vkGuk5Y",   # Beechupally
    "T0021": "AqvP36HH0eY",   # Medaram
    "T0022": "cNrOLnMw7mA",   # Surendrapuri
    "T0023": "g4kMf4h_7xE",   # Swarnagiri
}


def test_every_temple_has_its_verified_youtube_link():
    for temple_id, video_id in EXPECTED.items():
        record = json.loads((TEMPLES / f"{temple_id}.json").read_text("utf-8"))
        assert record.get("video_url") == f"https://youtu.be/{video_id}", temple_id


def test_all_twenty_three_temples_are_mapped():
    assert len(EXPECTED) == 23
    on_disk = {
        json.loads(p.read_text("utf-8")).get("temple_id") for p in TEMPLES.glob("T*.json")
    }
    assert on_disk == set(EXPECTED)


def test_no_temple_carries_a_second_clip_list():
    """One link per temple. video_urls was removed in v23.1 so a stale
    second clip (Ramappa's old yjRxKWxewqM) cannot linger."""
    for path in TEMPLES.glob("T*.json"):
        record = json.loads(path.read_text("utf-8"))
        assert "video_urls" not in record, record.get("temple_id")


def test_all_dataset_jsons_still_parse():
    for path in TEMPLES.glob("T*.json"):
        json.loads(path.read_text("utf-8"))


def test_chat_request_accepts_language_override():
    from app.models.query import ChatRequest

    plain = ChatRequest(message="hello")
    assert plain.language is None
    telugu = ChatRequest(message="hello", language="te")
    assert telugu.language == "te"
