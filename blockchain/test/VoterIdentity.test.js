const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VoterIdentity (SBT)", function () {
  let voterIdentity;
  let owner, voter1, voter2, attacker;

  // Mock data
  const aadhaarHash1 = ethers.keccak256(ethers.toUtf8Bytes("123456789012_salt"));
  const aadhaarHash2 = ethers.keccak256(ethers.toUtf8Bytes("987654321098_salt"));
  const metadataURI = "ipfs://QmTest123/metadata.json";

  beforeEach(async function () {
    [owner, voter1, voter2, attacker] = await ethers.getSigners();
    const VoterIdentity = await ethers.getContractFactory("VoterIdentity");
    voterIdentity = await VoterIdentity.deploy(owner.address);
    await voterIdentity.waitForDeployment();
  });

  describe("Minting", function () {
    it("Should mint a Voter Identity SBT", async function () {
      const tx = await voterIdentity.mintIdentity(voter1.address, aadhaarHash1, metadataURI);
      const receipt = await tx.wait();
      
      expect(await voterIdentity.walletToTokenId(voter1.address)).to.equal(1);
      expect(await voterIdentity.aadhaarHashToTokenId(aadhaarHash1)).to.equal(1);
      expect(await voterIdentity.ownerOf(1)).to.equal(voter1.address);
    });

    it("Should revert if wallet already has identity", async function () {
      await voterIdentity.mintIdentity(voter1.address, aadhaarHash1, metadataURI);
      await expect(
        voterIdentity.mintIdentity(voter1.address, aadhaarHash2, metadataURI)
      ).to.be.revertedWith("VoterIdentity: Wallet already has an identity");
    });

    it("Should revert if Aadhaar already registered", async function () {
      await voterIdentity.mintIdentity(voter1.address, aadhaarHash1, metadataURI);
      await expect(
        voterIdentity.mintIdentity(voter2.address, aadhaarHash1, metadataURI)
      ).to.be.revertedWith("VoterIdentity: Aadhaar already registered");
    });

    it("Should revert if non-owner tries to mint", async function () {
      await expect(
        voterIdentity.connect(attacker).mintIdentity(voter1.address, aadhaarHash1, metadataURI)
      ).to.be.revertedWithCustomError(voterIdentity, "OwnableUnauthorizedAccount");
    });
  });

  describe("Soulbound (Non-Transferable)", function () {
    beforeEach(async () => {
      await voterIdentity.mintIdentity(voter1.address, aadhaarHash1, metadataURI);
    });

    it("Should NOT allow transferFrom", async function () {
      await expect(
        voterIdentity.connect(voter1).transferFrom(voter1.address, voter2.address, 1)
      ).to.be.revertedWith("SBT: Soulbound tokens cannot be transferred");
    });

    it("Should NOT allow safeTransferFrom", async function () {
      await expect(
        voterIdentity.connect(voter1)["safeTransferFrom(address,address,uint256)"](
          voter1.address, voter2.address, 1
        )
      ).to.be.revertedWith("SBT: Soulbound tokens cannot be transferred");
    });

    it("Should NOT allow approval", async function () {
      await expect(
        voterIdentity.connect(voter1).approve(voter2.address, 1)
      ).to.be.revertedWith("SBT: Approval not allowed on Soulbound tokens");
    });

    it("Should confirm token is locked (EIP-5192)", async function () {
      expect(await voterIdentity.locked(1)).to.be.true;
    });
  });

  describe("Voter Status", function () {
    beforeEach(async () => {
      await voterIdentity.mintIdentity(voter1.address, aadhaarHash1, metadataURI);
    });

    it("Should mark voter as active after mint", async function () {
      expect(await voterIdentity.isVerifiedVoter(voter1.address)).to.be.true;
    });

    it("Should suspend a voter", async function () {
      await voterIdentity.updateStatus(1, 1); // SUSPENDED
      expect(await voterIdentity.isVerifiedVoter(voter1.address)).to.be.false;
    });
  });

  describe("Revocation", function () {
    it("Should revoke identity and burn token", async function () {
      await voterIdentity.mintIdentity(voter1.address, aadhaarHash1, metadataURI);
      await voterIdentity.revokeIdentity(1, "Duplicate registration detected");
      
      await expect(voterIdentity.ownerOf(1)).to.be.reverted;
      expect(await voterIdentity.walletToTokenId(voter1.address)).to.equal(0);
      expect(await voterIdentity.aadhaarHashToTokenId(aadhaarHash1)).to.equal(0);
    });

    it("Should allow re-registration after revocation", async function () {
      await voterIdentity.mintIdentity(voter1.address, aadhaarHash1, metadataURI);
      await voterIdentity.revokeIdentity(1, "Test revocation");
      // Now a different wallet can use same Aadhaar (admin-verified re-registration)
      await voterIdentity.mintIdentity(voter2.address, aadhaarHash1, metadataURI);
      expect(await voterIdentity.walletToTokenId(voter2.address)).to.equal(2);
    });
  });
});
