from app.credit.models.credit_profile import CreditProfile


class CreditEngine:

    def calculate(
        self,
        wallet_features: dict
    ):
        from app.credit.transparent_underwriting_engine import TransparentUnderwritingEngine
        underwriting_engine = TransparentUnderwritingEngine()
        factors = underwriting_engine._score_factors(wallet_features)
        credit_score = underwriting_engine.calculate_credit_score(factors)

        tx_count = wallet_features.get("transaction_count", 0)
        age_days = wallet_features.get("wallet_age_days", 0)

        confidence = self.calculate_confidence(
            tx_count,
            age_days
        )

        rating = self.rating(
            credit_score
        )

        prob_default = self.probability_of_default(
            credit_score
        )

        from app.credit.segment_engine import SegmentEngine
        segment = SegmentEngine.classify(wallet_features)

        return CreditProfile(
            credit_score=credit_score,
            rating=rating,
            confidence=confidence,
            probability_of_default=prob_default,
            segment=segment
        )

    def longevity_score(
        self,
        age_days: int
    ):

        if age_days >= 730:
            return 150

        if age_days >= 365:
            return 120

        if age_days >= 180:
            return 80

        return 40

    def calculate_confidence(
        self,
        tx_count: int,
        age_days: int
    ):

        score = 0

        score += min(
            tx_count,
            50
        )

        score += min(
            age_days // 30,
            50
        )

        return min(
            score,
            100
        )

    def rating(
        self,
        score: int
    ):

        if score >= 900:
            return "AAA"

        if score >= 800:
            return "AA"

        if score >= 700:
            return "A"

        if score >= 600:
            return "BBB"

        if score >= 500:
            return "BB"

        return "HIGH_RISK"

    def probability_of_default(
        self,
        credit_score: int
    ):

        if credit_score >= 900:
            return 1.0

        if credit_score >= 800:
            return 2.5

        if credit_score >= 700:
            return 5.0

        if credit_score >= 600:
            return 10.0

        return 25.0