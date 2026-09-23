const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
require("dotenv").config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const User = require("./models/User");
  const hash = await bcrypt.hash("admin123", 12);
  await User.updateOne({ role: "admin" }, { $set: { password: hash } });
  console.log("Password reset!");
  process.exit();
});