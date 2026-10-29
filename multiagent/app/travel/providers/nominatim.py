from __future__ import annotations

import json
import logging
import time
import urllib.parse
import urllib.request
from typing import Any

from app.core.config import settings
from app.travel.schemas import Coordinate, PlaceCandidate, ResolvedPlace

logger = logging.getLogger(__name__)

_last_request_at = 0.0


def _rate_limit() -> None:
    global _last_request_at

    now = time.monotonic()
    elapsed = now - _last_request_at
    wait = settings.nominatim_min_interval_s - elapsed

    if wait > 0:
        time.sleep(wait)

    _last_request_at = time.monotonic()


def _log_latency(
    started_at: float,
    status: str,
) -> None:
    elapsed_ms = (time.monotonic() - started_at) * 1000.0
    logger.info(
        "provider=%s kind=%s ms=%.2f status=%s",
        "nominatim",
        "geocode",
        elapsed_ms,
        status,
    )


def _viewbox() -> str:
    """Nominatim viewbox (left,top,right,bottom) from the service scope."""
    try:
        min_lat, min_lon, max_lat, max_lon = (
            float(part)
            for part in settings.geo_scope_bbox.split(",")
        )
    except (AttributeError, TypeError, ValueError):
        return ""
    return f"{min_lon},{max_lat},{max_lon},{min_lat}"


def search(
    query: str,
    *,
    timeout_seconds: float | None = None,
    limit: int = 5,
) -> list[PlaceCandidate]:
    started_at = time.monotonic()

    try:
        if not settings.nominatim_enabled:
            raise RuntimeError(
                "Nominatim provider is disabled."
            )

        _rate_limit()

        params_map: dict[str, Any] = {
            "q": query,
            "format": "jsonv2",
            "limit": limit,
            "addressdetails": 1,
            # Bias towards the Telangana service scope (resolver still
            # hard-filters out-of-scope hits).
            "bounded": 0,
        }
        viewbox = _viewbox()
        if viewbox:
            params_map["viewbox"] = viewbox
        params = urllib.parse.urlencode(params_map)

        request = urllib.request.Request(
            f"{settings.nominatim_url.rstrip('/')}/search?{params}",
            headers={
                "User-Agent": settings.nominatim_user_agent,
                "Accept": "application/json",
            },
        )

        with urllib.request.urlopen(
            request,
            timeout=(
                timeout_seconds
                if timeout_seconds is not None
                else settings.nominatim_timeout_s
            ),
        ) as response:
            payload: list[dict[str, Any]] = json.loads(
                response.read().decode("utf-8")
            )

        candidates: list[PlaceCandidate] = []

        for item in payload:
            try:
                candidates.append(
                    PlaceCandidate(
                        display_name=str(
                            item.get("display_name", query)
                        ),
                        latitude=float(item["lat"]),
                        longitude=float(item["lon"]),
                        source="nominatim",
                        place_type=item.get("type"),
                        importance=(
                            float(item["importance"])
                            if item.get("importance") is not None
                            else None
                        ),
                    )
                )
            except (KeyError, TypeError, ValueError):
                continue

        _log_latency(started_at, "success")
        return candidates

    except Exception:
        _log_latency(started_at, "error")
        logger.warning(
            "Nominatim request failed for query=%s",
            query,
        )
        raise


def resolve(
    query: str,
    *,
    timeout_seconds: float | None = None,
) -> ResolvedPlace | None:
    candidates = search(
        query,
        timeout_seconds=timeout_seconds,
        limit=5,
    )

    if not candidates:
        return None

    if len(candidates) > 1:
        top = candidates[0]

        if (
            top.importance is not None
            and candidates[1].importance is not None
            and abs(
                top.importance - candidates[1].importance
            ) < 0.05
        ):
            return None

    top = candidates[0]

    return ResolvedPlace(
        query=query,
        display_name=top.display_name,
        coordinates=Coordinate(
            latitude=top.latitude,
            longitude=top.longitude,
        ),
        source="nominatim",
        confidence=top.importance,
    )