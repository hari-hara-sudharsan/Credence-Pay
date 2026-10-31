from app.credit.models.raw_wallet import RawWallet
from app.credit.blockscout_client import BlockscoutClient


class WalletCollector:

    def __init__(self):

        self.client = BlockscoutClient()

    def collect(self, wallet: str):

        address_data = self.client.get_address(wallet)

        tx_data = self.client.get_transactions(wallet)

        transactions = tx_data.get("items", [])

        tx_count = len(transactions)

        first_timestamp = None

        if transactions:

            timestamps = [
                tx["timestamp"]
                for tx in transactions
                if "timestamp" in tx and tx["timestamp"] is not None
            ]

            if timestamps:
                first_timestamp = min(timestamps)

        balance = 0

        coin_balance = address_data.get("coin_balance")
        if coin_balance is not None:
            try:
                balance = int(coin_balance) / (10 ** 18)
            except (ValueError, TypeError):
                balance = 0

        return RawWallet(
            wallet=wallet,
            balance=balance,
            tx_count=tx_count,
            first_tx_timestamp=first_timestamp
        )