const jwt = require("jsonwebtoken");
const { ethers } = require("ethers");
const { normalizePincode } = require("./pincodeMappingService");

const SESSION_TYP = "aadhaar_offline_kyc";
const ISSUER = "ethvote-kyc";

function getSecret() {
  const s = process.env.KYC_SESSION_SECRET || process.env.JWT_SECRET;
  if (!s) throw new Error("KYC_SESSION_SECRET or JWT_SECRET must be set");
  return s;
}

function getExpiresIn() {
  return process.env.KYC_SESSION_EXPIRES_IN || "15m";
}

function normalizeName(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function normalizeDateString(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const parts = raw.match(/\d+/g);
  if (!parts || parts.length < 3) return "";

  let day = "";
  let month = "";
  let year = "";

  if (parts[0].length === 4) {
    [year, month, day] = parts;
  } else if (parts[2].length === 4) {
    [day, month, year] = parts;
  } else {
    return "";
  }

  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (
    !Number.isInteger(y) ||
    !Number.isInteger(m) ||
    !Number.isInteger(d) ||
    y < 1900 ||
    y > 2100 ||
    m < 1 ||
    m > 12 ||
    d < 1 ||
    d > 31
  ) {
    return "";
  }
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function normalizeGender(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";
  if (raw === "M" || raw === "MALE") return "M";
  if (raw === "F" || raw === "FEMALE") return "F";
  if (raw === "T" || raw === "TG" || raw === "TRANSGENDER" || raw === "OTHER" || raw === "O") {
    return "T";
  }
  return raw;
}

/**
 * @param {{
 *   aadhaarHash: string,
 *   pincode: string,
 *   blockchainHash: string | null,
 *   name?: string,
 *   dob?: string,
 *   gender?: string,
 * }} data
 */
function signOfflineKycSession(data) {
  const pincode = normalizePincode(data.pincode);
  const chain =
    typeof data.blockchainHash === "string" && ethers.isHexString(data.blockchainHash, 32)
      ? data.blockchainHash
      : null;
  const aadhaarName = normalizeName(data.name);
  const aadhaarDob = normalizeDateString(data.dob);
  const aadhaarGender = normalizeGender(data.gender);

  if (!data.aadhaarHash || !/^\d{6}$/.test(pincode) || !chain) {
    return null;
  }

  return jwt.sign(
    {
      typ: SESSION_TYP,
      aadhaarHash: data.aadhaarHash,
      pincode,
      blockchainHash: chain,
      aadhaarName,
      aadhaarDob,
      aadhaarGender,
    },
    getSecret(),
    {
      expiresIn: getExpiresIn(),
      issuer: ISSUER,
      subject: "offline-kyc",
    }
  );
}

/**
 * @param {string} token
 * @returns {{
 *   aadhaarHash: string,
 *   pincode: string,
 *   blockchainHash: string,
 *   name: string,
 *   dob: string,
 *   gender: string,
 * }}
 */
function verifyOfflineKycSession(token) {
  if (!token || typeof token !== "string") {
    const err = new Error("KYC session token missing");
    err.code = "KYC_SESSION_MISSING";
    throw err;
  }
  const decoded = jwt.verify(token, getSecret(), {
    issuer: ISSUER,
    algorithms: ["HS256"],
  });
  if (decoded.typ !== SESSION_TYP) {
    const err = new Error("Invalid KYC session type");
    err.code = "KYC_SESSION_INVALID";
    throw err;
  }
  const chain = decoded.blockchainHash;
  if (!decoded.aadhaarHash || !decoded.pincode || !chain || !ethers.isHexString(chain, 32)) {
    const err = new Error("Invalid KYC session payload");
    err.code = "KYC_SESSION_INVALID";
    throw err;
  }
  return {
    aadhaarHash: decoded.aadhaarHash,
    pincode: decoded.pincode,
    blockchainHash: chain,
    name: normalizeName(decoded.aadhaarName),
    dob: normalizeDateString(decoded.aadhaarDob),
    gender: normalizeGender(decoded.aadhaarGender),
  };
}

module.exports = {
  signOfflineKycSession,
  verifyOfflineKycSession,
  getKycSessionExpiresIn: getExpiresIn,
  SESSION_TYP,
};