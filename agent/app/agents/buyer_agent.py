"""Payment agent: a DeFi lending agent that buys risk reports to underwrite its borrowers.

It turns a natural-language instruction into an intent. Verification,
spending-policy enforcement and signing happen in the A2A flow against the
quote HSP locks in prepare_payment.
"""

import json
import re

from eth_account import Account

from app.chain.registry import TrustRegistry
from app.config import settings

ADDRESS_RE = re.compile(r"0x[a-fA-F0-9]{40}")

INTENT_PROMPT = """You are the payment agent of a DeFi lending protocol. Convert the user's
instruction into JSON with keys: product ("risk_report", "trust_attestation" or "portfolio_scan"),
targets (list of 0x wallet addresses to analyse), max_budget_usd (number or null).
Reply with JSON only."""


class BuyerAgent:
    def __init__(self, registry: TrustRegistry, private_key: str):
        self.registry = registry
        self.key = private_key
        self.account = Account.from_key(private_key)
        self.address = self.account.address

    def parse_intent(self, instruction: str) -> dict:
        """Groq LLM when configured; deterministic fallback otherwise, so the demo never stalls."""
        targets = ADDRESS_RE.findall(instruction)
        intent = None
        if settings.groq_api_key:
            try:
                from groq import Groq
                resp = Groq(api_key=settings.groq_api_key).chat.completions.create(
                    model=settings.groq_model,
                    messages=[{"role": "system", "content": INTENT_PROMPT}, {"role": "user", "content": instruction}],
                    response_format={"type": "json_object"},
                    temperature=0,
                )
                intent = json.loads(resp.choices[0].message.content)
                intent["source"] = "llm"
            except Exception:
                intent = None
        if intent is None:
            budget = re.search(r"(?:max|under|budget|up to)\s*\$?\s*(\d+(?:\.\d+)?)", instruction, re.I)
            intent = {
                "product": ("trust_attestation" if "attest" in instruction.lower()
                            else "portfolio_scan" if "portfolio" in instruction.lower() or "scan" in instruction.lower()
                            else "risk_report"),
                "max_budget_usd": float(budget.group(1)) if budget else None,
                "source": "rules",
            }
        # Never trust the model with addresses: only use ones literally present in the instruction.
        intent["targets"] = [t for t in intent.get("targets", targets) if t in targets] or targets
        return intent
