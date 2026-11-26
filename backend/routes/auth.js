const express  = require("express");
const router   = express.Router();
const multer   = require("multer");
const rateLimit = require("express-rate-limit");

const aadhaarOfflineController = require("../controllers/Aadhaarofflinecontroller")
const authController           = require("../controllers/authController");
const livenessSessionStore     = require("../services/livenessSessionStore");
const { upload } = require("../middleware/upload");
const { withMaskedEpic } = require("../utils/epicUtils");

// Memory storage for ZIP file
const memStorage = multer({ storage: multer.memoryStorage() });

// Rate limiter (stricter in production; dev-friendly default)
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: Number(
    process.env.AUTH_RATE_LIMIT_MAX ??
      (process.env.NODE_ENV === "production" ? 10 : 80)
  ),
  message: { error: "Too many requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Aadhaar Offline KYC ───────────────────────────────────────────────────────
router.post(
  "/aadhaar-offline/verify",
  limiter,
  memStorage.single("aadhaarZip"),
  aadhaarOfflineController.verifyAadhaarOffline
);

// ── Login — already registered voter ─────────────────────────────────────────


// ── Admin Login ───────────────────────────────────────────────────────────────
router.post("/admin/login", limiter, authController.adminLogin);

// ── Registration ──────────────────────────────────────────────────────────────
router.post("/register/path-a", aadhaarOfflineController.registerPathA);

/** First-time voters: Offline XML KYC fields + wallet; pincode → PincodeMapping → pending admin */
router.post(
  "/register/path-b-offline",
  limiter,
  aadhaarOfflineController.registerPathBOfflineKyc
);

router.post(
  "/register/path-b",
  upload.fields([
    { name: "aadhaarFront", maxCount: 1 },
    { name: "aadhaarBack",  maxCount: 1 },
    { name: "photo",        maxCount: 1 },
  ]),
  aadhaarOfflineController.registerPathB
);
// POST /api/auth/aadhaar-offline/login
router.post("/aadhaar-offline/login", async (req, res, next) => {
  try {
    const { aadhaarHash } = req.body;
    const User = require("../models/User");

    const user = await User.findOne({ aadhaarHash, role: "voter" });
    if (!user) {
      return res.status(404).json({
        error: "Ye Aadhaar registered nahi hai.",
        notRegistered: true,
      });
    }
    if (user.verificationStatus === "PENDING") {
      return res.status(403).json({
        error: "Aapki registration abhi pending hai — admin approval ka wait karein.",
      });
    }
    if (user.verificationStatus === "REJECTED") {
      return res.status(403).json({
        error: "Aapki registration reject ho gayi hai.",
      });
    }

    const livenessToken = livenessSessionStore.create(user._id);

    res.json({
      success: true,
      requiresLiveness: true,
      livenessToken,
      userPreview: withMaskedEpic(user),
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/finalize-login — exchange one-time liveness session for JWT
router.post("/finalize-login", limiter, async (req, res, next) => {
  try {
    const { livenessToken } = req.body;
    const User = require("../models/User");
    const jwt = require("jsonwebtoken");

    const userId = livenessSessionStore.peek(livenessToken);
    if (!userId) {
      return res.status(401).json({
        error: "Invalid or expired liveness session. Please log in again.",
      });
    }

    const user = await User.findById(userId);
    if (!user || user.role !== "voter") {
      return res.status(401).json({ error: "User not found." });
    }
    if (user.verificationStatus === "PENDING") {
      return res.status(403).json({
        error: "Aapki registration abhi pending hai — admin approval ka wait karein.",
      });
    }
    if (user.verificationStatus === "REJECTED") {
      return res.status(403).json({ error: "Aapki registration reject ho gayi hai." });
    }

    if (!livenessSessionStore.consume(livenessToken)) {
      return res.status(401).json({
        error: "Invalid or expired liveness session. Please log in again.",
      });
    }

    await User.findByIdAndUpdate(user._id, { lastLoginAt: new Date() });
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRE || "7d",
    });

    res.json({ success: true, token, user: withMaskedEpic(user) });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/auth/face/challenge ──────────────────────────────────────────────
// Frontend pehle ye call kare, server-signed challenge le, phir liveness check kare
router.get("/face/challenge", (req, res) => {
  const faceService = require("../services/faceService");
  const challenge = faceService.generateChallenge();
  res.json({ success: true, ...challenge });
});

module.exports = router;