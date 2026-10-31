import { expect } from "chai";
import { network } from "hardhat";
const { ethers } = await network.create();

describe("LendingPool Unit Tests", function () {
  it("Should deploy successfully", async function () {
    const Contract = await ethers.getContractFactory("LendingPool");
    const [owner] = await ethers.getSigners();
    const contract = await Contract.deploy(owner.address, owner.address, owner.address);
    expect(await contract.getAddress()).to.be.properAddress;
  });
});

