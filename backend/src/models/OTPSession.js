const mongoose = require("mongoose");

// Temporary OTP sessions — auto-expire via MongoDB TTL index
const otpSessionSchema = new mongoose.Schema({
  mobile:     { type: String, required: true },
  purpose:    { type: String, enum: ["REGISTRATION", "LOGIN"], required: true },
  twilioSid:  { type: String },
  verified:   { type: Boolean, default: false },
  expiresAt:  { type: Date, default: () => new Date(Date.now() + 10 * 60 * 1000) }, // 10 min
}, { timestamps: true });

otpSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("OTPSession", otpSessionSchema);
