"""HSP-supported HashKey Chain networks and stablecoins (from the HashKey Merchant onboarding docs)."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Token:
    symbol: str
    address: str
    decimals: int
    protocol: str  # "EIP-3009" or "Permit2"


@dataclass(frozen=True)
class Network:
    name: str          # HSP network identifier
    chain_id: int
    rpc: str
    explorer: str
    gateway: str       # HSP gateway host for this network
    tokens: dict


HASHKEY_MAINNET = Network(
    name="hashkey",
    chain_id=177,
    rpc="https://mainnet.hsk.xyz",
    explorer="https://hsk.blockscout.com",
    gateway="https://hsp.hashkey.com",
    tokens={
        "USDC": Token("USDC", "0x054ed45810DbBAb8B27668922D110669c9D88D0a", 6, "EIP-3009"),
        "USDT": Token("USDT", "0xf1b50ed67a9e2cc94ad3c477779e2d4cbfff9029", 6, "Permit2"),
    },
)

HASHKEY_TESTNET = Network(
    name="hashkey-testnet",
    chain_id=133,
    rpc="https://testnet.hsk.xyz",
    explorer="https://testnet-explorer.hskchain.net",
    gateway="https://merchant-qa.hashkeymerchant.com",
    tokens={
        "USDC": Token("USDC", "0x8FE3cB719Ee4410E236Cd6b72ab1fCDC06eF53c6", 6, "EIP-3009"),
        "USDT": Token("USDT", "0x372325443233fEbaC1F6998aC750276468c83CC6", 6, "Permit2"),
    },
)

NETWORKS = {n.name: n for n in (HASHKEY_MAINNET, HASHKEY_TESTNET)}
