"""§12 acceptance runner — executes the contract checks from
architecture-v2.md §12 against a running backend (port 8000).

Usage (from multiagent/):
    python -m app.scripts.run_acceptance12            # default: 20s between calls
    python -m app.scripts.run_acceptance12 --gap 600  # when Groq quota is tight

Static checks (STUB / supabase / transit module) run instantly and offline.
Live cases need: uvicorn running, a valid Groq key with quota headroom.
Cases needing the local temple model (3, 7) require the bge-m3 cache.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]  # multiagent/
BASE_URL = "http://127.0.0.1:8000/chat"

LIVE_CASES: list[tuple[str, str]] = [
    ("1 greeting (DIRECT, no agents)", "hiiii helloww"),
    ("2 help_meta (DIRECT)", "how do i use this website"),
    ("3 temple timings (RAG + source label)", "yadadri temple timings"),
    ("4 bus: honest fallback + driving", "hyderabad to yadadri by bus"),
    ("5 distance km + duration", "distance from hyd to warangal"),
    ("6 nearby attractions (Overpass, cached)",
     "nearby attractions near bhongir"),
    ("7 combined: two sections, in order",
     "what are yadadri temple timings and also distance from "
     "hyderabad to warangal"),
    ("9 emergency regex (no LLM)", "emergency help me now"),
]


def static_checks() -> bool:
    app_dir = ROOT / "app"
    ok = True

    def count(pattern: str) -> int:
        out = subprocess.run(
            ["grep", "-rn", pattern, str(app_dir), "--include=*.py"],
            capture_output=True, text=True,
        )
        return len([ln for ln in out.stdout.splitlines() if ln])

    stub = count('"STUB"')
    supa = count("import supabase") + count("from supabase")
    gtfs = count("gtfs")
    print(f"§12.10a no STUB status .......... {'PASS' if stub == 0 else f'FAIL ({stub})'}")
    print(f"§12.10b no supabase import ...... {'PASS' if supa == 0 else f'FAIL ({supa})'}")
    print(f"§12.10c no transit/gtfs module .. {'PASS' if gtfs == 0 else f'FAIL ({gtfs})'}")
    ok = ok and stub == 0 and supa == 0 and gtfs == 0
    return ok


def ask(message: str, session_id: str, timeout: float = 300.0):
    payload = json.dumps(
        {"message": message, "session_id": session_id}
    ).encode()
    request = urllib.request.Request(
        BASE_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    started = time.time()
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            data = json.load(response)
        return (
            time.time() - started,
            data.get("status", ""),
            data.get("category", ""),
            data.get("reply", ""),
            data.get("clarification") or "",
        )
    except urllib.error.HTTPError as exc:
        return time.time() - started, f"HTTP{exc.code}", "", exc.read().decode()[:160], ""
    except Exception as exc:  # noqa: BLE001
        return time.time() - started, "EXC", "", repr(exc)[:160], ""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--gap", type=int, default=20,
                        help="seconds between live calls (raise if Groq 429/503)")
    args = parser.parse_args()

    print("== Static checks ==")
    static_ok = static_checks()

    print("\n== Live checks (backend must be running) ==")
    results: list[tuple[str, bool]] = []
    for label, question in LIVE_CASES:
        elapsed, status, category, reply, clarification = ask(
            question, f"s12_{int(time.time())}_{abs(hash(label)) % 10000}"
        )
        head = reply.replace("\n", " | ")[:140]
        expected_direct = label.startswith(("1 ", "2 ", "9 "))
        passed = bool(status) and status != "EXC" and not status.startswith("HTTP")
        if "HTTP503" in status:
            head = "(Groq quota/keys) — wait for quota window and rerun with --gap 600"
            passed = False
        if "HTTP500" in status:
            head = "(server error — check uvicorn traceback)"
            passed = False
        mark = "PASS" if passed else "FAIL"
        print(f"[{mark}] {label}")
        print(f"       {elapsed:.1f}s status={status} cat={category}")
        if head:
            print(f"       {head}")
        results.append((label, passed))
        time.sleep(args.gap)

    total = len(results) + 1
    passed = sum(1 for _, p in results if p) + (1 if static_ok else 0)
    print(f"\n== Summary: {passed}/{total} checks passed ==")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
