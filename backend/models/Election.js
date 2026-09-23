const mongoose = require("mongoose");

const electionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    constituency: { type: String, required: true },
    state: { type: String },
    /**
     * Jurisdictional elections: 'Vidhan Sabha' | 'Lok Sabha' with target_constituency (Constituency _id).
     * Leave empty for legacy string-based constituency matching.
     */
    election_type: {
      type: String,
      enum: ["", "Vidhan Sabha", "Lok Sabha"],
      default: "",
      index: true,
    },
    target_constituency: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Constituency",
      default: null,
      index: true,
    },
    electionType: {
      type: String,
      enum: ["GENERAL", "STATE_ASSEMBLY", "LOCAL_BODY", "BY_ELECTION", "LokSabha", "VidhanSabha"],
      default: "GENERAL",
      index: true,
    },
    status: {
      type: String,
      enum: ["CREATED", "ACTIVE", "PAUSED", "CLOSED", "FINALIZED", "COMPLETED", "Draft", "Ended", "Published"],
      default: "CREATED",
      index: true,
    },
    startTime: { type: Date, required: true },
    endTime: { type: Date, required: true },
    totalVotes: { type: Number, default: 0 },
    eligibleVoters: { type: Number, default: 0 },
    // Blockchain reference — sparse: true taaki null values unique index conflict na karein
    onChainElectionId: { type: Number, sparse: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    resultsPublished: { type: Boolean, default: false },
    publishedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    publishedAt: { type: Date },
    winnerId: { type: mongoose.Schema.Types.ObjectId, ref: "Candidate" },
    bannerImage: { type: String }, // Cloudinary URL
  },
  { timestamps: true }
);

electionSchema.virtual("candidates", {
  ref: "Candidate",
  localField: "_id",
  foreignField: "election",
});

electionSchema.set("toJSON", { virtuals: true });

electionSchema.pre("validate", function (next) {
  const vs =
    this.electionType === "VidhanSabha" || this.election_type === "Vidhan Sabha";
  if (vs && !String(this.state || "").trim()) {
    return next(new Error("state is required for Vidhan Sabha elections"));
  }
  if (
    (this.election_type === "Vidhan Sabha" || this.election_type === "Lok Sabha") &&
    !this.target_constituency
  ) {
    return next(new Error("target_constituency is required when election_type is set"));
  }
  next();
});

module.exports = mongoose.model("Election", electionSchema);