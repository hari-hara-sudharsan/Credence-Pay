"""Cart mandate contents (payment conditions transmitted by the receiving agent).

Network, chain id, token contract and coin come from HSP get_chain_config;
HSP overrides pay_to with the separately supplied value and generates the
merchant_authorization itself.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal

X402_METHOD = "https://www.x402.org/"


@dataclass
class LineItem:
    label: str
    amount_usd: Decimal


def _money(value: Decimal) -> dict:
    return {"currency": "USD", "value": f"{value:.2f}"}


def build_contents(
    cart_mandate_id: str,
    payment_request_id: str,
    merchant_name: str,
    pay_to: str,
    items: list[LineItem],
    token: dict,
    expiry: timedelta = timedelta(hours=2),
    now: datetime | None = None,
) -> dict:
    now = now or datetime.now(timezone.utc)
    total = sum((i.amount_usd for i in items), Decimal("0"))
    return {
        "id": cart_mandate_id,
        "user_cart_confirmation_required": False,
        "payment_request": {
            "method_data": [{
                "supported_methods": X402_METHOD,
                "data": {
                    "x402Version": 2,
                    "network": token["network"],
                    "chain_id": token["chain_id"],
                    "contract_address": token["address"],
                    "pay_to": pay_to,
                    "coin": token["symbol"],
                },
            }],
            "details": {
                "id": payment_request_id,
                "display_items": [{"label": i.label, "amount": _money(i.amount_usd)} for i in items],
                "total": {"label": "Total", "amount": _money(total)},
            },
        },
        "cart_expiry": (now + expiry).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "merchant_name": merchant_name,
    }
