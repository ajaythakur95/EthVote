const mongoose = require("mongoose");

/**
 * Maps Indian postal PIN codes to Vidhan Sabha (Assembly) and Lok Sabha (Parliamentary) constituencies.
 * Populate via admin ops or seed script; lookups drive first-time (no EPIC) registration.
 */
const pincodeMappingSchema = new mongoose.Schema(
  {
    pincode: {
      type: String,
      required: true,
      trim: true,
      match: /^\d{6}$/,
    },
    vidhanSabhaAC: { type: String, required: true, trim: true },
    lokSabhaPC: { type: String, required: true, trim: true },
    state: { type: String, default: "", trim: true, index: true },
  },
  { timestamps: true }
);

pincodeMappingSchema.index({ pincode: 1 }, { unique: true });

module.exports = mongoose.model("PincodeMapping", pincodeMappingSchema);
