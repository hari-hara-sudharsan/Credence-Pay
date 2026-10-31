<div align="center">

# Credence

### HSP lets agents pay each other. Credence decides on what terms.

**Trust-gated agent-to-agent payments on HSK Chain, settled through HSP Agentic Payment.**

HSK Chain Horizon Hackathon · Mumbai Edition · Track 2: **Agent Payments & A2A Settlement (HSP)**

[Agent Console](#run-it-locally) · [How it works](#how-a-purchase-works) · [Contracts](#deployments) · [Business model](#business-model) · [What we built during the hackathon](#built-during-the-hackathon)

</div>

---

## The problem

AI agents are starting to buy from each other: data, compute, API calls, research. Payment rails such as HSP already let an agent pay another agent in stablecoins. What no rail answers is the question every merchant asks first:

> **Will this agent actually pay?**

Today a receiving agent has two bad options:

- **Make everyone prepay.** This is safe, but every purchase is slower, and good customers are treated like strangers forever.
- **Trust blindly.** This is fast, but one bad agent drains the merchant.

Human commerce solved this with credit history. A shop that knows you lets you run a tab. Agentic commerce has no equivalent, so every agent is a stranger on every purchase.

## The solution

Credence is a **trust and terms layer for agent payments**, built on HSP and HSK Chain.

1. **Every HSP settlement becomes on-chain memory.** When a payment reaches `payment-safe` or `payment-finalized`, Credence records the mandate on-chain with its HSP flow ID and transaction hash.
2. **Memory becomes a trust score.** `trustScore()` is computed on-chain from settlement history: on-time payments, volume, late payments, and defaults.
3. **Trust becomes terms.** `termsFor()` tells any receiving agent what to offer:

| Trust score | Terms | What the merchant agent does |
|---|---|---|
| < 560, or any default | **Prepay** | Payment settles before goods are delivered |
| 560 – 699 | **Net 7** | Goods delivered first, payment due within 7 days |
| ≥ 700 | **Credit tab** | Open tab of 25 to 225 USD, due within 30 days |

4. **Humans stay in control.** An agent can only spend inside an on-chain policy set by its human owner: daily cap, per-payment cap, allowed merchants, expiry, and a pause switch. Every payment also requires **two explicit human approvals**, once before signing and once before submission, as the HSP Agentic Payment guide requires.

The demo marketplace is Credence itself. The **Credence Risk Agent** (receiving agent) sells wallet risk reports to a **Lending Agent** (payment agent) that needs them to underwrite borrowers. The goods are real: live credit analysis of HSK Chain wallets from Blockscout data.

### Live on HSK testnet right now

Four payment agents have real on-chain payment histories, built through the same agent flow. Each one asks for the same product and is offered different terms:

| Payment agent | Trust | Terms | On-chain history |
|---|---|---|---|
| Atlas Lending Agent | **729** | Credit tab | 15 settlements, all on time |
| Orbit Trading Agent | **576** | Net 7 | 5 settlements |
| Nova Research Agent | **530** | Prepay | 2 settlements |
| Rogue Arbitrage Bot | **441** | Prepay | 6 settlements, then **defaulted** on a $6 tab |

The registry holds **28 settlements, $84.50 of merchant volume, $0.65 of Credence fees accrued on-chain, and $6 defaulted.** The Business page reads these numbers live from the contracts.

### Two payment rails, one agent flow

| Rail | Settles in | Status |
|---|---|---|
| **HSP Agentic Payment** (primary) | USDC via the HSP Gateway | Fully implemented against the HSP MCP server; enabled once HSP allowlists our server IP |
| **Sandbox rail** | Credence Test USD (cUSD) on HSK testnet | Live. It exposes the same 8 tools as the HSP MCP server and settles real EIP-3009 `transferWithAuthorization` transactions |

Both rails run the identical state machine: trust check, order, quote, spending-policy check, two human approvals, settlement, anchoring. Every step and every settlement is labelled with the rail it used. A sandbox payment is never presented as an HSP payment.

---

## How a purchase works

```mermaid
sequenceDiagram
    autonumber
    actor Human as Human owner
    participant Buyer as Lending Agent<br/>(payment agent)
    participant Merchant as Credence Risk Agent<br/>(receiving agent)
    participant HSP as HSP Agentic Payment<br/>(MCP server + Gateway)
    participant Chain as HSK Chain<br/>(Credence contracts)

    Human->>Buyer: "Get a risk report on 0x2988… Budget $1."
    Buyer->>HSP: get_chain_config
    Merchant->>Chain: trustScore(payer), termsFor(payer)
    Chain-->>Merchant: 500 → PREPAY
    Merchant->>HSP: create_order(merchant_name, pay_to, cart_mandate)
    HSP-->>Buyer: flow_id, payment_request_id
    Buyer->>HSP: get_order, prepare_payment(flow_id, payer, protocol)
    HSP-->>Buyer: eip712, token_total_raw, cart_hash (5-min quote)
    Buyer->>Chain: checkSpend(payer, merchant, amount)
    Note over Buyer: verify pay_to, payer, budget,<br/>policy and token balance
    Buyer->>Human: Approve signature? (recipient, payer, token_total_raw)
    Human-->>Buyer: Approve
    Buyer->>HSP: finalize_payment(signature, payment_payload, …)
    Buyer->>Human: Approve submission?
    Human-->>Buyer: Approve
    Buyer->>HSP: submit_payment(payment_mandate_json)
    loop every 15 s
        Buyer->>HSP: query_payment(flow_id, expected_merchant_name)
    end
    HSP-->>Buyer: payment-finalized, tx_signature
    Merchant->>Chain: recordSettlement(cart_hash, flow_id, tx)
    Chain-->>Merchant: trust 500 → 515
    Merchant-->>Buyer: Delivers risk report
```

On a trusted payer's next order, step 3 returns **Net** or **Credit**. The merchant opens a tab on-chain with `openTab()`, delivers the goods first, and the HSP payment closes the tab. If the tab goes overdue, anyone can call `markDefault()`, and the payer drops back to prepay.

### Mapping to the HSP Agentic Payment guide

| Guide requirement | Where it is implemented |
|---|---|
| Connect to `https://mcp-qa.hashkeymerchant.com/` over Streamable HTTP, verify all 8 tools | [`agent/app/hsp/mcp_client.py`](agent/app/hsp/mcp_client.py) refuses to proceed if any tool, including `finalize_payment`, is missing |
| Use live schema parameter names; do not invent arguments | `fit_arguments()` maps values onto the live schema and fails, showing the schema, rather than guessing |
| Network, token, decimals and protocol only from `get_chain_config` | `select_token()` in [`a2a_flow.py`](agent/app/agents/a2a_flow.py) |
| `create_order` with `merchant_name`, `pay_to` and a cart mandate without `merchant_authorization` | [`merchant_agent.py`](agent/app/agents/merchant_agent.py), [`cart_mandate.py`](agent/app/hsp/cart_mandate.py) |
| Sign only the returned `eip712`, unmodified | `A2AFlow._sign()` passes it straight to `encode_typed_data` |
| Show recipient, payer and `token_total_raw`; wait for approval before signing and before submitting | `awaiting_sign_approval` and `awaiting_submit_approval` states, plus the approval card in the console |
| Check the balance against `token_total_raw` before signing | `A2AFlow._prepare()` |
| Quote expiry or Gateway error `30043` → re-prepare and re-sign | `approve_sign()` and `approve_submit()` |
| Poll every 15 s, never create a duplicate order, `payment-safe` ≠ finalized | `refresh()` plus console polling; status wording follows the guide |
| `query_payment` with `expected_merchant_name`; report `attribution_verified` | `refresh()`; shown in the timeline |

No App Key, App Secret or merchant JWT is held by Credence. HSP manages those server-side.

---

## Architecture

```
┌───────────────────────────── web/ (Next.js 16) ─────────────────────────────┐
│  Landing · Console · Agents · Business · Settlements · Developers · Passport  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ REST
┌──────────────────────────── agent/ (FastAPI, Python) ───────────────────────┐
│  BuyerAgent (intent: Groq Llama 3.3 or deterministic rules)                    │
│  MerchantAgent (pricing, trust-gated terms, goods = live credit reports)      │
│  A2AFlow (state machine with two human approval gates, persisted runs)        │
│  HSPAgenticPayment (MCP client)       TrustRegistry (web3 client)             │
│  credit/ (wallet features → transparent underwriting → credit profile)        │
└───────────────┬───────────────────────────────────────────┬─────────────────┘
                │ MCP (Streamable HTTP)                     │ JSON-RPC
      ┌─────────▼──────────┐                     ┌──────────▼──────────────────┐
      │ HSP Agentic Payment │── broadcasts ──────▶│ HSK Chain                   │
      │ MCP + Gateway       │   USDC transfer     │  A2ASettlementRegistry      │
      └────────────────────┘                     │  AgentSpendingPolicy        │
                                                 └─────────────────────────────┘
```

### Contracts (`contracts/a2a/`)

**`AgentSpendingPolicy.sol`** holds a human owner's delegation to an AI agent.
- `setPolicy(agent, dailyCap, perTxCap, expiresAt, anyMerchant)`: the first caller becomes the owner, and nobody else can change the policy afterwards.
- `setMerchantAllowed`, `setPaused`: allow-list merchants and stop the agent instantly.
- `checkSpend(agent, merchant, amount)`: a view function the payment agent must pass before it signs.
- `recordSpend(...)`: meters settled spend against the daily cap. Only the registry can call it.

**`A2ASettlementRegistry.sol`** is the on-chain memory of agent payments.
- `recordSettlement(mandateHash, payer, payee, token, amount, hspFlowId, paymentTx)`: anchors an HSP settlement. Duplicate mandates are rejected.
- `openTab(...)` / `markDefault(...)`: records deferred terms and enforces them.
- `trustScore(agent)`: score in [300, 900]. Base 500, +15 per on-time settlement (max +300), +1 per 10 USD settled (max +100), −40 per late payment, −150 per default.
- `termsFor(agent)`: returns `(PREPAY | NET | CREDIT, remainingCreditLimit, netDays)`.
- If a payment breaches the payer's policy, it is still anchored and a `PolicyViolation` event is emitted. A payment that already happened on HSP is never hidden by a revert.
- **Fee ledger:** `feeBps` (default 150 = 1.5%, capped at 10%) accrues to `feesAccrued[merchant]` on every Net or Credit settlement. Prepay volume is free. `volumeByTerms`, `totalFees` and `totalDefaulted` make the business auditable on-chain.
- **Shared reputation:** on-time settlements call `ReputationRegistry.recordRepayment`, so agent payment history also strengthens the wallet's Credence reputation in other applications.

**`CredenceTestUSD.sol`** is a testnet-only, 6-decimal dollar with EIP-3009 `transferWithAuthorization`, the same authorisation scheme HSP uses for USDC, plus a rate-limited faucet. The sandbox rail settles in it.

Any agent, protocol or wallet can read `trustScore()` and `termsFor()` to price a counterparty. One record serves every market.

---

## Deployments

### HashKey Chain Testnet (133): full Credence stack

Deployed and wired together with [`ignition/modules/Credence.ts`](ignition/modules/Credence.ts). Records live in [`ignition/deployments/credence-testnet`](ignition/deployments/credence-testnet).

| Contract | Address | |
|---|---|---|
| `A2ASettlementRegistry` | [`0x0da11d916c5730E19a48bEc142387bEFDb59A819`](https://testnet-explorer.hsk.xyz/address/0x0da11d916c5730E19a48bEc142387bEFDb59A819) | hackathon |
| `AgentSpendingPolicy` | [`0x7a9559Db3c9846825102c3513AbA2973A1A47BCA`](https://testnet-explorer.hsk.xyz/address/0x7a9559Db3c9846825102c3513AbA2973A1A47BCA) | hackathon |
| `CredenceTestUSD` (cUSD) | [`0x26985124407Bf5d3B3E0e1EAc8d904221f4b9bc5`](https://testnet-explorer.hsk.xyz/address/0x26985124407Bf5d3B3E0e1EAc8d904221f4b9bc5) | hackathon |
| `ReputationRegistry` | [`0x946E4397B93a147D68e7ADBa22C5A0EA718b00DC`](https://testnet-explorer.hsk.xyz/address/0x946E4397B93a147D68e7ADBa22C5A0EA718b00DC) | core, fed by A2A settlements |
| `CreditPassportV2` | [`0x23CB5b72399c552A5117E9762C754c429Eb5Dd3F`](https://testnet-explorer.hsk.xyz/address/0x23CB5b72399c552A5117E9762C754c429Eb5Dd3F) | core |
| `SettlementManager` | [`0x578dF3A9ee35d8ade83BA742E1821c67cc7338C5`](https://testnet-explorer.hsk.xyz/address/0x578dF3A9ee35d8ade83BA742E1821c67cc7338C5) | core |
| `LendingPool` | [`0xc3D08c5D8fc127f4232f112a37399E1f2547ff39`](https://testnet-explorer.hsk.xyz/address/0xc3D08c5D8fc127f4232f112a37399E1f2547ff39) | core |
| `LoanManager` | [`0xDC8FBDA1e52c7677dc05b062A30BBaC802Ac57d3`](https://testnet-explorer.hsk.xyz/address/0xDC8FBDA1e52c7677dc05b062A30BBaC802Ac57d3) | core |

Example transactions from a live credit-terms purchase by Atlas:

| Step | Transaction |
|---|---|
| Credit tab opened, goods delivered first | [`0xab7b2b…dab0`](https://testnet-explorer.hsk.xyz/tx/0xab7b2b003a69b130aab360afe59693570c5b2c37a66259abe2d844f6a448dab0) |
| Payment settled (EIP-3009) | [`0xeb8256…6289`](https://testnet-explorer.hsk.xyz/tx/0xeb82562b6e9019432110dc2b222337795703dde66255bea15c97adc8af8e6289) |
| Settlement anchored, trust 714 → 729 | [`0x22c7ff…b3ef`](https://testnet-explorer.hsk.xyz/tx/0x22c7ff0dbd95090b23dbe2f867bed6d11421b4ea271f879f40bc3c8b0133b3ef) |
| Rogue's overdue tab marked defaulted | [`0xa94e50…fdf2`](https://testnet-explorer.hsk.xyz/tx/0xa94e502fb1ec89d9add7029798edf91e5f68d15460f83ffca626114dd903fdf2) |

**Mainnet (chain 177):** the same module deploys there once the deployer has HSK gas. Links will be added here at that point.

### Earlier Credence prototype (already on HSK mainnet)

The core contracts were first deployed to mainnet before the hackathon. They are listed for continuity, not as hackathon work. Every address was checked for bytecode with `eth_getCode`.

| Contract | HSK Chain Mainnet (177) |
|---|---|
| `CreditPassportV2` | [`0xbD3ff87D460def7cBB00b091cF994AC4B9c61E14`](https://hashkey.blockscout.com/address/0xbD3ff87D460def7cBB00b091cF994AC4B9c61E14) |
| `ReputationRegistry` | [`0x110e9fB1ABEc92521E4511d5f45B4917B4c941Ab`](https://hashkey.blockscout.com/address/0x110e9fB1ABEc92521E4511d5f45B4917B4c941Ab) |
| `LoanManager` | [`0x2988f0bE02e1a679430aEb4A6B9B10429F1e8e80`](https://hashkey.blockscout.com/address/0x2988f0bE02e1a679430aEb4A6B9B10429F1e8e80) |
| `LendingPool` | [`0x928BA9D30669c41695422a68a1C307a6529F0050`](https://hashkey.blockscout.com/address/0x928BA9D30669c41695422a68a1C307a6529F0050) |
| `SettlementManager` | [`0x4f3eEE789936a0eca627484bf680464f2F37b9FB`](https://hashkey.blockscout.com/address/0x4f3eEE789936a0eca627484bf680464f2F37b9FB) |

---

## Business model

See it live on the **Business** page: merchant revenue, fees accrued, volume by terms and defaults are read from the contracts. An interactive unit-economics model sits beside them, clearly labelled as a projection.

**Customer:** businesses that deploy selling agents (data providers, API and compute sellers, AI services) and protocols whose agents pay others.

| Revenue line | How it works |
|---|---|
| **Trust checks** | Per-call fee for `termsFor` / risk lookups through the Credence API. On-chain reads stay free, so the standard spreads. |
| **Deferred-terms fee** | 1.5% of volume settled under Net or Credit terms, **accrued on-chain** by the registry. Merchants pay for this because faster checkout and repeat buyers are worth more than prepay friction. |
| **Underwriting for credit tabs** | Credence can back credit tabs from a liquidity pool (building on the existing `LendingPool`), earning the spread and carrying the default risk it prices. |
| **Risk intelligence** | The goods in our demo, wallet and agent risk reports, sold agent-to-agent over HSP. Credence is its own first customer. |

**Why it compounds:** every settlement improves the trust record, which makes terms more accurate, which brings more volume through HSP, which produces more settlements. A newcomer can copy the code but not the history.

**Why HashKey:** HSK Chain is a compliance-first chain with HSP as its payment rail. Credence adds the missing risk layer on top of HSP, so every Credence-rated purchase is HSP volume.

---

## Run it locally

Requirements: Node.js 20+, Python 3.12, a funded testnet wallet, and **IP allowlisting from HSP Operations** for the machine that runs the agent service (see the HSP Agentic Payment guide, step 1).

```powershell
git clone https://github.com/hari-hara-sudharsan/Cre.git
cd Cre
npm install                                   # Hardhat workspace
copy .env.example agent\.env                  # then fill in agent keys and contract addresses
powershell -ExecutionPolicy Bypass -File scripts\dev.ps1
```

`dev.ps1` creates the Python venv, installs dependencies, and opens two windows:

- Agent API: http://localhost:8000/health
- Agent Console: http://localhost:3000/console

Or start each one manually:

```powershell
cd agent
.\.venv\Scripts\uvicorn.exe app.main:app --port 8000
```

```powershell
cd web
npm run dev
```

### Deploy the contracts yourself

```powershell
npx hardhat ignition deploy ignition/modules/Credence.ts --network hashkeyTestnet --deployment-id credence-testnet
npx hardhat run scripts/setup-agents.ts --network hashkeyTestnet
cd agent; .\.venv\Scripts\python -m scripts.seed      # optional: build demo histories
```

`setup-agents.ts` grants the receiving agent `SETTLER_ROLE`, funds its gas, and gives each payment agent an owner policy ($200/day, $50 per payment, one merchant, 30 days) and 500 cUSD.

`scripts.seed` runs real purchases through the normal flow, with the script giving both approvals; seeded runs are tagged in the UI. `scripts.seed --sweep` is the collections job: it marks overdue tabs as defaulted.

### Configuration (`agent/.env`)

| Variable | Purpose |
|---|---|
| `HSK_NETWORK` | `hashkey-testnet` (HSP QA) or `hashkey` |
| `HSP_MCP_URL` | `https://mcp-qa.hashkeymerchant.com/` |
| `HSP_TEAM_NAME` | Hackathon team name, used as `merchant_name` on create and query |
| `HSP_COIN` | Token chosen from `get_chain_config`, e.g. `USDC` |
| `MERCHANT_AGENT_KEY` | Receiving agent wallet: `pay_to` and registry settler |
| `BUYER_AGENT_KEY` | Payment agent wallet: signs EIP-712 authorisations |
| `A2A_REGISTRY_ADDRESS`, `SPENDING_POLICY_ADDRESS`, `TEST_USD_ADDRESS` | Deployed contracts |
| `DEFAULT_RAIL` | `sandbox` or `hsp` |
| `PERSONA_KEYS` | `nova=0x…,orbit=0x…,atlas=0x…,rogue=0x…`: payment agent wallets |
| `GROQ_API_KEY` | Optional; without it, intents are parsed by deterministic rules |

---

## Tests

```powershell
npx hardhat test solidity                     # 75 passing
cd agent; .\.venv\Scripts\python -m pytest    # 9 passing
```

- **Solidity (75):** 28 new tests.
  - Spending policy: caps, daily reset, expiry, pause, owner-only control.
  - Registry: the trust → terms progression, tabs, late payment, default, duplicate mandates, recorded policy violations, fee accrual only on deferred terms, admin-only fee cap, the reputation feed, and a 256-run fuzz test that keeps the score within [300, 900].
  - cUSD EIP-3009: relayed authorisation, replay, expiry, wrong signer, faucet cooldown.

  The other 47 are tests imported with the prototype contracts.
- **Python (9):** cart mandate shape, schema-driven argument fitting, chain-config token selection, and a **full A2A run against a fake HSP MCP server**. It asserts that nothing is signed before the first approval, nothing is submitted before the second, the signature recovers to the payer, settlement is anchored once, trust rises, and the spending policy blocks a payment before any signature.

---

## Built during the hackathon

The rules require projects to be built or rebuilt during the hackathon (Oct 23 – Nov 1, 2026). This repository makes the boundary explicit:

- **Commit 1** (`Import Credence core from pre-hackathon prototype`) brings in prior work from [credence-ai](https://github.com/hari-hara-sudharsan/credence-ai) (June to July 2026): the five contracts already live on mainnet with their tests, the wallet credit-scoring engine, and the web toolchain.
- **Every later commit is hackathon work:**
  - `AgentSpendingPolicy`, `A2ASettlementRegistry` (trust, terms, fee ledger) and `CredenceTestUSD`, with tests
  - deployment of the full 8-contract stack to HSK testnet, wired together
  - the sandbox rail, four payment agents with on-chain histories, and the collections sweep
  - the HSP Agentic Payment MCP integration and two-approval state machine
  - the payment and receiving agents
  - the agent API
  - the new web app (Landing, Console, Agents, Business, Settlements, Developers, trust passport)
  - this README

We deliberately did not carry over the prototype's earlier "HSP" code, which was a plain native-token transfer, or any unverified contract addresses.

## Roadmap

- **Now:** first live HSP QA settlements, then mainnet deployment of the A2A contracts.
- **Next:**
  - Permit2 (USDT) payments.
  - Agent-signed reusable mandates for subscriptions and metered usage.
  - Owner policy editing from a connected wallet in the UI.
- **Then:**
  - Pool-backed credit tabs.
  - Open trust API and SDK so third-party merchant agents can price counterparties.
  - Cross-chain trust portability via Chainlink CCIP.

## Team

Two builders plus Claude Code, for the HSK Chain Horizon Hackathon, Mumbai, November 2026.

## License

MIT
