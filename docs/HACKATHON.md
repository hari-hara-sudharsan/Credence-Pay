# Credence: credit history for the machine economy

> **HSP lets agents pay each other. Credence decides on what terms.**

Track 2: Agent Payments & A2A Settlement (HSP) · Contracts live on HSK Mainnet · HSK Chain Horizon Hackathon, Mumbai 2026

---

## The 2 a.m. problem

It's 2 a.m. A lending agent needs a wallet risk report to approve a loan before its human wakes up. A risk agent it has never met can sell one for $3.

Who goes first?

If the seller demands prepayment, a buyer that has paid on time five hundred times is treated like a stranger on purchase five hundred and one. If the seller delivers first, the first dishonest agent to arrive drains it. Multiply that by millions of machine-speed purchases a day and you have the core flaw of agentic commerce: **every agent is a stranger on every purchase.**

Humans solved this centuries ago with credit history: the corner-shop tab, the trade reference, the credit bureau. Agents have nothing like it. HSP gives them a way to pay. Nobody has given them a reason to trust each other.

**Credence is that reason.**

## The idea in one loop

```
HSP settlement ──▶ on-chain memory ──▶ trust score ──▶ credit terms ──▶ more HSP volume ─┐
      ▲                                                                                   │
      └───────────────────────────────────────────────────────────────────────────────────┘
```

1. **Every settlement becomes memory.** When a payment reaches `payment-safe` or `payment-finalized`, the *receiving* agent checks it with HSP itself, never trusting the payer's word, and anchors it on HSK Chain with the HSP flow ID and transaction hash.
2. **Memory becomes a score.** `trustScore()` is computed on-chain from on-time payments, volume, lateness and defaults: 300 to 900, fully auditable, no black box.
3. **The score becomes terms.** `termsFor()` gives every seller the same answer:
   - **Prepay** below 560, or after any default
   - **Net 7** from 560 to 699: goods first, pay within a week
   - **Credit tab** from 700: $25 to $225, due in 30 days
4. **Better terms bring more volume through HSP.** That produces more settlements, which makes the record more accurate.

Trust is earned slowly and lost in one transaction: a single default sends an agent straight back to Prepay. That asymmetry is the whole point.

## Watch four agents buy the same thing

The same $3 risk report, the same seller, four different buyers, four different outcomes. All of it is computed live from on-chain history:

| Agent | Score | What the seller offers | Why |
|---|---|---|---|
| **Atlas** | 760 | Credit tab | Long record of on-time HSP settlements |
| **Orbit** | 591 | Net 7 | Reliable, but a thinner history |
| **Nova** | 576 | Net 7, *recently promoted* | Crossed 560 and moved up from Prepay |
| **Rogue** | 441 | Prepay | Defaulted on a $6 tab and lost everything it had earned |

And when someone pretends to be Atlas without Atlas's key, the receiving agent rejects them before any HSP order is created.

## AI recommends. Humans authorise. Contracts enforce.

Autonomous spending without guardrails is how agents get drained. Credence puts the human owner in charge on-chain:

- **`AgentSpendingPolicy`**: a daily cap, a per-payment cap, an allowlist of merchants, an expiry date and a pause switch, all set by the owner and checked *before* any signature exists.
- **Two explicit human approvals** on every payment: one before signing and one before submission. They cannot be skipped or reordered; the test suite proves it.
- **Breaches are recorded, not hidden.** A blocked payment still leaves an on-chain trace.

## Real A2A, real goods, real chain

- **A standalone A2A 0.3 receiving agent** (the *Credence Risk Agent*) runs as its own process. Payment agents find it through its Agent Card and buy with **AP2 mandates** (Intent → Cart → Payment) over JSON-RPC. Any A2A-compliant agent can buy from it.
- **The goods are real:** live wallet risk reports built from HSK Chain data via Blockscout. Credence is its own first customer.
- **HSP Agentic Payment, done by the book.** Credence connects to the HSP QA MCP server over Streamable HTTP, verifies all 8 tools against their live schemas, resolves HSK USDC with `get_chain_config`, and implements every step of the HSP Agentic Payment guide: recipient and payer confirmation, `token_total_raw` display, approval gates, and the 10-minute "Pending confirmation" polling rule.

## What we shipped

| | |
|---|---|
| **HSK Mainnet** | `A2ASettlementRegistry` [`0xFA2C…3966`](https://hsk.blockscout.com/address/0xFA2CE501f004F53341665911A4E57FbAFA263966) and `AgentSpendingPolicy` [`0xD10e…573b`](https://hsk.blockscout.com/address/0xD10e77AF03cfA0a4241DdD298a9A4d4734Cb573b), wired into the Credence `ReputationRegistry` already live on mainnet |
| **HSK Testnet** | The full 8-contract stack: **33 real settlements, $97 of agent-to-agent volume, $0.765 of fees accrued on-chain, and one $6 default** |
| **Agents** | Four payment agents with distinct histories plus a standalone A2A receiving agent |
| **Tests** | **89 passing**: 75 Solidity (including a 256-run fuzz test that keeps every score inside [300, 900]) and 14 Python (including a full A2A run against a fake HSP server that proves nothing is signed or submitted without approval) |
| **Web app** | A guided console where you pick a buyer, watch the A2A conversation on the wire, approve each signature, and see the trust score move |

**About the HSP rail.** The HSP integration is complete and verified against the live QA MCP server. HSP Operations has allowlisted Credence7's IP range; live HSP settlement is waiting for that allowlist to take effect at HSP's edge. Until then, all 33 settlements ran on the **sandbox rail**: a testnet dollar with the same EIP-3009 `transferWithAuthorization` scheme HSP uses for USDC, driven through the identical 8-tool state machine. Every step in the app is labelled with its rail, and a sandbox payment is never presented as an HSP payment. Switching rails is one setting.

## Business model

- **1.5% fee on Net and Credit volume**, accrued on-chain by the registry. Prepay stays free, so Credence earns only when it creates value: when trust lets a sale happen on better terms.
- Paid trust and risk lookups through the Credence API; on-chain reads stay free.
- Underwriting credit tabs from the existing `LendingPool`.
- Selling risk intelligence agent-to-agent over HSP.

**The moat is time.** Anyone can fork the contracts. Nobody can fork two years of settlement history.

## Why HashKey

HSK Chain is a compliance-first chain with HSP as its native payment rail. Credence adds the risk layer that rail is missing, so every Credence-rated purchase is HSP volume. Trust an agent earns here also strengthens its wallet's reputation across every other Credence application on HashKey Chain.

## Vision

ERC-20 made assets programmable. ERC-721 made ownership programmable. **Credence makes trust programmable.**

When agents transact at machine speed, every sale on HashKey Chain should start with one question: *what does Credence say about this agent?*

---

**Live demo:** https://credence-pay-lyart.vercel.app · **Demo video:** https://youtu.be/rczer5cuPpc · **GitHub:** https://github.com/hari-hara-sudharsan/Credence-Pay

Built with Solidity and Hardhat 3 · HSP Agentic Payment (MCP) · A2A 0.3 · AP2 mandates · EIP-3009 · Python FastAPI · Next.js 16 and React 19
