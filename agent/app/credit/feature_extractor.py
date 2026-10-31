from datetime import datetime, timezone


class FeatureExtractor:

    def wallet_age_days(
        self,
        first_tx_timestamp: str | None
    ):

        if not first_tx_timestamp:
            return 0

        try:
            first_date = datetime.fromisoformat(
                first_tx_timestamp.replace("Z", "+00:00")
            )
            today = datetime.now(timezone.utc)
            return (
                today - first_date
            ).days
        except Exception:
            return 30

    def activity_score(
        self,
        tx_count: int
    ):

        if tx_count >= 1000:
            return 100

        if tx_count >= 500:
            return 80

        if tx_count >= 100:
            return 60

        if tx_count >= 20:
            return 40

        return 20

    def asset_stability_score(
        self,
        balance: float
    ):

        if balance >= 1000:
            return 90

        if balance >= 100:
            return 70

        if balance >= 10:
            return 50

        return 20

    def protocol_diversity_score(
        self,
        tx_count: int
    ):

        if tx_count >= 100:
            return 100

        if tx_count >= 50:
            return 80

        if tx_count >= 20:
            return 60

        if tx_count >= 10:
            return 40

        return 20

    def financial_reliability_score(
        self,
        age_days: int,
        tx_count: int
    ):

        score = 0

        score += min(
        age_days // 10,
        50
    )

        score += min(
        tx_count,
        50
    )

        return score

    def sybil_risk_score(
    self,
    tx_count: int,
    age_days: int
):

        if age_days < 30 and tx_count > 100:

            return 20

        return 90 