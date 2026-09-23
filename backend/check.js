require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  // Naya fresh password set karo
  const newPassword = "Admin@123";
  const hashed = await bcrypt.hash(newPassword, 12);
  
  await User.updateMany(
    { role: { $in: ['admin', 'superadmin'] } },
    { $set: { password: hashed } }
  );
  
  console.log("✅ Sabka password reset ho gaya!");
  console.log("Naya password:", newPassword);
  process.exit(0);
});