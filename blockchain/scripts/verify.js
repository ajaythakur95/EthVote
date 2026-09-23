/**
 * Verify deployed contracts on Polygonscan
 * Run: npx hardhat run scripts/verify.js --network amoy
 */
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const networkName = hre.network.name;
  const deployment = JSON.parse(
    fs.readFileSync(path.join(__dirname, `../deployments/${networkName}.json`))
  );

  console.log(`Verifying on ${networkName}...`);

  try {
    await hre.run("verify:verify", {
      address: deployment.contracts.VoterIdentity,
      constructorArguments: [deployment.deployer],
    });
    console.log("✓ VoterIdentity verified");
  } catch (e) {
    if (e.message.includes("Already Verified")) console.log("✓ VoterIdentity already verified");
    else throw e;
  }

  try {
    await hre.run("verify:verify", {
      address: deployment.contracts.EthVote,
      constructorArguments: [deployment.contracts.VoterIdentity, deployment.deployer],
    });
    console.log("✓ EthVote verified");
  } catch (e) {
    if (e.message.includes("Already Verified")) console.log("✓ EthVote already verified");
    else throw e;
  }
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
