// Tops up the receiving agent (registry settler) on HSK mainnet so it can pay gas for
// recordSettlement / openTab / markDefault. Sends only what is missing to reach the target.
//
//   npx hardhat run scripts/fund-merchant-mainnet.ts --network hashkey
import { network } from "hardhat";

const MERCHANT = "0x6CE2E6D1e14E1a111Ba1D106e784b325E2820eb5";
const TARGET = "0.3";

const { ethers } = await network.create();
const [owner] = await ethers.getSigners();
const { chainId } = await ethers.provider.getNetwork();
if (chainId !== 177n) throw new Error(`expected HSK mainnet (177), got ${chainId}`);

const target = ethers.parseEther(TARGET);
const before = await ethers.provider.getBalance(MERCHANT);
console.log(`receiving agent ${MERCHANT}: ${ethers.formatEther(before)} HSK`);
if (before >= target) {
  console.log("already funded");
} else {
  const tx = await owner.sendTransaction({ to: MERCHANT, value: target - before });
  console.log(`sent ${ethers.formatEther(target - before)} HSK from ${owner.address}: ${tx.hash}`);
  const receipt = await tx.wait();
  // Read at the receipt's block: a load-balanced RPC can otherwise answer from a node that is behind.
  const at = receipt!.blockNumber;
  console.log(`confirmed in block ${at}, status ${receipt!.status}`);
  console.log(`receiving agent now: ${ethers.formatEther(await ethers.provider.getBalance(MERCHANT, at))} HSK`);
}
console.log(`deployer left: ${ethers.formatEther(await ethers.provider.getBalance(owner.address, "latest"))} HSK`);
