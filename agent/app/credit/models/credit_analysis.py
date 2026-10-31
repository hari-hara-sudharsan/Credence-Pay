from pydantic import BaseModel


class CreditAnalysis(BaseModel):

    credit_score: int

    rating: str

    probability_of_default: float

    summary: str

    strengths: list[str]

    weaknesses: list[str]

    collateral_ratio: int

    max_ltv: int