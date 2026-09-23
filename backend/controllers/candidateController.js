const Candidate = require("../models/Candidate");
const Election = require("../models/Election");
const User = require("../models/User");
const { assertVoterEligibleForElection } = require("../utils/jurisdictionEligibility");
const { resolveElectionClassFromDoc } = require("../utils/electionPolicy");
const {
  getAdminHierarchyRole,
  getAssignedState,
  getAssignedDistrict,
} = require("../utils/adminHierarchy");

const CANDIDACY_TYPES = {
  NORMAL: "NORMAL_CANDIDATE",
  PRIME_MINISTER: "PRIME_MINISTER_CANDIDATE",
  CHIEF_MINISTER: "CHIEF_MINISTER_CANDIDATE",
};

const CANDIDACY_TYPE_LABELS = {
  [CANDIDACY_TYPES.NORMAL]: "Normal Candidate",
  [CANDIDACY_TYPES.PRIME_MINISTER]: "Prime Minister Candidate",
  [CANDIDACY_TYPES.CHIEF_MINISTER]: "Chief Minister Candidate",
};

function parseCandidacyType(input) {
  if (Array.isArray(input)) return null;

  const normalized = String(input || CANDIDACY_TYPES.NORMAL)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");

  if (["NORMAL", "NORMAL_CANDIDATE"].includes(normalized)) {
    return CANDIDACY_TYPES.NORMAL;
  }
  if (
    ["PRIME_MINISTER", "PRIME_MINISTER_CANDIDATE", "PM_CANDIDATE"].includes(
      normalized
    )
  ) {
    return CANDIDACY_TYPES.PRIME_MINISTER;
  }
  if (
    ["CHIEF_MINISTER", "CHIEF_MINISTER_CANDIDATE", "CM_CANDIDATE"].includes(
      normalized
    )
  ) {
    return CANDIDACY_TYPES.CHIEF_MINISTER;
  }
  return null;
}

function inferCandidacyTypeFromCandidate(candidate) {
  const role = String(candidate?.candidateRole || "").trim().toUpperCase();
  if (role === "PM") return CANDIDACY_TYPES.PRIME_MINISTER;
  if (role === "CM") return CANDIDACY_TYPES.CHIEF_MINISTER;

  const parsed = parseCandidacyType(candidate?.candidacyType);
  return parsed || CANDIDACY_TYPES.NORMAL;
}

function resolveNormalCandidateRole(election) {
  const electionClass = resolveElectionClassFromDoc(election);
  if (electionClass === "LOK_SABHA") return "MP";
  if (["VIDHAN_SABHA", "BY_ELECTION"].includes(electionClass)) return "MLA";
  return "MP";
}

function resolveCandidateRole(candidacyType, election) {
  if (candidacyType === CANDIDACY_TYPES.PRIME_MINISTER) return "PM";
  if (candidacyType === CANDIDACY_TYPES.CHIEF_MINISTER) return "CM";
  return resolveNormalCandidateRole(election);
}

function buildPendingCandidatesFilterForUser(user) {
  const hierarchyRole = getAdminHierarchyRole(user);
  const filter = { status: "PENDING" };

  // PM applications are routed only to Super Admin.
  if (user?.role === "superadmin") {
    filter.$or = [
      { candidacyType: CANDIDACY_TYPES.PRIME_MINISTER },
      { candidacyType: { $exists: false }, candidateRole: "PM" },
    ];
    return filter;
  }

  if (hierarchyRole === "National") {
    // National admins (non-superadmin) are not approval owners for candidacy queues.
    return { _id: null };
  }

  if (hierarchyRole === "State") {
    const assignedState = String(getAssignedState(user) || "").trim();
    if (!assignedState) {
      return { _id: null };
    }
    filter.state = assignedState;
    filter.$or = [
      { candidacyType: CANDIDACY_TYPES.CHIEF_MINISTER },
      { candidacyType: { $exists: false }, candidateRole: "CM" },
    ];
    return filter;
  }

  if (hierarchyRole === "District") {
    const adminConstituency = String(user?.adminConstituency || "").trim();
    const assignedDistrict = String(getAssignedDistrict(user) || "").trim();

    if (adminConstituency) {
      filter.constituency = adminConstituency;
    } else if (assignedDistrict) {
      filter.district = assignedDistrict;
    }

    // District scope: only normal applications.
    filter.$or = [
      { candidacyType: CANDIDACY_TYPES.NORMAL },
      {
        candidacyType: { $exists: false },
        candidateRole: { $in: ["MP", "MLA"] },
      },
    ];
    return filter;
  }

  return { _id: null };
}

// GET /api/candidate/election/:electionId
exports.getCandidates = async (req, res, next) => {
  try {
    const election = await Election.findById(req.params.electionId);
    if (!election) {
      return res.status(404).json({ error: "Election nahi mili" });
    }

    if (req.user.role === "voter") {
      const voter = await User.findById(req.user._id);
      const { eligible, message, code } = assertVoterEligibleForElection(
        voter,
        election
      );
      if (!eligible) {
        return res.status(403).json({ error: message, code });
      }
    }

    const candidates = await Candidate.find({ election: req.params.electionId }).sort({
      voteCount: -1,
    });

    res.json({ success: true, count: candidates.length, candidates });
  } catch (error) {
    next(error);
  }
};

// POST /api/candidate/register
exports.registerCandidate = async (req, res, next) => {
  try {
    const { electionId, partyName, manifesto, manifestoText, candidacyType } =
      req.body;
    const voter = req.user;

    if (voter.verificationStatus !== "APPROVED") {
      return res.status(403).json({
        error: "Sirf verified voters candidate ban sakte hain",
      });
    }

    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({ error: "Election nahi mili" });
    }

    const parsedCandidacyType = parseCandidacyType(candidacyType);
    if (!parsedCandidacyType) {
      return res.status(400).json({
        error:
          "Invalid candidacyType. Allowed: NORMAL_CANDIDATE, PRIME_MINISTER_CANDIDATE, CHIEF_MINISTER_CANDIDATE",
      });
    }

    const { eligible, message, code } = assertVoterEligibleForElection(
      voter,
      election
    );
    if (!eligible) {
      return res.status(403).json({ error: message, code });
    }

    if (!["CREATED", "ACTIVE"].includes(election.status)) {
      return res.status(400).json({
        error: "Is election mein ab candidate registration band hai",
      });
    }

    const existing = await Candidate.findOne({
      election: electionId,
      user: voter._id,
    });
    if (existing) {
      return res.status(400).json({
        error: "Aap pehle se is election mein candidate hain",
      });
    }

    const pendingApplication = await Candidate.findOne({
      user: voter._id,
      status: "PENDING",
      election: { $ne: electionId },
    }).select("candidacyType candidateRole");

    if (pendingApplication) {
      const pendingType = inferCandidacyTypeFromCandidate(pendingApplication);
      if (pendingType !== parsedCandidacyType) {
        return res.status(400).json({
          error: `Aap ek waqt mein sirf ek candidacy role ke liye apply kar sakte hain. Aapki existing pending application '${CANDIDACY_TYPE_LABELS[pendingType]}' role mein hai.`,
        });
      }
    }

    const candidateRole = resolveCandidateRole(parsedCandidacyType, election);
    if (parsedCandidacyType === CANDIDACY_TYPES.CHIEF_MINISTER && !voter.state) {
      return res.status(400).json({
        error: "Chief Minister candidacy ke liye voter profile me state hona zaroori hai.",
      });
    }
    if (["MP", "MLA"].includes(candidateRole) && !voter.district) {
      return res.status(400).json({
        error: "Normal candidacy ke liye voter profile me district hona zaroori hai.",
      });
    }

    const files = req.files || {};
    const candidate = await Candidate.create({
      election: electionId,
      user: voter._id,
      name: voter.name,
      constituency: voter.constituency || voter.district || "",
      partyName,
      candidateRole,
      candidacyType: parsedCandidacyType,
      state: voter.state || "",
      district: voter.district || "",
      manifesto:
        files.manifesto?.[0]?.path || manifesto || manifestoText || "",
      partySymbol: files.partySymbol?.[0]?.path,
      photo: files.photo?.[0]?.path,
      status: "PENDING",
    });

    const routingMessage =
      parsedCandidacyType === CANDIDACY_TYPES.PRIME_MINISTER
        ? "Application Super Admin dashboard par review ke liye bhej di gayi hai."
        : parsedCandidacyType === CANDIDACY_TYPES.CHIEF_MINISTER
        ? "Application State Admin dashboard par review ke liye bhej di gayi hai."
        : "Application jurisdiction-based admin review ke liye bhej di gayi hai.";

    res.status(201).json({
      success: true,
      message: `Candidate registration submit ho gayi. ${routingMessage}`,
      candidate,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/candidate/pending
exports.getPendingCandidates = async (req, res, next) => {
  try {
    const filter = buildPendingCandidatesFilterForUser(req.user);
    const hierarchyRole = getAdminHierarchyRole(req.user);

    if (hierarchyRole === "State") {
      const assignedState = String(getAssignedState(req.user) || "").trim();
      if (!assignedState) {
        return res
          .status(403)
          .json({ error: "State Admin assignment missing. Contact National Admin." });
      }
    }

    const candidates = await Candidate.find(filter)
      .populate("user", "name constituency district state")
      .populate("election", "title constituency state electionType")
      .sort({ createdAt: 1 });

    res.json({ success: true, count: candidates.length, candidates });
  } catch (error) {
    next(error);
  }
};

// POST /api/candidate/:id/approve
exports.approveCandidate = async (req, res, next) => {
  try {
    const candidate = await Candidate.findById(req.params.id);
    if (!candidate) {
      return res.status(404).json({ error: "Candidate nahi mila" });
    }

    if (candidate.status !== "PENDING") {
      return res
        .status(400)
        .json({ error: "Candidate PENDING status mein nahi hai" });
    }

    candidate.status = "APPROVED";
    candidate.reviewedBy = req.user._id;
    candidate.reviewedAt = new Date();
    await candidate.save();

    await User.findByIdAndUpdate(candidate.user, { role: "candidate" });

    res.json({
      success: true,
      message: `Candidate '${candidate.name}' approve ho gaya`,
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/candidate/:id/reject
exports.rejectCandidate = async (req, res, next) => {
  try {
    const { reason } = req.body;
    if (!reason) {
      return res.status(400).json({ error: "Rejection reason required hai" });
    }

    const candidate = await Candidate.findById(req.params.id);
    if (!candidate) {
      return res.status(404).json({ error: "Candidate nahi mila" });
    }

    candidate.status = "REJECTED";
    candidate.rejectionReason = reason;
    candidate.reviewedBy = req.user._id;
    candidate.reviewedAt = new Date();
    await candidate.save();

    res.json({
      success: true,
      message: `Candidate '${candidate.name}' reject ho gaya`,
    });
  } catch (error) {
    next(error);
  }
};