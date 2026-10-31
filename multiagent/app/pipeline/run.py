"""Stage 3 - executes brain subqueries: dependency-ordered, independent
subqueries in parallel. Each step routes to exactly one agent via the
agent registry (app/agents/registry.py)."""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from app.agents.registry import REGISTRY_RESOLVED_CATEGORIES, get_agent
from app.services.entity_registry import get_entity_registry
from app.travel.resolver import TravelResolverClarificationError

logger = logging.getLogger(__name__)

_TEMPLE_ENTITY_TYPES = {
    "temple",
    "person",
    "festival",
    "event",
    "landmark",
    "place",
}


def _resolve_temple_ids(subquery: Any) -> list[str]:
    """Registry-first: person/festival mentions may map to canonical temple ids."""
    ids: set[str] = set()

    for entity in subquery.entities:
        if entity.entity_type not in _TEMPLE_ENTITY_TYPES:
            continue
        try:
            result = get_entity_registry().resolve(
                mention=entity.mention,
                entity_type=entity.entity_type,
                context={},
            )
        except Exception:  # noqa: BLE001
            logger.warning("registry resolve failed for %s", entity.mention)
            continue

        if result.get("status") == "RESOLVED" and result.get("entity_id"):
            ids.add(str(result["entity_id"]))

    return sorted(ids)


def _dep_harvest(results: dict[str, dict], subquery: Any) -> tuple[dict, str | None]:
    """v17 (audit A02): a dependency's OUTPUT becomes this task's INPUT.
    Returns (context_additions, block_reason|None).

    Bound so far (deterministic, no LLM):
      * temple ids proven by predecessor evidence  -> context["temple_ids"]
      * resolved origin/place names                -> subquery origin/dest
      * a FAILED predecessor                       -> block this task
        (never run budget/route blindly without the selection it needs)
    """
    temple_ids: set[str] = set()
    origin_hint: str | None = None
    dest_hint: str | None = None
    for dep_id in subquery.depends_on or []:
        dep = results.get(dep_id)
        if dep is None:
            continue  # ordering issue only - cycle guard handles it
        if dep.get("status") in {"ERROR", "FAILED", "BLOCKED"}:
            return {}, (
                f"prerequisite step '{dep_id}' failed "
                f"({dep.get('error') or dep.get('status')}), so this step "
                "was not run"
            )
        for item in dep.get("evidence") or []:
            if not isinstance(item, dict):
                continue
            if item.get("temple_id"):
                temple_ids.add(str(item["temple_id"]))
            if item.get("kind") == "place" and item.get("name"):
                name = str(item["name"])
                if item.get("role") == "origin":
                    origin_hint = origin_hint or name
                else:
                    dest_hint = dest_hint or name
            for key in ("temple_name", "name"):
                value = item.get(key)
                if (
                    value
                    and item.get("source") in {"temple_rag", "temple_dataset"}
                ):
                    dest_hint = dest_hint or str(value)
    return {"temple_ids": sorted(temple_ids), "origin_hint": origin_hint,
            "dest_hint": dest_hint}, None


def _run_one(subquery: Any, dep_context: dict | None = None) -> dict:
    base = {
        "step_id": subquery.id,
        "category": subquery.category,
        "question": subquery.question,
    }

    try:
        agent = get_agent(subquery.category)

        context: dict = dict(dep_context or {})
        resolved_here = (
            _resolve_temple_ids(subquery) if subquery.category
            in REGISTRY_RESOLVED_CATEGORIES else []
        )
        if resolved_here:
            merged = set(context.get("temple_ids") or []) | set(resolved_here)
            context["temple_ids"] = sorted(merged)

        # bind inherited endpoints when the model left them null
        bound = {}
        if not subquery.origin and context.get("origin_hint"):
            bound["origin"] = context["origin_hint"]
        if not subquery.destination and context.get("dest_hint"):
            bound["destination"] = context["dest_hint"]
        if bound:
            subquery = subquery.model_copy(update=bound)

        outcome = agent(subquery, context)

        return {**base, **outcome}

    except KeyError:
        return {
            **base,
            "status": "ERROR",
            "error": f"no_agent_registered:{subquery.category}",
            "evidence": [],
        }
    except TravelResolverClarificationError as exc:
        return {
            **base,
            "status": "NEEDS_CLARIFICATION",
            "query": exc.query,
            "candidates": [
                candidate.model_dump(mode="json")
                for candidate in exc.candidates
            ],
            "evidence": [],
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("subquery %s failed", subquery.id)
        return {
            **base,
            "status": "ERROR",
            "error": f"{type(exc).__name__}: {exc}",
            "evidence": [],
        }


def execute(subqueries: list) -> list[dict]:
    """Run subqueries in dependency layers; parallel within a layer.
    v17: predecessor outputs are BOUND into each task's inputs, and a
    failed prerequisite produces a BLOCKED step instead of a blind run.
    Returns results in the original subquery order."""
    results: dict[str, dict] = {}
    pending = list(subqueries)
    safety_counter = 0

    while pending:
        safety_counter += 1
        if safety_counter > 100:  # pathological guard
            break

        # 1) tasks whose prerequisites FAILED -> blocked, not executed
        blocked_now = [
            sq for sq in pending
            if any(
                dep in results
                and results[dep].get("status") in {"ERROR", "FAILED", "BLOCKED"}
                for dep in sq.depends_on
            )
            and all(dep in results for dep in sq.depends_on)
        ]
        for sq in blocked_now:
            failed = [
                dep for dep in sq.depends_on
                if results.get(dep, {}).get("status")
                in {"ERROR", "FAILED", "BLOCKED"}
            ]
            results[sq.id] = {
                "step_id": sq.id,
                "category": sq.category,
                "question": sq.question,
                "status": "BLOCKED",
                "error": "prerequisite_failed:" + ",".join(failed),
                "evidence": [],
            }
            logger.warning("subquery %s blocked by %s", sq.id, failed)
        pending = [sq for sq in pending if sq.id not in results]
        if not pending:
            break

        ready = [
            sq
            for sq in pending
            if all(dep in results for dep in sq.depends_on)
        ]
        if not ready:
            # dependency cycle or unknown id - run the rest anyway
            ready = [pending[0]]

        # 2) bind each ready task's predecessor outputs into its context
        prepared: list[tuple[Any, dict]] = []
        for sq in ready:
            dep_context, block_reason = _dep_harvest(results, sq)
            if block_reason:
                results[sq.id] = {
                    "step_id": sq.id,
                    "category": sq.category,
                    "question": sq.question,
                    "status": "BLOCKED",
                    "error": block_reason,
                    "evidence": [],
                }
                prepared = prepared  # not scheduled
            else:
                prepared.append((sq, dep_context))

        with ThreadPoolExecutor(
            max_workers=min(4, max(1, len(prepared) or 1))
        ) as pool:
            futures = {
                pool.submit(_run_one, sq, ctx): sq for sq, ctx in prepared
            }
            for future, sq in futures.items():
                try:
                    results[sq.id] = future.result()
                except Exception as exc:  # noqa: BLE001 - should not happen
                    results[sq.id] = {
                        "step_id": sq.id,
                        "category": sq.category,
                        "question": sq.question,
                        "status": "ERROR",
                        "error": f"{type(exc).__name__}: {exc}",
                        "evidence": [],
                    }

        pending = [sq for sq in pending if sq.id not in results]

    return [results[sq.id] for sq in subqueries if sq.id in results]