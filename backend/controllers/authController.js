const jwt = require("jsonwebtoken");
const User = require("../models/User");
const aadhaarOfflineService = require("../services/aadhaarOfflineService");
const blockchainService = require("../services/blockchainService");
const { withMaskedEpic } = require("../utils/epicUtils");

// ── Token helpers ─────────────────────────────────────────────────────────────
const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "7d",
  });

const sendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  res.status(statusCode).json({ success: true, token, user: withMaskedEpic(user) });
};

// ── In-memory session cache ───────────────────────────────────────────────────
const sessionCache = new Map();

const cacheSet = (id, data) => {
  sessionCache.set(id, { aadhaarData: data, createdAt: Date.now() });
  setTimeout(() => sessionCache.delete(id), 10 * 60 * 1000);
};

// ─────────────────────────────────────────────────────────────────────────────
// Aadhaar Offline KYC — ZIP + Share Code verify karo
// POST /api/auth/aadhaar-offline/verify
// ─────────────────────────────────────────────────────────────────────────────
exports.verifyAadhaarOffline = async (req, res, next) => {
  try {
    const { shareCode } = req.body;
    const zipFile = req.file;

    if (!zipFile) return res.status(400).json({ error: "Aadhaar ZIP file upload karo" });
    if (!shareCode || shareCode.length < 4) return res.status(400).json({ error: "Share Code daalna zaroori hai" });

    const aadhaarData = await aadhaarOfflineService.parseOfflineKYC(zipFile.buffer, shareCode);

    if (!aadhaarData.isAdult) {
      return res.status(400).json({
        error: `Aap 18 saal se kam hain (Age: ${aadhaarData.age}). Voting ke liye eligible nahi hain.`,
      });
    }

    // Session cache mein store karo
    const session_id = "offline_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    cacheSet(session_id, aadhaarData);

    res.json({
      success: true,
      session_id,
      voter: {
        name:        aadhaarData.name,
        dob:         aadhaarData.dob,
        gender:      aadhaarData.gender,
        address:     aadhaarData.address,
        age:         aadhaarData.age,
        isAdult:     aadhaarData.isAdult,
        uidLast4:    aadhaarData.uidLast4,
        aadhaarHash: aadhaarData.aadhaarHash,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Complete Registration — Path A (Existing Voter)
// POST /api/auth/digilocker/complete
// ─────────────────────────────────────────────────────────────────────────────
exports.completeDigiLocker = async (req, res, next) => {
  try {
    const { session_id, epicNumber, walletAddress, aadhaarHash, name, dob, gender } = req.body;

    if (!session_id) return res.status(400).json({ error: "session_id required hai" });

    // Cache se data lo ya body se fallback karo
    const cached = sessionCache.get(session_id);
    const aadhaar = cached?.aadhaarData || { aadhaarHash, name, dob, gender, isAdult: true };

    if (!aadhaar.isAdult && aadhaar.age) {
      return res.status(400).json({
        error: `Aap 18 saal se kam hain. Voting ke liye eligible nahi hain.`,
      });
    }

    // Already registered? → Login
    const existing = await User.findOne({ aadhaarHash: aadhaar.aadhaarHash || aadhaarHash });
    if (existing) {
      sessionCache.delete(session_id);
      return sendToken(existing, 200, res);
    }

    // Path A: Voter ID hai → Register + Approve
    if (epicNumber) {
      const user = await User.create({
        aadhaarHash:        aadhaar.aadhaarHash || aadhaarHash,
        epicNumber:         epicNumber.toUpperCase().trim(),
        name:               aadhaar.name || name,
        dateOfBirth:        _parseDob(aadhaar.dob || dob),
        gender:             aadhaar.gender || gender,
        address:            aadhaar.address || "",
        walletAddress:      walletAddress?.toLowerCase(),
        registrationPath:   "PATH_A_EXISTING",
        verificationStatus: "APPROVED",
        aadhaarVerified:    true,
        digilockerVerified: true,
      });

      // SBT mint karo
      if (walletAddress && aadhaar.blockchainHash) {
        try {
          const ipfsMeta = `ipfs://QmPlaceholder/${user._id}`;
          const mint = await blockchainService.mintVoterIdentity(
            walletAddress, aadhaar.blockchainHash, ipfsMeta
          );
          await User.findByIdAndUpdate(user._id, {
            sbtTokenId:      parseInt(mint.tokenId),
            sbtMintedAt:     new Date(),
            sbtTxHash:       mint.txHash,
            ipfsMetadataURI: ipfsMeta,
          });
        } catch (mintErr) {
          console.error("[SBT] Mint failed:", mintErr.message);
        }
      }

      sessionCache.delete(session_id);
      return sendToken(user, 201, res);
    }

    return res.status(400).json({ error: "epicNumber required hai Path A ke liye" });

  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Path B Final Registration
// POST /api/auth/register/path-b
// ─────────────────────────────────────────────────────────────────────────────
exports.registerPathB = async (req, res, next) => {
  try {
    const { aadhaarHash, name, dob, gender, address, walletAddress, session_id } = req.body;
    const files = req.files || {};

    if (session_id) sessionCache.delete(session_id);

    const user = await User.create({
      aadhaarHash,
      name,
      dateOfBirth:        _parseDob(dob),
      gender,
      address,
      walletAddress:      walletAddress?.toLowerCase(),
      registrationPath:   "PATH_B_NEW",
      verificationStatus: "PENDING",
      aadhaarVerified:    true,
      digilockerVerified: true,
      documents: {
        photo:            files.photo?.[0]?.path,
        birthCertificate: files.birthCertificate?.[0]?.path,
      },
    });

    res.status(201).json({
      success: true,
      message: "Registration submit ho gayi. Admin verification mein 2-3 working days lagte hain.",
      userId: user._id,
      verificationStatus: "PENDING",
    });
  } catch (error) {
    next(error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin Login
// POST /api/auth/admin/login
// ─────────────────────────────────────────────────────────────────────────────
exports.adminLogin = async (req, res, next) => {
  try {
    const { name, password } = req.body;
    if (!name || !password) {
      return res.status(400).json({ error: "Name aur password dono required hain" });
    }
    const user = await User.findOne({ name, role: "admin" }).select("+password");
    if (!user) return res.status(401).json({ error: "Admin account nahi mila" });
    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ error: "Password galat hai" });
    return sendToken(user, 200, res);
  } catch (error) {
    next(error);
  }
};

// ── Helper ────────────────────────────────────────────────────────────────────
function _parseDob(dob) {
  if (!dob) return null;
  if (dob.includes("-")) {
    const parts = dob.split("-");
    if (parts[0].length === 4) return new Date(dob);
    return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
  }
  return new Date(dob);
}
exports.loginWithAadhaarHash = exports.completeDigiLocker;