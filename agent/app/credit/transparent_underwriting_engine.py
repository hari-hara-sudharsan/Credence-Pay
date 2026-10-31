"""
Transparent Underwriting Engine — Deterministic, explainable credit scoring.

Every score is derived from weighted on-chain factors.
No random generation. No AI hallucination. Full factor-by-factor breakdown.

Formula:
    wallet_age: 20% | transaction_history: 25% | repayment_history: 30%
    defi_activity: 15% | risk_events: 10%
"""
from dataclasses import dataclass, asdict
from typing import List, Dict
from app.credit.wallet_analyzer import WalletAnalyzer
from app.credit.credit_engine import CreditEngine
from app.credit.credit_analyst import CreditAnalyst


# ── Weight Configuration ─────────────────────────────────────────────

FACTOR_WEIGHTS = {
    "wallet_age": 0.20,
    "transaction_history": 0.25,
    "repayment_history": 0.30,
    "defi_activity": 0.15,
    "risk_events": 0.10,
}


@dataclass
class ScoringFactor:
    """A single transparent scoring factor."""
    name: str
    weight: float
    raw_value: float
    normalized_score: float      # 0-100
    weighted_contribution: float  # weight * normalized
    explanation: str
    status: str                  # "strong", "moderate", "weak"


@dataclass
class TransparentCreditReport:
    """Full transparent credit report with deterministic breakdown."""
    wallet: str
    credit_score: int            # 0-1000
    risk_level: str
    default_probability: float
    badge: str
    factors: List[ScoringFactor]
    weighted_formula: Dict[str, float]
    summary: str
    ai_explanation: str
    data_source: str


class TransparentUnderwritingEngine:
    """Deterministic, explainable underwriting using real chain data."""

    def __init__(self):
        self.analyzer = WalletAnalyzer()
        self.credit_engine = CreditEngine()
        self.credit_analyst = CreditAnalyst()

    def generate_credit_report(self, wallet: str) -> TransparentCreditReport:
        """Generate a full transparent credit report."""
        # Step 1: Extract features from real chain data
        features = self.extract_wallet_features(wallet)

        # Step 2: Calculate factor scores
        factors = self._score_factors(features)

        # Step 3: Calculate weighted credit score
        credit_score = self.calculate_credit_score(factors)

        # Step 4: Risk assessment
        risk_level, badge = self._assess_risk(credit_score)
        default_prob = self.calculate_default_probability(credit_score, features)

        # Step 5: Generate explanation
        summary = self._generate_summary(wallet, credit_score, risk_level, factors)
        ai_explanation = self._generate_ai_explanation(factors, credit_score)

        return TransparentCreditReport(
            wallet=wallet.lower(),
            credit_score=credit_score,
            risk_level=risk_level,
            default_probability=round(default_prob, 2),
            badge=badge,
            factors=factors,
            weighted_formula=FACTOR_WEIGHTS,
            summary=summary,
            ai_explanation=ai_explanation,
            data_source="HashKey Chain via Blockscout API (real on-chain data)",
        )

    def extract_wallet_features(self, wallet: str) -> dict:
        """Extract features from real blockchain data."""
        return self.analyzer.analyze(wallet)

    def calculate_credit_score(self, factors: List[ScoringFactor]) -> int:
        """Deterministic weighted score from factors."""
        total = sum(f.weighted_contribution for f in factors)
        # Scale to 0-1000
        return max(0, min(1000, int(total * 10)))

    def calculate_default_probability(self, score: int, features: dict) -> float:
        """Calculate probability of default from score and history."""
        if score >= 800:
            base_pd = 2.0
        elif score >= 650:
            base_pd = 5.0
        elif score >= 500:
            base_pd = 12.0
        elif score >= 350:
            base_pd = 22.0
        else:
            base_pd = 35.0

        # Adjust for activity
        tx_count = features.get("transaction_count", 0)
        if tx_count > 100:
            base_pd *= 0.85
        elif tx_count < 10:
            base_pd *= 1.2

        return round(min(50.0, max(1.0, base_pd)), 2)

    def generate_risk_breakdown(self, wallet: str) -> Dict:
        """Get individual factor scores for UI display."""
        features = self.extract_wallet_features(wallet)
        factors = self._score_factors(features)
        return {
            "wallet": wallet.lower(),
            "factors": [asdict(f) for f in factors],
            "formula": FACTOR_WEIGHTS,
        }

    # ── Internal Scoring Logic ────────────────────────────────────────

    def _score_factors(self, features: dict) -> List[ScoringFactor]:
        """Calculate each scoring factor from raw features."""
        factors = []

        # 1. WALLET AGE (20%)
        age_days = features.get("wallet_age_days", 0)
        if age_days >= 365:
            age_score = 95
            age_status = "strong"
            age_explain = f"Wallet active for {age_days} days — established history"
        elif age_days >= 90:
            age_score = 70
            age_status = "moderate"
            age_explain = f"Wallet active for {age_days} days — growing history"
        elif age_days >= 30:
            age_score = 45
            age_status = "moderate"
            age_explain = f"Wallet active for {age_days} days — relatively new"
        elif age_days > 0:
            age_score = 25
            age_status = "weak"
            age_explain = f"Wallet only {age_days} days old — limited history"
        else:
            age_score = 10
            age_status = "weak"
            age_explain = "No wallet history detected"

        factors.append(ScoringFactor(
            name="wallet_age",
            weight=FACTOR_WEIGHTS["wallet_age"],
            raw_value=age_days,
            normalized_score=age_score,
            weighted_contribution=age_score * FACTOR_WEIGHTS["wallet_age"],
            explanation=age_explain,
            status=age_status,
        ))

        # 2. TRANSACTION HISTORY (25%)
        tx_count = features.get("transaction_count", 0)
        if tx_count >= 200:
            tx_score = 95
            tx_status = "strong"
            tx_explain = f"{tx_count} transactions — highly active wallet"
        elif tx_count >= 50:
            tx_score = 75
            tx_status = "strong"
            tx_explain = f"{tx_count} transactions — active on-chain presence"
        elif tx_count >= 20:
            tx_score = 55
            tx_status = "moderate"
            tx_explain = f"{tx_count} transactions — moderate activity"
        elif tx_count > 0:
            tx_score = 30
            tx_status = "weak"
            tx_explain = f"Only {tx_count} transactions — limited activity"
        else:
            tx_score = 5
            tx_status = "weak"
            tx_explain = "No transaction history"

        factors.append(ScoringFactor(
            name="transaction_history",
            weight=FACTOR_WEIGHTS["transaction_history"],
            raw_value=tx_count,
            normalized_score=tx_score,
            weighted_contribution=tx_score * FACTOR_WEIGHTS["transaction_history"],
            explanation=tx_explain,
            status=tx_status,
        ))

        # 3. REPAYMENT HISTORY (30%)
        repayments = features.get("repayment_count", 0)
        defaults = features.get("default_count", 0)
        activity = features.get("activity_score", 0)

        if repayments > 5 and defaults == 0:
            rep_score = 95
            rep_status = "strong"
            rep_explain = f"{repayments} repayments, 0 defaults — excellent reliability"
        elif repayments > 0 and defaults == 0:
            rep_score = 70
            rep_status = "moderate"
            rep_explain = f"{repayments} repayments, clean record"
        elif activity >= 60:
            rep_score = 55
            rep_status = "moderate"
            rep_explain = f"Activity score {activity}/100 suggests reliable behavior"
        elif activity >= 30:
            rep_score = 35
            rep_status = "weak"
            rep_explain = f"Activity score {activity}/100 — building track record"
        else:
            rep_score = 15
            rep_status = "weak"
            rep_explain = "Insufficient repayment data — new to lending"

        factors.append(ScoringFactor(
            name="repayment_history",
            weight=FACTOR_WEIGHTS["repayment_history"],
            raw_value=repayments,
            normalized_score=rep_score,
            weighted_contribution=rep_score * FACTOR_WEIGHTS["repayment_history"],
            explanation=rep_explain,
            status=rep_status,
        ))

        # 4. DEFI ACTIVITY (15%)
        unique_contracts = features.get("unique_contracts", 0)
        if unique_contracts >= 20:
            defi_score = 90
            defi_status = "strong"
            defi_explain = f"Interacted with {unique_contracts} contracts — DeFi native"
        elif unique_contracts >= 5:
            defi_score = 65
            defi_status = "moderate"
            defi_explain = f"Interacted with {unique_contracts} contracts — DeFi familiar"
        elif unique_contracts > 0:
            defi_score = 35
            defi_status = "weak"
            defi_explain = f"Only {unique_contracts} contract interactions"
        else:
            defi_score = 10
            defi_status = "weak"
            defi_explain = "No DeFi contract interactions detected"

        factors.append(ScoringFactor(
            name="defi_activity",
            weight=FACTOR_WEIGHTS["defi_activity"],
            raw_value=unique_contracts,
            normalized_score=defi_score,
            weighted_contribution=defi_score * FACTOR_WEIGHTS["defi_activity"],
            explanation=defi_explain,
            status=defi_status,
        ))

        # 5. RISK EVENTS (10%) — Inverted: lower risk = higher score
        risk_flags = features.get("risk_flags", 0)
        if risk_flags == 0:
            risk_score = 90
            risk_status = "strong"
            risk_explain = "No risk events detected — clean wallet"
        elif risk_flags <= 2:
            risk_score = 55
            risk_status = "moderate"
            risk_explain = f"{risk_flags} risk flag(s) detected — monitor recommended"
        else:
            risk_score = 20
            risk_status = "weak"
            risk_explain = f"{risk_flags} risk flags — elevated concern"

        factors.append(ScoringFactor(
            name="risk_events",
            weight=FACTOR_WEIGHTS["risk_events"],
            raw_value=risk_flags,
            normalized_score=risk_score,
            weighted_contribution=risk_score * FACTOR_WEIGHTS["risk_events"],
            explanation=risk_explain,
            status=risk_status,
        ))

        return factors

    def _assess_risk(self, score: int) -> tuple:
        """Derive risk level and badge from score."""
        if score >= 750:
            return "LOW", "PRIME"
        elif score >= 600:
            return "LOW", "TRUSTED"
        elif score >= 450:
            return "MEDIUM", "STANDARD"
        elif score >= 300:
            return "MEDIUM", "WATCHLIST"
        else:
            return "HIGH", "HIGH_RISK"

    def _generate_summary(self, wallet: str, score: int, risk: str, factors: List[ScoringFactor]) -> str:
        """Human-readable summary."""
        short = f"{wallet[:6]}...{wallet[-4:]}"
        strong = [f for f in factors if f.status == "strong"]
        weak = [f for f in factors if f.status == "weak"]

        parts = [f"Wallet {short} scored {score}/1000 ({risk} risk)."]

        if strong:
            names = ", ".join(f.name.replace("_", " ") for f in strong)
            parts.append(f"Strengths: {names}.")
        if weak:
            names = ", ".join(f.name.replace("_", " ") for f in weak)
            parts.append(f"Areas to improve: {names}.")

        return " ".join(parts)

    def _generate_ai_explanation(self, factors: List[ScoringFactor], score: int) -> str:
        """Generate transparent AI explanation."""
        lines = [f"Credit score of {score} calculated using weighted on-chain factors:"]
        for f in factors:
            pct = int(f.weight * 100)
            lines.append(f"  • {f.name.replace('_', ' ').title()} ({pct}%): {f.normalized_score}/100 — {f.explanation}")

        lines.append("")
        lines.append("This score is deterministic. Same wallet data always produces the same score.")
        lines.append("Data source: HashKey Chain via Blockscout API.")
        return "\n".join(lines)
