const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema({
  action: { type: String, required: true },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  targetUser: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  targetElection: { type: mongoose.Schema.Types.ObjectId, ref: "Election" },
  details: { type: mongoose.Schema.Types.Mixed },
  ipAddress: { type: String },
  txHash: { type: String },
}, { timestamps: true });

auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ targetUser: 1, createdAt: -1 });
auditLogSchema.index({ performedBy: 1, createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
