const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
  // ─── Identity ───────────────────────────────────────────────────────────
  aadhaarHash:  { type: String, unique: true, sparse: true },
  epicNumber:   { type: String, unique: true, sparse: true },
  mobileNumber: { type: String, required: true, unique: true },
  email:        { type: String, unique: true, sparse: true, lowercase: true },
  name:         { type: String, required: true },
  dateOfBirth:  { type: Date },
  age:          { type: Number },

  // ─── Constituency (from Aadhaar address) ────────────────────────────────
  constituency: { type: String, default: "" },
  // District + State from DigiLocker Aadhaar XML
  district: {
    type: String,
    default: "",
    index: true,
  },
  subDistrict:  { type: String, default: "" },
  pincode:      { type: String, default: "" },
  state:        { type: String, default: "" },
  address:      { type: String, default: "" },
  gender:       { type: String, default: "" },

  /** keccak256 UID-derived hash (0x…) for VoterIdentity SBT — set from Offline KYC / registration */
  blockchainHash: { type: String, default: "", sparse: true },

  /** Issued on admin approval for PATH_B / no-EPIC users; format ETH-YYYY-XXXXX */
  virtualVoterId: { type: String, unique: true, sparse: true, trim: true },

  /** From PincodeMapping at registration (first-time voters) */
  vidhanSabhaAC: { type: String, default: "" },
  lokSabhaPC:    { type: String, default: "" },

  /** Jurisdictional voting: refs to Constituency by level */
  assigned_vidhan_sabha: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Constituency",
    default: null,
    index: true,
  },
  assigned_lok_sabha: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Constituency",
    default: null,
    index: true,
  },

  // ─── Auth ───────────────────────────────────────────────────────────────
  password: { type: String, select: false }, // Admin accounts only
  role: {
    type: String,
    enum: ["voter", "candidate", "admin", "superadmin"],
    default: "voter",
  },

  // ─── Admin specific ─────────────────────────────────────────────────────
  // Constituency admin sirf apni constituency ke voters dekhega
  // Superadmin ke liye ye blank hoga (sab dekhe)
  adminConstituency: { type: String, default: "" },
  assignedDistrict: {
    type: String,
    default: "",
    index: true,
  },
  assignedState: {
    type: String,
    default: "",
    index: true,
  },
  adminRole: {
    type: String,
    enum: ["National", "State", "District", ""],
    default: "",
    index: true,
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

  // ─── Registration Path ──────────────────────────────────────────────────
  registrationPath: {
    type: String,
    enum: ["PATH_A_EXISTING", "PATH_B_NEW"],
    required: function () { return this.role === "voter"; },
  },

  // ─── Verification Status ────────────────────────────────────────────────
  verificationStatus: {
    type: String,
    enum: ["PENDING", "APPROVED", "REJECTED", "FLAGGED"],
    default: "PENDING",
  },
  aadhaarVerified:  { type: Boolean, default: false },
  mobileVerified:   { type: Boolean, default: false },
  digilockerVerified: { type: Boolean, default: false },
  adminReviewedBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  adminReviewedAt:  { type: Date },
  rejectionReason:  { type: String },

  // ─── Blockchain ─────────────────────────────────────────────────────────
  walletAddress: { type: String, unique: true, sparse: true, lowercase: true },
  sbtTokenId:    { type: Number },
  sbtMintedAt:   { type: Date },
  sbtTxHash:     { type: String },

  // ─── Documents (Path B only) ────────────────────────────────────────────
  documents: {
    aadhaarFront:     { type: String },
    aadhaarBack:      { type: String },
    photo:            { type: String },
    birthCertificate: { type: String },
  },

  // ─── Metadata ───────────────────────────────────────────────────────────
  ipfsMetadataURI: { type: String },
  lastLoginAt:     { type: Date },
  loginAttempts:   { type: Number, default: 0 },
  lockUntil:       { type: Date },

}, { timestamps: true });

// District-wise admin routing ke liye optimized indexes
userSchema.index({ role: 1, verificationStatus: 1, district: 1, createdAt: 1 });
userSchema.index({ role: 1, assignedDistrict: 1 });
userSchema.index({ role: 1, adminRole: 1, assignedState: 1, assignedDistrict: 1 });

// ─── Virtual: isLocked ──────────────────────────────────────────────────────
userSchema.virtual("isLocked").get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// ─── Pre-save: hash password + age ──────────────────────────────────────────
userSchema.pre("save", async function (next) {
  if (this.password && this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 12);
  }
  if (this.dateOfBirth) {
    const today = new Date();
    this.age = Math.floor((today - this.dateOfBirth) / (365.25 * 24 * 60 * 60 * 1000));
  }
  next();
});

userSchema.methods.comparePassword = async function (password) {
  return bcrypt.compare(password, this.password);
};

userSchema.methods.incrementLoginAttempts = async function () {
  if (this.loginAttempts >= 4) {
    this.lockUntil = new Date(Date.now() + 2 * 60 * 60 * 1000);
  }
  this.loginAttempts += 1;
  return this.save();
};

userSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.password;
    delete ret.aadhaarHash;
    delete ret.blockchainHash;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model("User", userSchema);