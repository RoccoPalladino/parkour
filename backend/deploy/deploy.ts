import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedParkourGame = await deploy("ParkourGame", {
    from: deployer,
    log: true,
  });

  console.log(`ParkourGame contract: `, deployedParkourGame.address);
};
export default func;
func.id = "deploy_parkourGame"; // id required to prevent reexecution
func.tags = ["ParkourGame"];

