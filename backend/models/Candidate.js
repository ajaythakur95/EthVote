const mongoose = require("mongoose");

const CANDIDACY_TYPES = [
  "NORMAL_CANDIDATE",
  "PRIME_MINISTER_CANDIDATE",
  "CHIEF_MINISTER_CANDIDATE",
];

const candidateSchema = new mongoose.Schema(
  {
    election: { type: mongoose.Schema.Types.ObjectId, ref: "Election", required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
    constituency: { type: String, required: true, index: true },
    partyName: { type: String, required: true, default: "Independent", index: true },
    candidateRole: { type: String, enum: ["PM", "CM", "MP", "MLA"], required: true, default: "MP", index: true },
    candidacyType: {
      type: String,
      enum: CANDIDACY_TYPES,
      default: "NORMAL_CANDIDATE",
      index: true,
    },
    state: { type: String, default: "", index: true },
    district: { type: String, default: "", index: true },
    manifesto: { type: String },
    partySymbol: { type: String },
    photo: { type: String },
    voteCount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
      index: true,
    },
    verificationStatus: {
      type: String,
      enum: ["Pending", "Verified", "Rejected"],
      default: "Pending",
      index: true,
    },
    rejectionReason: { type: String },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    verifiedAt: { type: Date },
    isWinner: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

// Ek voter ek election mein sirf ek baar candidate ban sake
candidateSchema.index({ election: 1, user: 1 }, { unique: true });

candidateSchema.pre("validate", function (next) {
  const role = this.candidateRole;

  // Backward compatibility: older PM/CM rows without candidacyType should be inferred.
  if (role === "PM" && this.candidacyType === "NORMAL_CANDIDATE") {
    this.candidacyType = "PRIME_MINISTER_CANDIDATE";
  }
  if (role === "CM" && this.candidacyType === "NORMAL_CANDIDATE") {
    this.candidacyType = "CHIEF_MINISTER_CANDIDATE";
  }

  if (this.candidacyType === "PRIME_MINISTER_CANDIDATE" && role !== "PM") {
    return next(new Error("candidateRole must be PM for Prime Minister candidacy"));
  }
  if (this.candidacyType === "CHIEF_MINISTER_CANDIDATE" && role !== "CM") {
    return next(new Error("candidateRole must be CM for Chief Minister candidacy"));
  }
  if (this.candidacyType === "NORMAL_CANDIDATE" && !["MP", "MLA"].includes(role)) {
    return next(new Error("Normal candidacy supports only MP/MLA candidateRole"));
  }

  if (["CM", "MLA"].includes(role) && !String(this.state || "").trim()) {
    return next(new Error("state is required for CM/MLA candidates"));
  }
  if (["MP", "MLA"].includes(role) && !String(this.district || "").trim()) {
    return next(new Error("district is required for MP/MLA candidates"));
  }
  if (this.verificationStatus === "Verified") this.status = "APPROVED";
  if (this.verificationStatus === "Rejected") this.status = "REJECTED";
  if (this.status === "APPROVED") this.verificationStatus = "Verified";
  if (this.status === "REJECTED") this.verificationStatus = "Rejected";
  if (this.status === "PENDING") this.verificationStatus = "Pending";
  next();
});

module.exports = mongoose.model("Candidate", candidateSchema);