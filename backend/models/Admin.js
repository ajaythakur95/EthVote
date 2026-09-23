const mongoose = require("mongoose");

const adminSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    role: {
      type: String,
      enum: ["National", "State", "District", "SuperAdmin", "StateAdmin", "DistrictAdmin"],
      required: true,
      index: true,
    },
    assignedState: { type: String, default: "", index: true },
    assignedDistrict: { type: String, default: "", index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  },
  {
    timestamps: true,
    // Use dedicated collection for hierarchy metadata.
    // Prevent collisions with any legacy "admins" collection indexes (e.g. email_1 unique on null).
    collection: "admin_hierarchy",
  }
);

adminSchema.index({ role: 1, assignedState: 1, assignedDistrict: 1 });

adminSchema.pre("validate", function (next) {
  const role = String(this.role || "");
  const needsState = ["State", "District", "StateAdmin", "DistrictAdmin"].includes(role);
  const needsDistrict = ["District", "DistrictAdmin"].includes(role);

  if (needsState && !String(this.assignedState || "").trim()) {
    return next(new Error("assignedState is required for this admin role"));
  }
  if (needsDistrict && !String(this.assignedDistrict || "").trim()) {
    return next(new Error("assignedDistrict is required for district admin role"));
  }
  next();
});

module.exports = mongoose.model("Admin", adminSchema);
