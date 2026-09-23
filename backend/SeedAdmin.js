/**
 * Seeds the legacy `Admin` mongoose model (admins collection).
 * Admin panel login uses the `User` model → run: node makeSuperAdmin.js
 *
 * Usage:
 *   cd backend
 *   node SeedAdmin.js
 *
 * Optional env overrides:
 *   ADMIN_EMAIL=you@yoursite.com ADMIN_PASSWORD=Str0ng! node SeedAdmin.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

// Inline Admin schema so this script has no import issues
const adminSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  email:     { type: String, required: true, unique: true, lowercase: true },
  password:  { type: String, required: true },
  role:      { type: String, enum: ["admin","superadmin"], default: "admin" },
  districts: { type: [String], default: [] },
  isActive:  { type: Boolean, default: true },
}, { timestamps: true });

const Admin = mongoose.models.Admin || mongoose.model("Admin", adminSchema);

async function seed() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌  MONGODB_URI not set in .env");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("✅  MongoDB connected");

  const email    = process.env.ADMIN_EMAIL    || "admin@ethvote.in";
  const password = process.env.ADMIN_PASSWORD || "Admin@1234";
  const name     = process.env.ADMIN_NAME     || "EthVote Admin";
  // Comma-separated list of districts, e.g. ADMIN_DISTRICTS="Mumbai North,Mumbai South"
  // Leave unset for superadmin (sees all districts).
  const districts = process.env.ADMIN_DISTRICTS
    ? process.env.ADMIN_DISTRICTS.split(",").map(d => d.trim())
    : [];

  const existing = await Admin.findOne({ email });
  if (existing) {
    console.log(`ℹ️   Admin already exists: ${existing.email}`);
    await mongoose.disconnect();
    process.exit(0);
  }

  const hashed = await bcrypt.hash(password, 12);
  const admin  = await Admin.create({ name, email, password: hashed, role: "superadmin", districts });

  console.log("\n✅  Admin seeded successfully!");
  console.log(`    Email     : ${admin.email}`);
  console.log(`    Password  : ${password}`);
  console.log(`    Role      : ${admin.role}`);
  console.log(`    Districts : ${admin.districts.length ? admin.districts.join(", ") : "(all — superadmin)"}`);
  console.log("\n⚠️   Change this password after first login.\n");

  await mongoose.disconnect();
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});