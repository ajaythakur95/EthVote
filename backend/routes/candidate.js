const express = require("express");
const router = express.Router();
const multer = require("multer");
const { protect, authorize, adminConstituencyGuard } = require("../middleware/auth");
const ctrl = require("../controllers/candidateController");
const bulkCtrl = require("../controllers/Candidatebulkcontroller");
const { upload } = require("../middleware/upload");

// CSV ke liye memory storage (Cloudinary pe nahi jaana)
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max CSV
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "text/csv" || file.originalname.endsWith(".csv")) {
      cb(null, true);
    } else {
      cb(new Error("Sirf CSV files allowed hain"), false);
    }
  },
});

// ── Public ────────────────────────────────────────────────────────────────────
router.get("/election/:electionId", protect, ctrl.getCandidates);

// ── Voter: apni constituency ki election mein register kare ──────────────────
router.post(
  "/register",
  protect,
  authorize("voter"),
  upload.fields([
    { name: "partySymbol", maxCount: 1 },
    { name: "manifesto",   maxCount: 1 },
    { name: "photo",       maxCount: 1 },
  ]),
  ctrl.registerCandidate
);

// ── Admin: CSV se bulk candidates upload kare ─────────────────────────────────
router.post(
  "/bulk-upload",
  protect,
  authorize("admin", "superadmin"),
  csvUpload.single("csv"),
  bulkCtrl.bulkUploadCandidates
);

// ── Admin + SuperAdmin: sirf apni constituency ke candidates ─────────────────
router.get(
  "/pending",
  protect,
  authorize("admin", "superadmin"),
  adminConstituencyGuard,
  ctrl.getPendingCandidates
);

// ── SuperAdmin only: candidate verify kare ───────────────────────────────────
router.post(
  "/:id/approve",
  protect,
  authorize("superadmin"),
  ctrl.approveCandidate
);

router.post(
  "/:id/reject",
  protect,
  authorize("superadmin"),
  ctrl.rejectCandidate
);

module.exports = router;