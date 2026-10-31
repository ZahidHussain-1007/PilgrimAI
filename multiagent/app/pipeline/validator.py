"""Deterministic grounding checks: every number in a draft reply must exist in
the evidence. Also provides the structured (no-LLM) fallback renderer."""
from __future__ import annotations

import re
from typing import Any

# numbers possibly with decimals, not glued to word chars (avoids T0001, q1).
# trailing "." must NOT hide sentence-final numbers ("... pincode 500063.")
# - only a "." that starts a decimal (".\d") blocks the match.
_NUMBER_RE = re.compile(r"(?<![\w.])-?\d+(?:\.\d+)?(?!\w)(?!\.\d)")


def _normalize_number(token: str) -> set[str]:
    """Variants of a number token that count as 'the same value'."""
    variants = {token}
    try:
        value = float(token)
    except ValueError:
        return variants

    if value == int(value):
        variants.add(str(int(value)))
    variants.add(f"{value:g}")
    return variants


def _strip_thousands(text: str) -> str:
    """Remove thousands separators so '₹1,066' and evidence '1066' match.

    Only digit,digit-digit groups are touched (1,066 -> 1066); list commas
    like 'Warangal, 2 districts' or decimals are left alone.
    """
    return re.sub(r"(?<=\d),(?=\d{3}(?!\d))", "", text)


def _corpus_numbers(text: str) -> set[str]:
    found: set[str] = set()
    for match in _NUMBER_RE.finditer(_strip_thousands(text)):
        found.update(_normalize_number(match.group(0)))
    return found


def _evidence_text(results: Any) -> str:
    """Join every evidence STRING (and numeric leaf) with real newlines.

    json.dumps() escapes newlines to the two characters backslash+n, and the
    `n` counts as a word character - numbers at line starts (phones, list
    values) then become invisible to _NUMBER_RE and legitimate replies get
    flagged as hallucinations. Walking the structure instead keeps true
    line boundaries."""
    parts: list[str] = []

    # keys whose text must NOT ground the reply (audit C17): the echoed
    # customer question / prompt draft - their digits are the user's own
    # words, not evidence.
    _NON_EVIDENCE_KEYS = {
        "question",
        "rewritten_query",
        "query",
        "user_query",
        "prompt",
        "system_prompt",
        "user_message",
        "draft",
        "reply_draft",
    }

    def walk(value: Any) -> None:
        if isinstance(value, str):
            parts.append(value)
        elif isinstance(value, bool):
            return
        elif isinstance(value, (int, float)):
            parts.append(str(value))
        elif isinstance(value, dict):
            for key, item in value.items():
                if str(key).lower() in _NON_EVIDENCE_KEYS:
                    continue
                # keys carry data too ("open_24x7": true, "distance_km")
                parts.append(str(key))
                walk(item)
        elif isinstance(value, (list, tuple, set)):
            for item in value:
                walk(item)

    walk(results)
    text = "\n".join(parts)
    # split glued separators so "open_24x7" / "24x7" / "24x7" expose 24 and 7
    # exactly as a reply would print them ("24x7", "24 hours")
    text = re.sub(r"(?<=\w)_(?=\w)", " ", text)
    text = re.sub(r"(?<=\d)[x\u00d7](?=\d)", " ", text)
    return text


def find_missing_numbers(draft: str, results: list[dict]) -> list[str]:
    """Numbers appearing in `draft` that do NOT appear anywhere in `results`."""
    allowed = _corpus_numbers(_evidence_text(results))

    missing: list[str] = []
    for match in _NUMBER_RE.finditer(_strip_thousands(draft)):
        token = match.group(0)
        if token in missing:
            continue
        if not (_normalize_number(token) & allowed):
            missing.append(token)
    return missing


def render_structured(results: list[dict]) -> str:
    """LLM-free degraded answer: raw structured facts, one per line.

    Used when the composer is unavailable or keeps failing validation.
    Guarantees zero hallucination - it only prints evidence."""
    lines: list[str] = []

    for result in results:
        question = str(result.get("question") or "").strip()
        if question:
            lines.append(f"Q: {question}")

        status = result.get("status")
        if status == "NEEDS_CLARIFICATION":
            lines.append(str(result.get("query") or "clarification needed"))
            continue

        if result.get("error"):
            lines.append(f"({result['error']})")

        for item in result.get("evidence", []):
            if not isinstance(item, dict):
                continue
            kind = item.get("kind")

            if kind == "fact" or kind == "calculation":
                unit = item.get("unit") or ""
                approx = " (approx)" if item.get("approximate") or item.get("estimated") else ""
                provider = item.get("provider") or item.get("source") or ""
                lines.append(
                    f"{item.get('key')}: {item.get('value')} {unit}{approx} [{provider}]"
                )
            elif kind == "place":
                lines.append(f"{item.get('role')}: {item.get('name')}")
            elif kind == "note" or kind == "error":
                hint = item.get("hint")
                base = str(item.get("error") or item.get("key") or "note")
                lines.append(f"{base}{(' - ' + str(hint)) if hint else ''}")
            elif kind == "status":
                lines.append(
                    f"provider status: {item.get('status')}"
                    + (f", selected: {item.get('selected')}" if item.get("selected") else "")
                )
            elif kind in {"hotel", "restaurant", "poi"}:
                # structured stays (audit C16): a bare "text" dump hides
                # every other field - print name + the useful keys.
                name = item.get("name")
                lines.append(f"{kind}: {name}" if name else f"{kind}: (unnamed)")
                for key in (
                    "rating",
                    "reviews",
                    "price",
                    "price_range",
                    "price_category",
                    "average_cost_for_two",
                    "phone",
                    "address",
                    "distance_km",
                    "maps_link",
                    "google_maps_url",
                    "note",
                    "error",
                ):
                    val = item.get(key)
                    if val not in (None, "", []):
                        lines.append(f"  {key}: {val}")
            elif kind == "budget_item":
                component = item.get("component") or "cost"
                scope = item.get("scope") or ""
                low, high = item.get("low"), item.get("high")
                symbol = "₹" if item.get("unit") == "currency" else ""
                if low is None and high is None:
                    label = f"{component} {scope}".strip()
                    free = item.get("free_darshan_stated")
                    lines.append(
                        f"{label}: free darshan listed in records; no priced entries"
                        if free
                        else f"{label}: no priced entries"
                    )
                elif high is None or low == high:
                    lines.append(f"{component} {scope}: {symbol}{low}".rstrip())
                else:
                    lines.append(
                        f"{component} {scope}: {symbol}{low} - {symbol}{high}".rstrip()
                    )
                for sample in item.get("samples") or []:
                    if isinstance(sample, dict):
                        lines.append(
                            f"  {sample.get('name')}: {sample.get('charges')}"
                        )
            elif kind == "budget_total":
                covers = item.get("components_included") or []
                lines.append(
                    f"budget total: ₹{item.get('low')} - ₹{item.get('high')}"
                    + (f" (covers: {', '.join(str(c) for c in covers)})" if covers else "")
                )
            else:
                text = str(item.get("text") or "").strip()
                if text:
                    name = item.get("name")
                    prefix = f"{name}: " if name else ""
                    lines.append(prefix + text[:400])

        lines.append("")

    return "\n".join(line for line in lines if line is not None).strip()


def collect_evidence(results: list[dict]) -> list[dict[str, Any]]:
    flat: list[dict[str, Any]] = []
    for result in results:
        for item in result.get("evidence", []):
            if isinstance(item, dict):
                flat.append(item)
    return flat
