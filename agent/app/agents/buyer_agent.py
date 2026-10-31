"""Payment agent: a DeFi lending agent that buys risk reports to underwrite its borrowers.

It turns a natural-language instruction into an intent, verifies the
merchant's Cart Mandate, enforces its owner's on-chain spending policy,
and only then signs a Payment Mandate.
"""

import json
import re

from eth_account import Account

from app.chain.registry import TrustRegistry
from app.config import settings
from app.hsp.payment_mandate import build_payment_mandate, select_method, to_base_units
from app.hsp.signing import verify_merchant_authorization

ADDRESS_RE = re.compile(r"0x[a-fA-F0-9]{40}")

INTENT_PROMPT = """You are the payment agent of a DeFi lending protocol. Convert the user's
instruction into JSON with keys: product ("risk_report" or "trust_attestation"),
targets (list of 0x wallet addresses to analyse), max_budget_usd (number or null).
Reply with JSON only."""


class BuyerAgent:
    def __init__(self, registry: TrustRegistry):
        self.registry = registry
        self.account = Account.from_key(settings.buyer_agent_key)
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
                "product": "trust_attestation" if "attest" in instruction.lower() else "risk_report",
                "max_budget_usd": float(budget.group(1)) if budget else None,
                "source": "rules",
            }
        # Never trust the model with addresses: only use ones literally present in the instruction.
        intent["targets"] = [t for t in intent.get("targets", targets) if t in targets] or targets
        return intent

    def review_cart(self, cart_body: dict, intent: dict, merchant: str) -> dict:
        """Verify merchant signature, budget and on-chain spending policy before signing anything."""
        contents = cart_body["cart_mandate"]["contents"]
        verify_merchant_authorization(contents, cart_body["cart_mandate"]["merchant_authorization"], settings.merchant_jwt_public_key)
        method = select_method(contents, settings.network)
        if method["pay_to"].lower() != merchant.lower():
            raise ValueError("cart pays a different address than the agent we are trading with")

        total = contents["payment_request"]["details"]["total"]["amount"]["value"]
        if intent.get("max_budget_usd") is not None and float(total) > float(intent["max_budget_usd"]):
            raise ValueError(f"cart total {total} USD exceeds intent budget {intent['max_budget_usd']} USD")

        amount = to_base_units(total, settings.network.tokens["USDC"].decimals)
        ok, reason = self.registry.check_spend(self.address, merchant, amount)
        if not ok:
            raise PermissionError(f"spending policy rejected payment: {reason}")
        return {"total_usd": total, "amount": amount, "method": method}

    def sign_payment_mandate(self, cart_body: dict) -> dict:
        return build_payment_mandate(cart_body["cart_mandate"]["contents"], settings.network, settings.buyer_agent_key)
