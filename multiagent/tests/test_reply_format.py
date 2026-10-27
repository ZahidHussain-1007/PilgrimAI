"""Reply typography repairs: unit spacing + range glue (validator-safe)."""
from __future__ import annotations

from app.pipeline.compose import _repair_range_glue, _repair_unit_spacing


def test_unit_spacing_inserts_single_space():
    assert _repair_unit_spacing("32.71minutes") == "32.71 minutes"
    assert _repair_unit_spacing("22km") == "22 km"
    assert _repair_unit_spacing("takes 2hours") == "takes 2 hours"
    assert _repair_unit_spacing("3nights in 2rooms") == "3 nights in 2 rooms"


def test_unit_spacing_noop_when_already_correct():
    text = "about 33 minutes and 22.18 km for 2 people"
    assert _repair_unit_spacing(text) == text


def test_unit_spacing_never_touches_digits_or_urls():
    assert _repair_unit_spacing("₹116.15 per litre at 14.0 km/l") == (
        "₹116.15 per litre at 14.0 km/l"
    )
    # URLs must stay byte-exact even when they contain digit+unit glue
    url = "https://example.com/trip?q=22km"
    assert _repair_unit_spacing(url) == url
    text = f"See {url} for 22km details"
    assert _repair_unit_spacing(text) == f"See {url} for 22 km details"


def test_range_glue_still_works_and_spacing_chains():
    repaired = _repair_unit_spacing(_repair_range_glue("₹700₹4500 for 2nights"))
    assert repaired == "₹700–₹4500 for 2 nights"
