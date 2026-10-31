from app.credit.models.credit_analysis import CreditAnalysis


class CreditAnalyst:

    def analyze(
        self,
        features: dict,
        profile
    ):

        strengths = []

        weaknesses = []

        if features["wallet_age_days"] > 365:
            strengths.append(
                "Strong wallet longevity"
            )
        else:
            weaknesses.append(
                "Limited wallet history"
            )

        if features["financial_reliability_score"] > 70:
            strengths.append(
                "High financial reliability"
            )
        else:
            weaknesses.append(
                "Insufficient financial history"
            )

        if features["protocol_diversity_score"] > 60:
            strengths.append(
                "Good protocol diversification"
            )
        else:
            weaknesses.append(
                "Limited DeFi exposure"
            )

        if features["sybil_risk_score"] < 50:
            weaknesses.append(
                "Potential Sybil behavior"
            )
        else:
            strengths.append(
                "Low Sybil risk"
            )

        collateral_ratio = self.collateral_ratio(
            profile.credit_score
        )

        max_ltv = self.max_ltv(
            profile.credit_score
        )

        summary = (
            f"Wallet rated {profile.rating} "
            f"with default probability "
            f"{profile.probability_of_default}%."
        )

        return CreditAnalysis(
            credit_score=profile.credit_score,
            rating=profile.rating,
            probability_of_default=profile.probability_of_default,
            summary=summary,
            strengths=strengths,
            weaknesses=weaknesses,
            collateral_ratio=collateral_ratio,
            max_ltv=max_ltv
        )

    def collateral_ratio(
        self,
        score: int
    ):

        if score >= 900:
            return 105

        if score >= 800:
            return 110

        if score >= 700:
            return 115

        if score >= 600:
            return 125

        return 150

    def max_ltv(
        self,
        score: int
    ):

        if score >= 900:
            return 95

        if score >= 800:
            return 90

        if score >= 700:
            return 85

        if score >= 600:
            return 75

        return 60