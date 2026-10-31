import asyncio
from decimal import Decimal

import pytest
from eth_abi import encode
from eth_account import Account
from eth_account.messages import encode_typed_data
from web3 import Web3

from app.hsp.cart_mandate import LineItem, build_contents
from app.hsp.mcp_client import HSPToolError, fit_arguments
from app.hsp.networks import HASHKEY_MAINNET
from app.hsp.signing import canonical_json

# DOMAIN_SEPARATOR() read from USDC (0x054e...8D0a) on HashKey Chain mainnet.
ONCHAIN_USDC_DOMAIN_SEPARATOR = "78101f50ab6b299bde76a9973e97b1c9ead7df26f6a40692f4440296a507259d"

TOKEN = {"symbol": "USDC", "address": "0x8FE3cB719Ee4410E236Cd6b72ab1fCDC06eF53c6", "decimals": 6,
         "protocol": "eip3009", "network": "hashkey-testnet", "chain_id": 133}


def test_canonical_json_matches_spec_example():
    assert canonical_json({"b": 2, "a": 1, "nested": {"z": "last", "m": "middle"}}) == '{"a":1,"b":2,"nested":{"m":"middle","z":"last"}}'


def test_cart_contents_follow_hsp_requirements():
    c = build_contents("CRED-1", "CRED-1-PAY", "Credence", "0x99c1aA23e3a5A9C5c8E1F7D6E6b1a5C4e3D2B1A0",
                       [LineItem("Risk report", Decimal("0.10")), LineItem("Risk report", Decimal("0.10"))], TOKEN)
    m = c["payment_request"]["method_data"][0]
    assert m["supported_methods"] == "https://www.x402.org/"
    assert m["data"]["x402Version"] == 2 and m["data"]["chain_id"] == 133
    assert c["payment_request"]["details"]["total"]["amount"] == {"currency": "USD", "value": "0.20"}
    assert c["cart_expiry"].endswith("Z") and "merchant_authorization" not in c


def test_fit_arguments_uses_live_schema_names_only():
    schema = {"properties": {"flow_id": {}, "payer_address": {}, "protocol": {}}, "required": ["flow_id", "payer_address"]}
    args = fit_arguments("prepare_payment", schema, {"flow_id": "f1", "payer|payer_address": "0xabc", "protocol|payment_protocol": "eip3009", "junk": 1})
    assert args == {"flow_id": "f1", "payer_address": "0xabc", "protocol": "eip3009"}


def test_fit_arguments_refuses_to_guess_missing_required():
    with pytest.raises(HSPToolError, match="cannot satisfy required parameters"):
        fit_arguments("prepare_payment", {"properties": {"wallet": {}}, "required": ["wallet"]}, {"payer": "0xabc"})


def test_select_token_reads_chain_config():
    from app.agents.a2a_flow import select_token
    config = {"networks": [{"network": "hashkey-testnet", "chain_id": 133, "tokens": [
        {"symbol": "USDT", "address": "0x3723", "decimals": 6, "payment_protocol": "permit2"},
        {"symbol": "USDC", "address": "0x8FE3", "decimals": 6, "payment_protocol": "eip3009"}]}]}
    tok = select_token(config, "hashkey-testnet", 133, "USDC")
    assert tok["address"] == "0x8FE3" and tok["payment_protocol"] == "eip3009"
    with pytest.raises(ValueError):
        select_token(config, "hashkey", 177, "USDC")


def test_usdc_domain_matches_mainnet_contract():
    typehash = Web3.keccak(text="EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
    separator = Web3.keccak(encode(
        ["bytes32", "bytes32", "bytes32", "uint256", "address"],
        [typehash, Web3.keccak(text="Bridged USDC"), Web3.keccak(text="2"), 177, HASHKEY_MAINNET.tokens["USDC"].address],
    ))
    assert separator.hex().removeprefix("0x") == ONCHAIN_USDC_DOMAIN_SEPARATOR


# ---------------- full flow against a fake HSP MCP server ----------------

def _eip712(payer, pay_to, value):
    return {
        "types": {
            "EIP712Domain": [{"name": "name", "type": "string"}, {"name": "version", "type": "string"},
                             {"name": "chainId", "type": "uint256"}, {"name": "verifyingContract", "type": "address"}],
            "TransferWithAuthorization": [{"name": "from", "type": "address"}, {"name": "to", "type": "address"},
                                          {"name": "value", "type": "uint256"}, {"name": "validAfter", "type": "uint256"},
                                          {"name": "validBefore", "type": "uint256"}, {"name": "nonce", "type": "bytes32"}]},
        "primaryType": "TransferWithAuthorization",
        "domain": {"name": "USDC", "version": "2", "chainId": 133, "verifyingContract": TOKEN["address"]},
        "message": {"from": payer, "to": pay_to, "value": value, "validAfter": 0, "validBefore": 9999999999, "nonce": "0x" + "11" * 32},
    }


class FakeHSP:
    def __init__(self, payer, pay_to):
        self.payer, self.pay_to, self.calls, self.signature = payer, pay_to, [], None
        # payment agent polls twice; the receiving agent then re-verifies independently
        self.statuses = ["payment-processing", "payment-finalized", "payment-finalized"]

    async def call(self, tool, args):
        self.calls.append((tool, args))
        if tool == "get_chain_config":
            return {"networks": [{"network": "hashkey-testnet", "chain_id": 133, "tokens": [
                {"symbol": "USDC", "address": TOKEN["address"], "decimals": 6, "payment_protocol": "eip3009"}]}]}
        if tool == "create_order":
            assert "merchant_authorization" not in args["cart_mandate"]["contents"]
            return {"flow_id": "flow_1", "payment_request_id": "CRED-PAY", "payment_url": "https://pay/flow_1"}
        if tool == "get_order":
            return {"order": {"gas_fee_advanced": True}}
        if tool == "prepare_payment":
            return {"eip712": _eip712(self.payer, self.pay_to, 200000), "cart_hash": "ab" * 32, "token_total_raw": "200000",
                    "quote_expires_at": "2099-01-01T00:00:00Z", "pay_to": self.pay_to, "payer": self.payer,
                    "payment_request_id": "CRED-PAY", "payment_payload": {"payload": {"signature": ""}}, "payment_mandate_contents": {"x": 1}}
        if tool == "finalize_payment":
            self.signature = args["signature"]
            return {"payment_mandate_json": {"mandate": "jwt"}}
        if tool == "submit_payment":
            return {"status": "payment-submitted"}
        if tool == "query_payment":
            status = self.statuses.pop(0)
            return {"attribution_verified": True, "payment": {"status": status, "tx_signature": "0x" + "cd" * 32 if status != "payment-processing" else ""}}
        raise AssertionError(tool)


class FakeRegistry:
    def __init__(self, allow=True):
        self.allow, self.settled, self.score, self.tabs = allow, [], 500, []
        self.w3 = self

    # web3-ish shim for the balance check
    @property
    def eth(self):
        return self

    def contract(self, address, abi):
        return self

    @property
    def functions(self):
        return self

    def balanceOf(self, a):
        return self

    def call(self):
        return 10**9

    def trust_score(self, a): return self.score
    def trust_score_after(self, a, previous): return self.score
    def terms_for(self, a): return {"terms": "PREPAY", "credit_limit": 0, "net_days": 0}
    def check_spend(self, a, m, amt): return (True, "") if self.allow else (False, "exceeds daily cap")
    def is_settled(self, h): return h in self.settled
    def open_tab(self, *a): self.tabs.append(a); return "0x" + "ee" * 32

    def record_settlement(self, h, *a):
        self.settled.append(h)
        self.score += 15
        return "0x" + "aa" * 32


@pytest.fixture
def flow(monkeypatch, tmp_path):
    buyer, merchant = Account.create(), Account.create()
    from app import config
    monkeypatch.setattr(config, "settings", config.Settings(**{**config.settings.__dict__, "buyer_agent_key": buyer.key.hex(),
                        "merchant_agent_key": merchant.key.hex(), "data_dir": tmp_path}))
    import importlib
    import app.agents.a2a_flow as af
    import app.agents.buyer_agent as ba
    import app.agents.merchant_agent as ma
    import app.a2a.protocol as proto
    import app.a2a.merchant_service as ms
    from app.a2a.client import A2AClient
    for mod in (ba, ma, af, proto, ms):
        monkeypatch.setattr(mod, "settings", config.settings)
    monkeypatch.setattr(af, "store", af.RunStore())

    f = af.A2AFlow.__new__(af.A2AFlow)
    f.registry = FakeRegistry()
    f.merchant = ma.MerchantAgent(f.registry)
    f.buyer = ba.BuyerAgent(f.registry, buyer.key.hex())
    f.persona, f.rail, f.rail_label = "nova", "hsp", "HSP"
    f.merchant.deliver = lambda product, targets: [{"wallet": t, "credit_score": 700} for t in targets]
    f.hsp = FakeHSP(buyer.address, merchant.address)
    f.service = ms.MerchantService(registry=f.registry, merchant=f.merchant, rail_override=f.hsp)
    f.peer = A2AClient.in_process(f.service)
    return f, buyer


def _confirmed(f):
    from app.agents import a2a_flow as af
    return {"merchant_name": af.settings.hsp_team_name, "pay_to": f.merchant.address, "payer": f.buyer.address}


def test_full_a2a_flow_with_two_human_approvals(flow):
    f, buyer = flow
    run = asyncio.run(f.start("Buy a risk report for 0x2988f0bE02e1a679430aEb4A6B9B10429F1e8e80 under $1", _confirmed(f)))
    assert run["state"] == "awaiting_sign_approval", run["steps"][-1]
    assert run["steps"][-1]["data"]["token_total_raw"] == "200000"
    assert f.hsp.signature is None  # nothing signed before approval

    run = asyncio.run(f.approve_sign(run["id"]))
    assert run["state"] == "awaiting_submit_approval"
    recovered = Account.recover_message(encode_typed_data(full_message=_eip712(buyer.address, f.merchant.address, 200000)), signature=f.hsp.signature)
    assert recovered == buyer.address
    assert not any(t == "submit_payment" for t, _ in f.hsp.calls)  # nothing submitted before second approval

    run = asyncio.run(f.approve_submit(run["id"]))
    assert run["state"] == "settling"
    run = asyncio.run(f.refresh(run["id"]))
    assert run["state"] == "settling"  # processing: keep polling
    run = asyncio.run(f.refresh(run["id"]))
    assert run["state"] == "settled"
    assert run["report"]["Payment status"] == "payment-finalized" and run["report"]["Team attribution verified"] is True
    assert run["steps"][-1]["key"] == "a2a_done"
    assert run["trust_after"] == 515 and f.registry.settled == [run["mandate_hash"]]
    # the whole conversation went over A2A JSON-RPC
    methods = [w["kind"] for w in run["wire"] if w["dir"] == "out"]
    assert methods == ["GET agent-card", "message/send", "message/send", "message/send"]
    assert f.service.store.get(run["a2a"]["task_id"])["status"]["state"] == "completed"
    assert run["reports"][0]["credit_score"] == 700

    query = [a for t, a in f.hsp.calls if t == "query_payment"][0]
    from app.agents import a2a_flow as af
    assert query["expected_merchant_name"] == af.settings.hsp_team_name


def test_spending_policy_blocks_before_any_signature(flow):
    f, _ = flow
    f.registry.allow = False
    run = asyncio.run(f.start("Buy a risk report for 0x2988f0bE02e1a679430aEb4A6B9B10429F1e8e80", _confirmed(f)))
    assert run["state"] == "failed"
    assert "exceeds daily cap" in run["steps"][-1]["detail"]
    assert f.hsp.signature is None


def test_approvals_must_happen_in_order(flow):
    f, _ = flow
    run = asyncio.run(f.start("Buy a risk report for 0x2988f0bE02e1a679430aEb4A6B9B10429F1e8e80", _confirmed(f)))
    with pytest.raises(ValueError):
        asyncio.run(f.approve_submit(run["id"]))


# ---------------- A2A protocol ----------------

def test_agent_card_advertises_ap2_and_skills(flow):
    f, _ = flow
    card = asyncio.run(f.peer.card())
    assert card["protocolVersion"] == "0.3.0" and card["preferredTransport"] == "JSONRPC"
    assert any(e["uri"].startswith("https://github.com/google-agentic-commerce/ap2") and e["required"] for e in card["capabilities"]["extensions"])
    assert {s["id"] for s in card["skills"]} == {"risk_report", "trust_attestation", "portfolio_scan"}
    assert card["payment"]["payTo"] == f.merchant.address


def test_impersonating_a_trusted_payer_is_rejected(flow):
    """An agent cannot claim another wallet's trust: the quote needs that wallet's signature."""
    f, _ = flow
    from app.a2a import protocol as p
    impostor, victim = Account.create(), Account.create()
    proof = p.sign_identity(impostor.key.hex(), "ctx_x")
    task = asyncio.run(f.peer.send([
        p.data_part(p.QUOTE_REQUEST, {"product": "risk_report", "targets": ["0x2988f0bE02e1a679430aEb4A6B9B10429F1e8e80"],
                                      "payer": victim.address, "rail": "hsp", "token": TOKEN}),
        p.data_part(p.IDENTITY, {**proof, "payer": victim.address})], context_id="ctx_x"))
    assert task["status"]["state"] == "rejected"
    assert not any(t == "create_order" for t, _ in f.hsp.calls)


def test_receiving_agent_does_not_anchor_on_payer_word(flow):
    f, _ = flow
    f.hsp.statuses = ["payment-processing"]
    run = asyncio.run(f.start("Buy a risk report for 0x2988f0bE02e1a679430aEb4A6B9B10429F1e8e80", _confirmed(f)))
    from app.a2a import protocol as p
    task = asyncio.run(f.peer.send([p.data_part(p.SETTLEMENT_NOTICE, {"flow_id": run["order"]["flow_id"], "tx": "0xfake"})],
                                   task_id=run["a2a"]["task_id"], context_id=run["a2a"]["context_id"]))
    assert task["status"]["state"] == "working"
    assert f.registry.settled == []


def test_unknown_rpc_method_returns_jsonrpc_error(flow):
    f, _ = flow
    from app.a2a.client import A2AError
    with pytest.raises(A2AError, match="-32601"):
        asyncio.run(f.peer.rpc("tasks/cancel", {"id": "x"}))


def test_hsp_order_needs_user_confirmation_of_team_recipient_and_payer(flow):
    """HSP guide step 6: merchant_name, pay_to and payer are confirmed before create_order."""
    f, _ = flow
    run = asyncio.run(f.start("Buy a risk report for 0x2988f0bE02e1a679430aEb4A6B9B10429F1e8e80"))
    assert run["state"] == "failed" and "not confirmed" in run["steps"][-1]["detail"]
    wrong = {**_confirmed(f), "pay_to": Account.create().address}
    run = asyncio.run(f.start("Buy a risk report for 0x2988f0bE02e1a679430aEb4A6B9B10429F1e8e80", wrong))
    assert run["state"] == "failed"
    assert not any(t == "create_order" for t, _ in f.hsp.calls)
