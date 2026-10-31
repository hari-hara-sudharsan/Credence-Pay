"""Receiving agent: the Credence Risk Agent sells wallet risk intelligence to other agents.

It prices the request, reads the payer's on-chain trust to decide terms,
issues a signed HSP Cart Mandate, and delivers the goods once settled.
"""

import time
import uuid
from decimal import Decimal

from eth_account import Account

from app.chain.registry import TrustRegistry
from app.config import settings
from app.credit.credit_engine import CreditEngine
from app.credit.wallet_analyzer import WalletAnalyzer
from app.hsp.cart_mandate import LineItem, build_contents

CATALOG = {
    "risk_report": {"label": "Wallet risk report", "price": Decimal("2.50")},
    "trust_attestation": {"label": "Signed trust attestation", "price": Decimal("1.00")},
    "portfolio_scan": {"label": "Counterparty portfolio scan", "price": Decimal("6.00")},
}


class MerchantAgent:
    def __init__(self, registry: TrustRegistry):
        self.registry = registry
        self.address = Account.from_key(settings.merchant_agent_key).address

    def quote(self, payer: str, product: str, targets: list[str]) -> dict:
        """Price the order and pick terms from the payer's trust record."""
        item = CATALOG[product]
        items = [LineItem(f"{item['label']}: {t[:6]}…{t[-4:]}", item["price"]) for t in targets]
        total = sum((i.amount_usd for i in items), Decimal("0"))

        terms = self.registry.terms_for(payer)
        score = self.registry.trust_score(payer)
        deferred = terms["terms"] != "PREPAY" and float(total) <= terms["credit_limit"]
        return {
            "items": items,
            "total_usd": total,
            "trust_score": score,
            "terms": terms["terms"] if deferred else "PREPAY",
            "net_days": terms["net_days"] if deferred else 0,
            "credit_limit": terms["credit_limit"],
        }

    def cart_mandate(self, quote: dict, token: dict) -> dict:
        """Payment conditions the receiving agent transmits, as an HSP cart mandate.

        HSP generates merchant_authorization server-side, so none is attached here.
        """
        order_id = f"CRED-{int(time.time())}-{uuid.uuid4().hex[:6]}"
        contents = build_contents(
            cart_mandate_id=order_id,
            payment_request_id=f"{order_id}-PAY",
            merchant_name=settings.hsp_team_name,
            pay_to=self.address,
            items=quote["items"],
            token=token,
        )
        return {"contents": contents}

    def deliver(self, product: str, targets: list[str]) -> list[dict]:
        """The goods: live credit analysis from Blockscout data via the transparent underwriting engine."""
        analyzer, engine = WalletAnalyzer(), CreditEngine()
        reports = []
        for wallet in targets:
            features = analyzer.analyze(wallet)
            profile = engine.calculate(features)
            reports.append({
                "wallet": wallet,
                "credit_score": profile.credit_score,
                "rating": profile.rating,
                "probability_of_default": profile.probability_of_default,
                "segment": profile.segment,
                "wallet_age_days": features["wallet_age_days"],
                "transaction_count": features["transaction_count"],
            })
        return reports
