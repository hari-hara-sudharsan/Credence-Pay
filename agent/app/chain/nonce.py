"""Nonce tracking for the receiving agent's wallet.

The public HSK RPC is load-balanced and a node can lag the one that accepted our
last transaction, returning a stale pending nonce. Track the last nonce we used
and never go backwards.
"""

import threading

_lock = threading.Lock()
_last: dict[str, int] = {}


def next_nonce(w3, address: str) -> int:
    with _lock:
        chain = w3.eth.get_transaction_count(address, "pending")
        nonce = max(chain, _last.get(address, -1) + 1)
        _last[address] = nonce
        return nonce
