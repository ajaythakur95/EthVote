/**
 * makeSuperAdmin.js
 * Run once: node makeSuperAdmin.js
 * Existing "Admin" user ko superadmin bana dega
 * Ya naya superadmin create karega
 */

const mongoose = require("mongoose");
require("dotenv").config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const User = require("./models/User");

  const SUPER_NAME = process.env.ADMIN_BOOTSTRAP_NAME || "SuperAdmin";
  const SUPER_PASSWORD = process.env.ADMIN_BOOTSTRAP_PASSWORD || "super@123";

  let superAdmin = await User.findOne({ role: "superadmin" });

  if (superAdmin) {
    const doc = await User.findById(superAdmin._id).select("+password");
    const ok = await doc.comparePassword(SUPER_PASSWORD);
    if (!ok) {
      doc.password = SUPER_PASSWORD;
      await doc.save();
      console.log("✅ SuperAdmin password theek kiya (pehle double-hash / galat hash tha).");
    }
    console.log(`✅ SuperAdmin ready: ${doc.name}`);
    console.log(`   Admin login — Name: ${SUPER_NAME}`);
    console.log(`   Password: ${SUPER_PASSWORD}`);
  } else {
    superAdmin = await User.create({
      name: SUPER_NAME,
      password: SUPER_PASSWORD,
      role: "superadmin",
      adminConstituency: "",
      mobileNumber: `superadmin_${Date.now()}`,
      dateOfBirth: new Date("1990-01-01"),
    });
    console.log("✅ SuperAdmin create ho gaya!");
    console.log(`   Name:     ${SUPER_NAME}`);
    console.log(`   Password: ${SUPER_PASSWORD}`);
    console.log(`   ID:       ${superAdmin._id}`);
  }

  console.log("\n→ Frontend: Admin Login → Admin Name + Password (User collection)");
  await mongoose.disconnect();
  process.exit(0);
}).catch((err) => {
  console.error("❌ MongoDB connect nahi hua:", err.message);
  process.exit(1);
});