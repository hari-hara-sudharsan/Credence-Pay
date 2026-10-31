"""Agent-to-agent purchase over the A2A protocol, paid through HSP Agentic Payment.

Flow (A2A + AP2 mandates, HSP Agentic Payment guide):
  intent -> discover receiving agent (Agent Card) -> get_chain_config
  -> A2A message/send: IntentMandate + quote request + wallet identity proof
  <- Task(input-required): CartMandate (HSP create_order by the receiving agent) + trust terms
  -> get_order + prepare_payment -> HUMAN APPROVAL -> sign eip712 -> finalize_payment
  -> HUMAN APPROVAL -> submit_payment -> A2A: PaymentMandate
  -> query_payment polling -> A2A: SettlementNotice
  <- Task(completed): receiving agent re-verified the rail, anchored on-chain, delivered goods.
"""

import json
import time
import uuid
from datetime import datetime, timezone
from decimal import Decimal

from eth_account import Account
from eth_account.messages import encode_typed_data
from web3 import Web3

from app.a2a import protocol as a2a
from app.a2a.client import A2AClient
from app.agents.buyer_agent import BuyerAgent
from app.agents.merchant_agent import MerchantAgent
from app.agents.personas import PERSONAS, persona_key
from app.chain.registry import TrustRegistry
from app.config import settings
from app.hsp.mcp_client import HSPAgenticPayment, HSPToolError, flatten_error, probe
from app.hsp.sandbox_rail import SandboxRail

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
    """The payment agent's side of a purchase. It reaches the receiving agent only over A2A."""

    def __init__(self, persona: str = "nova", rail: str | None = None):
        self.persona = persona
        self.rail = rail or settings.default_rail
        self.registry = TrustRegistry()
        self.merchant = MerchantAgent(self.registry)  # used only to host the in-process receiving agent
        self.buyer = BuyerAgent(self.registry, persona_key(persona))
        self.rail_label = "HSP" if self.rail == "hsp" else "sandbox rail"
        self.hsp = (HSPAgenticPayment(settings.hsp_mcp_url) if self.rail == "hsp"
                    else SandboxRail(self.registry.w3, settings.merchant_agent_key))
        self.peer = self._peer()

    @staticmethod
    def _peer() -> A2AClient:
        """A remote receiving agent if MERCHANT_AGENT_URL is set; otherwise the one hosted by this process."""
        if settings.merchant_agent_url:
            return A2AClient(settings.merchant_agent_url)
        from app.a2a.merchant_service import service
        return A2AClient.in_process(service())

    @classmethod
    def for_run(cls, run_id: str) -> "A2AFlow":
        run = store.get(run_id)
        return cls(run.get("persona", "nova"), run.get("rail", "hsp"))

    # ---------- helpers ----------

    def _step(self, run: dict, key: str, title: str, detail: str = "", status: str = "done", **data):
        run["steps"].append({"key": key, "title": title, "detail": detail, "status": status, "data": data, "at": _now()})

    def _save(self, run: dict) -> dict:
        """Persist the run, moving any new A2A wire traffic onto it."""
        run.setdefault("wire", []).extend(self.peer.wire)
        self.peer.wire = []
        return store.save(run)

    def _fail(self, run: dict, exc: Exception, detail: str | None = None) -> dict:
        run["state"] = "failed"
        self._step(run, "error", "Run stopped", detail or flatten_error(exc), status="error", error_type=type(exc).__name__)
        return self._save(run)

    async def _afail(self, run: dict, exc: Exception) -> dict:
        """Fail the run with a reason a person can act on. HSP transport errors are probed for allowlist/TLS causes."""
        detail = flatten_error(exc)
        if self.rail == "hsp" and (isinstance(exc, BaseExceptionGroup | ConnectionError) or "MCPError" in detail):
            diag = await probe(settings.hsp_mcp_url)
            if diag.get("hint"):
                detail = f"{diag['hint']} No order was created and nothing was signed." if run["state"] == "running" else diag["hint"]
        return self._fail(run, exc, detail)

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
        # The rail's pay_to must equal what the receiving agent stated over A2A (Agent Card + Cart Mandate).
        if prep["pay_to"].lower() != run["payee"].lower():
            raise ValueError("prepare_payment pay_to does not match the receiving agent's Cart Mandate")
        if prep["payer"].lower() != self.buyer.address.lower():
            raise ValueError("prepare_payment payer does not match the payment agent wallet")

        raw = int(prep["token_total_raw"])
        budget = run["intent"].get("max_budget_usd")
        if budget is not None and Decimal(raw) / (10 ** run["token"]["decimals"]) > Decimal(str(budget)) * Decimal("1.05"):
            raise ValueError(f"quote {raw} raw units exceeds the intent budget of {budget} USD")
        ok, reason = self.registry.check_spend(self.buyer.address, run["payee"], raw)
        if not ok:
            raise PermissionError(f"on-chain spending policy rejected payment: {reason}")
        token = self.registry.w3.eth.contract(address=Web3.to_checksum_address(run["token"]["address"]), abi=ERC20_BALANCE_ABI)
        balance = token.functions.balanceOf(self.buyer.address).call()
        if balance < raw:
            raise ValueError(f"payer balance {balance} is below token_total_raw {raw}; fund the payer wallet manually")
        run["prepare"] = prep
        return prep

    # ---------- phase 1: discovery, A2A quote, up to the first human approval ----------

    async def preflight(self) -> dict:
        """The three values the HSP guide requires the user to confirm, one at a time, before create_order."""
        card = await self.peer.card()
        return {"merchant_name": settings.hsp_team_name, "pay_to": card["payment"]["payTo"], "payer": self.buyer.address,
                "rail": self.rail, "network": settings.network.name, "chain_id": settings.network.chain_id,
                "agent": card["name"], "confirmation_required": self.rail == "hsp"}

    @staticmethod
    def _check_confirmed(expected: dict, confirmed: dict | None):
        """HSP rail: refuse to create an order unless the user confirmed exactly these values."""
        confirmed = confirmed or {}
        for key in ("merchant_name", "pay_to", "payer"):
            if str(confirmed.get(key, "")).lower() != str(expected[key]).lower():
                raise PermissionError(f"{key} was not confirmed by the user ({expected[key]}); confirm it before an HSP order is created")

    async def start(self, instruction: str, confirmed: dict | None = None) -> dict:
        run = {"id": uuid.uuid4().hex[:12], "instruction": instruction, "created_at": _now(), "state": "running", "steps": [],
               "persona": self.persona, "persona_name": PERSONAS[self.persona]["name"], "rail": self.rail,
               "payer": self.buyer.address, "payee": None, "merchant_name": settings.hsp_team_name, "wire": []}
        try:
            intent = self.buyer.parse_intent(instruction)
            if not intent["targets"]:
                raise ValueError("no wallet address found in the instruction")
            run["intent"] = intent
            self._step(run, "intent", "Payment agent understood the task", f"{intent['product']} for {len(intent['targets'])} wallet(s)", intent=intent)

            card = await self.peer.card()
            ap2 = any(e.get("uri") == a2a.AP2_EXTENSION for e in card.get("capabilities", {}).get("extensions", []))
            if not ap2:
                raise ValueError("receiving agent does not support AP2 payment mandates")
            if intent["product"] not in {s["id"] for s in card.get("skills", [])}:
                raise ValueError(f"receiving agent does not offer {intent['product']}")
            run["payee"] = card["payment"]["payTo"]
            run["a2a"] = {"agent": card["name"], "endpoint": card["url"], "protocol": card["protocolVersion"]}
            self._step(run, "discover", f"Discovered {card['name']} via A2A Agent Card",
                       f"A2A {card['protocolVersion']} · AP2 mandates · {len(card['skills'])} skills · pay_to {run['payee'][:8]}…",
                       endpoint=card["url"], skills=[s["id"] for s in card["skills"]])

            expected = {"merchant_name": settings.hsp_team_name, "pay_to": run["payee"], "payer": self.buyer.address}
            if self.rail == "hsp":
                self._check_confirmed(expected, confirmed)
            if confirmed:
                self._step(run, "confirm", "You confirmed team, recipient and payer",
                           f"{expected['merchant_name']} · pay_to {expected['pay_to'][:8]}… · payer {expected['payer'][:8]}…", **expected)

            config = await self.hsp.call("get_chain_config", {})
            coin = settings.hsp_coin if self.rail == "hsp" else "cUSD"
            tok = select_token(config, settings.network.name, settings.network.chain_id, coin)
            run["token"] = {"symbol": coin, "address": tok["address"], "decimals": int(tok["decimals"]),
                            "protocol": tok.get("payment_protocol") or tok.get("protocol"),
                            "network": tok.get("network", settings.network.name), "chain_id": int(tok.get("chain_id", settings.network.chain_id))}
            self._step(run, "config", "HSP chain configuration loaded" if self.rail == "hsp" else "Sandbox rail configuration loaded (HSK testnet, cUSD)", f"{coin} on {run['token']['network']} · {run['token']['protocol']}", token=run["token"])

            # A2A message 1: Intent Mandate + quote request, bound to this wallet by a signature.
            context_id = a2a.new_id("ctx_")
            task = await self.peer.send([
                a2a.data_part(a2a.INTENT_MANDATE, {"natural_language_description": instruction, "user_cart_confirmation_required": False,
                                                   "merchants": [card["name"]], "requires_refundability": False,
                                                   "intent_expiry": datetime.fromtimestamp(time.time() + 3600, timezone.utc).isoformat()}),
                a2a.data_part(a2a.QUOTE_REQUEST, {"product": intent["product"], "targets": intent["targets"], "payer": self.buyer.address,
                                                  "rail": self.rail, "token": run["token"], "max_budget_usd": intent.get("max_budget_usd")}),
                a2a.data_part(a2a.IDENTITY, a2a.sign_identity(self.buyer.key, context_id)),
            ], context_id=context_id)
            run["a2a"].update(task_id=task["id"], context_id=task["contextId"])
            self._step(run, "identity", "Payer identity proven to the receiving agent", "EIP-191 signature bound to the A2A context; the merchant recovers it before pricing")
            if task["status"]["state"] != "input-required":
                raise ValueError(f"receiving agent {task['status']['state']} the request: {a2a.status_text(task)}")

            out = a2a.parts_data(task)
            terms, cart = out[a2a.TERMS], out[a2a.CART_MANDATE]
            cart_pay_to = cart["contents"]["payment_request"]["method_data"][0]["data"]["pay_to"]
            if cart_pay_to.lower() != run["payee"].lower():
                raise ValueError("Cart Mandate pay_to differs from the Agent Card")
            before = terms["trust_score"]
            run["trust_before"], run["terms"] = before, terms["terms"]
            run["total_usd"], run["product"] = terms["total_usd"], intent["product"]
            terms_text = "pay before delivery" if terms["terms"] == "PREPAY" else f"deliver now, pay within {terms['net_days']} days"
            self._step(run, "trust", "Receiving agent checked payer trust on-chain", f"Trust {before} → {terms['terms']}: {terms_text}",
                       trust_score=before, terms=terms["terms"], net_days=terms["net_days"], credit_limit=terms["credit_limit"], total_usd=terms["total_usd"])

            run["order"] = {"flow_id": cart["flow_id"], "payment_request_id": cart.get("payment_request_id"), "payment_url": cart.get("payment_url")}
            run["mandate_hash"] = cart["mandate_hash"]
            self._step(run, "order", f"Cart Mandate received over A2A ({self.rail_label} order)", f"flow {cart['flow_id']} · {terms['total_usd']} USD",
                       flow_id=cart["flow_id"], payment_request_id=cart.get("payment_request_id"), payment_url=cart.get("payment_url"))

            if a2a.GOODS in out:
                goods = out[a2a.GOODS]
                run["reports"] = goods["reports"]
                self._step(run, "tab", f"Trusted payer: goods delivered first, {terms['terms']} tab opened on-chain",
                           f"Due in {terms['net_days']} days", tx=goods.get("tab_tx"), explorer=self._explorer_tx(goods["tab_tx"]) if goods.get("tab_tx") else None,
                           reports=run["reports"])

            details = await self.hsp.call("get_order", {"flow_id": run["order"]["flow_id"]})
            run["gas_fee_advanced"] = _find(details, "gas_fee_advanced")
            await self._prepare(run)
            self._step(run, "prepare", "Payment agent verified order, policy and balance; quote locked",
                       "pay_to ✓ · payer ✓ · budget ✓ · on-chain spending policy ✓ · balance ✓", **self._approval_view(run),
                       gas_fee_advanced=run["gas_fee_advanced"])

            run["state"] = "awaiting_sign_approval"
            self._step(run, "approve_sign", "Waiting for your approval to sign", status="waiting", **self._approval_view(run))
            return self._save(run)
        except Exception as exc:
            return await self._afail(run, exc)

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
            self._step(run, "sign", f"Payment Mandate signed ({run['prepare']['eip712'].get('primaryType')}) and finalized by {self.rail_label}",
                       "Signature over the exact eip712 returned by prepare_payment", signature=signature[:18] + "…")
            run["state"] = "awaiting_submit_approval"
            self._step(run, "approve_submit", "Waiting for your approval to submit", status="waiting", **self._approval_view(run))
            return self._save(run)
        except Exception as exc:
            return await self._afail(run, exc)

    def _sign(self, eip712: dict) -> str:
        """Sign exactly the returned EIP-712 data: domain, types, primaryType and message untouched."""
        signed = Account.from_key(self.buyer.key).sign_message(encode_typed_data(full_message=eip712))
        return "0x" + signed.signature.hex().removeprefix("0x")

    # ---------- phase 3: submit, then hand the Payment Mandate to the receiving agent ----------

    async def approve_submit(self, run_id: str) -> dict:
        run = store.get(run_id)
        if run["state"] != "awaiting_submit_approval":
            raise ValueError(f"run is {run['state']}")
        try:
            run["steps"][-1]["status"] = "done"
            sub = await self.hsp.call("submit_payment", {"payment_mandate_json": run["payment_mandate_json"]})
            status = _find(sub, "status") or "payment-submitted"
            run["payment_status"] = status
            self._step(run, "submit", "Submitted to HSP Gateway" if self.rail == "hsp" else "Submitted: receiving agent relays the authorisation on-chain", f"Status: {status} (not final yet)", status_value=status)

            task = await self.peer.send([a2a.data_part(a2a.PAYMENT_MANDATE, {
                "flow_id": run["order"]["flow_id"], "payment_request_id": run["order"].get("payment_request_id"),
                "payer": self.buyer.address, "payment_mandate_contents": run["prepare"]["payment_mandate_contents"],
                "user_authorization": run["payment_mandate_json"], "rail_status": status})],
                task_id=run["a2a"]["task_id"], context_id=run["a2a"]["context_id"])
            self._step(run, "mandate", "Payment Mandate delivered to the receiving agent over A2A", a2a.status_text(task),
                       a2a_state=task["status"]["state"])
            run["state"] = "settling"
            run["submitted_at"] = _now()
            return self._save(run)
        except HSPToolError as exc:
            if QUOTE_EXPIRED_CODE in str(exc):
                run["state"] = "awaiting_sign_approval"
                await self._prepare(run)
                self._step(run, "requote", "Gateway returned 30043 (quote expired): fresh quote, sign again", status="waiting", **self._approval_view(run))
                return self._save(run)
            return self._fail(run, exc)
        except Exception as exc:
            return await self._afail(run, exc)

    # ---------- phase 4: poll the rail; receiving agent verifies, anchors, delivers ----------

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
                self._step(run, "status", f"{self.rail_label} status: {status}", payment.get("status_reason") or "",
                           tx=payment.get("tx_signature") or None, attribution_verified=run["attribution_verified"])

            run["report"] = self._report(run, payment)
            if status in DONE:
                await self._settle(run, payment)
            elif status == "payment-failed":
                run["state"] = "failed"
                self._step(run, "error", "Payment failed", payment.get("status_reason") or "No status_reason returned", status="error")
            elif status not in POLLING:
                self._step(run, "status", f"Unrecognised {self.rail_label} status", str(status), status="error")
            elif self._pending_too_long(run) and not any(s["key"] == "pending" for s in run["steps"]):
                # Guide: after 10 minutes, report "Pending confirmation" with both identifiers and keep querying.
                self._step(run, "pending", "Pending confirmation",
                           f"flow_id {run['order']['flow_id']} · payment_request_id {run['order'].get('payment_request_id')}. Still querying the same payment.",
                           status="waiting")
            return self._save(run)
        except Exception as exc:
            # A failed query is not a failed payment: keep identifiers and keep polling.
            self._step(run, "query_error", "Query failed, will retry", str(exc), status="error")
            return self._save(run)

    @staticmethod
    def _pending_too_long(run: dict) -> bool:
        at = run.get("submitted_at")
        return bool(at) and (datetime.now(timezone.utc) - datetime.fromisoformat(at)).total_seconds() > 600

    def _report(self, run: dict, payment: dict) -> dict:
        """The guide's result report, filled only from returned or retained values."""
        na = "unavailable"
        return {
            "title": "HSP Agentic Payment — QA Result" if self.rail == "hsp" else "Credence sandbox rail — HSK testnet result (not HSP)",
            "Payment status": payment.get("status") or na,
            "Hackathon team": settings.hsp_team_name,
            "Team attribution verified": run.get("attribution_verified") if run.get("attribution_verified") is not None else na,
            "Network": payment.get("network") or na,
            "Raw authorization amount (raw units)": run.get("prepare", {}).get("token_total_raw") or na,
            "Recipient address": payment.get("to_pay_address") or na,
            "Payer address": payment.get("payer_address") or na,
            "Transaction hash": payment.get("tx_signature") or na,
        }

    async def _settle(self, run: dict, payment: dict):
        tx = payment.get("tx_signature")
        final_text = ("The payment has reached final confirmation." if payment.get("status") == "payment-finalized"
                      else "The transaction is on-chain and has received half of the required block confirmations. It is not yet finalized.")
        if not any(s["key"] == "settled" for s in run["steps"]):
            self._step(run, "settled", f"Payment settled through {self.rail_label}", final_text, tx=tx, explorer=self._explorer_tx(tx) if tx else None)

        task = await self.peer.send([a2a.data_part(a2a.SETTLEMENT_NOTICE, {"flow_id": run["order"]["flow_id"], "tx": tx})],
                                    task_id=run["a2a"]["task_id"], context_id=run["a2a"]["context_id"])
        if task["status"]["state"] != "completed":
            self._step(run, "verify_wait", "Receiving agent has not verified settlement yet", a2a.status_text(task), status="waiting")
            return
        out = a2a.parts_data(task)
        receipt = out[a2a.RECEIPT]
        run.update(state="settled", anchor_tx=receipt.get("anchor_tx"), trust_after=receipt["trust_after"], next_terms=receipt["next_terms"])
        self._step(run, "anchor", "Receiving agent verified the rail independently, anchored settlement, trust updated",
                   f"Trust {run['trust_before']} → {receipt['trust_after']} · next terms: {receipt['next_terms']['terms']}",
                   tx=receipt.get("anchor_tx"), explorer=self._explorer_tx(receipt["anchor_tx"]) if receipt.get("anchor_tx") else None,
                   trust_before=run["trust_before"], trust_after=receipt["trust_after"], next_terms=receipt["next_terms"])
        goods = out.get(a2a.GOODS)
        if goods and not goods.get("delivered_before_payment"):
            run["reports"] = goods["reports"]
            self._step(run, "deliver", "Goods delivered over A2A", f"{len(run['reports'])} report(s)", reports=run["reports"])
        self._step(run, "a2a_done", "A2A task completed", a2a.status_text(task))


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
