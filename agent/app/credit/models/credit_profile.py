from pydantic import BaseModel


class CreditProfile(BaseModel):

    credit_score: int

    rating: str

    confidence: int

    probability_of_default: float

    segment: str = "UNKNOWN"