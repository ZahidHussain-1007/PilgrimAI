"""Conservative, source-pinned catalog windows in IST.
Ambiguous operational prose is normalized as reviewed data, not guessed by an
LLM or a permissive time regex. Changed source prose fails closed until reviewed.
These are catalog scenarios, not live or certified date-specific availability.
"""

import hashlib
import json
from datetime import date
from functools import lru_cache
from pathlib import Path


def minutes(value: str) -> int:
    h, m = value.split(":")
    h, m = int(h), int(m)
    if not (0 <= h <= 23 and 0 <= m <= 59):
        raise ValueError("Invalid IST clock")
    return h * 60 + m


def clock(value: int) -> str:
    return f"{value // 60:02d}:{value % 60:02d}"


@lru_cache(maxsize=1)
def _normalized():
    path = Path(__file__).resolve().parents[2] / "data" / "planning_windows.json"
    return json.loads(path.read_text(encoding="utf-8"))["temples"]


def opening_windows(record: dict, day: date) -> list[list[int]]:
    data = _normalized().get(record.get("temple_id"))
    if not data:
        return []
    digest = hashlib.sha256(
        json.dumps(
            record.get("darshan_timings"), sort_keys=True, ensure_ascii=False
        ).encode()
    ).hexdigest()
    if digest != data["source_sha256"]:
        return []
    windows = data["weekday_windows"].get(str(day.weekday()), data["windows"])
    if any(not (0 <= a < b < 1440) for a, b in windows):
        return []
    return windows
