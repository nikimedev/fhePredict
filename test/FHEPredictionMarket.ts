import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { FHEPredictionMarket, FHEPredictionMarket__factory } from "../types";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("FHEPredictionMarket")) as FHEPredictionMarket__factory;
  const contract = (await factory.deploy()) as FHEPredictionMarket;
  return contract;
}

describe("FHEPredictionMarket", function () {
  let signers: Signers;
  let predictionMarket: FHEPredictionMarket;
  let contractAddress: string;

  before(async function () {
    const ethSigners = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn("This test suite only runs inside the FHEVM mock");
      this.skip();
    }

    predictionMarket = await deployFixture();
    contractAddress = await predictionMarket.getAddress();
  });

  it("creates predictions with valid option counts", async function () {
    await expect(predictionMarket.createPrediction("", ["Yes", "No"])).to.be.revertedWithCustomError(
      predictionMarket,
      "EmptyName",
    );

    await expect(predictionMarket.createPrediction("Invalid", ["OnlyOne"])).to.be.revertedWithCustomError(
      predictionMarket,
      "InvalidOptionsCount",
    );

    await expect(predictionMarket.createPrediction("Full", ["A", "B", "C", "D", "E"])).to.be.revertedWithCustomError(
      predictionMarket,
      "InvalidOptionsCount",
    );

    await predictionMarket.createPrediction("Weather", ["Sunny", "Rainy"]);
    const summaries = await predictionMarket.listPredictions();
    expect(summaries.length).to.eq(1);
    expect(summaries[0].name).to.eq("Weather");
    expect(summaries[0].options.length).to.eq(2);
  });

  it("stores encrypted bets and aggregates option totals", async function () {
    await predictionMarket.createPrediction("Winner", ["Team A", "Team B", "Draw"]);

    const encryptedChoice = await fhevm
      .createEncryptedInput(contractAddress, signers.alice.address)
      .add8(1)
      .encrypt();

    const stake = ethers.parseEther("0.5");
    await predictionMarket
      .connect(signers.alice)
      .placeEncryptedBet(1, encryptedChoice.handles[0], encryptedChoice.inputProof, { value: stake });

    const betData = await predictionMarket.getUserBet(1, signers.alice.address);
    expect(betData[2]).to.eq(true);

    const decryptedAmount = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      betData[0],
      contractAddress,
      signers.alice,
    );
    expect(decryptedAmount).to.eq(stake);

    const decryptedChoice = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      betData[1],
      contractAddress,
      signers.alice,
    );
    expect(decryptedChoice).to.eq(1);

    const [optionTotals, pool] = await predictionMarket.getEncryptedTotals(1);
    const decryptedPool = await fhevm.userDecryptEuint(FhevmType.euint64, pool, contractAddress, signers.alice);
    expect(decryptedPool).to.eq(stake);

    const decryptedOptionTotals = [];
    for (const total of optionTotals) {
      const value = await fhevm.userDecryptEuint(FhevmType.euint64, total, contractAddress, signers.alice);
      decryptedOptionTotals.push(value);
    }

    expect(decryptedOptionTotals[1]).to.eq(stake);
    expect(decryptedOptionTotals[0]).to.eq(0);
    expect(decryptedOptionTotals[2]).to.eq(0);
  });
});
