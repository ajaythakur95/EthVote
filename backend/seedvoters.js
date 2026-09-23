/**
 * Mock Voters Seed Script
 * 50 fake voters create karta hai testing ke liye
 * Run: node seedVoters.js
 */

const mongoose = require("mongoose");
const crypto = require("crypto");
require("dotenv").config();

const userSchema = new mongoose.Schema({
  aadhaarHash:        { type: String, unique: true, sparse: true },
  epicNumber:         { type: String, unique: true, sparse: true },
  mobileNumber:       { type: String, unique: true, sparse: true },
  name:               { type: String },
  dateOfBirth:        { type: Date },
  age:                { type: Number },
  gender:             { type: String },
  address:            { type: String },
  constituency:       { type: String },
  role:               { type: String, default: "voter" },
  registrationPath:   { type: String },
  verificationStatus: { type: String, default: "APPROVED" },
  aadhaarVerified:    { type: Boolean, default: true },
  digilockerVerified: { type: Boolean, default: true },
  walletAddress:      { type: String, unique: true, sparse: true },
  sbtTokenId:         { type: Number },
  sbtTxHash:          { type: String },
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model("User", userSchema);

const SALT = "ethvote_salt";

const STATES = ["Uttar Pradesh", "Maharashtra", "Delhi", "Bihar", "Rajasthan", "Gujarat", "Karnataka", "Tamil Nadu"];

const CONSTITUENCIES = {
  "Uttar Pradesh": ["Lucknow", "Varanasi", "Agra", "Kanpur", "Allahabad"],
  "Maharashtra":   ["Mumbai North", "Mumbai South", "Pune", "Nagpur", "Nashik"],
  "Delhi":         ["New Delhi", "East Delhi", "West Delhi", "North Delhi", "South Delhi"],
  "Bihar":         ["Patna Sahib", "Muzaffarpur", "Bhagalpur", "Gaya", "Ara"],
  "Rajasthan":     ["Jaipur", "Jodhpur", "Udaipur", "Ajmer", "Kota"],
  "Gujarat":       ["Ahmedabad East", "Surat", "Vadodara", "Rajkot", "Gandhi Nagar"],
  "Karnataka":     ["Bangalore North", "Bangalore South", "Mysore", "Hubli", "Mangalore"],
  "Tamil Nadu":    ["Chennai North", "Chennai South", "Coimbatore", "Madurai", "Salem"],
};

const FIRST_NAMES_M = ["Rahul", "Amit", "Suresh", "Rajesh", "Vikram", "Arun", "Manoj", "Deepak", "Sanjay", "Rohit", "Ajay", "Vijay", "Ankit", "Nikhil", "Pradeep", "Rakesh", "Dinesh", "Mahesh", "Ravi", "Karan", "Arjun", "Sachin", "Mohit", "Gaurav", "Vishal"];
const FIRST_NAMES_F = ["Priya", "Sunita", "Kavita", "Anjali", "Pooja", "Neha", "Ritu", "Seema", "Anita", "Rekha", "Meena", "Sonal", "Divya", "Preeti", "Geeta", "Shilpa", "Asha", "Usha", "Radha", "Lata", "Suman", "Nisha", "Mona", "Sneha", "Komal"];
const LAST_NAMES   = ["Sharma", "Verma", "Singh", "Gupta", "Patel", "Kumar", "Mishra", "Joshi", "Yadav", "Tiwari", "Chauhan", "Pandey", "Shah", "Mehta", "Desai", "Nair", "Reddy", "Rao", "Iyer", "Pillai"];

const randomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randomInt  = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const generateEPIC = (state) => {
  const codes = { "Uttar Pradesh": "UP", "Maharashtra": "MH", "Delhi": "DL", "Bihar": "BR", "Rajasthan": "RJ", "Gujarat": "GJ", "Karnataka": "KA", "Tamil Nadu": "TN" };
  const code = codes[state] || "XX";
  return `EV${code}${randomInt(1000000, 9999999)}`;
};

const generateWallet = () => {
  const hex = crypto.randomBytes(20).toString("hex");
  return `0x${hex}`;
};

const generateAadhaarHash = (name, dob) => {
  const fake = `${name}${dob}${Math.random()}`;
  return crypto.createHash("sha256").update(fake + SALT).digest("hex");
};

const generateDOB = () => {
  const year  = randomInt(1960, 2003);
  const month = randomInt(1, 12);
  const day   = randomInt(1, 28);
  return new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
};

const generateMobile = () => `${randomInt(7, 9)}${randomInt(100000000, 999999999)}`;

const generateAddress = (state, constituency) => {
  const houseNo = randomInt(1, 999);
  const streets = ["MG Road", "Gandhi Nagar", "Nehru Street", "Patel Nagar", "Shastri Marg", "Subhash Road", "Rajiv Chowk", "Ambedkar Marg"];
  return `${houseNo}, ${randomItem(streets)}, ${constituency}, ${state}`;
};

async function seedVoters() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("MongoDB connected!");

  let created = 0, skipped = 0;

  for (let i = 0; i < 50; i++) {
    const gender       = Math.random() > 0.5 ? "M" : "F";
    const firstName    = gender === "M" ? randomItem(FIRST_NAMES_M) : randomItem(FIRST_NAMES_F);
    const lastName     = randomItem(LAST_NAMES);
    const name         = `${firstName} ${lastName}`;
    const state        = randomItem(STATES);
    const constituency = randomItem(CONSTITUENCIES[state]);
    const dob          = generateDOB();
    const age          = Math.floor((Date.now() - dob) / (365.25 * 24 * 60 * 60 * 1000));
    const epicNumber   = generateEPIC(state);
    const walletAddress = generateWallet();
    const aadhaarHash  = generateAadhaarHash(name, dob.toISOString());
    const mobile       = generateMobile();
    const address      = generateAddress(state, constituency);
    const path         = Math.random() > 0.3 ? "PATH_A_EXISTING" : "PATH_B_NEW";

    try {
      await User.create({
        name,
        gender,
        dateOfBirth:        dob,
        age,
        aadhaarHash,
        epicNumber,
        mobileNumber:       mobile,
        address,
        constituency,
        walletAddress,
        role:               "voter",
        registrationPath:   path,
        verificationStatus: "APPROVED",
        aadhaarVerified:    true,
        digilockerVerified: true,
        sbtTokenId:         randomInt(1, 9999),
        sbtTxHash:          `0x${crypto.randomBytes(32).toString("hex")}`,
      });
      created++;
      console.log(`✅ [${i + 1}/50] ${name} — ${constituency}, ${state}`);
    } catch (e) {
      skipped++;
      console.log(`⚠️  [${i + 1}/50] Skipped (duplicate): ${name}`);
    }
  }

  console.log(`\n=== DONE ===`);
  console.log(`Created: ${created}`);
  console.log(`Skipped: ${skipped}`);
  process.exit();
}

seedVoters().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});