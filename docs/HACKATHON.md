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
| **Nova** | 591 | Net 7, *recently promoted* | Crossed 560, then paid its latest tab through HSP |
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
- **HSP Agentic Payment, done by the book.** Credence connects to the HSP QA MCP server over Streamable HTTP, has **settled a live HSP payment**, verifies all 8 tools against their live schemas, resolves HSK USDC with `get_chain_config`, and implements every step of the HSP Agentic Payment guide: recipient and payer confirmation, `token_total_raw` display, approval gates, and the 10-minute "Pending confirmation" polling rule.

## What we shipped

| | |
|---|---|
| **HSK Mainnet** | `A2ASettlementRegistry` [`0xFA2C…3966`](https://hsk.blockscout.com/address/0xFA2CE501f004F53341665911A4E57FbAFA263966) and `AgentSpendingPolicy` [`0xD10e…573b`](https://hsk.blockscout.com/address/0xD10e77AF03cfA0a4241DdD298a9A4d4734Cb573b), wired into the Credence `ReputationRegistry` already live on mainnet |
| **HSK Testnet** | The full 8-contract stack: **35 real settlements, $102 of agent-to-agent volume, $0.84 of fees accrued on-chain, and one $6 default** |
| **Agents** | Four payment agents with distinct histories plus a standalone A2A receiving agent |
| **Tests** | **89 passing**: 75 Solidity (including a 256-run fuzz test that keeps every score inside [300, 900]) and 14 Python (including a full A2A run against a fake HSP server that proves nothing is signed or submitted without approval) |
| **Web app** | A guided console where you pick a buyer, watch the A2A conversation on the wire, approve each signature, and see the trust score move |

**First live HSP payment: settled.** On Nov 2, Nova bought a $2.50 risk report over A2A and paid through HSP Agentic Payment (QA MCP + Gateway, team Credence7): HSP flow `22ed967f-079c-478d-8252-3b513558d1a2`, quote `token_total_raw` 2500762, USDC transfer [`0x4e75e6a5…`](https://testnet-explorer.hskchain.net/tx/0x4e75e6a5f56646605acd4d9a4071b17cc93b3012df85443a92906ce8d8fcf585), verified by the receiving agent as `payment-safe` and anchored on-chain in [`0xe0bc260e…`](https://testnet-explorer.hskchain.net/tx/0xe0bc260ee63c135439c694a0f456de6a5fb18966aa1b0839347a160cace28b57). Trust went from 576 to 591. The earlier settlements ran on the **sandbox rail**, a testnet dollar with the same EIP-3009 scheme HSP uses for USDC, driven through the identical 8-tool state machine. Every step in the app is labelled with its rail.

## See it in three minutes

Open the [live demo](https://credence-pay-lyart.vercel.app) and follow the same path a buyer agent takes:

1. **Home:** drag the trust simulator from 300 to 900 and watch Prepay turn into Net 7, then a Credit tab.
2. **Agents:** the trust bureau, with four agents, four scores and four sets of terms, read from `trustScore()` and `termsFor()`.
3. **Console:** pick Nova, choose the HSP rail, and follow the A2A conversation: Agent Card → identity proof → trust check → Cart Mandate → two human approvals → HSP settlement → on-chain anchor → trust goes up.
4. **Settlements:** every payment with its rail, HSP flow ID and explorer link, starting with the first live HSP payment.
5. **Business:** volume by terms, fees accrued on-chain, open tabs and the default rate.
6. **Developers:** the receiving agent's Agent Card and every contract address, HSK Mainnet first.

The public site is a read-only snapshot of the live testnet agents. Clone the repo and run `scripts\dev.ps1` to make a real payment yourself.

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

## Demo video

**[Watch on YouTube: youtu.be/zwnT2ucXELg](https://youtu.be/zwnT2ucXELg)** (2:50)

A motion-graphics walkthrough built from real screens of the live app and the HashKey explorer, with the real values from the first live HSP payment.

| Time | Chapter |
|---|---|
| 0:00 | 2 a.m.: who pays first? |
| 0:08 | HSP lets agents pay each other. Credence decides on what terms. |
| 0:20 | Every agent is a stranger |
| 0:32 | Settlement → memory → score → terms |
| 0:50 | The trust ladder: Prepay, Net 7, Credit tab |
| 1:06 | Same order, different terms: four real agents |
| 1:26 | Real A2A: two agents, one protocol |
| 1:38 | The first live HSP payment, step by step |
| 2:06 | Proof on HashKey Chain |
| 2:22 | AI recommends, humans authorise, contracts enforce |
| 2:34 | Credence earns when trust earns |
| 2:42 | Live on HSK Mainnet |

**Live demo:** https://credence-pay-lyart.vercel.app · **Demo video:** https://youtu.be/zwnT2ucXELg · **GitHub:** https://github.com/hari-hara-sudharsan/Credence-Pay

Built with Solidity and Hardhat 3 · HSP Agentic Payment (MCP) · A2A 0.3 · AP2 mandates · EIP-3009 · Python FastAPI · Next.js 16 and React 19
