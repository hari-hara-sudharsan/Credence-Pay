import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

from app.hsp.networks import NETWORKS, Network

load_dotenv()

ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Settings:
    network: Network
    # HSP Agentic Payment (MCP). App Key/Secret are held by HSP, not by us.
    hsp_mcp_url: str
    hsp_team_name: str      # merchant_name: hackathon team reporting name, identical on create and query
    hsp_coin: str           # the team's chosen token from get_chain_config
    # EVM keys
    merchant_agent_key: str | None   # receiving agent: pay_to address and SETTLER on the registry
    buyer_agent_key: str | None      # payment agent wallet (signs EIP-712 authorisations)
    # Credence contracts
    registry_address: str | None
    policy_address: str | None
    groq_api_key: str | None
    groq_model: str
    data_dir: Path


def load_settings() -> Settings:
    network = NETWORKS[os.getenv("HSK_NETWORK", "hashkey-testnet")]
    data_dir = Path(os.getenv("DATA_DIR", str(ROOT / "data")))
    data_dir.mkdir(parents=True, exist_ok=True)
    return Settings(
        network=network,
        hsp_mcp_url=os.getenv("HSP_MCP_URL", "https://mcp-qa.hashkeymerchant.com/"),
        hsp_team_name=os.getenv("HSP_TEAM_NAME", "Credence"),
        hsp_coin=os.getenv("HSP_COIN", "USDC"),
        merchant_agent_key=os.getenv("MERCHANT_AGENT_KEY"),
        buyer_agent_key=os.getenv("BUYER_AGENT_KEY"),
        registry_address=os.getenv("A2A_REGISTRY_ADDRESS"),
        policy_address=os.getenv("SPENDING_POLICY_ADDRESS"),
        groq_api_key=os.getenv("GROQ_API_KEY"),
        groq_model=os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
        data_dir=data_dir,
    )


settings = load_settings()
