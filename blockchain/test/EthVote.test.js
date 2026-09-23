const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("EthVote", function () {
  let voterIdentity, ethVote;
  let owner, voter1, voter2, voter3, attacker;
  let electionId;

  const aadhaarHash1 = ethers.keccak256(ethers.toUtf8Bytes("111111111111_salt"));
  const aadhaarHash2 = ethers.keccak256(ethers.toUtf8Bytes("222222222222_salt"));
  const aadhaarHash3 = ethers.keccak256(ethers.toUtf8Bytes("333333333333_salt"));
  const metaURI = "ipfs://QmTest/metadata.json";

  beforeEach(async () => {
    [owner, voter1, voter2, voter3, attacker] = await ethers.getSigners();

    const VoterIdentity = await ethers.getContractFactory("VoterIdentity");
    voterIdentity = await VoterIdentity.deploy(owner.address);
    await voterIdentity.waitForDeployment();

    const EthVote = await ethers.getContractFactory("EthVote");
    ethVote = await EthVote.deploy(await voterIdentity.getAddress(), owner.address);
    await ethVote.waitForDeployment();

    // Mint SBTs for voters
    await voterIdentity.mintIdentity(voter1.address, aadhaarHash1, metaURI);
    await voterIdentity.mintIdentity(voter2.address, aadhaarHash2, metaURI);
    await voterIdentity.mintIdentity(voter3.address, aadhaarHash3, metaURI);

    // Create election starting in 60s, ending in 1 day
    const now = await time.latest();
    const tx = await ethVote.createElection(
      "General Election 2025",
      "National General Election",
      "NATIONAL",
      now + 60,
      now + 86400
    );
    const receipt = await tx.wait();
    const event = receipt.logs
      .map(l => { try { return ethVote.interface.parseLog(l); } catch { return null; } })
      .find(e => e?.name === "ElectionCreated");
    electionId = event.args.electionId;
  });

  describe("Election Management", () => {
    it("Should create an election", async () => {
      const election = await ethVote.elections(electionId);
      expect(election.title).to.equal("General Election 2025");
      expect(election.status).to.equal(0); // CREATED
    });

    it("Should activate an election", async () => {
      await ethVote.setElectionStatus(electionId, 1); // ACTIVE
      const election = await ethVote.elections(electionId);
      expect(election.status).to.equal(1);
    });

    it("Should not allow non-owner to create election", async () => {
      const now = await time.latest();
      await expect(
        ethVote.connect(attacker).createElection("Fake", "Fake", "FAKE", now + 60, now + 3600)
      ).to.be.revertedWithCustomError(ethVote, "OwnableUnauthorizedAccount");
    });
  });

  describe("Candidate Registration", () => {
    it("Should allow verified voter to register as candidate", async () => {
      const tx = await ethVote.connect(voter1).registerCandidate(
        electionId, "Candidate One", "Party A",
        "ipfs://QmPartySymbol", "ipfs://QmManifesto"
      );
      await tx.wait();

      const candidateIds = await ethVote.getElectionCandidates(electionId);
      expect(candidateIds.length).to.equal(1);
    });

    it("Should not allow unverified (no SBT) voter to register", async () => {
      await expect(
        ethVote.connect(attacker).registerCandidate(
          electionId, "Attacker", "Evil Party", "ipfs://x", "ipfs://y"
        )
      ).to.be.revertedWith("EthVote: Caller is not a verified voter");
    });

    it("Admin should approve candidate", async () => {
      const tx = await ethVote.connect(voter1).registerCandidate(
        electionId, "Candidate One", "Party A", "ipfs://x", "ipfs://y"
      );
      await tx.wait();
      const [candidateId] = await ethVote.getElectionCandidates(electionId);
      await ethVote.approveCandidate(candidateId);
      const candidate = await ethVote.candidates(candidateId);
      expect(candidate.approved).to.be.true;
    });
  });

  describe("Vote Casting", () => {
    let candidateId;

    beforeEach(async () => {
      // Register and approve candidate
      await ethVote.connect(voter1).registerCandidate(
        electionId, "Candidate One", "Party A", "ipfs://x", "ipfs://y"
      );
      const [cId] = await ethVote.getElectionCandidates(electionId);
      candidateId = cId;
      await ethVote.approveCandidate(candidateId);

      // Activate election and fast-forward past start
      await ethVote.setElectionStatus(electionId, 1);
      await time.increase(120);
    });

    it("Should allow verified voter to cast vote", async () => {
      const nonce = ethers.randomBytes(32);
      const commitment = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "bytes32"], [candidateId, nonce]
      ));

      await ethVote.connect(voter2).castVote(electionId, commitment);
      expect(await ethVote.hasVoted(electionId, voter2.address)).to.be.true;
    });

    it("Should prevent double voting", async () => {
      const commitment = ethers.keccak256(ethers.toUtf8Bytes("vote_data_1"));
      await ethVote.connect(voter2).castVote(electionId, commitment);

      const commitment2 = ethers.keccak256(ethers.toUtf8Bytes("vote_data_2"));
      await expect(
        ethVote.connect(voter2).castVote(electionId, commitment2)
      ).to.be.revertedWith("EthVote: Already voted in this election");
    });

    it("Should prevent unverified voter from voting", async () => {
      const commitment = ethers.keccak256(ethers.toUtf8Bytes("fake_vote"));
      await expect(
        ethVote.connect(attacker).castVote(electionId, commitment)
      ).to.be.revertedWith("EthVote: Caller is not a verified voter");
    });

    it("Should track total votes", async () => {
      const c1 = ethers.keccak256(ethers.toUtf8Bytes("v1"));
      const c2 = ethers.keccak256(ethers.toUtf8Bytes("v2"));
      await ethVote.connect(voter2).castVote(electionId, c1);
      await ethVote.connect(voter3).castVote(electionId, c2);

      const election = await ethVote.elections(electionId);
      expect(election.totalVotes).to.equal(2n);
    });
  });

  describe("Results Publishing", () => {
    it("Should publish results after closing", async () => {
      await ethVote.connect(voter1).registerCandidate(electionId, "C1", "P1", "ipfs://x", "ipfs://y");
      const [cId] = await ethVote.getElectionCandidates(electionId);
      await ethVote.approveCandidate(cId);
      await ethVote.setElectionStatus(electionId, 1);
      await time.increase(120);

      const c1 = ethers.keccak256(ethers.toUtf8Bytes("vote1"));
      await ethVote.connect(voter2).castVote(electionId, c1);
      await ethVote.setElectionStatus(electionId, 3); // CLOSED

      await ethVote.publishResults(electionId, [cId], [1n]);
      const election = await ethVote.elections(electionId);
      expect(election.status).to.equal(4); // FINALIZED
      expect(election.resultsPublished).to.be.true;
    });
  });
});
