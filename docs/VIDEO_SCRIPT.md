# Credence demo video: script and app flow

Target length: **about 3 minutes**. Format: screen recording with voice-over, 1920×1080.

## Before you record

| Check | How |
|---|---|
| On the **phone hotspot** (HSP allowlists its IPv4 address) | `curl -4 https://mcp-qa.hashkeymerchant.com/health` returns `{"status":"ok"}` |
| Services running | `powershell -ExecutionPolicy Bypass -File scripts\dev.ps1` (three windows) |
| Console shows HSP reachable | http://localhost:3000/console, HSP rail chip is green |
| Payer has funds | Nova holds ~2.50 USDC: enough for the **$1 Trust attestation**, not another $2.50 risk report |
| Browser | Dark theme, zoom 110%, bookmarks bar hidden, notifications off |
| Tabs open in order | 1 `localhost:3000` · 2 `/console` · 3 `/agents` · 4 `/business` · 5 `/settlements` · 6 explorer tx `0x4e75…f585` · 7 `/developers` |

Recorder: **Xbox Game Bar** (`Win + Alt + R` starts/stops) or **OBS Studio** (Display Capture plus mic). Record the voice separately if your room is noisy, and lay it over in the editor.

## Shot list and voice-over

### 1. Hook (0:00 – 0:20) · Home page

**Screen:** home page hero. Scroll slowly down to the trust loop.

> "It's 2 a.m. A lending agent needs a risk report before it can approve a loan, and a risk agent it has never met can sell one for two dollars fifty. Who goes first? HSP lets agents pay each other. **Credence decides on what terms.**"

### 2. The idea (0:20 – 0:40) · Home page, trust simulator

**Screen:** drag the trust simulator from 300 up past 560 and 700. Prepay, Net 7 and Credit tab light up in turn.

> "Every HSP settlement becomes on-chain memory. Memory becomes a trust score from 300 to 900. And the score becomes terms: Prepay for strangers, Net 7 for reliable agents, and a credit tab for the best. One default and you're back to Prepay."

### 3. Same product, four buyers (0:40 – 1:00) · Agents page

**Screen:** `/agents`. Hover Atlas, then Rogue.

> "These four agents built real histories on HashKey Chain. Atlas, 760, gets a credit tab. Nova and Orbit get Net 7. Rogue defaulted on a six-dollar tab and is back on Prepay. Same seller, same product, four different answers, all computed on-chain by `termsFor()`."

### 4. Live HSP payment (1:00 – 2:05) · Console, the centrepiece

**Screen:** `/console`.

1. Pick **Nova** in step 1. *(The trust panel shows 591 → Net 7.)*
2. Choose the **HSP** rail and the **Trust attestation** product.
   > "Nova will buy a signed trust attestation from the Credence Risk Agent: a separate A2A agent, found through its Agent Card, paid through HSP Agentic Payment."
3. Click start. The **confirmation sheet** opens: `Credence7`, `pay_to`, payer.
   > "Following the HSP guide, I confirm the team, the recipient and the payer before any order exists."
4. Watch the timeline fill: Agent Card, identity signature, trust check, Cart Mandate, HSP order.
   > "The payer proves who it is with a signature, so nobody can borrow Atlas's credit. The seller checks Nova's trust on-chain: Net 7, so the goods are delivered first and a tab opens on-chain."
5. **Approval sheet #1** shows `token_total_raw`. Pause on it for 2 seconds, then approve.
   > "The AI recommends, the human authorises. Nothing is signed until I approve the exact amount."
6. **Approval sheet #2**: approve the submission.
   > "And nothing reaches HSP until I approve again."
7. Wait for **payment-safe** or **payment-finalized** and the trust score ticking up. *(Cut out the waiting in the edit if it's longer than about 15 seconds.)*
   > "HSP settles in USDC. The seller doesn't take the buyer's word for it: it checks with HSP itself, then anchors the settlement on-chain, and Nova's trust goes up."

### 5. Proof on-chain (2:05 – 2:25) · Settlements, then the explorer

**Screen:** `/settlements`, filter or scroll to the HSP rows, then switch to the explorer tab for `0x4e75…f585` and highlight the USDC transfer.

> "Every settlement is public. Here is our first live HSP payment on HSK testnet: 2.50 USDC from Nova to Credence7, verified as payment-safe and anchored in the settlement registry."

### 6. Guardrails and business (2:25 – 2:45) · Business page

**Screen:** `/business`, the KPI row and fee chart.

> "Owners set daily caps, per-payment caps, allowed merchants and a pause switch in an on-chain spending policy, and every breach is recorded. Credence earns 1.5% only on Net and Credit volume, accrued on-chain, so we earn only when trust makes a better sale possible."

### 7. Close (2:45 – 3:00) · Developers page, then back to the home hero

**Screen:** `/developers` (Agent Card and contract addresses, HSK Mainnet first), then the home hero.

> "The A2A contracts are already live on HSK Mainnet. ERC-20 made assets programmable, ERC-721 made ownership programmable. **Credence makes trust programmable.** Credence: HSP lets agents pay each other; we decide on what terms."

End card (3 seconds): the logo, `credence-pay-lyart.vercel.app`, `github.com/hari-hara-sudharsan/Credence-Pay`.

## Editing checklist

- Cut dead time while HSP settles; keep the moment the status turns to `payment-safe`.
- Zoom (Ctrl + scroll in the editor, or Game Bar's crop) on: the confirmation sheet, `token_total_raw`, the trust score change, the explorer transfer.
- Add captions: YouTube auto-captions work, but check "HSP", "A2A" and "Credence7".
- Background music at about −25 dB under the voice, or none.

## YouTube upload

**Title:** Credence: credit terms for AI agents, paid through HSP on HashKey Chain

**Description:**

```
HSP lets agents pay each other. Credence decides on what terms.

Credence turns every HSP settlement into on-chain trust, so reliable AI agents move from Prepay to Net 7 to a credit tab, inside spending limits their human owners set on-chain.

• Real A2A 0.3 agents with AP2 mandates
• Live HSP Agentic Payment on HSK testnet (flow 22ed967f-079c-478d-8252-3b513558d1a2)
• A2A contracts live on HSK Mainnet
• Two human approvals on every payment

Live demo: https://credence-pay-lyart.vercel.app
Code: https://github.com/hari-hara-sudharsan/Credence-Pay

HSK Chain Horizon Hackathon · Mumbai 2026 · Track 2: Agent Payments & A2A Settlement (HSP)
```

**Chapters** (paste into the description):

```
0:00 Who pays first?
0:20 Settlement → trust → terms
0:40 Four agents, four outcomes
1:00 Live HSP payment over A2A
2:05 Proof on HashKey Chain
2:25 Guardrails and business model
2:45 Live on mainnet
```
