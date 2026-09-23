import { ethers } from "ethers";
import VoterIdentityArtifact from "../assets/abis/VoterIdentity.json";
import EthVoteArtifact from "../assets/abis/EthVote.json";

const VoterIdentityABI = VoterIdentityArtifact.abi || VoterIdentityArtifact;
const EthVoteABI = EthVoteArtifact.abi || EthVoteArtifact;

export const getProvider = () => {
  if (!window.ethereum) throw new Error("MetaMask is not installed");
  return new ethers.BrowserProvider(window.ethereum);
};

export const getSigner = async () => {
  const provider = getProvider();
  return provider.getSigner();
};

export const connectWallet = async () => {
  if (!window.ethereum) throw new Error("Please install MetaMask to use EthVote");
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  return accounts[0];
};

export const getVoterIdentityContract = async (withSigner = false) => {
  const address = process.env.REACT_APP_VOTER_IDENTITY_ADDRESS;
  if (!address) throw new Error("VoterIdentity contract address not configured");
  const provider = withSigner ? await getSigner() : getProvider();
  return new ethers.Contract(address, VoterIdentityABI, provider);
};

export const getEthVoteContract = async (withSigner = false) => {
  const address = process.env.REACT_APP_ETHVOTE_ADDRESS;
  if (!address) throw new Error("EthVote contract address not configured");
  const provider = withSigner ? await getSigner() : getProvider();
  return new ethers.Contract(address, EthVoteABI, provider);
};

export const generateVoteCommitment = (candidateId) => {
  const nonce = ethers.randomBytes(32);
  const commitment = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "bytes32"], [candidateId, nonce])
  );
  const voteProof = { candidateId: candidateId.toString(), nonce: ethers.hexlify(nonce), commitment };
  localStorage.setItem(`vote_proof_${candidateId}`, JSON.stringify(voteProof));
  return { commitment, nonce: ethers.hexlify(nonce) };
};

export const castVoteOnChain = async (onChainElectionId, commitment) => {
  const contract = await getEthVoteContract(true);
  const tx = await contract.castVote(onChainElectionId, commitment);
  const receipt = await tx.wait();
  return { txHash: receipt.hash, blockNumber: receipt.blockNumber };
};

export const checkSBTStatus = async (walletAddress) => {
  try {
    console.log("[SBT] Checking for wallet:", walletAddress);
    console.log("[SBT] Contract address:", process.env.REACT_APP_VOTER_IDENTITY_ADDRESS);
    const contract = await getVoterIdentityContract();
    const result = await contract.isVerifiedVoter(walletAddress);
    console.log("[SBT] Result:", result);
    return result;
  } catch (e) {
    console.error("[SBT] Error:", e.message);
    return false;
  }
};

export const switchToCorrectNetwork = async () => {
  const chainId = process.env.REACT_APP_CHAIN_ID || "31337";
  const hex = `0x${parseInt(chainId).toString(16)}`;
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
  } catch (err) {
    if (err.code === 4902) throw new Error("Please add the correct network to MetaMask");
    throw err;
  }
};