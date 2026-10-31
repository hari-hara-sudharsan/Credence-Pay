from pydantic import BaseModel

class RawWallet(BaseModel):

    wallet: str

    balance: float

    tx_count: int

    first_tx_timestamp: str | None = None