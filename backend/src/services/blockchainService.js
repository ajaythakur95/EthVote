/**
 * Blockchain Service — mints SBT after successful KYC.
 * Backend oracle wallet calls VoterIdentity.mintIdentity().
 */
const { ethers }  = require("ethers");
const VoterIdentityABI = require("../../../blockchain/artifacts/contracts/VoterIdentity.sol/VoterIdentity.json");

let provider, oracleSigner, voterIdentityContract;

function init() {
  const rpcUrl = process.env.BLOCKCHAIN_RPC_URL || "http://127.0.0.1:8545";
  provider = new ethers.JsonRpcProvider(rpcUrl);

  if (!process.env.ORACLE_PRIVATE_KEY) throw new Error("ORACLE_PRIVATE_KEY not set");
  oracleSigner = new ethers.Wallet(process.env.ORACLE_PRIVATE_KEY, provider);

  const contractAddress = process.env.VOTER_IDENTITY_CONTRACT;
  if (!contractAddress) throw new Error("VOTER_IDENTITY_CONTRACT not set");

  voterIdentityContract = new ethers.Contract(
    contractAddress,
    VoterIdentityABI.abi,
    oracleSigner
  );

  console.log("BlockchainService: connected to", rpcUrl);
}

/**
 * Mint a Soulbound Identity Token.
 * @param {string} walletAddress  Voter's EOA
 * @param {string} aadhaarHash    keccak256 hex from keccak256ForChain()
 * @returns {{ tokenId: string, txHash: string }}
 */
async function mintIdentity(walletAddress, aadhaarHash) {
  if (!voterIdentityContract) init();

  const tx = await voterIdentityContract.mintIdentity(walletAddress, aadhaarHash);
  const receipt = await tx.wait();

  // Parse IdentityMinted event
  const event = receipt.logs
    .map((log) => {
      try { return voterIdentityContract.interface.parseLog(log); }
      catch { return null; }
    })
    .find((e) => e && e.name === "IdentityMinted");

  const tokenId = event ? event.args.tokenId.toString() : "unknown";
  return { tokenId, txHash: receipt.hash };
}

/**
 * Check if a wallet already has a valid SBT.
 */
async function isVerifiedVoter(walletAddress) {
  if (!voterIdentityContract) init();
  return voterIdentityContract.isVerifiedVoter(walletAddress);
}

module.exports = { init, mintIdentity, isVerifiedVoter };
