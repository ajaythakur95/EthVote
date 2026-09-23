const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with:", deployer.address);
  console.log("Account balance:", (await deployer.provider.getBalance(deployer.address)).toString());

  // 1. Deploy VoterIdentity (SBT)
  console.log("\n--- Deploying VoterIdentity.sol ---");
  const VoterIdentity = await hre.ethers.getContractFactory("VoterIdentity");
  const voterIdentity = await VoterIdentity.deploy(deployer.address);
  await voterIdentity.waitForDeployment();
  const voterIdentityAddress = await voterIdentity.getAddress();
  console.log("VoterIdentity deployed to:", voterIdentityAddress);

  // 2. Deploy EthVote (Main Election Contract)
  console.log("\n--- Deploying EthVote.sol ---");
  const EthVote = await hre.ethers.getContractFactory("EthVote");
  const ethVote = await EthVote.deploy(voterIdentityAddress, deployer.address);
  await ethVote.waitForDeployment();
  const ethVoteAddress = await ethVote.getAddress();
  console.log("EthVote deployed to:", ethVoteAddress);

  // 3. Save deployment addresses
  const deploymentInfo = {
    network: hre.network.name,
    chainId: hre.network.config.chainId,
    deployer: deployer.address,
    contracts: {
      VoterIdentity: voterIdentityAddress,
      EthVote: ethVoteAddress,
    },
    deployedAt: new Date().toISOString(),
  };

  const deploymentsDir = path.join(__dirname, "../deployments");
  if (!fs.existsSync(deploymentsDir)) fs.mkdirSync(deploymentsDir);
  
  const filename = path.join(deploymentsDir, `${hre.network.name}.json`);
  fs.writeFileSync(filename, JSON.stringify(deploymentInfo, null, 2));
  console.log("\nDeployment info saved to:", filename);

  console.log("\n=== DEPLOYMENT COMPLETE ===");
  console.log("VoterIdentity:", voterIdentityAddress);
  console.log("EthVote:      ", ethVoteAddress);
  console.log("\nAdd these to your .env:");
  console.log(`VOTER_IDENTITY_CONTRACT_ADDRESS=${voterIdentityAddress}`);
  console.log(`ETHVOTE_CONTRACT_ADDRESS=${ethVoteAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
