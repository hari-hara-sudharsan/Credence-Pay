// Checks everything the mainnet deployment needs, sends nothing.
//   npx hardhat run scripts/mainnet-preflight.ts --network hashkey
import { network } from "hardhat";
import { readFileSync } from "node:fs";
import { parse } from "dotenv";

const { ethers } = await network.create();
const [deployer] = await ethers.getSigners();
const provider = ethers.provider;
const chainId = (await provider.getNetwork()).chainId;
const REPUTATION = "0x110e9fB1ABEc92521E4511d5f45B4917B4c941Ab";
const USDC = "0x054ed45810DbBAb8B27668922D110669c9D88D0a";

let ok = true;
const check = (pass: boolean, label: string, detail = "") => {
  ok &&= pass;
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
};

check(chainId === 177n, "connected to HSK Chain mainnet", `chainId ${chainId}`);
console.log(`      deployer ${deployer.address}`);

// gas budget: estimate the two deployments plus wiring at the current base fee
const fee = await provider.getFeeData();
const price = (fee.maxFeePerGas ?? fee.gasPrice ?? 0n) + 0n;
const policyF = await ethers.getContractFactory("AgentSpendingPolicy");
const registryF = await ethers.getContractFactory("A2ASettlementRegistry");
const gPolicy = await provider.estimateGas({ from: deployer.address, data: (await policyF.getDeployTransaction(deployer.address)).data });
const gRegistry = await provider.estimateGas({ from: deployer.address, data: (await registryF.getDeployTransaction(deployer.address, deployer.address)).data });
const wiring = 400_000n;
const need = ((gPolicy + gRegistry + wiring) * price * 125n) / 100n; // 25% headroom
const have = await provider.getBalance(deployer.address);
console.log(`      gas: policy ${gPolicy}, registry ${gRegistry}, wiring ~${wiring} at ${ethers.formatUnits(price, "gwei")} gwei`);
check(have >= need, "deployer can pay for the deployment", `has ${ethers.formatEther(have)} HSK, needs ~${ethers.formatEther(need)} HSK`);

// the prototype ReputationRegistry must be live and administered by this deployer
const rep = await ethers.getContractAt("ReputationRegistry", REPUTATION);
check((await provider.getCode(REPUTATION)).length > 2, "ReputationRegistry has bytecode on mainnet", REPUTATION);
check(await rep.hasRole(ethers.ZeroHash, deployer.address), "deployer administers ReputationRegistry (can grant ORACLE_ROLE)");
check((await provider.getCode(USDC)).length > 2, "HSP USDC (EIP-3009) live on mainnet", USDC);

// the receiving agent needs gas on mainnet to anchor settlements
try {
  const env = parse(readFileSync("agent/.env"));
  const merchant = new ethers.Wallet(env.MERCHANT_AGENT_KEY).address;
  const mBal = await provider.getBalance(merchant);
  console.log(`      merchant agent ${merchant}: ${ethers.formatEther(mBal)} HSK`);
  check(mBal >= ethers.parseEther("0.3"), "receiving agent has gas for ~10 anchors/tabs", "needs >= 0.3 HSK");
  console.log(`\nDeploy with:\n  npx hardhat ignition deploy ignition/modules/CredenceMainnet.ts --network hashkey --deployment-id credence-mainnet --parameters '{"CredenceMainnet":{"merchantAgent":"${merchant}"}}'`);
} catch {
  check(false, "agent/.env readable with MERCHANT_AGENT_KEY");
}

console.log(ok ? "\nREADY for mainnet." : "\nNOT READY: fix the FAIL lines above.");
