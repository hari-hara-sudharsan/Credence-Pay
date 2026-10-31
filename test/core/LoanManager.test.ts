import { expect } from "chai";
import { network } from "hardhat";
const { ethers } = await network.create();

describe("LoanManager Unit Tests", function () {
  it("Should deploy successfully", async function () {
    const Contract = await ethers.getContractFactory("LoanManager");
    const [owner] = await ethers.getSigners();
    // Use dummy addresses for dependencies
    const contract = await Contract.deploy(owner.address, owner.address);
    expect(await contract.getAddress()).to.be.properAddress;
  });
});

