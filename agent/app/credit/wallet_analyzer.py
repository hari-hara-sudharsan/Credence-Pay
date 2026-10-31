from app.credit.wallet_collector import WalletCollector
from app.credit.feature_extractor import FeatureExtractor


import time

class WalletAnalyzer:
    _cache = {}
    CACHE_DURATION_SECS = 300

    def __init__(self):
        self.collector = WalletCollector()
        self.extractor = FeatureExtractor()

    def analyze(self, wallet: str):
        wallet_lower = wallet.lower()
        now = time.time()
        
        if wallet_lower in self._cache:
            cached_data, timestamp = self._cache[wallet_lower]
            if now - timestamp < self.CACHE_DURATION_SECS:
                return cached_data

        raw = self.collector.collect(wallet)

        wallet_age = self.extractor.wallet_age_days(
            raw.first_tx_timestamp
        )

        activity = self.extractor.activity_score(
            raw.tx_count
        )

        asset_stability = (
            self.extractor.asset_stability_score(
                raw.balance
            )
        )

        protocol_diversity = (
            self.extractor.protocol_diversity_score(
                raw.tx_count
            )
        )

        financial_reliability = (
            self.extractor.financial_reliability_score(
                wallet_age,
                raw.tx_count
            )
        )

        sybil_score = (
            self.extractor.sybil_risk_score(
                raw.tx_count,
                wallet_age
            )
        )

        result = {
            "wallet": wallet,
            "balance": raw.balance,
            "wallet_age_days": wallet_age,
            "transaction_count": raw.tx_count,
            "activity_score": activity,
            "asset_stability_score": asset_stability,
            "protocol_diversity_score": protocol_diversity,
            "financial_reliability_score": financial_reliability,
            "sybil_risk_score": sybil_score
        }
        
        self._cache[wallet_lower] = (result, now)
        return result