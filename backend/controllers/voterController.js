const User = require("../models/User");
const Vote = require("../models/Vote");
const Election = require("../models/Election");
const Candidate = require("../models/Candidate");
const blockchainService = require("../services/blockchainService");
const { ethers } = require("ethers");
const mongoose = require("mongoose");
const { withMaskedEpic } = require("../utils/epicUtils");
const { isVoterEligibleForElection, assertVoterEligibleForElection } = require("../utils/jurisdictionEligibility");

// GET /api/voter/profile
exports.getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select("-aadhaarHash -password");
    const votingHistory = await Vote.find({ voter: req.user._id })
      .populate("election", "title constituency status")
      .sort({ votedAt: -1 });

    // Check blockchain SBT status
    let sbtStatus = null;
    if (user.walletAddress) {
      try {
        sbtStatus = await blockchainService.isVerifiedVoter(user.walletAddress);
      } catch (e) { /* blockchain might be unreachable */ }
    }

    res.json({ success: true, user: withMaskedEpic(user), votingHistory, sbtStatus });
  } catch (e) { next(e); }
};

// GET /api/voter/eligible-elections
exports.getEligibleElections = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user || user.role !== "voter") {
      return res.status(403).json({ error: "Voter access only" });
    }

    const active = await Election.find({ status: "ACTIVE" })
      .populate("target_constituency", "name level state")
      .populate({ path: "candidates", match: { status: "APPROVED" } });

    const eligible = active.filter((e) => isVoterEligibleForElection(user, e));

    const votes = await Vote.find({ voter: req.user._id });
    const votedElectionIds = new Set(votes.map((v) => v.election.toString()));

    const electionsWithStatus = eligible.map((e) => ({
      ...e.toJSON(),
      hasVoted: votedElectionIds.has(e._id.toString()),
    }));

    res.json({ success: true, elections: electionsWithStatus });
  } catch (e) { next(e); }
};

// POST /api/voter/vote — Cast encrypted vote
exports.castVote = async (req, res, next) => {
  try {
    const { electionId, candidateId, voteCommitment, txHash, blockNumber } = req.body;

    if (!req.user.walletAddress) return res.status(400).json({ error: "No wallet linked to this account" });
    if (req.user.verificationStatus !== "APPROVED") return res.status(403).json({ error: "Not a verified voter" });
    if (!candidateId) return res.status(400).json({ error: "candidateId is required" });
    if (!mongoose.isValidObjectId(candidateId)) return res.status(400).json({ error: "candidateId is invalid" });

    const election = await Election.findById(electionId);
    if (!election) return res.status(404).json({ error: "Election not found" });
    if (election.status !== "ACTIVE") return res.status(400).json({ error: "Election is not active" });
    if (new Date() > election.endTime) return res.status(400).json({ error: "Election has ended" });

    const candidate = await Candidate.findOne({
      _id: candidateId,
      election: electionId,
      status: "APPROVED",
    }).select("_id");
    if (!candidate) {
      return res.status(400).json({ error: "Selected candidate is invalid for this election" });
    }

    const voter = await User.findById(req.user._id);
    const jurisdiction = assertVoterEligibleForElection(voter, election);
    if (!jurisdiction.eligible) {
      return res.status(403).json({ error: jurisdiction.message, code: jurisdiction.code });
    }

    // Prevent double-voting
    const existingVote = await Vote.findOne({ election: electionId, voter: req.user._id });
    if (existingVote) return res.status(400).json({ error: "You have already voted in this election" });

    // Verify the tx actually happened on-chain
    const onChainVoted = await blockchainService.hasVoted(election.onChainElectionId, req.user.walletAddress);
    if (!onChainVoted) return res.status(400).json({ error: "Vote transaction not confirmed on blockchain" });

    await Vote.create({
      election: electionId,
      candidateId,
      voter: req.user._id,
      voteCommitment,
      txHash,
      blockNumber,
      voterWallet: req.user.walletAddress,
    });

    await Election.findByIdAndUpdate(electionId, { $inc: { totalVotes: 1 } });

    res.json({ success: true, message: "Vote recorded successfully", txHash });
  } catch (e) { next(e); }
};

// GET /api/voter/has-voted/:electionId
exports.checkVoteStatus = async (req, res, next) => {
  try {
    const vote = await Vote.findOne({ election: req.params.electionId, voter: req.user._id });
    res.json({ success: true, hasVoted: !!vote, txHash: vote?.txHash || null });
  } catch (e) { next(e); }
};

// GET /api/voter/internal/:userId/epic
// Internal-only endpoint for smart-contract services
exports.getUnmaskedEpicInternal = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.userId).select("epicNumber verificationStatus role");
    if (!user || user.role !== "voter") {
      return res.status(404).json({ error: "Voter not found" });
    }
    if (!user.epicNumber) {
      return res.status(404).json({ error: "EPIC number not assigned yet." });
    }
    return res.json({
      success: true,
      userId: user._id,
      epicNumber: user.epicNumber,
      verificationStatus: user.verificationStatus,
    });
  } catch (e) { next(e); }
};
