"""Canonical JSON and cart hashing, matching HashKey Merchant conventions."""

import hashlib
import json
from typing import Any


def canonical_json(value: Any) -> str:
    """Deterministic JSON: keys sorted lexicographically, arrays keep order, no whitespace."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def cart_hash(contents: dict) -> str:
    return hashlib.sha256(canonical_json(contents).encode("utf-8")).hexdigest()
