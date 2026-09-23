const express  = require("express");
const router   = express.Router();
const { body, validationResult } = require("express-validator");
const twilio   = require("twilio");
const jwt      = require("jsonwebtoken");
const Voter    = require("../models/Voter");
const OTPSession = require("../models/OTPSession");
const aadhaarSvc = require("../services/aadhaarService");
const blockchainSvc = require("../services/blockchainService");
const { uploadMiddleware, uploadToCloudinary } = require("../middleware/upload");

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// ── POST /api/auth/aadhaar/send-otp ─────────────────────────────────────────
router.post("/aadhaar/send-otp", [
  body("aadhaarNumber").isLength({ min: 12, max: 12 }).isNumeric(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { aadhaarNumber } = req.body;
  try {
    const result = await aadhaarSvc.sendAadhaarOTP(aadhaarNumber);
    res.json({ success: true, transactionId: result.transactionId });
  } catch (err) {
    res.status(500).json({ error: "Failed to send Aadhaar OTP", detail: err.message });
  }
});

// ── POST /api/auth/aadhaar/verify-otp ────────────────────────────────────────
// Handles both Path A and Path B registration
router.post("/aadhaar/verify-otp", [
  body("aadhaarNumber").isLength({ min: 12, max: 12 }).isNumeric(),
  body("otp").isLength({ min: 6, max: 6 }).isNumeric(),
  body("transactionId").notEmpty(),
  body("walletAddress").isEthereumAddress(),
  body("path").isIn(["EXISTING_VOTER", "FIRST_TIME_VOTER"]),
  body("epicNumber").if(body("path").equals("EXISTING_VOTER")).notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { aadhaarNumber, otp, transactionId, walletAddress, path, epicNumber } = req.body;

  try {
    // 1. Verify Aadhaar OTP
    const demo = await aadhaarSvc.verifyAadhaarOTP(aadhaarNumber, otp, transactionId);
    if (!demo.success) return res.status(400).json({ error: "Aadhaar OTP verification failed" });

    // 2. Age check
    if (!aadhaarSvc.isEligibleAge(demo.dob))
      return res.status(400).json({ error: "Voter must be 18 or older" });

    // 3. Hash Aadhaar (never store raw)
    const aadhaarHashHex   = aadhaarSvc.hashAadhaar(aadhaarNumber);
    const aadhaarHashChain = aadhaarSvc.keccak256ForChain(aadhaarNumber);

    // 4. Check existing registration
    const existingVoter = await Voter.findOne({ aadhaarHashHex });
    if (existingVoter) return res.status(409).json({ error: "Aadhaar already registered" });

    if (path === "EXISTING_VOTER") {
      // Path A: Auto-approve + instant blockchain mint
      // TODO: Cross-verify EPIC number with Election Commission API
      const voter = await Voter.create({
        aadhaarHashHex,
        epicNumber,
        fullName:  demo.name,
        dateOfBirth: new Date(demo.dob),
        mobile:    demo.mobile,
        walletAddress,
        registrationPath: "EXISTING_VOTER",
        kycStatus: "APPROVED",
      });

      // Mint SBT on blockchain
      const { tokenId, txHash } = await blockchainSvc.mintIdentity(walletAddress, aadhaarHashChain);
      voter.sbtTokenId  = tokenId;
      voter.sbtMintedAt = new Date();
      voter.sbtTxHash   = txHash;
      await voter.save();

      const token = jwt.sign({ voterId: voter._id, walletAddress, role: "VOTER" },
        process.env.JWT_SECRET, { expiresIn: "7d" });

      return res.json({ success: true, path: "EXISTING_VOTER", token, sbtTokenId: tokenId, txHash });
    }

    // Path B: First-time voter — create pending record
    const voter = await Voter.create({
      aadhaarHashHex,
      fullName:  demo.name,
      dateOfBirth: new Date(demo.dob),
      mobile:    demo.mobile,
      walletAddress,
      registrationPath: "FIRST_TIME_VOTER",
      kycStatus: "PENDING",
    });

    res.json({
      success: true,
      path: "FIRST_TIME_VOTER",
      voterId: voter._id,
      message: "OTP verified. Please upload documents for admin review.",
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Registration failed", detail: err.message });
  }
});

// ── POST /api/auth/documents/upload ─────────────────────────────────────────
// Path B: Upload Aadhaar photos + selfie for admin review
router.post("/documents/upload",
  uploadMiddleware.fields([
    { name: "aadhaarFront",  maxCount: 1 },
    { name: "aadhaarBack",   maxCount: 1 },
    { name: "selfieWithDoc", maxCount: 1 },
  ]),
  async (req, res) => {
    const { voterId, faceApiScore } = req.body;
    try {
      const voter = await Voter.findById(voterId);
      if (!voter) return res.status(404).json({ error: "Voter not found" });
      if (voter.registrationPath !== "FIRST_TIME_VOTER")
        return res.status(400).json({ error: "Only for first-time voter path" });

      const [front, back, selfie] = await Promise.all([
        uploadToCloudinary(req.files["aadhaarFront"][0].buffer,  `ethvote/docs/${voterId}_front`),
        uploadToCloudinary(req.files["aadhaarBack"][0].buffer,   `ethvote/docs/${voterId}_back`),
        uploadToCloudinary(req.files["selfieWithDoc"][0].buffer, `ethvote/docs/${voterId}_selfie`),
      ]);

      voter.documents = {
        aadhaarFront:  front.secure_url,
        aadhaarBack:   back.secure_url,
        selfieWithDoc: selfie.secure_url,
        faceApiScore:  parseFloat(faceApiScore) || 0,
      };
      await voter.save();

      res.json({ success: true, message: "Documents submitted for admin review" });
    } catch (err) {
      res.status(500).json({ error: "Upload failed", detail: err.message });
    }
  }
);

module.exports = router;
