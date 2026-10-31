// Copies the A2A contract ABIs from Hardhat artifacts into the agent and web apps.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const contracts = ["AgentSpendingPolicy", "A2ASettlementRegistry", "CredenceTestUSD"];
const targets = ["agent/app/chain/abi", "web/lib/abi"];

for (const dir of targets) mkdirSync(dir, { recursive: true });
for (const name of contracts) {
  const artifact = JSON.parse(readFileSync(`artifacts/contracts/a2a/${name}.sol/${name}.json`, "utf8"));
  for (const dir of targets) writeFileSync(`${dir}/${name}.json`, JSON.stringify(artifact.abi, null, 2) + "\n");
  console.log(`exported ${name}`);
}
