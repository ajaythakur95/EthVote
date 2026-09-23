// backend/routes/aadhaarOffline.js
// Offline Aadhaar XML upload route

const express = require("express");
const router = express.Router();
const multer = require("multer");
const aadhaarOfflineService = require("../services/aadhaarOfflineService");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/zip" || file.originalname.endsWith(".zip")) {
      cb(null, true);
    } else {
      cb(new Error("Sirf .zip file upload karo"));
    }
  },
});

// POST /api/auth/aadhaar-offline/verify
router.post("/verify", upload.single("aadhaarZip"), async (req, res) => {
  try {
    const { shareCode } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: "Aadhaar ZIP file upload karo" });
    }
    if (!shareCode || shareCode.length < 4) {
      return res.status(400).json({ error: "Share Code daalna zaroori hai" });
    }

    const data = await aadhaarOfflineService.parseOfflineKYC(
      req.file.buffer,
      shareCode
    );

    if (!data.isAdult) {
      return res.status(400).json({ error: "Voter ki age 18+ honi chahiye" });
    }

    return res.json({ success: true, voter: data });

  } catch (err) {
    console.error("[AadhaarOffline Route] Error:", err.message);
    return res.status(400).json({ error: err.message });
  }
});

module.exports = router;