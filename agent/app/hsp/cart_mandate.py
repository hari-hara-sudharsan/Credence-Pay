"""Cart Mandate construction (merchant side of the AP2-style flow).

The receiving (merchant) agent turns its payment conditions into an HSP Cart
Mandate: x402 payment methods on HashKey Chain, line items, expiry, and an
ES256K merchant_authorization JWT that binds the merchant to the exact cart.
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from app.hsp.networks import Network
from app.hsp.signing import sign_merchant_authorization

X402_METHOD = "https://www.x402.org/"


@dataclass
class LineItem:
    label: str
    amount_usd: Decimal


@dataclass
class PaymentConditions:
    """What the receiving agent transmits to the payment agent."""
    cart_mandate_id: str
    payment_request_id: str
    merchant_name: str
    pay_to: str
    items: list[LineItem]
    network: Network
    coins: list[str] = field(default_factory=lambda: ["USDC"])
    expiry: timedelta = timedelta(hours=2)
    user_cart_confirmation_required: bool = False  # agent-to-agent: no human checkout step

    @property
    def total_usd(self) -> Decimal:
        return sum((i.amount_usd for i in self.items), Decimal("0"))


def _money(value: Decimal) -> dict:
    return {"currency": "USD", "value": f"{value:.2f}"}


def build_contents(cond: PaymentConditions, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    method_data = []
    for coin in cond.coins:
        token = cond.network.tokens[coin]
        method_data.append({
            "supported_methods": X402_METHOD,
            "data": {
                "x402Version": 2,
                "network": cond.network.name,
                "chain_id": cond.network.chain_id,
                "contract_address": token.address,
                "pay_to": cond.pay_to,
                "coin": coin,
            },
        })

    return {
        "id": cond.cart_mandate_id,
        "user_cart_confirmation_required": cond.user_cart_confirmation_required,
        "payment_request": {
            "method_data": method_data,
            "details": {
                "id": cond.payment_request_id,
                "display_items": [{"label": i.label, "amount": _money(i.amount_usd)} for i in cond.items],
                "total": {"label": "Total", "amount": _money(cond.total_usd)},
            },
        },
        "cart_expiry": (now + cond.expiry).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "merchant_name": cond.merchant_name,
    }


def build_cart_mandate(cond: PaymentConditions, private_key_pem: str, redirect_url: str | None = None) -> dict:
    """Full request body for POST /api/v1/merchant/orders."""
    contents = build_contents(cond)
    body = {
        "cart_mandate": {
            "contents": contents,
            "merchant_authorization": sign_merchant_authorization(contents, cond.merchant_name, private_key_pem),
        }
    }
    if redirect_url:
        body["redirect_url"] = redirect_url
    return body
