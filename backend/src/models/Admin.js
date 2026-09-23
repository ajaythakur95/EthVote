const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");
const { DISTRICTS } = require("../../constants/districts");

const adminSchema = new mongoose.Schema({
  name:         { type: String, required: true },
  email:        { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role:         { type: String, enum: ["SUPER_ADMIN", "REVIEWER"], default: "REVIEWER" },
  assignedDistrict: {
    type: String,
    enum: [...DISTRICTS, ""],
    default: "",
    index: true,
  },
  walletAddress:{ type: String },
  isActive:     { type: Boolean, default: true },
}, { timestamps: true });

adminSchema.pre("save", async function (next) {
  if (!this.isModified("passwordHash")) return next();
  this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  next();
});

adminSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

module.exports = mongoose.model("Admin", adminSchema);
