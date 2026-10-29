"""Pytest bootstrap: make `app.*` importable no matter which directory
pytest is launched from (repo root or multiagent/).

pytest loads every conftest.py between the rootdir and the test paths
before importing test modules, so this file runs first and puts the
multiagent package root on sys.path.
"""
from __future__ import annotations

import sys
from pathlib import Path

_MULTIAGENT_ROOT = str(Path(__file__).resolve().parent)
if _MULTIAGENT_ROOT not in sys.path:
    sys.path.insert(0, _MULTIAGENT_ROOT)
