import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedPredictionMarket = await deploy("FHEPredictionMarket", {
    from: deployer,
    args: [],
    log: true,
  });

  console.log(`FHEPredictionMarket contract: `, deployedPredictionMarket.address);
};
export default func;
func.id = "deploy_prediction_market"; // id required to prevent reexecution
func.tags = ["FHEPredictionMarket"];
