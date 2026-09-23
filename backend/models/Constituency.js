const mongoose = require("mongoose");

/**
 * Referenced by User (assigned_vidhan_sabha / assigned_lok_sabha) and Election (target_constituency).
 */
const constituencySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    level: {
      type: String,
      required: true,
      enum: ["Vidhan Sabha", "Lok Sabha"],
      index: true,
    },
    state: { type: String, default: "", trim: true, index: true },
  },
  { timestamps: true }
);

constituencySchema.index({ name: 1, level: 1 }, { unique: true });

module.exports = mongoose.model("Constituency", constituencySchema);
