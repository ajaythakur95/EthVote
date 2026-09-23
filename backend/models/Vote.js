const mongoose = require("mongoose");

const voteSchema = new mongoose.Schema({
  election: { type: mongoose.Schema.Types.ObjectId, ref: "Election", required: true },
  candidateId: { type: mongoose.Schema.Types.ObjectId, ref: "Candidate", required: true, index: true },
  voter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  voteCommitment: { type: String, required: true }, 
  txHash: { type: String, required: true, unique: true },
  blockNumber: { type: Number },
  votedAt: { type: Date, default: Date.now },

  voterWallet: { type: String, required: true },
}, { timestamps: true });

voteSchema.index({ election: 1, voter: 1 }, { unique: true });
voteSchema.index({ election: 1, candidateId: 1 });

module.exports = mongoose.model("Vote", voteSchema);