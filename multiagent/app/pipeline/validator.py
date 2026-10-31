"""Deterministic grounding checks: every number in a draft reply must exist in
the evidence. Also provides the structured (no-LLM) fallback renderer."""
from __future__ import annotations

import json

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


def _fmt_money(value: Any) -> str:
    """₹700 not ₹700.0, but ₹200.5 keeps its decimals (audit C08)."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value)
    if number.is_integer():
        return str(int(number))
    return f"{number:g}"


def _serialize_item(item: dict) -> str:
    parts: list[str] = []
    for key, value in item.items():
        if isinstance(value, (dict, list, tuple)):
            parts.append(json.dumps(value, ensure_ascii=False, default=str))
        else:
            parts.append(f"{key} {value}")
    return "\n".join(parts)


def find_misattributed_numbers(draft: str, results: list[dict]) -> list[str]:
    """v15 (audit C17): global number matching can approve a SWAPPED
    claim — "Hotel A costs ₹900" passes when only Hotel B's record says
    900. For each sentence that names exactly ONE evidence record, any
    number that exists globally but NOT in that record's own text is
    flagged as misattributed (fed back like a missing number)."""
    named_items: list[tuple[str, str, set[str]]] = []
    for result in results:
        for item in result.get("evidence") or []:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "").strip()
            if len(name) < 4:
                continue
            named_items.append(
                (name.lower(), _serialize_item(item), _corpus_numbers(_serialize_item(item)))
            )
    if not named_items:
        return []

    flagged: list[str] = []
    for sentence in re.split(r"(?<=[.!?।\n])\s+", draft):
        tokens = [
            t for t in _NUMBER_RE.findall(_strip_thousands(sentence))
            if t.strip()
        ]
        if not tokens:
            continue
        hits = [entry for entry in named_items if entry[0] in sentence.lower()]
        if len(hits) != 1:
            continue  # zero or ambiguous attribution → stay with old rule
        _, _, own_numbers = hits[0]
        for token in tokens:
            normalized = _normalize_number(token)
            if normalized & own_numbers:
                continue
            # number exists SOMEWHERE in results but not in the named
            # record → the sentence attributes another record's fact
            if not any(_normalize_number(token) & it[2] for it in named_items):
                continue  # globally missing — handled by find_missing_numbers
            if token not in flagged:
                flagged.append(token)
    return flagged


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
                base = str(
                    item.get("error")
                    or item.get("content")  # notes emitted with `content`
                    or item.get("key")
                    or "note"
                )
                lines.append(f"{base}{(' - ' + str(hint)) if hint else ''}")
            elif kind == "status":
                lines.append(
                    f"provider status: {item.get('status')}"
                    + (f", selected: {item.get('selected')}" if item.get("selected") else "")
                )
            elif kind in {"hotel", "restaurant", "poi"}:
                # structured stays (audit C16): print name + the REAL keys
                # the emitters use — hotels carry `phones`/`map_link`, not
                # `phone`/`maps_link` (that mismatch hid every contact).
                name = item.get("name")
                lines.append(f"{kind}: {name}" if name else f"{kind}: (unnamed)")
                for label, val in (
                    ("rating", item.get("rating")),
                    ("reviews", item.get("reviews")),
                    ("price", item.get("price")),
                    ("price_range", item.get("price_range")),
                    ("price_category", item.get("price_category")),
                    ("average_cost_for_two", item.get("average_cost_for_two")),
                    ("phone", item.get("phone") or item.get("phones")),
                    ("address", item.get("address")),
                    ("distance", item.get("distance_km")),
                    ("map", item.get("maps_link") or item.get("map_link")
                     or item.get("google_maps_url")),
                    ("website", item.get("website")),
                    ("cuisine", item.get("cuisine")),
                    ("open", item.get("open")),
                    ("note", item.get("note")),
                    ("error", item.get("error")),
                ):
                    if val not in (None, "", []):
                        if isinstance(val, (list, tuple)):
                            val = ", ".join(str(v) for v in val)
                        lines.append(f"  {label}: {val}")
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
                    lines.append(
                        f"{component} {scope}: {symbol}{_fmt_money(low)}".rstrip()
                    )
                else:
                    lines.append(
                        f"{component} {scope}: {symbol}{_fmt_money(low)}"
                        f" - {symbol}{_fmt_money(high)}".rstrip()
                    )
                for sample in item.get("samples") or []:
                    if isinstance(sample, dict):
                        lines.append(
                            f"  {sample.get('name')}: {sample.get('charges')}"
                        )
            elif kind == "budget_total":
                covers = item.get("components_included") or []
                missing = item.get("components_missing") or []
                line = (
                    f"budget total: ₹{_fmt_money(item.get('low'))}"
                    f" - ₹{_fmt_money(item.get('high'))}"
                    + (f" (covers: {', '.join(str(c) for c in covers)})" if covers else "")
                )
                if item.get("partial") or missing:
                    line += (
                        " [PARTIAL — missing: "
                        + (", ".join(str(c) for c in missing) or "unknown")
                        + "]"
                    )
                lines.append(line)
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
