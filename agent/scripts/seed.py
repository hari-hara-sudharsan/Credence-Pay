"""Build real on-chain payment histories for the demo agents (sandbox rail, HSK testnet).

Every purchase goes through the normal A2A flow; the script plays the human and
approves both gates. Runs are tagged seeded=True so the UI and metrics can tell
them apart from live demo runs.

    .venv/Scripts/python -m scripts.seed --one            # single end-to-end smoke run
    .venv/Scripts/python -m scripts.seed                  # full demo histories
"""

import argparse
import asyncio
import time

from app.agents.a2a_flow import A2AFlow, store
from app.agents.personas import persona_key
from app.chain.registry import TrustRegistry

TARGETS = ["0x2988f0bE02e1a679430aEb4A6B9B10429F1e8e80", "0x928BA9D30669c41695422a68a1C307a6529F0050",
           "0x4f3eEE789936a0eca627484bf680464f2F37b9FB", "0x110e9fB1ABEc92521E4511d5f45B4917B4c941Ab"]
PRODUCTS = ["Get a risk report on {t}", "Buy a signed trust attestation for {t}", "Run a portfolio scan on {t}"]


async def purchase(persona: str, i: int) -> dict:
    flow = A2AFlow(persona, "sandbox")
    run = await flow.start(PRODUCTS[i % 3].format(t=TARGETS[i % len(TARGETS)]) + ". Budget $10.")
    run["seeded"] = True
    store.save(run)
    if run["state"] != "awaiting_sign_approval":
        return run
    run = await flow.approve_sign(run["id"])
    if run["state"] != "awaiting_submit_approval":
        return run
    run = await flow.approve_submit(run["id"])
    for _ in range(40):
        if run["state"] != "settling":
            break
        time.sleep(2)
        run = await flow.refresh(run["id"])
    return run


def report(persona: str, run: dict):
    last = run["steps"][-1]
    print(f"  {persona:6} {run['state']:9} terms={run.get('terms')} trust {run.get('trust_before')}→{run.get('trust_after')}  {last['title']}: {last['detail'][:90]}")


async def seed_default(persona: str):
    """A deferred tab the agent never pays: opened with a short due date, then marked defaulted on-chain."""
    from eth_account import Account
    from app.config import settings
    reg = TrustRegistry()
    payer = Account.from_key(persona_key(persona)).address
    merchant = Account.from_key(settings.merchant_agent_key).address
    h = "0x" + Account.create().key.hex()[2:]
    reg.open_tab(h, payer, merchant, settings.test_usd_address, 6_000_000, "NET", int(time.time()) + 20)
    print(f"  {persona}: opened 6.00 cUSD NET tab due in 20 s, never paid…")
    time.sleep(30)
    fn = reg.registry.functions.markDefault(bytes.fromhex(h[2:]))
    print(f"  {persona}: markDefault tx {reg._send(fn)}  → trust now {reg.trust_score_after(payer, -1)}")


async def main(one: bool):
    if one:
        report("nova", await purchase("nova", 0))
        return
    plan = {"orbit": 5, "atlas": 14, "rogue": 6}
    for persona, n in plan.items():
        print(f"{persona}: {n} purchases")
        for i in range(n):
            report(persona, await purchase(persona, i))
    await seed_default("rogue")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--one", action="store_true")
    asyncio.run(main(ap.parse_args().one))
