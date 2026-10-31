"""The Credence Risk Agent as an A2A server: task lifecycle behind `message/send` and `tasks/get`.

Task states:
  input-required  cart mandate issued, waiting for the payer's Payment Mandate
  working         Payment Mandate received, settlement not yet verified on the rail
  completed       settlement verified independently, anchored on-chain, goods delivered
  rejected/failed identity, pricing or settlement problems
"""

import json
import time
from decimal import Decimal

from app.a2a import protocol as p
from app.config import settings
from app.hsp.signing import cart_hash

DONE = {"payment-safe", "payment-finalized"}


class TaskStore:
    def __init__(self, path):
        self.path = path
        self.tasks: dict[str, dict] = json.loads(path.read_text()) if path.exists() else {}

    def get(self, task_id: str) -> dict:
        if task_id not in self.tasks:
            raise p.RPCError(p.TASK_NOT_FOUND, f"task {task_id} not found")
        return self.tasks[task_id]

    def save(self, task: dict) -> dict:
        self.tasks[task["id"]] = task
        self.path.write_text(json.dumps(self.tasks, indent=1, default=str))
        return task


class MerchantService:
    """Owns the receiving-agent side of every purchase. Rails are chosen per task."""

    def __init__(self, registry=None, merchant=None, rail_override=None):
        self._registry, self._merchant, self.rail_override = registry, merchant, rail_override
        self.store = TaskStore(settings.data_dir / "a2a_tasks.json")

    # lazily built so the API process starts even without keys
    @property
    def registry(self):
        if self._registry is None:
            from app.chain.registry import TrustRegistry
            self._registry = TrustRegistry()
        return self._registry

    @property
    def merchant(self):
        if self._merchant is None:
            from app.agents.merchant_agent import MerchantAgent
            self._merchant = MerchantAgent(self.registry)
        return self._merchant

    def rail(self, name: str):
        if self.rail_override is not None:
            return self.rail_override
        if name == "hsp":
            from app.hsp.mcp_client import HSPAgenticPayment
            return HSPAgenticPayment(settings.hsp_mcp_url)
        from app.hsp.sandbox_rail import SandboxRail
        return SandboxRail(self.registry.w3, settings.merchant_agent_key)

    def card(self, base_url: str) -> dict:
        return p.agent_card(base_url, self.merchant.address)

    # ---------- JSON-RPC dispatch ----------

    async def dispatch(self, method: str, params: dict) -> dict:
        if method == "message/send":
            return await self.on_message(params.get("message") or {})
        if method == "tasks/get":
            return self._public(self.store.get(params.get("id", "")))
        raise p.RPCError(p.METHOD_NOT_FOUND, f"method {method} not supported")

    async def on_message(self, msg: dict) -> dict:
        data = p.parts_data(msg)
        if p.QUOTE_REQUEST in data:
            return self._public(await self._quote(msg, data))
        task = self.store.get(msg.get("taskId", ""))
        task.setdefault("history", []).append(msg)
        if p.PAYMENT_MANDATE in data:
            return self._public(self._payment_mandate(task, data[p.PAYMENT_MANDATE]))
        if p.SETTLEMENT_NOTICE in data:
            return self._public(await self._verify_settlement(task, data[p.SETTLEMENT_NOTICE]))
        raise p.RPCError(p.INVALID_PARAMS, "message carries no recognised data part")

    # ---------- skills ----------

    async def _quote(self, msg: dict, data: dict) -> dict:
        req = data[p.QUOTE_REQUEST]
        context_id = msg.get("contextId") or p.new_id("ctx_")
        task = {"id": p.new_id("task_"), "contextId": context_id, "kind": "task", "history": [msg], "artifacts": [],
                "metadata": {"rail": req.get("rail", "sandbox")}}
        try:
            payer = p.verify_identity(data.get(p.IDENTITY), context_id)
        except Exception as exc:
            return self._set(task, "rejected", f"Identity proof failed: {exc}")
        if payer.lower() != str(req.get("payer", "")).lower():
            return self._set(task, "rejected", "Identity proof is for a different payer")

        from app.agents.merchant_agent import CATALOG
        product, targets, token = req.get("product"), req.get("targets") or [], req.get("token") or {}
        if product not in CATALOG or not targets:
            return self._set(task, "rejected", "Unknown product or no target wallets")

        quote = self.merchant.quote(payer, product, targets)
        cart = self.merchant.cart_mandate(quote, token)
        rail = self.rail(task["metadata"]["rail"])
        order = await rail.call("create_order", {"merchant_name": settings.hsp_team_name, "pay_to": self.merchant.address,
                                                 "cart_mandate": cart})
        mandate_hash = "0x" + cart_hash(cart["contents"])
        task["metadata"].update(payer=payer, product=product, targets=targets, token=token, flow_id=order["flow_id"],
                                payment_request_id=order.get("payment_request_id"), mandate_hash=mandate_hash,
                                total_usd=str(quote["total_usd"]), terms=quote["terms"], trust_before=quote["trust_score"])
        terms = {"trust_score": quote["trust_score"], "terms": quote["terms"], "net_days": quote["net_days"],
                 "credit_limit": quote["credit_limit"], "total_usd": str(quote["total_usd"]),
                 "registry": settings.registry_address, "chain_id": settings.network.chain_id}
        task["artifacts"] += [
            p.artifact("cart-mandate", p.CART_MANDATE, {**cart, "flow_id": order["flow_id"],
                                                         "payment_request_id": order.get("payment_request_id"),
                                                         "payment_url": order.get("payment_url"), "mandate_hash": mandate_hash}),
            p.artifact("terms", p.TERMS, terms),
        ]
        if quote["terms"] != "PREPAY":
            # Trusted payer: open the tab on-chain and ship the goods before payment.
            raw = int(Decimal(quote["total_usd"]) * 10 ** int(token.get("decimals", 6)))
            due = int(time.time()) + quote["net_days"] * 86400
            tab_tx = self.registry.open_tab(mandate_hash, payer, self.merchant.address, token["address"], raw, quote["terms"], due)
            reports = self.merchant.deliver(product, targets)
            task["metadata"].update(tab_tx=tab_tx, delivered=True)
            task["artifacts"].append(p.artifact("goods", p.GOODS, {"reports": reports, "delivered_before_payment": True,
                                                                     "tab_tx": tab_tx, "due_at": due}))
        verb = "pay before delivery" if quote["terms"] == "PREPAY" else f"goods delivered now, pay within {quote['net_days']} days"
        return self._set(task, "input-required", f"Trust {quote['trust_score']} → {quote['terms']}: {verb}. Send a Payment Mandate for flow {order['flow_id']}.")

    def _payment_mandate(self, task: dict, mandate: dict) -> dict:
        if task["status"]["state"] not in ("input-required", "working"):
            raise p.RPCError(p.INVALID_PARAMS, f"task is {task['status']['state']}")
        if mandate.get("flow_id") != task["metadata"]["flow_id"]:
            return self._set(task, "failed", "Payment Mandate references a different HSP flow")
        task["metadata"]["payment_mandate"] = p.compact(mandate, 4000)
        return self._set(task, "working", "Payment Mandate received. Verifying settlement on the rail before anything else.")

    async def _verify_settlement(self, task: dict, notice: dict) -> dict:
        """Never trust the payer's notice: query the rail ourselves, then anchor and deliver."""
        meta = task["metadata"]
        if task["status"]["state"] == "completed":
            return task
        res = await self.rail(meta["rail"]).call("query_payment", {
            "flow_id": meta["flow_id"], "payment_request_id": meta.get("payment_request_id"),
            "expected_merchant_name": settings.hsp_team_name})
        payment = res.get("payment", res)
        status = payment.get("status")
        meta["rail_status"] = status
        if status not in DONE:
            return self._set(task, "failed" if status == "payment-failed" else "working", f"Rail reports {status}; not settled yet.")
        if res.get("attribution_verified") is False:
            return self._set(task, "failed", "HSP attribution check failed for this merchant")

        tx = payment.get("tx_signature") or notice.get("tx")
        anchor_tx = meta.get("anchor_tx")
        if not anchor_tx and not self.registry.is_settled(meta["mandate_hash"]):
            raw = int(Decimal(meta["total_usd"]) * 10 ** int(meta["token"].get("decimals", 6)))
            anchor_tx = self.registry.record_settlement(meta["mandate_hash"], meta["payer"], self.merchant.address,
                                                        meta["token"]["address"], raw, meta["flow_id"], tx)
            meta["anchor_tx"] = anchor_tx
        after = self.registry.trust_score_after(meta["payer"], meta["trust_before"])
        next_terms = self.registry.terms_for(meta["payer"])
        task["artifacts"].append(p.artifact("receipt", p.RECEIPT, {
            "payment_tx": tx, "anchor_tx": anchor_tx, "rail_status": status, "trust_before": meta["trust_before"],
            "trust_after": after, "next_terms": next_terms, "mandate_hash": meta["mandate_hash"]}))
        if not meta.get("delivered"):
            reports = self.merchant.deliver(meta["product"], meta["targets"])
            meta["delivered"] = True
            task["artifacts"].append(p.artifact("goods", p.GOODS, {"reports": reports, "delivered_before_payment": False}))
        return self._set(task, "completed", f"Settlement verified ({status}) and anchored. Trust {meta['trust_before']} → {after}.")

    # ---------- helpers ----------

    def _set(self, task: dict, state: str, text: str) -> dict:
        task["status"] = {"state": state, "timestamp": p.now_iso(),
                          "message": p.message("agent", [p.text_part(text)], task["id"], task["contextId"])}
        return self.store.save(task)

    @staticmethod
    def _public(task: dict) -> dict:
        """What goes over the wire: the A2A Task object (internal metadata trimmed to safe fields)."""
        meta = task.get("metadata", {})
        return {"kind": "task", "id": task["id"], "contextId": task["contextId"], "status": task["status"],
                "artifacts": task.get("artifacts", []),
                "metadata": {k: meta[k] for k in ("rail", "flow_id", "terms", "total_usd", "mandate_hash", "anchor_tx", "tab_tx") if k in meta}}


_service: MerchantService | None = None


def service() -> MerchantService:
    global _service
    if _service is None:
        _service = MerchantService()
    return _service
