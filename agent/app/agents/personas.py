"""Payment agents in the demo economy. Each one has its own wallet and on-chain history,
so the receiving agent offers each of them different terms."""

import os

from eth_account import Account

from app.config import settings

PERSONAS = {
    "nova": {
        "name": "Nova Research Agent",
        "tagline": "Brand new. No payment history.",
        "owner": "Nova Labs",
        "color": "#7aa7ff",
    },
    "orbit": {
        "name": "Orbit Trading Agent",
        "tagline": "A handful of on-time payments.",
        "owner": "Orbit Capital",
        "color": "#c792ff",
    },
    "atlas": {
        "name": "Atlas Lending Agent",
        "tagline": "Long record of paying on time.",
        "owner": "Atlas Finance",
        "color": "#3ee6b0",
    },
    "rogue": {
        "name": "Rogue Arbitrage Bot",
        "tagline": "Let a credit tab go unpaid.",
        "owner": "Unknown",
        "color": "#f2667a",
    },
}


def _keys() -> dict[str, str]:
    """PERSONA_KEYS="nova=0x..,orbit=0x.."; Nova falls back to BUYER_AGENT_KEY."""
    keys = {}
    for pair in filter(None, os.getenv("PERSONA_KEYS", "").split(",")):
        pid, key = pair.split("=", 1)
        keys[pid.strip()] = key.strip()
    if "nova" not in keys and settings.buyer_agent_key:
        keys["nova"] = settings.buyer_agent_key
    return keys


def persona_key(persona: str) -> str:
    keys = _keys()
    if persona not in keys:
        raise KeyError(f"no wallet configured for persona '{persona}'")
    return keys[persona]


def all_personas() -> list[dict]:
    keys = _keys()
    return [{"id": pid, **meta, "address": Account.from_key(keys[pid]).address}
            for pid, meta in PERSONAS.items() if pid in keys]
