const express = require("express");
const router = express.Router();
const { protect, requireInternalScope } = require("../middleware/auth");
const ctrl = require("../controllers/voterController");

router.get("/internal/:userId/epic", requireInternalScope("epic:read"), ctrl.getUnmaskedEpicInternal);

router.use(protect);

router.get("/profile", ctrl.getProfile);
router.get("/eligible-elections", ctrl.getEligibleElections);
router.post("/vote", ctrl.castVote);
router.get("/has-voted/:electionId", ctrl.checkVoteStatus);

module.exports = router;
