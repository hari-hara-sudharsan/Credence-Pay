import { expect } from "chai";
import { network } from "hardhat";
const { ethers } = await network.create();

describe("ReputationRegistry Unit Tests", function () {
  it("Should deploy successfully", async function () {
    const Contract = await ethers.getContractFactory("ReputationRegistry");
    const [owner] = await ethers.getSigners();
    const contract = await Contract.deploy(owner.address);
    expect(await contract.getAddress()).to.be.properAddress;
  });
});

