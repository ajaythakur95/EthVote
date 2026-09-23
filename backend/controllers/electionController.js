const mongoose = require("mongoose");
const Election = require("../models/Election");
const Candidate = require("../models/Candidate");
const Vote = require("../models/Vote");
const Constituency = require("../models/Constituency");
const blockchainService = require("../services/blockchainService");
const AuditLog = require("../models/AuditLog");
const {
  resolveElectionClassFromPayload,
  resolveElectionClassFromDoc,
} = require("../utils/electionPolicy");

function mapElectionClassToDbType(electionClass) {
  // Persist canonical API-compatible values so old/new dashboards stay consistent.
  if (electionClass === "LOK_SABHA") return "GENERAL";
  if (electionClass === "VIDHAN_SABHA") return "STATE_ASSEMBLY";
  if (electionClass === "BY_ELECTION") return "BY_ELECTION";
  return "";
}

function mapElectionClassToStrictLevel(electionClass) {
  if (electionClass === "LOK_SABHA") return "Lok Sabha";
  if (electionClass === "VIDHAN_SABHA") return "Vidhan Sabha";
  return "";
}

// GET /api/election — list all elections
exports.getAllElections = async (req, res, next) => {
  try {
    const { status, constituency } = req.query;
    const filter = {};
    if (status) filter.status = status.toUpperCase();
    if (constituency) filter.constituency = new RegExp(constituency, "i");

    const elections = await Election.find(filter)
      .populate("createdBy", "name")
      .populate("winnerId", "name partyName")
      .sort({ createdAt: -1 });

    res.json({ success: true, count: elections.length, elections });
  } catch (e) { next(e); }
};

// GET /api/election/:id
exports.getElection = async (req, res, next) => {
  try {
    const election = await Election.findById(req.params.id)
      .populate("createdBy", "name")
      .populate({ path: "candidates", match: { status: "APPROVED" }, populate: { path: "user", select: "name" } });

    if (!election) return res.status(404).json({ error: "Election not found" });
    res.json({ success: true, election });
  } catch (e) { next(e); }
};

// POST /api/election — Admin creates election
exports.createElection = async (req, res, next) => {
  try {
    const {
      title,
      description,
      constituency,
      state,
      electionType,
      election_type,
      target_constituency,
      startTime,
      endTime,
    } = req.body;

    const startDate = new Date(startTime);
    const endDate = new Date(endTime);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return res.status(400).json({ error: "Invalid startTime or endTime." });
    }
    if (startDate <= new Date()) return res.status(400).json({ error: "Start time must be in the future" });
    if (endDate <= startDate) return res.status(400).json({ error: "End time must be after start time" });

    const electionClass = req.normalizedElectionClass || resolveElectionClassFromPayload(req.body);
    const normalizedElectionType = mapElectionClassToDbType(electionClass) || electionType;
    const strictLevel = mapElectionClassToStrictLevel(electionClass);

    const normalizedTitle = String(title || "").trim();
    const normalizedConstituency = String(constituency || "").trim();
    if (!normalizedTitle || !normalizedConstituency) {
      return res.status(400).json({ error: "title and constituency are required." });
    }

    let election_type_val = strictLevel || "";
    let target_constituency_val = null;
    if (target_constituency) {
      if (!target_constituency || !mongoose.isValidObjectId(target_constituency)) {
        return res.status(400).json({ error: "target_constituency must be a valid Constituency ObjectId" });
      }
      const cDoc = await Constituency.findById(target_constituency);
      if (!cDoc) return res.status(400).json({ error: "Constituency not found" });
      if (strictLevel && cDoc.level !== strictLevel) {
        return res.status(400).json({
          error: `Constituency level (${cDoc.level}) must match election type (${strictLevel})`,
        });
      }
      target_constituency_val = cDoc._id;
    }
    if (!target_constituency_val) {
      election_type_val = "";
    }

    const election = await Election.create({
      title: normalizedTitle,
      description,
      constituency: normalizedConstituency,
      state,
      electionType: normalizedElectionType,
      election_type: election_type_val,
      target_constituency: target_constituency_val,
      startTime: startDate,
      endTime: endDate,
      createdBy: req.user._id,
      bannerImage: req.file?.path || "",
    });

    // Create on blockchain too
    try {
      const onChainId = await blockchainService.createElection(
        normalizedTitle, description, normalizedConstituency,
        Math.floor(startDate.getTime() / 1000),
        Math.floor(endDate.getTime() / 1000)
      );
      if (onChainId !== null && onChainId !== undefined) {
        election.onChainElectionId = onChainId;
        await election.save();
      }
    } catch (bcErr) {
      console.warn("[Blockchain] Election creation failed (DB record still saved):", bcErr.message);
      // onChainElectionId unset rehega — sparse index ki wajah se null duplicate error nahi aayega
    }

    await AuditLog.create({ action: "ELECTION_CREATED", performedBy: req.user._id, targetElection: election._id, details: { title } });
    res.status(201).json({ success: true, election });
  } catch (e) { next(e); }
};

// PATCH /api/election/:id/status — Admin changes election status
exports.updateElectionStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const validStatuses = ["CREATED", "ACTIVE", "PAUSED", "CLOSED", "FINALIZED", "COMPLETED"];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: "Invalid status" });

    const election = await Election.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!election) return res.status(404).json({ error: "Election not found" });

    // Mirror on blockchain
    const statusMap = { CREATED: 0, ACTIVE: 1, PAUSED: 2, CLOSED: 3, FINALIZED: 4, COMPLETED: 4 };
    if (election.onChainElectionId) {
      try {
        await blockchainService.setElectionStatus(election.onChainElectionId, statusMap[status]);
      } catch (bcErr) {
        console.warn("[Blockchain] Status update failed:", bcErr.message);
      }
    }

    await AuditLog.create({ action: "ELECTION_STATUS_CHANGED", performedBy: req.user._id, targetElection: election._id, details: { status } });
    res.json({ success: true, election });
  } catch (e) { next(e); }
};

// GET /api/election/:id/results
exports.getResults = async (req, res, next) => {
  try {
    const election = await Election.findById(req.params.id);
    if (!election) return res.status(404).json({ error: "Election not found" });
    const adminViewer = req.user && ["admin", "superadmin"].includes(req.user.role);
    if (!election.resultsPublished && !adminViewer) {
      return res.status(403).json({ error: "Results not yet published" });
    }

    const candidates = await Candidate.find({ election: req.params.id, status: "APPROVED" })
      .sort({ voteCount: -1 });

    res.json({ success: true, election, candidates, totalVotes: election.totalVotes });
  } catch (e) { next(e); }
};

// POST /api/election/:id/results — Admin publishes results
exports.publishResults = async (req, res, next) => {
  try {
    const { candidateResults } = req.body;
    // candidateResults: [{ candidateId, voteCount }]

    if (!Array.isArray(candidateResults) || candidateResults.length === 0) {
      return res.status(400).json({ error: "candidateResults must be a non-empty array." });
    }

    const election = req.targetElection || await Election.findById(req.params.id);
    if (!election) return res.status(404).json({ error: "Election not found" });
    if (election.status !== "CLOSED") return res.status(400).json({ error: "Election must be CLOSED before publishing results" });

    const parsedResults = [];
    const candidateIds = [];
    for (const item of candidateResults) {
      const candidateId = String(item?.candidateId || "").trim();
      const voteCountNum = Number(item?.voteCount);
      if (!mongoose.isValidObjectId(candidateId)) {
        return res.status(400).json({ error: "candidateId is invalid." });
      }
      if (!Number.isInteger(voteCountNum) || voteCountNum < 0) {
        return res.status(400).json({ error: "voteCount must be a non-negative integer." });
      }
      parsedResults.push({ candidateId, voteCount: voteCountNum });
      candidateIds.push(candidateId);
    }

    const uniqueCandidateIds = [...new Set(candidateIds)];
    if (uniqueCandidateIds.length !== candidateIds.length) {
      return res.status(400).json({ error: "candidateResults contains duplicate candidateId entries." });
    }

    const candidatesInElection = await Candidate.find({
      _id: { $in: uniqueCandidateIds },
      election: election._id,
      status: "APPROVED",
    }).select("_id");

    if (candidatesInElection.length !== uniqueCandidateIds.length) {
      return res.status(400).json({
        error: "All candidateIds must belong to approved candidates in this election.",
      });
    }

    let totalVotes = 0;
    let winnerId = null;
    let maxVotes = -1;

    await Candidate.updateMany({ election: election._id }, { isWinner: false });

    for (const { candidateId, voteCount } of parsedResults) {
      await Candidate.findByIdAndUpdate(candidateId, {
        voteCount,
        votePercentage: 0, // calculated below
      }, { new: true });

      totalVotes += voteCount;
      if (voteCount > maxVotes) { maxVotes = voteCount; winnerId = candidateId; }
    }

    // Set percentages and winner
    for (const { candidateId, voteCount } of parsedResults) {
      await Candidate.findByIdAndUpdate(candidateId, {
        votePercentage: totalVotes > 0 ? ((voteCount / totalVotes) * 100).toFixed(2) : 0,
        isWinner: candidateId === winnerId?.toString(),
      });
    }

    await Election.findByIdAndUpdate(req.params.id, {
      status: "FINALIZED", resultsPublished: true, totalVotes, winnerId,
      publishedBy: req.user._id,
      publishedAt: new Date(),
    });

    await AuditLog.create({ action: "RESULTS_PUBLISHED", performedBy: req.user._id, targetElection: election._id, details: { totalVotes, winnerId } });
    res.json({ success: true, message: "Results published successfully", totalVotes, winnerId });
  } catch (e) { next(e); }
};

// POST /api/election/publish-result/:electionId
// Aggregates winner seats by party for LokSabha/ VidhanSabha.
exports.publishResult = async (req, res, next) => {
  try {
    const election = req.targetElection || await Election.findById(req.params.electionId);
    if (!election) return res.status(404).json({ error: "Election not found" });

    if (election.status === "Published" || election.status === "PUBLISHED" || election.resultsPublished) {
      return res.status(400).json({ error: "Results already published for this election." });
    }

    const match = {
      election: election._id,
      isWinner: true,
      $or: [
        { verificationStatus: "Verified" },
        { status: "APPROVED" },
      ],
    };

    const electionClass = req.normalizedElectionClass || resolveElectionClassFromDoc(election);

    if (electionClass === "LOK_SABHA") {
      match.candidateRole = "MP";
    } else if (electionClass === "VIDHAN_SABHA") {
      match.candidateRole = "MLA";
      match.state = election.state;
    } else {
      return res.status(400).json({ error: "Unsupported election type for hierarchical aggregation." });
    }

    const results = await Candidate.aggregate([
      { $match: match },
      { $group: { _id: "$partyName", totalSeats: { $sum: 1 } } },
      { $project: { _id: 0, party: "$_id", totalSeats: 1 } },
      { $sort: { totalSeats: -1, party: 1 } },
    ]);

    election.status = "Published";
    election.resultsPublished = true;
    election.publishedBy = req.user._id;
    election.publishedAt = new Date();
    await election.save();

    return res.json({
      success: true,
      electionId: election._id,
      electionType: election.electionType || electionClass,
      state: election.state || null,
      results,
      winningParty: results[0] || null,
    });
  } catch (error) {
    next(error);
  }
};