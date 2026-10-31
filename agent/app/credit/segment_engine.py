class SegmentEngine:

    @staticmethod
    def classify(features):

        if isinstance(features, dict):
            balance = features.get("balance", 0)
            age = features.get("wallet_age_days", 0)
            txs = features.get("transaction_count", 0)
        else:
            balance = getattr(features, "balance", 0)
            age = getattr(features, "wallet_age_days", 0)
            txs = getattr(features, "transaction_count", 0)

        if age < 30:
            return "New Wallet"

        if balance > 10000:
            return "Whale"

        if txs > 500:
            return "Power User"

        if txs > 100 and age > 180:
            return "DeFi Native"

        if txs < 10 and age > 180:
            return "Passive Holder"

        return "Retail User"
