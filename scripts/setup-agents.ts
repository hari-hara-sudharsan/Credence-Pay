// Wires the demo agents to the deployed A2A contracts.
//   npx hardhat run scripts/setup-agents.ts --network hashkeyTestnet
// Reads agent keys and contract addresses from agent/.env. The deployer acts as
// the human owner who delegates bounded spending authority to the payment agent.
import { network } from "hardhat";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";

const env = parse(readFileSync("agent/.env"));
const { ethers } = await network.create();
const [owner] = await ethers.getSigners();

const merchant = new ethers.Wallet(env.MERCHANT_AGENT_KEY).address;
const buyer = new ethers.Wallet(env.BUYER_AGENT_KEY).address;
const registry = await ethers.getContractAt("A2ASettlementRegistry", env.A2A_REGISTRY_ADDRESS);
const policy = await ethers.getContractAt("AgentSpendingPolicy", env.SPENDING_POLICY_ADDRESS);

const USD = 1_000_000n; // 6-decimal stablecoin units

const settler = await registry.SETTLER_ROLE();
if (!(await registry.hasRole(settler, merchant))) {
  await (await registry.grantRole(settler, merchant)).wait();
  console.log(`granted SETTLER_ROLE to merchant agent ${merchant}`);
}

const gas = await ethers.provider.getBalance(merchant);
if (gas < ethers.parseEther("0.02")) {
  await (await owner.sendTransaction({ to: merchant, value: ethers.parseEther("0.05") })).wait();
  console.log("sent 0.05 HSK gas to merchant agent");
}

// Human owner policy for the payment agent: 5 USD/day, 1 USD per payment, only this merchant, 30-day mandate.
const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 30 * 86400);
await (await policy.setPolicy(buyer, 5n * USD, 1n * USD, expiresAt, false)).wait();
await (await policy.setMerchantAllowed(buyer, merchant, true)).wait();
console.log(`policy set for payment agent ${buyer}: 5 USD/day, 1 USD/tx, merchant ${merchant}`);

console.log("checkSpend(0.10 USD):", await policy.checkSpend(buyer, merchant, USD / 10n));
console.log("trustScore(buyer):", await registry.trustScore(buyer));
