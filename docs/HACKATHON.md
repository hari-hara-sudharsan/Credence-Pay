# Credence: the trust layer for agent payments on HashKey Chain

**HSP lets agents pay each other. Credence decides on what terms.**

Track 2: Agent Payments & A2A Settlement (HSP) · Live on HSK Mainnet

## The problem

AI agents are starting to buy from each other: data, compute, API calls, research. HSP already lets one agent pay another in stablecoins. But no payment rail answers the question every seller asks first: **will this agent actually pay?**

So every agent is a stranger on every purchase. Sellers either make everyone prepay, which is slow and treats loyal buyers like strangers forever, or trust blindly and get drained by the first bad agent. People solved this long ago with credit history. Agentic commerce has nothing like it.

## What Credence does

Credence is a trust and terms layer that sits on top of HSP.

1. **Every HSP settlement becomes on-chain memory.** When a payment reaches `payment-safe` or `payment-finalized`, the receiving agent verifies it with HSP itself and anchors it on HSK Chain with its HSP flow ID and transaction hash.
2. **Memory becomes a trust score.** `trustScore()` is computed on-chain from on-time payments, volume, late payments and defaults: 300 to 900, with no black box.
3. **Trust becomes terms.** `termsFor()` tells any seller what to offer:
   - below 560, or any default: **Prepay**
   - 560 to 699: **Net 7**, goods first, pay within 7 days
   - 700 and above: **Credit tab** of $25 to $225, due in 30 days
4. **Humans stay in control.** An agent can only spend inside an on-chain policy set by its owner (daily cap, per-payment cap, allowed merchants, expiry, pause switch), and every payment needs two explicit human approvals, before signing and before submission.

Trust is earned slowly and lost fast: one default sends an agent straight back to Prepay.

## Live proof

- **HSK Mainnet:** `A2ASettlementRegistry` (0xFA2CE501f004F53341665911A4E57FbAFA263966) and `AgentSpendingPolicy` (0xD10e77AF03cfA0a4241DdD298a9A4d4734Cb573b), deployed Nov 1 and wired into the Credence `ReputationRegistry` already live on mainnet.
- **HSK Testnet:** the full 8-contract stack, with **33 real settlements, $97 of volume, $0.765 of fees accrued on-chain and one $6 default.**
- **Four agents, four outcomes for the same product:** Atlas (760, Credit tab), Orbit (591, Net 7), Nova (561, just promoted from Prepay to Net 7), and Rogue (441, back on Prepay after defaulting).
- **HSP Agentic Payment:** connected to the live HSP QA MCP server with all 8 tools verified against live schemas, following every requirement of the HSP guide.

## Real A2A, not a mock

The seller, the Credence Risk Agent, is a standalone A2A 0.3 server in its own process. The buyer finds it through its Agent Card and buys with AP2 mandates (Intent, Cart, Payment) over JSON-RPC. Any A2A-compliant agent can buy from it. The goods are real: live wallet risk reports built from HSK Chain data.

Credence closes three holes a naive agent payment flow leaves open:

- **Impersonation:** the buyer proves its identity with a wallet signature before it is quoted, so no agent can borrow Atlas's credit.
- **"Trust me, I paid":** the seller checks payment status with HSP itself and anchors only a safe or finalized payment.
- **Runaway spend:** the on-chain policy check must pass before any signature, and a breach is still recorded on-chain, never hidden.

## Business model

- **1.5% fee on Net and Credit volume, accrued on-chain** by the registry; Prepay is free.
- Paid trust and risk lookups through the Credence API (on-chain reads stay free).
- Underwriting credit tabs from the existing `LendingPool`.
- Risk intelligence sold agent-to-agent over HSP; Credence is its own first customer.

Every settlement makes the record more accurate, better terms bring more HSP volume, and more volume produces more settlements. The code can be copied; the history cannot.

## Why HashKey

HSK Chain is a compliance-first chain with HSP as its native payment rail. Credence adds the missing risk layer on top, so every Credence-rated purchase is HSP volume, and trust earned in agent payments also strengthens the wallet's reputation in every other Credence application on HashKey Chain.

## Built with

Solidity and Hardhat 3 · HSP Agentic Payment (MCP) · A2A 0.3 · AP2 mandates · EIP-3009 · Python FastAPI · Next.js 16 and React 19. 89 tests passing (75 Solidity including fuzzing, 14 Python including a full A2A run against a fake HSP server).

## Vision

ERC-20 made assets programmable. ERC-721 made ownership programmable. Credence makes **trust** programmable. When agents transact at machine speed, every sale on HashKey Chain should begin with one question: *what does Credence say about this agent?*

**GitHub:** https://github.com/hari-hara-sudharsan/Cre
