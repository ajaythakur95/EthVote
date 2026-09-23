/**
 * Blockchain Service
 * Handles all contract interactions from the backend (Node.js)
 * Uses ethers.js v6 with a server-side signer (admin wallet)
 */

const { ethers } = require("ethers");
const path = require("path");
const fs = require("fs");

class BlockchainService {
  constructor() {
    this.provider = null;
    this.signer = null;
    this.voterIdentityContract = null;
    this.ethVoteContract = null;
    this._initialized = false;
  }

  async init() {
    if (this._initialized) return;

    const rpcUrl = process.env.BLOCKCHAIN_RPC_URL || "http://127.0.0.1:8545";
    this.provider = new ethers.JsonRpcProvider(rpcUrl);

    const privateKey = process.env.ADMIN_WALLET_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("ADMIN_WALLET_PRIVATE_KEY not set in .env");
    }
    this.signer = new ethers.Wallet(privateKey, this.provider);

    const voterIdentityABI = this._loadABI("VoterIdentity");
    const ethVoteABI = this._loadABI("EthVote");

    const viAddress = process.env.VOTER_IDENTITY_CONTRACT_ADDRESS;
    const evAddress = process.env.ETHVOTE_CONTRACT_ADDRESS;

    if (!viAddress || !evAddress) {
      throw new Error("Contract addresses not configured in .env");
    }

    this.voterIdentityContract = new ethers.Contract(viAddress, voterIdentityABI, this.signer);
    this.ethVoteContract = new ethers.Contract(evAddress, ethVoteABI, this.signer);

    this._initialized = true;
    console.log("[Blockchain] Service initialized. Signer:", this.signer.address);
  }

  _loadABI(contractName) {
    const artifactPath = path.join(
      __dirname,
      "../../blockchain/artifacts/contracts",
      `${contractName}.sol/${contractName}.json`
    );
    if (!fs.existsSync(artifactPath)) {
      throw new Error(`ABI not found for ${contractName}. Run 'npx hardhat compile' first.`);
    }
    return JSON.parse(fs.readFileSync(artifactPath)).abi;
  }

  /**
   * Mint a Voter Identity SBT (called after successful Aadhaar + OTP verification)
   */
  async mintVoterIdentity(walletAddress, blockchainHash, metadataURI) {
    await this.init();

    const alreadyRegistered = await this.voterIdentityContract.isAadhaarRegistered(blockchainHash);
    if (alreadyRegistered) {
      throw new Error("Aadhaar already registered on blockchain");
    }

    const walletHasToken = await this.voterIdentityContract.walletToTokenId(walletAddress);
    if (walletHasToken !== 0n) {
      throw new Error("Wallet already has a Voter Identity SBT");
    }

    const gasEstimate = await this.voterIdentityContract.mintIdentity.estimateGas(
      walletAddress, blockchainHash, metadataURI
    );

    const tx = await this.voterIdentityContract.mintIdentity(
      walletAddress,
      blockchainHash,
      metadataURI,
      { gasLimit: gasEstimate * 120n / 100n }
    );

    const receipt = await tx.wait();

    const mintEvent = receipt.logs
      .map(log => {
        try { return this.voterIdentityContract.interface.parseLog(log); } catch { return null; }
      })
      .find(e => e?.name === "IdentityMinted");

    return {
      txHash: receipt.hash,
      tokenId: mintEvent?.args.tokenId?.toString(),
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
    };
  }

  /**
   * Check if an address has a valid, active voter identity
   */
  async isVerifiedVoter(walletAddress) {
    await this.init();
    return this.voterIdentityContract.isVerifiedVoter(walletAddress);
  }

  /**
   * Get voter record from blockchain
   */
  async getVoterRecord(walletAddress) {
    await this.init();
    return this.voterIdentityContract.getVoterByWallet(walletAddress);
  }

  /**
   * Revoke a voter identity (admin action)
   */
  async revokeVoterIdentity(tokenId, reason) {
    await this.init();
    const tx = await this.voterIdentityContract.revokeIdentity(tokenId, reason);
    const receipt = await tx.wait();
    return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
  }

  /**
   * Create an election on-chain
   */
  async createElection(title, description, constituency, startTimestamp, endTimestamp) {
    await this.init();
    const tx = await this.ethVoteContract.createElection(
      title, description, constituency, startTimestamp, endTimestamp
    );
    const receipt = await tx.wait();
    const event = receipt.logs
      .map(l => { try { return this.ethVoteContract.interface.parseLog(l); } catch { return null; } })
      .find(e => e?.name === "ElectionCreated");
    return event?.args.electionId?.toString();
  }

  /**
   * Update election status on-chain
   */
  async setElectionStatus(onChainElectionId, statusCode) {
    await this.init();
    const tx = await this.ethVoteContract.setElectionStatus(onChainElectionId, statusCode);
    return tx.wait();
  }

  /**
   * Check if a wallet has already voted in an election
   */
  async hasVoted(onChainElectionId, walletAddress) {
    await this.init();
    if (!onChainElectionId) return true; // Skip check if no on-chain ID
    return this.ethVoteContract.hasVoted(onChainElectionId, walletAddress);
  }

  /**
   * Register and approve a candidate on-chain
   */
  async registerAndApproveCandidate(onChainElectionId, walletAddress, name, partyName) {
    await this.init();
    // Candidate registration on-chain is done by the voter's own wallet (frontend)
    // Admin approval via backend
    return { candidateId: null }; // Simplified: real impl queries contract
  }
}

module.exports = new BlockchainService();