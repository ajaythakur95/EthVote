/**
 * Seed sample PincodeMapping rows for dev/demo. Run: node scripts/seedPincodeMappings.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mongoose = require("mongoose");
const PincodeMapping = require("../models/PincodeMapping");

const SAMPLES = [
  {
    pincode: "226001",
    vidhanSabhaAC: "Lucknow North",
    lokSabhaPC: "Lucknow",
    state: "Uttar Pradesh",
  },
  {
    pincode: "110001",
    vidhanSabhaAC: "New Delhi",
    lokSabhaPC: "New Delhi",
    state: "Delhi",
  },
  {
    pincode: "400001",
    vidhanSabhaAC: "Mumbai South",
    lokSabhaPC: "Mumbai South",
    state: "Maharashtra",
  },
];

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI missing in .env");
    process.exit(1);
  }
  await mongoose.connect(uri);
  for (const row of SAMPLES) {
    await PincodeMapping.findOneAndUpdate(
      { pincode: row.pincode },
      { $set: row },
      { upsert: true, new: true }
    );
    console.log("Upserted pincode", row.pincode);
  }
  await mongoose.disconnect();
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
