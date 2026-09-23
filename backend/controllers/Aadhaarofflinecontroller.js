const { verifyAadhaarOffline } = require("../services/Aadhaarofflineservice");
const User = require("../models/User");
const jwt  = require("jsonwebtoken");
const blockchainService = require("../services/blockchainService");
const { resolveDistrict } = require("../constants/districts");
const { withMaskedEpic } = require("../utils/epicUtils");
const { resolveByPincode } = require("../services/pincodeMappingService");
const {
  signOfflineKycSession,
  verifyOfflineKycSession,
  getKycSessionExpiresIn,
} = require("../services/kycSessionService");
const {
  resolveAssignedFromPincodeMapping,
  resolveVidhanOnlyFromConstituencyName,
} = require("../services/constituencyService");
const { verifyEpicWithIdfy, EPIC_NOT_FOUND_MESSAGE } = require("../services/idfy.service");

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "7d",
  });

function normalizeAadhaarHash(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeWalletAddress(value) {
  return String(value || "").trim().toLowerCase();
}

function isMatchingAadhaarIdentity(existingUser, identity = {}) {
  if (!existingUser) return false;

  const incomingName = normalizeName(identity.name || "");
  const incomingDob = normalizeDateString(identity.dob || "");
  const incomingGender = normalizeGender(identity.gender || "");

  const existingName = normalizeName(existingUser.name || "");
  const existingDob = normalizeDateString(
    existingUser?.dateOfBirth
      ? new Date(existingUser.dateOfBirth).toISOString().slice(0, 10)
      : ""
  );
  const existingGender = normalizeGender(existingUser.gender || "");

  if (!incomingName || !existingName) return false;

  const nameMatch = areNamesMatching(incomingName, existingName);
  const dobMatch = !incomingDob || !existingDob || incomingDob === existingDob;
  const genderMatch =
    !incomingGender || !existingGender || incomingGender === existingGender;

  return nameMatch && dobMatch && genderMatch;
}

function canReuseExistingVoterRecord(existingUser, identity = {}) {
  if (!existingUser) return false;

  const existingAadhaarHash = normalizeAadhaarHash(existingUser.aadhaarHash);
  const incomingAadhaarHash = normalizeAadhaarHash(identity.aadhaarHash);
  if (existingAadhaarHash && incomingAadhaarHash && existingAadhaarHash === incomingAadhaarHash) {
    return true;
  }

  if (existingUser.role !== "voter") return false;

  return isMatchingAadhaarIdentity(existingUser, identity);
}

// ── POST /api/auth/aadhaar-offline/verify ────────────────────────────────────
exports.verifyAadhaarOffline = async (req, res, next) => {
  try {
    const { shareCode } = req.body;
    const zipFile = req.file;

    if (!zipFile) return res.status(400).json({ error: "Aadhaar ZIP file upload karo" });
    if (!shareCode || shareCode.length < 4) {
      return res.status(400).json({ error: "4-digit Share Code daalo" });
    }

    const voterData = await verifyAadhaarOffline(zipFile.buffer, shareCode);
    const electoralMapping = await resolveByPincode(voterData.pincode);

    if (!voterData.isAdult) {
      return res.status(400).json({
        error: `Aap 18 saal se kam hain (Age: ${voterData.age}). Voting ke liye eligible nahi hain.`,
      });
    }

    // ── Already registered check — login karne do, block mat karo ──────────
    const existing = await User.findOne({ aadhaarHash: voterData.aadhaarHash });
    if (existing) {
      const referencePhoto = voterData.photo || existing.documents?.photo || null;
      return res.json({
        success:           true,
        alreadyRegistered: true,         
        aadhaarHash:       voterData.aadhaarHash,
        voter: {
          name: existing.name,
          constituency: existing.constituency,
          photo: referencePhoto,
        },
        electoralMapping: electoralMapping || undefined,
      });
    }

    const kycSessionToken = signOfflineKycSession({
      aadhaarHash: voterData.aadhaarHash,
      pincode: voterData.pincode,
      blockchainHash: voterData.blockchainHash,
      name: voterData.name,
      dob: voterData.dob,
      gender: voterData.gender,
    });

    
    res.json({
      success:           true,
      alreadyRegistered: false,
      kycSessionToken:     kycSessionToken || null,
      kycSessionReady:     !!kycSessionToken,
      kycSessionExpiresIn: kycSessionToken ? getKycSessionExpiresIn() : null,
      voter: {
        name:           voterData.name,
        dob:            voterData.dob,
        gender:         voterData.gender,
        age:            voterData.age,
        isAdult:        voterData.isAdult,
        address:        voterData.address,
        district:       voterData.district,
        subdist:        voterData.subdist || "",
        pc:             voterData.pincode || "",
        pincode:        voterData.pincode || "",
        state:          voterData.state,
        constituency:   voterData.constituency,
        uidLast4:       voterData.uidLast4,
        photo:          voterData.photo || null,
        aadhaarHash:    voterData.aadhaarHash,
        blockchainHash: voterData.blockchainHash,
      },
      electoralMapping: electoralMapping || null,
    });
  } catch (error) {
    if (error.message.includes("Share Code") || error.message.includes("ZIP")) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
};

exports.registerPathA = async (req, res, next) => {
  try {
    const {
      aadhaarHash, kycSessionToken, blockchainHash, name, dob, gender,
      address, subdist, pc, pincode,
      epicNumber, walletAddress,
    } = req.body;
    const requestedChainHash =
      typeof blockchainHash === "string" && blockchainHash.startsWith("0x")
        ? blockchainHash
        : "";

    if (!epicNumber || !walletAddress || !kycSessionToken) {
      return res.status(400).json({
        error: "KYC session token, EPIC number aur wallet address required hain",
      });
    }

    let session;
    try {
      session = verifyOfflineKycSession(kycSessionToken);
    } catch (e) {
      if (e.name === "TokenExpiredError") {
        return res.status(401).json({
          error: "KYC session expired hai. Aadhaar Offline verify dobara karein.",
        });
      }
      if (e.code === "KYC_SESSION_MISSING" || e.name === "JsonWebTokenError") {
        return res.status(401).json({
          error: "KYC session invalid ya missing hai. Aadhaar Offline verify dobara karein.",
        });
      }
      return res.status(401).json({ error: "KYC session invalid." });
    }

    if (
      aadhaarHash &&
      normalizeAadhaarHash(aadhaarHash) !== normalizeAadhaarHash(session.aadhaarHash)
    ) {
      return res.status(422).json({
        error: "Aadhaar session mismatch. Aadhaar verify dobara karein.",
      });
    }

    if (
      requestedChainHash &&
      session.blockchainHash &&
      requestedChainHash.toLowerCase() !== session.blockchainHash.toLowerCase()
    ) {
      return res.status(422).json({
        error: "Aadhaar session blockchain hash mismatch. Aadhaar verify dobara karein.",
      });
    }

    const canonicalAadhaarHash = normalizeAadhaarHash(session.aadhaarHash);
    const aadhaarName = session.name || name;
    const aadhaarDob = session.dob || dob;
    const aadhaarGender = session.gender || gender;
    const chainHash = requestedChainHash || session.blockchainHash;
    const normalizedWalletAddress = normalizeWalletAddress(walletAddress);

    if (!canonicalAadhaarHash || !aadhaarName || !aadhaarDob || !aadhaarGender) {
      return res.status(422).json({
        error: "Aadhaar session me identity data incomplete hai. Aadhaar verify dobara karein.",
      });
    }

    let epicData;
    try {
      epicData = await verifyEpicWithIdfy(epicNumber);
    } catch (idfyErr) {
      if (idfyErr.code === "IDFY_EPIC_NOT_FOUND") {
        return res.status(422).json({ error: EPIC_NOT_FOUND_MESSAGE });
      }
      throw idfyErr;
    }

    const assemblyConstituency = String(epicData.assembly_constituency || "").trim();
    const parliamentaryConstituency = String(epicData.parliamentary_constituency || "").trim();
    const epicState = String(epicData.state || "").trim();
    const epicDistrict = String(epicData.district || "").trim();
    const resolvedDistrict = resolveDistrict(epicDistrict) || epicDistrict;

    if (!assemblyConstituency || !parliamentaryConstituency || !epicState || !resolvedDistrict) {
      return res.status(422).json({ error: EPIC_NOT_FOUND_MESSAGE });
    }

    const identityCheck = validateAadhaarEpicIdentity(
      { name: aadhaarName, dob: aadhaarDob, gender: aadhaarGender },
      {
        name: epicData.name,
        dob: epicData.dateOfBirth,
        gender: epicData.gender,
      }
    );
    if (!identityCheck.ok) {
      return res.status(422).json({ error: identityCheck.error });
    }

    // Aadhaar duplicate check
    const existingByAadhaar = await User.findOne({ aadhaarHash: canonicalAadhaarHash });

    // ── Wallet duplicate check ──────────────────────────────────────────────
    const existingByWallet = await User.findOne({
      walletAddress: normalizedWalletAddress,
    });

    let reusableUser = null;
    if (existingByAadhaar) {
      if (existingByAadhaar.role !== "voter") {
        return res.status(400).json({ error: "Ye Aadhaar kisi non-voter account se linked hai." });
      }

      const existingWallet = normalizeWalletAddress(existingByAadhaar.walletAddress);
      if (existingWallet && existingWallet !== normalizedWalletAddress) {
        return res.status(400).json({
          error: "Ye Aadhaar pehle se ek aur wallet se linked hai. Wahi wallet use karein.",
        });
      }
      reusableUser = existingByAadhaar;
    }

    if (existingByWallet && (!reusableUser || String(existingByWallet._id) !== String(reusableUser._id))) {
      if (
        !canReuseExistingVoterRecord(existingByWallet, {
          aadhaarHash: canonicalAadhaarHash,
          name: aadhaarName,
          dob: aadhaarDob,
          gender: aadhaarGender,
        })
      ) {
        return res.status(400).json({
          error: "Yeh wallet address pehle se registered hai. Alag wallet use karo.",
        });
      }
      reusableUser = existingByWallet;
    }

    const jurByMapping = await resolveAssignedFromPincodeMapping({
      vidhanSabhaAC: assemblyConstituency,
      lokSabhaPC: parliamentaryConstituency,
      state: epicState,
    });
    const jurByConstituency = await resolveVidhanOnlyFromConstituencyName(
      assemblyConstituency,
      epicState
    );
    const jur = {
      assigned_vidhan_sabha:
        jurByMapping.assigned_vidhan_sabha || jurByConstituency.assigned_vidhan_sabha || null,
      assigned_lok_sabha: jurByMapping.assigned_lok_sabha || null,
    };

    const userPayload = {
      aadhaarHash: canonicalAadhaarHash,
      epicNumber: epicData.epicNumber,
      name: aadhaarName,
      dateOfBirth: _parseDob(aadhaarDob),
      gender: aadhaarGender,
      address,
      district: resolvedDistrict,
      subDistrict: subdist || "",
      pincode: pc || pincode || "",
      state: epicState,
      constituency: assemblyConstituency,
      vidhanSabhaAC: assemblyConstituency,
      lokSabhaPC: parliamentaryConstituency,
      ...jur,
      walletAddress: normalizedWalletAddress,
      role: "voter",
      registrationPath: "PATH_A_EXISTING",
      verificationStatus: "APPROVED",
      aadhaarVerified: true,
      rejectionReason: "",
      ...(chainHash ? { blockchainHash: chainHash } : {}),
    };

    let user;
    if (reusableUser) {
      user = await User.findByIdAndUpdate(
        reusableUser._id,
        { $set: userPayload, $unset: { adminReviewedBy: "", adminReviewedAt: "" } },
        { new: true, runValidators: true }
      );
    } else {
      user = await User.create({
        ...userPayload,
        mobileNumber: `voter_${Date.now()}`,
      });
    }

    // Mint SBT
    try {
      const ipfsMeta = `ipfs://QmPlaceholder/${user._id}`;
      const mint     = await blockchainService.mintVoterIdentity(
        normalizedWalletAddress,
        chainHash || canonicalAadhaarHash,
        ipfsMeta
      );
      await User.findByIdAndUpdate(user._id, {
        sbtTokenId:      parseInt(mint.tokenId),
        sbtMintedAt:     new Date(),
        sbtTxHash:       mint.txHash,
        ipfsMetadataURI: ipfsMeta,
      });
    } catch (mintErr) {
      console.error("[Path A] SBT mint failed:", mintErr.message);
      // SBT fail hone pe bhi registration complete hogi
    }

    const token = signToken(user._id);
    res.status(201).json({ success: true, token, user: withMaskedEpic(user) });
  } catch (error) {
    if (error.code === "IDFY_EPIC_NOT_FOUND") {
      return res.status(422).json({ error: EPIC_NOT_FOUND_MESSAGE });
    }
    // MongoDB duplicate key error
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      const messages = {
        walletAddress: "Yeh wallet address pehle se registered hai. Alag wallet use karo.",
        aadhaarHash:   "Ye Aadhaar pehle se registered hai.",
        epicNumber:    "Yeh EPIC number pehle se registered hai.",
      };
      return res.status(400).json({ 
        error: messages[field] || "Duplicate entry — pehle se registered hai." 
      });
    }
    next(error);
  }
};

// ── POST /api/auth/register/path-b ───────────────────────────────────────────
exports.registerPathB = async (req, res, next) => {
  try {
    const {
      aadhaarHash, blockchainHash, name, dob, gender,
      address, district, subdist, pc, pincode, state, constituency,
      walletAddress,
    } = req.body;
    const files = req.files || {};
    const chainHash =
      typeof blockchainHash === "string" && blockchainHash.startsWith("0x")
        ? blockchainHash
        : "";
    const canonicalAadhaarHash = normalizeAadhaarHash(aadhaarHash);
    const normalizedWalletAddress = normalizeWalletAddress(walletAddress);

    if (!canonicalAadhaarHash || !name) {
      return res.status(400).json({ error: "Required fields missing hain" });
    }
    const resolvedDistrict = resolveDistrict(district);
    if (!resolvedDistrict) {
      return res.status(400).json({ error: "Valid district select karna zaroori hai" });
    }

    // Aadhaar duplicate check
    const existingByAadhaar = await User.findOne({ aadhaarHash: canonicalAadhaarHash });

    // ── Wallet duplicate check ──────────────────────────────────────────────
    const existingByWallet = normalizedWalletAddress
      ? await User.findOne({ walletAddress: normalizedWalletAddress })
      : null;

    let reusableUser = null;
    if (existingByAadhaar) {
      if (existingByAadhaar.role !== "voter") {
        return res.status(400).json({ error: "Ye Aadhaar kisi non-voter account se linked hai." });
      }

      const existingWallet = normalizeWalletAddress(existingByAadhaar.walletAddress);
      if (existingWallet && normalizedWalletAddress && existingWallet !== normalizedWalletAddress) {
        return res.status(400).json({
          error: "Ye Aadhaar pehle se ek aur wallet se linked hai. Wahi wallet use karein.",
        });
      }
      reusableUser = existingByAadhaar;
    }

    if (
      existingByWallet &&
      (!reusableUser || String(existingByWallet._id) !== String(reusableUser._id))
    ) {
      if (
        !canReuseExistingVoterRecord(existingByWallet, {
          aadhaarHash: canonicalAadhaarHash,
          name,
          dob,
          gender,
        })
      ) {
        return res.status(400).json({
          error: "Yeh wallet address pehle se registered hai. Alag wallet use karo.",
        });
      }
      reusableUser = existingByWallet;
    }

    const jur = await resolveVidhanOnlyFromConstituencyName(constituency, state);

    const userPayload = {
      aadhaarHash: canonicalAadhaarHash,
      name,
      dateOfBirth: _parseDob(dob),
      gender,
      address,
      district: resolvedDistrict,
      subDistrict: subdist || "",
      pincode: pc || pincode || "",
      state,
      constituency,
      ...jur,
      walletAddress: normalizedWalletAddress || undefined,
      role: "voter",
      registrationPath: "PATH_B_NEW",
      verificationStatus: "PENDING",
      aadhaarVerified: true,
      rejectionReason: "",
      ...(chainHash ? { blockchainHash: chainHash } : {}),
      documents: {
        aadhaarFront: files.aadhaarFront?.[0]?.path,
        aadhaarBack: files.aadhaarBack?.[0]?.path,
        photo: files.photo?.[0]?.path,
      },
    };

    let user;
    if (reusableUser) {
      user = await User.findByIdAndUpdate(
        reusableUser._id,
        { $set: userPayload, $unset: { adminReviewedBy: "", adminReviewedAt: "" } },
        { new: true, runValidators: true }
      );
    } else {
      user = await User.create({
        ...userPayload,
        mobileNumber: `voter_${Date.now()}`,
      });
    }

    res.status(201).json({
      success: true,
      message: `Registration submit ho gayi. ${constituency} ke admin verify karenge — 2-3 working days mein.`,
      userId:             user._id,
      verificationStatus: "PENDING",
      constituency,
    });
  } catch (error) {
    // MongoDB duplicate key error
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      const messages = {
        walletAddress: "Yeh wallet address pehle se registered hai. Alag wallet use karo.",
        aadhaarHash:   "Ye Aadhaar pehle se registered hai.",
      };
      return res.status(400).json({ 
        error: messages[field] || "Duplicate entry — pehle se registered hai." 
      });
    }
    next(error);
  }
};

// ── POST /api/auth/register/path-b-offline — no EPIC: Offline XML KYC + PincodeMapping → pending ──
exports.registerPathBOfflineKyc = async (req, res, next) => {
  try {
    const {
      kycSessionToken,
      name,
      dob,
      gender,
      address,
      district,
      subdist,
      state,
      walletAddress,
    } = req.body;

    if (!name || !walletAddress) {
      return res.status(400).json({ error: "name aur walletAddress zaroori hain" });
    }

    let session;
    try {
      session = verifyOfflineKycSession(kycSessionToken);
    } catch (e) {
      if (e.name === "TokenExpiredError") {
        return res.status(401).json({
          error: "KYC session expired — Aadhaar Offline verify dubara karein.",
        });
      }
      if (e.code === "KYC_SESSION_MISSING" || e.name === "JsonWebTokenError") {
        return res.status(401).json({
          error:
            "kycSessionToken invalid ya missing — pehle POST /aadhaar-offline/verify se session lo.",
        });
      }
      return res.status(401).json({ error: "KYC session invalid." });
    }

    const { aadhaarHash, pincode: pinNorm, blockchainHash: chainHash } = session;
    const canonicalAadhaarHash = normalizeAadhaarHash(aadhaarHash);
    const normalizedWalletAddress = normalizeWalletAddress(walletAddress);

    const electoral = await resolveByPincode(pinNorm);
    if (!electoral) {
      return res.status(422).json({
        error:
          "Is PIN code ke liye electoral mapping database mein nahi hai. Admin mapping add karein.",
        pincode: pinNorm,
      });
    }

    const resolvedDistrict = resolveDistrict(district);
    if (!resolvedDistrict) {
      return res.status(400).json({ error: "Valid district select karna zaroori hai" });
    }

    const [existingByAadhaar, existingByWallet] = await Promise.all([
      User.findOne({ aadhaarHash: canonicalAadhaarHash }),
      User.findOne({ walletAddress: normalizedWalletAddress }),
    ]);

    let reusableUser = null;
    if (existingByAadhaar) {
      if (existingByAadhaar.role !== "voter") {
        return res.status(400).json({ error: "Ye Aadhaar kisi non-voter account se linked hai." });
      }

      const existingWallet = normalizeWalletAddress(existingByAadhaar.walletAddress);
      if (existingWallet && existingWallet !== normalizedWalletAddress) {
        return res.status(400).json({
          error: "Ye Aadhaar pehle se ek aur wallet se linked hai. Wahi wallet use karein.",
        });
      }
      reusableUser = existingByAadhaar;
    }

    if (
      existingByWallet &&
      (!reusableUser || String(existingByWallet._id) !== String(reusableUser._id))
    ) {
      if (
        !canReuseExistingVoterRecord(existingByWallet, {
          aadhaarHash: canonicalAadhaarHash,
          name,
          dob,
          gender,
        })
      ) {
        return res.status(400).json({
          error: "Yeh wallet address pehle se registered hai. Alag wallet use karo.",
        });
      }
      reusableUser = existingByWallet;
    }

    const jur = await resolveAssignedFromPincodeMapping({
      vidhanSabhaAC: electoral.vidhanSabhaAC,
      lokSabhaPC: electoral.lokSabhaPC,
      state: state || electoral.state || "",
    });

    const userPayload = {
      aadhaarHash: canonicalAadhaarHash,
      blockchainHash: chainHash,
      name,
      dateOfBirth: _parseDob(dob),
      gender: gender || "",
      address: address || "",
      district: resolvedDistrict,
      subDistrict: subdist || "",
      pincode: pinNorm,
      state: state || electoral.state || "",
      constituency: electoral.vidhanSabhaAC,
      vidhanSabhaAC: electoral.vidhanSabhaAC,
      lokSabhaPC: electoral.lokSabhaPC,
      ...jur,
      walletAddress: normalizedWalletAddress,
      role: "voter",
      registrationPath: "PATH_B_NEW",
      verificationStatus: "PENDING",
      aadhaarVerified: true,
      digilockerVerified: true,
      rejectionReason: "",
    };

    let user;
    if (reusableUser) {
      user = await User.findByIdAndUpdate(
        reusableUser._id,
        { $set: userPayload, $unset: { adminReviewedBy: "", adminReviewedAt: "" } },
        { new: true, runValidators: true }
      );
    } else {
      user = await User.create({
        ...userPayload,
        mobileNumber: `voter_${Date.now()}`,
      });
    }

    res.status(201).json({
      success: true,
      message:
        "Registration submit ho gayi — admin approve par Virtual Voter ID + SBT issue hoga.",
      userId: user._id,
      verificationStatus: "PENDING",
      constituency: user.constituency,
      vidhanSabhaAC: user.vidhanSabhaAC,
      lokSabhaPC: user.lokSabhaPC,
    });
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      const messages = {
        walletAddress: "Yeh wallet address pehle se registered hai. Alag wallet use karo.",
        aadhaarHash: "Ye Aadhaar pehle se registered hai.",
      };
      return res.status(400).json({
        error: messages[field] || "Duplicate entry — pehle se registered hai.",
      });
    }
    next(error);
  }
};

// ── Helper ────────────────────────────────────────────────────────────────────
function _parseDob(dob) {
  if (!dob) return null;
  const parts = dob.split("-");
  if (parts[0].length === 4) return new Date(dob);
  return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
}

function validateAadhaarEpicIdentity(aadhaar, epic) {
  const aadhaarName = normalizeName(aadhaar.name);
  const aadhaarDob = normalizeDateString(aadhaar.dob);
  const aadhaarGender = normalizeGender(aadhaar.gender);
  const epicName = normalizeName(epic.name);
  const epicDob = normalizeDateString(epic.dob);
  const epicGender = normalizeGender(epic.gender);

  if (!aadhaarName || !aadhaarDob || !aadhaarGender) {
    return {
      ok: false,
      error: "Aadhaar details incomplete hain. Offline Aadhaar verify dobara karein.",
    };
  }

  if (!epicName || !epicDob || !epicGender) {
    return {
      ok: false,
      error: "EPIC verification me name/DOB/gender complete nahi mila. Sahi EPIC use karein.",
    };
  }

  if (!areNamesMatching(aadhaarName, epicName)) {
    return {
      ok: false,
      error: "Aadhaar aur EPIC ka naam match nahi karta.",
    };
  }

  if (aadhaarDob !== epicDob) {
    return {
      ok: false,
      error: "Aadhaar aur EPIC ki DOB match nahi karti.",
    };
  }

  if (aadhaarGender !== epicGender) {
    return {
      ok: false,
      error: "Aadhaar aur EPIC ka gender match nahi karta.",
    };
  }

  return { ok: true };
}

function normalizeName(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function areNamesMatching(aadhaarName, epicName) {
  if (!aadhaarName || !epicName) return false;
  if (aadhaarName === epicName) return true;

  const compactA = aadhaarName.replace(/\s+/g, "");
  const compactB = epicName.replace(/\s+/g, "");
  if (compactA === compactB) return true;

  const tokensA = aadhaarName.split(" ").filter((token) => token.length > 1);
  const tokensB = epicName.split(" ").filter((token) => token.length > 1);
  if (!tokensA.length || !tokensB.length) return false;

  const small = tokensA.length <= tokensB.length ? tokensA : tokensB;
  const big = tokensA.length <= tokensB.length ? tokensB : tokensA;
  const overlap = small.filter((token) => big.includes(token)).length;
  return overlap / small.length >= 0.7;
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