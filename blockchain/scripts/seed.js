/**
 * Seed script: Creates test data on local Hardhat network
 * Run after deploy.js: npx hardhat run scripts/seed.js --network localhost
 */
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const deployment = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../deployments/localhost.json"))
  );

  const [deployer, voter1, voter2, voter3, candidate1, candidate2] = await hre.ethers.getSigners();

  const VoterIdentity = await hre.ethers.getContractAt("VoterIdentity", deployment.contracts.VoterIdentity);
  const EthVote = await hre.ethers.getContractAt("EthVote", deployment.contracts.EthVote);

  console.log("Seeding test data...\n");

  // Mint SBTs for test voters
  const voters = [voter1, voter2, voter3, candidate1, candidate2];
  for (let i = 0; i < voters.length; i++) {
    const hash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(`test_aadhaar_${i}_salt`));
    const tx = await VoterIdentity.mintIdentity(voters[i].address, hash, `ipfs://QmTest/voter${i}.json`);
    await tx.wait();
    console.log(`✓ SBT minted for voter${i + 1}: ${voters[i].address}`);
  }

  // Create election starting in 2 minutes
  const now = Math.floor(Date.now() / 1000);
  const tx = await EthVote.createElection(
    "Lok Sabha General Election 2025",
    "National General Election for Lok Sabha constituencies",
    "NATIONAL",
    now + 120,       // starts in 2 min
    now + 86400 * 7  // ends in 7 days
  );
  const receipt = await tx.wait();
  const event = receipt.logs
    .map(l => { try { return EthVote.interface.parseLog(l); } catch { return null; } })
    .find(e => e?.name === "ElectionCreated");
  const electionId = event.args.electionId;
  console.log(`\n✓ Election created: ID=${electionId}`);

  // Register candidates
  const candidateData = [
    { signer: candidate1, name: "Rahul Mehta", party: "Progressive Alliance", symbol: "ipfs://QmSymbol1", manifesto: "ipfs://QmManifesto1" },
    { signer: candidate2, name: "Priya Sharma", party: "National Unity Front", symbol: "ipfs://QmSymbol2", manifesto: "ipfs://QmManifesto2" },
  ];

  const candidateIds = [];
  for (const c of candidateData) {
    const tx = await EthVote.connect(c.signer).registerCandidate(electionId, c.name, c.party, c.symbol, c.manifesto);
    const receipt = await tx.wait();
    const evt = receipt.logs.map(l => { try { return EthVote.interface.parseLog(l); } catch { return null; } })
      .find(e => e?.name === "CandidateRegistered");
    const candidateId = evt.args.candidateId;
    candidateIds.push(candidateId);
    await EthVote.approveCandidate(candidateId);
    console.log(`✓ Candidate approved: ${c.name} (ID=${candidateId})`);
  }

  console.log("\n=== SEED COMPLETE ===");
  console.log(`Election ID (on-chain): ${electionId}`);
  console.log(`Voter 1: ${voter1.address}`);
  console.log(`Voter 2: ${voter2.address}`);
  console.log(`Candidate 1: ${candidate1.address}`);
  console.log(`Candidate 2: ${candidate2.address}`);
  console.log("\nElection starts in 2 minutes. Use setElectionStatus to activate it manually.");
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
