const Candidate = require("../models/Candidate");
const User = require("../models/User");

exports.verifyCandidate = async (req, res, next) => {
  try {
    const candidate = req.targetCandidate || (await Candidate.findById(req.params.candidateId));
    if (!candidate) return res.status(404).json({ error: "Candidate not found" });

    const { action, rejectionReason } = req.body;
    if (!["Verified", "Rejected"].includes(action)) {
      return res.status(400).json({ error: "action must be either 'Verified' or 'Rejected'" });
    }

    const currentStatus = candidate.verificationStatus || candidate.status;
    if (["Verified", "Rejected", "APPROVED", "REJECTED"].includes(currentStatus)) {
      return res.status(400).json({ error: "Candidate has already been reviewed." });
    }

    if (action === "Rejected" && !String(rejectionReason || "").trim()) {
      return res.status(400).json({ error: "rejectionReason is required when action is Rejected." });
    }

    const nextVerification = action;
    const legacyStatus = action === "Verified" ? "APPROVED" : "REJECTED";

    candidate.verificationStatus = nextVerification;
    candidate.status = legacyStatus;
    candidate.verifiedBy = req.user._id;
    candidate.verifiedAt = new Date();
    candidate.reviewedBy = req.user._id;
    candidate.reviewedAt = candidate.verifiedAt;
    candidate.rejectionReason = action === "Rejected" ? String(rejectionReason).trim() : "";

    await candidate.save();

    if (action === "Verified") {
      await User.findByIdAndUpdate(candidate.user, { role: "candidate" });
    }

    res.json({ success: true, candidate });
  } catch (error) {
    next(error);
  }
};
