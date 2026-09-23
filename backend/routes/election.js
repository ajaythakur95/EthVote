const express = require("express");
const router = express.Router();
const { protect, authorize } = require("../middleware/auth");
const ctrl = require("../controllers/electionController");
const { upload } = require("../middleware/upload");
const {
  requireElectionCreationAccess,
  requireElectionStatusAccess,
  requireElectionPublishAccess,
} = require("../middleware/rbac");

router.get("/", ctrl.getAllElections);
router.get("/:id", ctrl.getElection);
router.get("/:id/results", protect, ctrl.getResults);

// Admin only
router.post(
  "/",
  protect,
  authorize("admin", "superadmin"),
  requireElectionCreationAccess,
  upload.single("bannerImage"),
  ctrl.createElection
);
router.patch(
  "/:id/status",
  protect,
  authorize("admin", "superadmin"),
  requireElectionStatusAccess,
  ctrl.updateElectionStatus
);
router.post(
  "/:id/results",
  protect,
  authorize("admin", "superadmin"),
  requireElectionPublishAccess,
  ctrl.publishResults
);
router.post(
  "/publish-result/:electionId",
  protect,
  authorize("admin", "superadmin"),
  requireElectionPublishAccess,
  ctrl.publishResult
);

module.exports = router;