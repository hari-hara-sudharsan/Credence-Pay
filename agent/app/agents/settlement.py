"""Executes a signed Payment Mandate on HashKey Chain.

Rails:
- "hsp":    the mandate is submitted to the HSP gateway, which broadcasts the
            transfer and reports status via webhook / payment query.
- "direct": the receiving agent relays the same x402 / EIP-3009 authorisation
            to the USDC contract itself. Same signature, same on-chain effect;
            used when HSP agent submission is unavailable.
"""

from web3 import Web3

from app.config import settings

TRANSFER_WITH_AUTHORIZATION_ABI = [{
    "name": "transferWithAuthorization",
    "type": "function",
    "stateMutability": "nonpayable",
    "inputs": [
        {"name": "from", "type": "address"}, {"name": "to", "type": "address"},
        {"name": "value", "type": "uint256"}, {"name": "validAfter", "type": "uint256"},
        {"name": "validBefore", "type": "uint256"}, {"name": "nonce", "type": "bytes32"},
        {"name": "v", "type": "uint8"}, {"name": "r", "type": "bytes32"}, {"name": "s", "type": "bytes32"},
    ],
    "outputs": [],
}]


class DirectSettlement:
    rail = "direct-x402"

    def __init__(self, w3: Web3, relayer):
        self.w3 = w3
        self.relayer = relayer

    def execute(self, payment_mandate: dict) -> dict:
        x402 = payment_mandate["x402"]
        auth = x402["payload"]["authorization"]
        sig = bytes.fromhex(x402["payload"]["signature"].removeprefix("0x"))
        r, s, v = sig[:32], sig[32:64], sig[64]

        usdc = self.w3.eth.contract(address=Web3.to_checksum_address(x402["asset"]), abi=TRANSFER_WITH_AUTHORIZATION_ABI)
        tx = usdc.functions.transferWithAuthorization(
            Web3.to_checksum_address(auth["from"]), Web3.to_checksum_address(auth["to"]), int(auth["value"]),
            int(auth["validAfter"]), int(auth["validBefore"]), bytes.fromhex(auth["nonce"].removeprefix("0x")), v, r, s,
        ).build_transaction({
            "from": self.relayer.address,
            "nonce": self.w3.eth.get_transaction_count(self.relayer.address, "pending"),
            "chainId": settings.network.chain_id,
        })
        signed = self.relayer.sign_transaction(tx)
        tx_hash = self.w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
        tx_hex = "0x" + tx_hash.hex().removeprefix("0x")
        if receipt.status != 1:
            raise RuntimeError(f"USDC transfer reverted: {tx_hex}")
        return {"rail": self.rail, "status": "payment-finalized", "tx_hash": tx_hex, "block": receipt.blockNumber}
