"""Web3 client for the Credence A2A contracts on HashKey Chain."""

import json
from functools import cached_property
from pathlib import Path

from eth_account import Account
from web3 import Web3

from app.chain.nonce import next_nonce

from app.config import settings

ABI_DIR = Path(__file__).parent / "abi"
TERMS = ["PREPAY", "NET", "CREDIT"]
ZERO32 = b"\x00" * 32


def _abi(name: str) -> list:
    return json.loads((ABI_DIR / f"{name}.json").read_text())


def to_bytes32(value: str) -> bytes:
    """Hex string -> bytes32; any other string (e.g. an HSP flow_id) -> keccak256."""
    if value.startswith("0x") and len(value) == 66:
        return bytes.fromhex(value[2:])
    return Web3.keccak(text=value)


class TrustRegistry:
    def __init__(self):
        self.w3 = Web3(Web3.HTTPProvider(settings.network.rpc, request_kwargs={"timeout": 30}))

    @property
    def enabled(self) -> bool:
        return bool(settings.registry_address and settings.policy_address)

    @cached_property
    def registry(self):
        return self.w3.eth.contract(address=Web3.to_checksum_address(settings.registry_address), abi=_abi("A2ASettlementRegistry"))

    @cached_property
    def policy(self):
        return self.w3.eth.contract(address=Web3.to_checksum_address(settings.policy_address), abi=_abi("AgentSpendingPolicy"))

    @cached_property
    def settler(self):
        return Account.from_key(settings.merchant_agent_key)

    # --- reads ---

    def trust_score(self, agent: str) -> int:
        return self.registry.functions.trustScore(Web3.to_checksum_address(agent)).call()

    def trust_score_after(self, agent: str, previous: int, attempts: int = 10) -> int:
        """Read the score after a write, tolerating an RPC node that lags a block behind."""
        import time
        score = self.trust_score(agent)
        for _ in range(attempts):
            if score != previous:
                break
            time.sleep(1)
            score = self.trust_score(agent)
        return score

    def terms_for(self, agent: str) -> dict:
        terms, limit, net_days = self.registry.functions.termsFor(Web3.to_checksum_address(agent)).call()
        return {"terms": TERMS[terms], "credit_limit": limit / 1e6, "net_days": net_days}

    def stats(self, agent: str) -> dict:
        s = self.registry.functions.getStats(Web3.to_checksum_address(agent)).call()
        keys = ["settled_count", "on_time_count", "late_count", "default_count", "settled_volume", "outstanding", "first_seen_at", "last_settled_at"]
        out = dict(zip(keys, s))
        out["settled_volume"] /= 1e6
        out["outstanding"] /= 1e6
        return out

    def check_spend(self, agent: str, merchant: str, amount_base_units: int) -> tuple[bool, str]:
        ok, reason = self.policy.functions.checkSpend(
            Web3.to_checksum_address(agent), Web3.to_checksum_address(merchant), amount_base_units
        ).call()
        return ok, reason

    def policy_of(self, agent: str) -> dict:
        owner, daily, per_tx, expires, any_merchant, paused = self.policy.functions.policies(Web3.to_checksum_address(agent)).call()
        spent = self.policy.functions.spentToday(Web3.to_checksum_address(agent)).call()
        return {
            "owner": owner, "daily_cap": daily / 1e6, "per_tx_cap": per_tx / 1e6, "expires_at": expires,
            "any_merchant": any_merchant, "paused": paused, "spent_today": spent / 1e6,
        }

    def is_settled(self, mandate_hash: str) -> bool:
        return self.registry.functions.getMandate(to_bytes32(mandate_hash)).call()[8] == 2  # Status.SETTLED

    def totals(self) -> dict:
        f = self.registry.functions
        prepay, net, credit = f.getVolumeByTerms().call()
        return {
            "total_settled": f.totalSettled().call(),
            "total_volume": f.totalVolume().call() / 1e6,
            "volume_by_terms": {"PREPAY": prepay / 1e6, "NET": net / 1e6, "CREDIT": credit / 1e6},
            "total_fees": f.totalFees().call() / 1e6,
            "total_defaulted": f.totalDefaulted().call() / 1e6,
            "fee_bps": f.feeBps().call(),
        }

    # --- writes (merchant agent acts as SETTLER) ---

    def record_settlement(self, mandate_hash: str, payer: str, payee: str, token: str, amount: int, hsp_flow_id: str, payment_tx: str) -> str:
        fn = self.registry.functions.recordSettlement(
            to_bytes32(mandate_hash), Web3.to_checksum_address(payer), Web3.to_checksum_address(payee),
            Web3.to_checksum_address(token), amount, to_bytes32(hsp_flow_id) if hsp_flow_id else ZERO32,
            to_bytes32(payment_tx) if payment_tx else ZERO32,
        )
        return self._send(fn)

    def open_tab(self, mandate_hash: str, payer: str, payee: str, token: str, amount: int, terms: str, due_at: int) -> str:
        fn = self.registry.functions.openTab(
            to_bytes32(mandate_hash), Web3.to_checksum_address(payer), Web3.to_checksum_address(payee),
            Web3.to_checksum_address(token), amount, TERMS.index(terms), due_at,
        )
        return self._send(fn)

    def overdue_tabs(self, lookback_blocks: int = 99_000) -> list[dict]:
        """Open tabs past their due date, found from TabOpened events and current mandate state.

        The public RPC caps log queries at 100k blocks, so only recent tabs are scanned.
        """
        import time
        from_block = max(0, self.w3.eth.block_number - lookback_blocks)
        logs = self.registry.events.TabOpened.get_logs(from_block=from_block)
        now = int(time.time())
        overdue = []
        for log in logs:
            h = log["args"]["mandateHash"]
            m = self.registry.functions.getMandate(h).call()
            status, due_at = m[8], m[5]
            if status == 1 and due_at < now:  # Status.OPEN
                overdue.append({"mandate_hash": "0x" + h.hex(), "payer": m[0], "amount": m[3] / 1e6, "due_at": due_at})
        return overdue

    def mark_default(self, mandate_hash: str) -> str:
        return self._send(self.registry.functions.markDefault(to_bytes32(mandate_hash)))

    def _send(self, fn) -> str:
        tx = fn.build_transaction({
            "from": self.settler.address,
            "nonce": next_nonce(self.w3, self.settler.address),
            "chainId": settings.network.chain_id,
        })
        signed = self.settler.sign_transaction(tx)
        tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        if receipt.status != 1:
            raise RuntimeError(f"transaction reverted: {tx_hash.hex()}")
        return "0x" + tx_hash.hex().removeprefix("0x")
