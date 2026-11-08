"""Rank evidence-bearing catalog destinations; the engine alone schedules them.
Unresolved prose suggestions stay visible but cannot become invented timed stops.
"""

from . import evidence
from .contracts import AttractionEvidence, TempleEvidence


def discover(req, required) -> tuple[list[TempleEvidence], list[AttractionEvidence]]:
    from app.api.temple_suggest import CATALOG

    required_ids = set(req.temple_ids)
    primary = next(t for t in required if t["id"] == req.primary_temple_id)
    raw_candidates = []
    if req.include_attractions:
        for summary in CATALOG:
            if summary["id"] in required_ids:
                continue
            tm = evidence.catalog([summary["id"]], req.start_date, req.days)[0]
            distance = evidence._distance(primary, tm)
            if distance > 100:
                continue
            text = (
                summary["name"]
                + " "
                + summary.get("deity", "")
                + " "
                + summary.get("summary", "")
            ).lower()
            interest = sum(
                1
                for key in req.priorities
                if (
                    key == "shakti"
                    and any(w in text for w in ["shakti", "devi", "durga", "jogulamba"])
                )
                or (
                    key == "history"
                    and any(
                        w in text for w in ["ancient", "historic", "kakatiya", "unesco"]
                    )
                )
                or key in {"darshan", "family"}
            )
            tm.update(
                required=False,
                kind=tm.get("kind", "temple"),
                distance_from_primary_km=round(distance, 1),
                straight_line=True,
                interest_score=interest,
                rank_score=round(100 + interest * 15 - distance, 2),
                classification="optional",
                reason="candidate_pending_route_evaluation",
            )
            if tm.get("effort") == "long_walk" and (
                req.elderly or req.special in {"elder", "wheel", "medical"}
            ):
                tm["rank_score"] -= 60
            if not any(tm["windows"].values()):
                tm.update(classification="excluded", reason="opening_hours_missing")
            if req.avoid_climbing and tm.get("effort") in {
                "climbing",
                "assisted_access",
            }:
                tm.update(
                    classification="excluded",
                    reason="assistance_requires_confirmation"
                    if tm.get("effort") == "assisted_access"
                    else "climbing_conflicts",
                )
            raw_candidates.append(tm)
    raw_candidates.sort(
        key=lambda t: (t["classification"] == "excluded", -t["rank_score"], t["id"])
    )
    # Bound external matrix size. All candidates remain classified in the result.
    for i, t in enumerate(raw_candidates):
        if i >= 8 and t["classification"] != "excluded":
            t.update(reason="outside_search_bound")
    eligible = [t for t in raw_candidates[:8] if t["classification"] != "excluded"]
    names = " ".join(t["name"].lower() for t in required + raw_candidates)
    unresolved = []
    for parent in required:
        for place in parent["nearby"]:
            if place["name"].lower().split(" — ")[0] in names:
                continue
            # Resolve only exact catalog aliases; don't equate similar names.
            import json

            from app.agents import temple

            match = None
            for t in raw_candidates:
                record = json.loads(
                    (temple._TEMPLE_DIR / (t["id"] + ".json")).read_text(
                        encoding="utf-8"
                    )
                )
                aliases = [record["name"]] + record.get("alternate_names", [])
                if any(a.lower() == place["name"].lower() for a in aliases):
                    match = t
                    break
            if not match:
                unresolved.append(
                    {
                        **place,
                        "id": None,
                        "classification": "optional",
                        "reason": "coordinates_or_hours_missing",
                        "verification": "unconfirmed",
                        "source": parent["id"] + "#nearby_places",
                    }
                )
    return eligible, raw_candidates + unresolved
