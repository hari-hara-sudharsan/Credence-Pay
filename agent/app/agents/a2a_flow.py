"""Agent-to-agent purchase over HSP Agentic Payment, with Credence trust-gated terms.

Flow (per the HSP Agentic Payment guide):
  intent -> get_chain_config -> trust check & terms -> create_order (receiving agent)
  -> get_order + prepare_payment (payment agent) -> HUMAN APPROVAL -> sign eip712
  -> finalize_payment -> HUMAN APPROVAL -> submit_payment -> query_payment polling
  -> anchor settlement on-chain -> trust update -> next order gets better terms.
"""

import json
import time
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from eth_account import Account
from eth_account.messages import encode_typed_data
from web3 import Web3

from app.agents.buyer_agent import BuyerAgent
from app.agents.merchant_agent import MerchantAgent
from app.chain.registry import TrustRegistry
from app.config import settings
from app.hsp.mcp_client import HSPAgenticPayment, HSPToolError

POLLING = {"payment-submitted", "payment-verified", "payment-processing", "payment-included", "payment-timeout"}
DONE = {"payment-safe", "payment-finalized"}
QUOTE_EXPIRED_CODE = "30043"
ERC20_BALANCE_ABI = [{"name": "balanceOf", "type": "function", "stateMutability": "view",
                      "inputs": [{"name": "a", "type": "address"}], "outputs": [{"name": "", "type": "uint256"}]}]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class RunStore:
    """Runs persist to disk so a payment can always be recovered by flow_id / payment_request_id."""

    def __init__(self):
        self.path = settings.data_dir / "runs.json"
        self.runs: dict[str, dict] = json.loads(self.path.read_text()) if self.path.exists() else {}

    def save(self, run: dict) -> dict:
        run["updated_at"] = _now()
        self.runs[run["id"]] = run
        self.path.write_text(json.dumps(self.runs, indent=1, default=str))
        return run

    def get(self, run_id: str) -> dict:
        if run_id not in self.runs:
            raise KeyError(run_id)
        return self.runs[run_id]

    def latest(self, limit: int = 20) -> list[dict]:
        return sorted(self.runs.values(), key=lambda r: r["created_at"], reverse=True)[:limit]


store = RunStore()


def select_token(chain_config: dict, network: str, chain_id: int, coin: str) -> dict:
    """Find the configured network/token in get_chain_config output (authoritative source)."""
    candidates = []

    def walk(node, ctx):
        if isinstance(node, dict):
            ctx = {**ctx, **{k: node[k] for k in ("network", "chain_id", "name") if k in node and not isinstance(node[k], (dict, list))}}
            for tok in node.get("tokens", []) if isinstance(node.get("tokens"), list) else []:
                candidates.append({**ctx, **tok})
            for v in node.values():
                walk(v, ctx)
        elif isinstance(node, list):
            for v in node:
                walk(v, ctx)

    walk(chain_config, {})
    for c in candidates:
        symbol = (c.get("symbol") or c.get("coin") or c.get("name") or "").upper()
        net_ok = str(c.get("chain_id")) == str(chain_id) or c.get("network") == network
        if symbol == coin.upper() and net_ok:
            return c
    raise ValueError(f"{coin} on {network} ({chain_id}) not offered by HSP get_chain_config")


class A2AFlow:
    def __init__(self):
        self.hsp = HSPAgenticPayment(settings.hsp_mcp_url)
        self.registry = TrustRegistry()
        self.merchant = MerchantAgent(self.registry)
        self.buyer = BuyerAgent(self.registry)

    # ---------- helpers ----------

    def _step(self, run: dict, key: str, title: str, detail: str = "", status: str = "done", **data):
        run["steps"].append({"key": key, "title": title, "detail": detail, "status": status, "data": data, "at": _now()})

    def _fail(self, run: dict, exc: Exception) -> dict:
        run["state"] = "failed"
        self._step(run, "error", "Run stopped", str(exc), status="error", error_type=type(exc).__name__)
        return store.save(run)

    def _explorer_tx(self, tx: str) -> str:
        return f"{settings.network.explorer}/tx/{tx}"

    def _approval_view(self, run: dict) -> dict:
        p = run["prepare"]
        return {"recipient": p["pay_to"], "payer": p["payer"], "token_total_raw": p["token_total_raw"],
                "token_total": str(Decimal(p["token_total_raw"]) / (10 ** run["token"]["decimals"])),
                "coin": run["token"]["symbol"], "quote_expires_at": p.get("quote_expires_at")}

    async def _prepare(self, run: dict) -> dict:
        prep = await self.hsp.call("prepare_payment", {
            "flow_id": run["order"]["flow_id"],
            "payer|payer_address|from": self.buyer.address,
            "protocol|payment_protocol": run["token"]["protocol"],
        })
        if prep["pay_to"].lower() != self.merchant.address.lower():
            raise ValueError("prepare_payment pay_to does not match the merchant agent")
        if prep["payer"].lower() != self.buyer.address.lower():
            raise ValueError("prepare_payment payer does not match the payment agent wallet")

        raw = int(prep["token_total_raw"])
        budget = run["intent"].get("max_budget_usd")
        if budget is not None and Decimal(raw) / (10 ** run["token"]["decimals"]) > Decimal(str(budget)) * Decimal("1.05"):
            raise ValueError(f"quote {raw} raw units exceeds the intent budget of {budget} USD")
        ok, reason = self.registry.check_spend(self.buyer.address, self.merchant.address, raw)
        if not ok:
            raise PermissionError(f"on-chain spending policy rejected payment: {reason}")
        token = self.registry.w3.eth.contract(address=Web3.to_checksum_address(run["token"]["address"]), abi=ERC20_BALANCE_ABI)
        balance = token.functions.balanceOf(self.buyer.address).call()
        if balance < raw:
            raise ValueError(f"payer balance {balance} is below token_total_raw {raw}; fund the payer wallet manually")
        run["prepare"] = prep
        return prep

    # ---------- phase 1: up to the first human approval ----------

    async def start(self, instruction: str) -> dict:
        run = {"id": uuid.uuid4().hex[:12], "instruction": instruction, "created_at": _now(), "state": "running", "steps": [],
               "payer": self.buyer.address, "payee": self.merchant.address, "merchant_name": settings.hsp_team_name}
        try:
            intent = self.buyer.parse_intent(instruction)
            if not intent["targets"]:
                raise ValueError("no wallet address found in the instruction")
            run["intent"] = intent
            self._step(run, "intent", "Payment agent understood the task", f"{intent['product']} for {len(intent['targets'])} wallet(s)", intent=intent)

            config = await self.hsp.call("get_chain_config", {})
            tok = select_token(config, settings.network.name, settings.network.chain_id, settings.hsp_coin)
            run["token"] = {"symbol": settings.hsp_coin, "address": tok["address"], "decimals": int(tok["decimals"]),
                            "protocol": tok.get("payment_protocol") or tok.get("protocol"),
                            "network": tok.get("network", settings.network.name), "chain_id": int(tok.get("chain_id", settings.network.chain_id))}
            self._step(run, "config", "HSP chain configuration loaded", f"{settings.hsp_coin} on {run['token']['network']} · {run['token']['protocol']}", token=run["token"])

            before = self.registry.trust_score(self.buyer.address)
            quote = self.merchant.quote(self.buyer.address, intent["product"], intent["targets"])
            run["trust_before"], run["terms"] = before, quote["terms"]
            terms_text = "pay before delivery" if quote["terms"] == "PREPAY" else f"deliver now, pay within {quote['net_days']} days"
            self._step(run, "trust", "Receiving agent checked payer trust on-chain", f"Trust {before} → {quote['terms']}: {terms_text}",
                       trust_score=before, terms=quote["terms"], net_days=quote["net_days"], credit_limit=quote["credit_limit"], total_usd=str(quote["total_usd"]))

            order = await self.hsp.call("create_order", {
                "merchant_name": settings.hsp_team_name,
                "pay_to": self.merchant.address,
                "cart_mandate": self.merchant.cart_mandate(quote, run["token"]),
            })
            run["order"] = order
            self._step(run, "order", "Receiving agent created HSP order (Cart Mandate)", f"flow {order['flow_id']}",
                       flow_id=order["flow_id"], payment_request_id=order.get("payment_request_id"), payment_url=order.get("payment_url"))

            details = await self.hsp.call("get_order", {"flow_id": order["flow_id"]})
            run["gas_fee_advanced"] = _find(details, "gas_fee_advanced")
            await self._prepare(run)
            self._step(run, "prepare", "Payment agent verified order, policy and balance; quote locked",
                       "pay_to ✓ · payer ✓ · budget ✓ · on-chain spending policy ✓ · balance ✓", **self._approval_view(run),
                       gas_fee_advanced=run["gas_fee_advanced"])

            if quote["terms"] != "PREPAY":
                due = int(time.time()) + quote["net_days"] * 86400
                tab_tx = self.registry.open_tab("0x" + run["prepare"]["cart_hash"], self.buyer.address, self.merchant.address,
                                                run["token"]["address"], int(run["prepare"]["token_total_raw"]), quote["terms"], due)
                run["reports"] = self.merchant.deliver(intent["product"], intent["targets"])
                self._step(run, "tab", f"Trusted payer: goods delivered first, {quote['terms']} tab opened on-chain",
                           f"Due in {quote['net_days']} days", tx=tab_tx, explorer=self._explorer_tx(tab_tx), reports=run["reports"])

            run["state"] = "awaiting_sign_approval"
            self._step(run, "approve_sign", "Waiting for your approval to sign", status="waiting", **self._approval_view(run))
            return store.save(run)
        except Exception as exc:
            return self._fail(run, exc)

    # ---------- phase 2: sign + finalize ----------

    async def approve_sign(self, run_id: str) -> dict:
        run = store.get(run_id)
        if run["state"] != "awaiting_sign_approval":
            raise ValueError(f"run is {run['state']}")
        try:
            run["steps"][-1]["status"] = "done"
            expires = run["prepare"].get("quote_expires_at")
            if expires and datetime.fromisoformat(expires.replace("Z", "+00:00")) <= datetime.now(timezone.utc):
                await self._prepare(run)
                self._step(run, "requote", "Quote expired; prepared a fresh quote", **self._approval_view(run))

            signature = self._sign(run["prepare"]["eip712"])
            final = await self.hsp.call("finalize_payment", {
                "signature": signature,
                "payment_payload": run["prepare"]["payment_payload"],
                "payment_mandate_contents": run["prepare"]["payment_mandate_contents"],
                "cart_hash": run["prepare"]["cart_hash"],
            })
            run["payment_mandate_json"] = final.get("payment_mandate_json", final)
            self._step(run, "sign", f"Payment Mandate signed ({run['prepare']['eip712'].get('primaryType')}) and finalized by HSP",
                       "Signature over the exact eip712 returned by prepare_payment", signature=signature[:18] + "…")
            run["state"] = "awaiting_submit_approval"
            self._step(run, "approve_submit", "Waiting for your approval to submit", status="waiting", **self._approval_view(run))
            return store.save(run)
        except Exception as exc:
            return self._fail(run, exc)

    def _sign(self, eip712: dict) -> str:
        """Sign exactly the returned EIP-712 data: domain, types, primaryType and message untouched."""
        signed = Account.from_key(settings.buyer_agent_key).sign_message(encode_typed_data(full_message=eip712))
        return "0x" + signed.signature.hex().removeprefix("0x")

    # ---------- phase 3: submit ----------

    async def approve_submit(self, run_id: str) -> dict:
        run = store.get(run_id)
        if run["state"] != "awaiting_submit_approval":
            raise ValueError(f"run is {run['state']}")
        try:
            run["steps"][-1]["status"] = "done"
            sub = await self.hsp.call("submit_payment", {"payment_mandate_json": run["payment_mandate_json"]})
            status = _find(sub, "status") or "payment-submitted"
            run["payment_status"] = status
            self._step(run, "submit", "Submitted to HSP Gateway", f"Status: {status} (not final yet)", status_value=status)
            run["state"] = "settling"
            return store.save(run)
        except HSPToolError as exc:
            if QUOTE_EXPIRED_CODE in str(exc):
                run["state"] = "awaiting_sign_approval"
                await self._prepare(run)
                self._step(run, "requote", "Gateway returned 30043 (quote expired): fresh quote, sign again", status="waiting", **self._approval_view(run))
                return store.save(run)
            return self._fail(run, exc)
        except Exception as exc:
            return self._fail(run, exc)

    # ---------- phase 4: poll, anchor, update trust ----------

    async def refresh(self, run_id: str) -> dict:
        run = store.get(run_id)
        if run["state"] != "settling":
            return run
        try:
            res = await self.hsp.call("query_payment", {
                "flow_id": run["order"]["flow_id"],
                "payment_request_id": run["order"].get("payment_request_id"),
                "expected_merchant_name": settings.hsp_team_name,
            })
            payment = res.get("payment", res)
            status = payment.get("status")
            run["payment"] = payment
            run["attribution_verified"] = res.get("attribution_verified")
            if status != run.get("payment_status"):
                run["payment_status"] = status
                self._step(run, "status", f"HSP status: {status}", payment.get("status_reason") or "",
                           tx=payment.get("tx_signature") or None, attribution_verified=run["attribution_verified"])

            if status in DONE:
                await self._anchor(run, payment)
            elif status == "payment-failed":
                run["state"] = "failed"
            elif status not in POLLING:
                self._step(run, "status", "Unrecognised HSP status", str(status), status="error")
            return store.save(run)
        except Exception as exc:
            # A failed query is not a failed payment: keep identifiers and keep polling.
            self._step(run, "query_error", "Query failed, will retry", str(exc), status="error")
            return store.save(run)

    async def _anchor(self, run: dict, payment: dict):
        tx = payment.get("tx_signature")
        mandate_hash = "0x" + run["prepare"]["cart_hash"]
        # Idempotent: a retried poll after a partial failure must not try to anchor twice.
        anchor_tx = run.get("anchor_tx")
        if not anchor_tx and not self.registry.is_settled(mandate_hash):
            anchor_tx = self.registry.record_settlement(
                mandate_hash, self.buyer.address, self.merchant.address, run["token"]["address"],
                int(run["prepare"]["token_total_raw"]), run["order"]["flow_id"], tx,
            )
            run["anchor_tx"] = anchor_tx
        after = self.registry.trust_score(self.buyer.address)
        next_terms = self.registry.terms_for(self.buyer.address)
        run.update(state="settled", trust_after=after, next_terms=next_terms)
        final_text = ("Final confirmation reached." if payment.get("status") == "payment-finalized"
                      else "On-chain with half the required confirmations; not yet finalized.")
        self._step(run, "settled", "Payment settled through HSP", final_text, tx=tx, explorer=self._explorer_tx(tx) if tx else None)
        self._step(run, "anchor", "Settlement anchored, trust updated", f"Trust {run['trust_before']} → {after} · next terms: {next_terms['terms']}",
                   tx=anchor_tx, explorer=self._explorer_tx(anchor_tx) if anchor_tx else None, trust_before=run["trust_before"], trust_after=after, next_terms=next_terms)
        if run["terms"] == "PREPAY":
            run["reports"] = self.merchant.deliver(run["intent"]["product"], run["intent"]["targets"])
            self._step(run, "deliver", "Goods delivered", f"{len(run['reports'])} report(s)", reports=run["reports"])


def _find(node, key):
    """First value for `key` anywhere in a nested response."""
    if isinstance(node, dict):
        if key in node:
            return node[key]
        for v in node.values():
            found = _find(v, key)
            if found is not None:
                return found
    elif isinstance(node, list):
        for v in node:
            found = _find(v, key)
            if found is not None:
                return found
    return None
