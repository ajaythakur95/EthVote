/**
 * Aadhaar Mock/Sandbox Service
 * Replace sandbox calls with UIDAI / DigiLocker production API in production.
 */
const crypto = require("crypto");
const axios  = require("axios");

// ── Mock Sandbox Data (replace with real sandbox credentials) ─────────────────
const SANDBOX_BASE = process.env.AADHAAR_SANDBOX_URL || "https://sandbox.aadhaarapi.com";
const SANDBOX_KEY  = process.env.AADHAAR_SANDBOX_KEY;

/**
 * Send OTP to Aadhaar-linked mobile.
 * @param {string} aadhaarNumber  12-digit Aadhaar UID
 * @returns {{ transactionId: string }}
 */
async function sendAadhaarOTP(aadhaarNumber) {
  // Sandbox mock — swap for real UIDAI API call
  if (process.env.USE_MOCK_AADHAAR === "true") {
    return { transactionId: `MOCK_TXN_${Date.now()}`, success: true };
  }
  const res = await axios.post(`${SANDBOX_BASE}/otp/generate`, {
    aadhaarNumber,
  }, {
    headers: { "x-api-key": SANDBOX_KEY },
  });
  return res.data;
}

/**
 * Verify OTP and fetch demographic data.
 * @returns {{ name, dob, gender, mobile, address, shareCode }}
 */
async function verifyAadhaarOTP(aadhaarNumber, otp, transactionId) {
  if (process.env.USE_MOCK_AADHAAR === "true") {
    // Return mock demo data for sandbox testing
    return {
      success:    true,
      name:       "Rahul Kumar",
      dob:        "1995-08-15",
      gender:     "M",
      mobile:     "9876543210",
      address:    "123 Main St, Delhi",
      shareCode:  "1234",
    };
  }
  const res = await axios.post(`${SANDBOX_BASE}/otp/verify`, {
    aadhaarNumber, otp, transactionId,
  }, {
    headers: { "x-api-key": SANDBOX_KEY },
  });
  return res.data;
}

/**
 * Hash Aadhaar UID — the ONLY form we store/transmit beyond this point.
 * Uses HMAC-SHA256 with a server-side secret for extra security.
 */
function hashAadhaar(aadhaarNumber) {
  return crypto
    .createHmac("sha256", process.env.AADHAAR_HASH_SECRET || "change-me")
    .update(aadhaarNumber)
    .digest("hex");
}

/**
 * Compute keccak256 for on-chain storage (matching Solidity keccak256(abi.encodePacked(...))).
 */
function keccak256ForChain(aadhaarNumber) {
  const { keccak256, toUtf8Bytes } = require("ethers");
  return keccak256(toUtf8Bytes(aadhaarNumber));
}

/**
 * Basic age check — voter must be >= 18.
 */
function isEligibleAge(dobString) {
  const dob  = new Date(dobString);
  const today = new Date();
  const age   = today.getFullYear() - dob.getFullYear() -
    (today < new Date(today.getFullYear(), dob.getMonth(), dob.getDate()) ? 1 : 0);
  return age >= 18;
}

module.exports = { sendAadhaarOTP, verifyAadhaarOTP, hashAadhaar, keccak256ForChain, isEligibleAge };
