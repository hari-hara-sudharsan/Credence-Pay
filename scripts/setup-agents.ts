// Wires the demo agents to the deployed Credence contracts.
//   npx hardhat run scripts/setup-agents.ts --network hashkeyTestnet
// Reads agent keys and contract addresses from agent/.env. The deployer acts as the
// human owner who delegates bounded spending authority to each payment agent.
import { network } from "hardhat";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";

const env = parse(readFileSync("agent/.env"));
const { ethers } = await network.create();
const [owner] = await ethers.getSigners();

const merchant = new ethers.Wallet(env.MERCHANT_AGENT_KEY).address;
const personas = Object.fromEntries(
  env.PERSONA_KEYS.split(",").map((pair) => {
    const [id, key] = pair.split("=");
    return [id, new ethers.Wallet(key).address];
  }),
);
const registry = await ethers.getContractAt("A2ASettlementRegistry", env.A2A_REGISTRY_ADDRESS);
const policy = await ethers.getContractAt("AgentSpendingPolicy", env.SPENDING_POLICY_ADDRESS);
const cusd = await ethers.getContractAt("CredenceTestUSD", env.TEST_USD_ADDRESS);

const USD = 1_000_000n; // 6-decimal stablecoin units

// The public testnet RPC is load-balanced; a node can lag a block behind the one that confirmed
// our transaction. Wait until a read reflects the write before sending a dependent transaction.
async function until(check: () => Promise<boolean>, label: string) {
  for (let i = 0; i < 30; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`timed out waiting for ${label}`);
}

const settler = await registry.SETTLER_ROLE();
if (!(await registry.hasRole(settler, merchant))) {
  await (await registry.grantRole(settler, merchant)).wait();
  console.log(`granted SETTLER_ROLE to merchant agent ${merchant}`);
}

const gas = await ethers.provider.getBalance(merchant);
if (gas < ethers.parseEther("0.1")) {
  await (await owner.sendTransaction({ to: merchant, value: ethers.parseEther("0.2") })).wait();
  console.log("sent 0.2 HSK gas to merchant agent");
}

// Each payment agent: 200 USD/day, 50 USD per payment, this merchant only, 30-day mandate, 500 cUSD.
const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 30 * 86400);
for (const [id, agent] of Object.entries(personas)) {
  const current = await policy.policies(agent);
  if (current.dailyCap !== 200n * USD) {
    await (await policy.setPolicy(agent, 200n * USD, 50n * USD, expiresAt, false)).wait();
    await until(async () => (await policy.policies(agent)).owner === owner.address, `${id} policy`);
  }
  if (!(await policy.merchantAllowed(agent, merchant))) {
    await (await policy.setMerchantAllowed(agent, merchant, true)).wait();
    await until(() => policy.merchantAllowed(agent, merchant), `${id} merchant allow-list`);
  }
  if ((await cusd.balanceOf(agent)) < 100n * USD) {
    await (await cusd.mint(agent, 500n * USD)).wait();
    await until(async () => (await cusd.balanceOf(agent)) >= 100n * USD, `${id} cUSD`);
  }
  console.log(`${id.padEnd(6)} ${agent}  policy set, cUSD ${(await cusd.balanceOf(agent)) / USD}`);
}
