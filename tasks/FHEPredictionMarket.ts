import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";
import { FhevmType } from "@fhevm/hardhat-plugin";

task("task:prediction-address", "Prints the FHEPredictionMarket deployment address").setAction(
  async (_taskArguments: TaskArguments, hre) => {
    const { deployments } = hre;
    const deployment = await deployments.get("FHEPredictionMarket");
    console.log(`FHEPredictionMarket address: ${deployment.address}`);
  },
);

task("task:create-prediction", "Creates a prediction with 2-4 comma separated options")
  .addParam("name", "Prediction title")
  .addParam("options", "Comma separated option labels, e.g. 'Yes,No'")
  .setAction(async (taskArgs: TaskArguments, hre) => {
    const { ethers, deployments } = hre;
    const deployment = await deployments.get("FHEPredictionMarket");
    const signer = (await ethers.getSigners())[0];
    const contract = await ethers.getContractAt("FHEPredictionMarket", deployment.address);

    const options = String(taskArgs.options)
      .split(",")
      .map((option: string) => option.trim())
      .filter((option: string) => option.length > 0);

    console.log(`Creating "${taskArgs.name}" with options: ${options.join(", ")}`);
    const tx = await contract.connect(signer).createPrediction(taskArgs.name, options);
    const receipt = await tx.wait();
    console.log(`Transaction mined in block ${receipt?.blockNumber}`);
  });

task("task:list-predictions", "Lists every prediction created").setAction(async (_: TaskArguments, hre) => {
  const { deployments, ethers } = hre;
  const deployment = await deployments.get("FHEPredictionMarket");
  const contract = await ethers.getContractAt("FHEPredictionMarket", deployment.address);
  const summaries = await contract.listPredictions();
  console.log(`Found ${summaries.length} prediction(s)`);
  summaries.forEach((summary: any) => {
    console.log(
      `- #${summary.id.toString()} ${summary.name} (${summary.options.length} options, created ${new Date(
        Number(summary.createdAt) * 1000,
      ).toISOString()})`,
    );
  });
});

task("task:place-bet", "Places an encrypted bet on a prediction")
  .addParam("prediction", "Prediction id")
  .addParam("choice", "0-based option index to bet on")
  .addParam("eth", "ETH amount to send, e.g. 0.1")
  .setAction(async (taskArgs: TaskArguments, hre) => {
    const { ethers, deployments, fhevm } = hre;
    const deployment = await deployments.get("FHEPredictionMarket");
    const contract = await ethers.getContractAt("FHEPredictionMarket", deployment.address);
    const contractAddress = await contract.getAddress();
    const signer = (await ethers.getSigners())[0];

    const predictionId = Number(taskArgs.prediction);
    const choice = Number(taskArgs.choice);
    if (Number.isNaN(predictionId) || Number.isNaN(choice)) {
      throw new Error("Prediction id and choice must be numeric");
    }

    const encryptedChoice = await fhevm
      .createEncryptedInput(contractAddress, signer.address)
      .add8(choice)
      .encrypt();

    const tx = await contract
      .connect(signer)
      .placeEncryptedBet(predictionId, encryptedChoice.handles[0], encryptedChoice.inputProof, {
        value: ethers.parseEther(String(taskArgs.eth)),
      });

    console.log(`Placed bet tx=${tx.hash}`);
    await tx.wait();
  });

task("task:decrypt-totals", "Decrypts option totals for a prediction")
  .addParam("prediction", "Prediction id")
  .setAction(async (taskArgs: TaskArguments, hre) => {
    const { ethers, deployments, fhevm } = hre;
    const deployment = await deployments.get("FHEPredictionMarket");
    const contract = await ethers.getContractAt("FHEPredictionMarket", deployment.address);
    const contractAddress = await contract.getAddress();
    const signer = (await ethers.getSigners())[0];
    const predictionId = Number(taskArgs.prediction);

    const [totals, pool] = await contract.getEncryptedTotals(predictionId);
    console.log(`Prediction #${predictionId} pool handle: ${pool}`);

    const clearPool = await fhevm.userDecryptEuint(FhevmType.euint64, pool, contractAddress, signer);
    console.log(`Total pool (wei): ${clearPool.toString()}`);

    for (let i = 0; i < totals.length; i++) {
      const decrypted = await fhevm.userDecryptEuint(FhevmType.euint64, totals[i], contractAddress, signer);
      console.log(`Option #${i} total (wei): ${decrypted.toString()}`);
    }
  });
