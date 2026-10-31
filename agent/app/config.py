import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

from app.hsp.networks import NETWORKS, Network

load_dotenv()

ROOT = Path(__file__).resolve().parent.parent


def _read_pem(value: str | None) -> str | None:
    """Accept either an inline PEM or a path to a .pem file."""
    if not value:
        return None
    if "BEGIN" in value:
        return value.replace("\\n", "\n")
    path = Path(value)
    if not path.is_absolute():
        path = ROOT / path
    return path.read_text() if path.exists() else None


@dataclass(frozen=True)
class Settings:
    network: Network
    # HSP merchant credentials (receiving agent)
    hsp_app_key: str | None
    hsp_app_secret: str | None
    hsp_base_url: str
    merchant_name: str
    merchant_jwt_private_key: str | None
    merchant_jwt_public_key: str | None
    # EVM keys
    merchant_agent_key: str | None   # receives payments, acts as settler/relayer
    buyer_agent_key: str | None      # payment agent wallet
    # Credence contracts
    registry_address: str | None
    policy_address: str | None
    # "hsp" = settle through the HSP gateway; "direct" = submit the signed x402/EIP-3009 authorisation ourselves
    settlement_mode: str
    groq_api_key: str | None
    groq_model: str
    data_dir: Path

    @property
    def hsp_enabled(self) -> bool:
        return bool(self.hsp_app_key and self.hsp_app_secret and self.merchant_jwt_private_key)


def load_settings() -> Settings:
    network = NETWORKS[os.getenv("HSK_NETWORK", "hashkey")]
    data_dir = Path(os.getenv("DATA_DIR", str(ROOT / "data")))
    data_dir.mkdir(parents=True, exist_ok=True)
    return Settings(
        network=network,
        hsp_app_key=os.getenv("HSP_APP_KEY"),
        hsp_app_secret=os.getenv("HSP_APP_SECRET"),
        hsp_base_url=os.getenv("HSP_BASE_URL", network.gateway),
        merchant_name=os.getenv("MERCHANT_NAME", "Credence Risk Agent"),
        merchant_jwt_private_key=_read_pem(os.getenv("MERCHANT_JWT_PRIVATE_KEY")),
        merchant_jwt_public_key=_read_pem(os.getenv("MERCHANT_JWT_PUBLIC_KEY")),
        merchant_agent_key=os.getenv("MERCHANT_AGENT_KEY"),
        buyer_agent_key=os.getenv("BUYER_AGENT_KEY"),
        registry_address=os.getenv("A2A_REGISTRY_ADDRESS"),
        policy_address=os.getenv("SPENDING_POLICY_ADDRESS"),
        settlement_mode=os.getenv("SETTLEMENT_MODE", "hsp"),
        groq_api_key=os.getenv("GROQ_API_KEY"),
        groq_model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
        data_dir=data_dir,
    )


settings = load_settings()
