// Rehearses ignition/modules/CredenceMainnet.ts on an in-process chain: deploys a stand-in
// ReputationRegistry, runs the mainnet module against it, and checks every role and link.
//   npx hardhat run scripts/rehearse-mainnet.ts
import { network } from "hardhat";
import CredenceMainnet from "../ignition/modules/CredenceMainnet.js";

const { ethers, ignition } = await network.create();
const [admin, merchant] = await ethers.getSigners();
const rep = await ethers.deployContract("ReputationRegistry");
const { policy, registry } = await ignition.deploy(CredenceMainnet, {
  parameters: { CredenceMainnet: { reputation: await rep.getAddress(), merchantAgent: merchant.address } },
});
const checks: [string, boolean][] = [
  ["registry -> reputation", (await registry.reputation()) === (await rep.getAddress())],
  ["registry -> policy", (await registry.spendingPolicy()) === (await policy.getAddress())],
  ["policy METER_ROLE -> registry", await policy.hasRole(await policy.METER_ROLE(), await registry.getAddress())],
  ["reputation ORACLE_ROLE -> registry", await rep.hasRole(await rep.ORACLE_ROLE(), await registry.getAddress())],
  ["registry SETTLER_ROLE -> merchant agent", await registry.hasRole(await registry.SETTLER_ROLE(), merchant.address)],
  ["admin is DEFAULT_ADMIN", await registry.hasRole(ethers.ZeroHash, admin.address)],
];
for (const [label, pass] of checks) console.log(`${pass ? "PASS" : "FAIL"}  ${label}`);
if (checks.some(([, p]) => !p)) process.exitCode = 1;
