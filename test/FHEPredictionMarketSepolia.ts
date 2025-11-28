import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm, deployments } from "hardhat";
import { expect } from "chai";

describe("FHEPredictionMarketSepolia", function () {
  let signer: HardhatEthersSigner;
  let contractAddress: string;
  let contract: any;

  before(async function () {
    if (fhevm.isMock) {
      console.warn("This test suite only runs against Sepolia");
      this.skip();
    }

    const deployment = await deployments.get("FHEPredictionMarket");
    contractAddress = deployment.address;
    contract = await ethers.getContractAt("FHEPredictionMarket", deployment.address);
    signer = (await ethers.getSigners())[0];
  });

  it("places an encrypted bet on an existing prediction", async function () {
    this.timeout(4 * 60 * 1000);
    const summaries = await contract.listPredictions();
    expect(summaries.length).to.be.greaterThan(0);
    const predictionId = summaries[0].id;

    const encryptedChoice = await fhevm
      .createEncryptedInput(contractAddress, signer.address)
      .add8(0)
      .encrypt();

    const tx = await contract
      .connect(signer)
      .placeEncryptedBet(predictionId, encryptedChoice.handles[0], encryptedChoice.inputProof, {
        value: ethers.parseEther("0.001"),
      });
    await tx.wait();
  });
});
