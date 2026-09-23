const mongoose = require("mongoose");

const voterSchema = new mongoose.Schema({
  // Identity
  aadhaarHashHex:  { type: String, required: true, unique: true }, // keccak256 hex — no raw UID
  epicNumber:      { type: String, sparse: true },                  // Voter ID (EPIC)
  fullName:        { type: String, required: true },
  dateOfBirth:     { type: Date,   required: true },
  mobile:          { type: String, required: true },

  // Wallet
  walletAddress:   { type: String, unique: true, sparse: true },

  // Registration Path
  registrationPath: {
    type: String,
    enum: ["EXISTING_VOTER", "FIRST_TIME_VOTER"],
    required: true,
  },

  // KYC Status
  kycStatus: {
    type: String,
    enum: ["PENDING", "APPROVED", "REJECTED", "FLAGGED"],
    default: "PENDING",
  },

  // Document uploads (Path B only)
  documents: {
    aadhaarFront:   String,  // Cloudinary URL
    aadhaarBack:    String,
    selfieWithDoc:  String,
    faceApiScore:   Number,  // liveness confidence 0-1
  },

  // Blockchain
  sbtTokenId:     { type: String, default: null },
  sbtMintedAt:    { type: Date,   default: null },
  sbtTxHash:      { type: String, default: null },

  // Admin
  reviewedBy:     { type: mongoose.Schema.Types.ObjectId, ref: "Admin" },
  reviewNotes:    String,
  flaggedReason:  String,
}, { timestamps: true });

module.exports = mongoose.model("Voter", voterSchema);
