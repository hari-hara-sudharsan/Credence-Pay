"""Runs one agent-to-agent purchase end to end and yields a timeline of verifiable steps."""

import json
import time
from datetime import datetime, timezone

from app.agents.buyer_agent import BuyerAgent
from app.agents.merchant_agent import MerchantAgent
from app.agents.settlement import DirectSettlement
from app.chain.registry import TrustRegistry
from app.config import settings
from app.hsp.signing import cart_hash

EXPLORER = settings.network.explorer


def _step(key: str, title: str, detail: str = "", status: str = "done", **data) -> dict:
    return {"key": key, "title": title, "detail": detail, "status": status, "data": data, "at": datetime.now(timezone.utc).isoformat()}


class A2ARun:
    def __init__(self):
        self.registry = TrustRegistry()
        self.merchant = MerchantAgent(self.registry)
        self.buyer = BuyerAgent(self.registry)
        self.settlement = DirectSettlement(self.registry.w3, self.registry.settler)

    def run(self, instruction: str):
        log_path = settings.data_dir / "runs.jsonl"
        record = {"instruction": instruction, "payer": self.buyer.address, "payee": self.merchant.address, "steps": []}

        def emit(step):
            record["steps"].append(step)
            return step

        try:
            # 1. Intent (AP2 Intent Mandate)
            intent = self.buyer.parse_intent(instruction)
            if not intent["targets"]:
                raise ValueError("no wallet address found in the instruction")
            yield emit(_step("intent", "Intent understood", f"{intent['product']} for {len(intent['targets'])} wallet(s)", intent=intent))

            # 2. Trust check and terms
            before = self.registry.trust_score(self.buyer.address)
            quote = self.merchant.quote(self.buyer.address, intent["product"], intent["targets"])
            terms_text = "pay before delivery" if quote["terms"] == "PREPAY" else f"deliver now, pay within {quote['net_days']} days"
            yield emit(_step("trust", "Merchant agent checked payer trust on-chain",
                             f"Trust {quote['trust_score']} → {quote['terms']}: {terms_text}",
                             trust_score=quote["trust_score"], terms=quote["terms"], credit_limit=quote["credit_limit"], total_usd=str(quote["total_usd"])))

            # 3. Cart Mandate
            cart = self.merchant.issue_cart_mandate(quote)
            contents = cart["body"]["cart_mandate"]["contents"]
            yield emit(_step("cart", "Cart Mandate issued (ES256K signed)",
                             f"{cart['cart_mandate_id']} · {quote['total_usd']} USDC on HashKey Chain",
                             cart_mandate_id=cart["cart_mandate_id"], cart_hash=cart_hash(contents),
                             hsp_flow_id=(cart["hsp"] or {}).get("flow_id"), hsp_payment_url=(cart["hsp"] or {}).get("payment_url"),
                             hsp_registered=bool(cart["hsp"])))

            # 4. Payment agent verification
            review = self.buyer.review_cart(cart["body"], intent, self.merchant.address)
            yield emit(_step("verify", "Payment agent verified mandate and spending policy",
                             "Merchant signature ✓ · cart hash ✓ · token contract ✓ · budget ✓ · on-chain policy ✓",
                             amount=review["amount"]))

            # 5. Payment Mandate
            pm = self.buyer.sign_payment_mandate(cart["body"])
            yield emit(_step("sign", "Payment Mandate signed (EIP-712 / EIP-3009)",
                             f"Authorises exactly {review['total_usd']} USDC to the merchant, valid 10 min",
                             payment_mandate_id=pm["payment_mandate_id"], signature=pm["x402"]["payload"]["signature"][:20] + "…"))

            mandate_hash = "0x" + cart_hash(contents)
            token = review["method"]["contract_address"]

            # 6. Deferred terms: goods first, tab recorded on-chain
            if quote["terms"] != "PREPAY":
                due = int(time.time()) + quote["net_days"] * 86400
                tab_tx = self.registry.open_tab(mandate_hash, self.buyer.address, self.merchant.address, token, review["amount"], quote["terms"], due)
                yield emit(_step("tab", f"{quote['terms']} tab opened on-chain", f"Due in {quote['net_days']} days", tx=tab_tx, explorer=f"{EXPLORER}/tx/{tab_tx}"))
                reports = self.merchant.deliver(intent["product"], intent["targets"])
                yield emit(_step("deliver", "Goods delivered before payment (trusted payer)", f"{len(reports)} report(s)", reports=reports))

            # 7. Settlement
            result = self.settlement.execute(pm)
            yield emit(_step("settle", "Payment settled on HashKey Chain", f"{review['total_usd']} USDC via {result['rail']}",
                             tx=result["tx_hash"], explorer=f"{EXPLORER}/tx/{result['tx_hash']}", rail=result["rail"]))

            # 8. Anchor + trust update
            anchor_tx = self.registry.record_settlement(
                mandate_hash, self.buyer.address, self.merchant.address, token, review["amount"],
                (cart["hsp"] or {}).get("flow_id") or cart["cart_mandate_id"], result["tx_hash"],
            )
            after = self.registry.trust_score(self.buyer.address)
            next_terms = self.registry.terms_for(self.buyer.address)
            yield emit(_step("anchor", "Settlement anchored, trust updated",
                             f"Trust {before} → {after} · next order terms: {next_terms['terms']}",
                             tx=anchor_tx, explorer=f"{EXPLORER}/tx/{anchor_tx}", trust_before=before, trust_after=after, next_terms=next_terms))

            if quote["terms"] == "PREPAY":
                reports = self.merchant.deliver(intent["product"], intent["targets"])
                yield emit(_step("deliver", "Goods delivered", f"{len(reports)} report(s)", reports=reports))

            record["status"] = "settled"
        except Exception as exc:
            record["status"] = "failed"
            yield emit(_step("error", "Run stopped", str(exc), status="error", error_type=type(exc).__name__))
        finally:
            record["finished_at"] = datetime.now(timezone.utc).isoformat()
            with log_path.open("a", encoding="utf-8") as f:
                f.write(json.dumps(record, default=str) + "\n")
