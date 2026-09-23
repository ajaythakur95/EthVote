const Candidate = require("../models/Candidate");
const Election = require("../models/Election");
const { normalizeDistrict } = require("../constants/districts");
const {
  getAdminHierarchyRole,
  getAssignedState,
  getAssignedDistrict,
  equalsCI,
} = require("../utils/adminHierarchy");
const {
  resolveElectionClassFromPayload,
  resolveElectionClassFromDoc,
  isSpecificSeatInput,
} = require("../utils/electionPolicy");

const CANDIDACY_TYPES = {
  NORMAL: "NORMAL_CANDIDATE",
  PRIME_MINISTER: "PRIME_MINISTER_CANDIDATE",
  CHIEF_MINISTER: "CHIEF_MINISTER_CANDIDATE",
};

function resolveCandidateCandidacyType(candidate) {
  const role = String(candidate?.candidateRole || "").trim().toUpperCase();
  if (role === "PM") return CANDIDACY_TYPES.PRIME_MINISTER;
  if (role === "CM") return CANDIDACY_TYPES.CHIEF_MINISTER;

  const rawType = String(candidate?.candidacyType || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");

  if (rawType === CANDIDACY_TYPES.PRIME_MINISTER) {
    return CANDIDACY_TYPES.PRIME_MINISTER;
  }
  if (rawType === CANDIDACY_TYPES.CHIEF_MINISTER) {
    return CANDIDACY_TYPES.CHIEF_MINISTER;
  }
  if (rawType === CANDIDACY_TYPES.NORMAL) {
    return CANDIDACY_TYPES.NORMAL;
  }
  return CANDIDACY_TYPES.NORMAL;
}

function resolveAdminScope(user) {
  return {
    hierarchyRole: getAdminHierarchyRole(user),
    assignedState: getAssignedState(user),
    assignedDistrict: getAssignedDistrict(user),
  };
}

function readElectionIdFromRequest(req) {
  return req.params.electionId || req.params.id || "";
}

function isStateElectionType(electionClass) {
  return electionClass === "VIDHAN_SABHA" || electionClass === "BY_ELECTION";
}

exports.requireVoterVerificationAccess = (req, res, next) => {
  const scope = resolveAdminScope(req.user);
  if (scope.hierarchyRole !== "District") {
    return res.status(403).json({
      error: "Only District Admin can verify voters.",
    });
  }

  const adminDistrict = normalizeDistrict(scope.assignedDistrict || "");
  if (!adminDistrict) {
    return res.status(403).json({
      error: "District Admin assignment missing. Contact State Admin.",
    });
  }

  const targetDistrict = normalizeDistrict(
    req.body.district || req.query.district || req.params.district || ""
  );
  if (targetDistrict && targetDistrict !== adminDistrict) {
    return res.status(403).json({
      error: "You can verify voters only in your assigned district.",
    });
  }

  req.adminScope = scope;
  req.adminDistrict = scope.assignedDistrict;
  next();
};

exports.requireCandidateVerificationAccess = async (req, res, next) => {
  try {
    const { candidateId } = req.params;
    const candidate = await Candidate.findById(candidateId);
    if (!candidate) return res.status(404).json({ error: "Candidate not found" });

    const scope = resolveAdminScope(req.user);
    const candidacyType = resolveCandidateCandidacyType(candidate);
    const candidateRole = candidate.candidateRole;
    const candidateState = String(candidate.state || "").trim();
    const candidateDistrict = String(candidate.district || "").trim();
    const normalizedAdminDistrict = normalizeDistrict(scope.assignedDistrict);
    const normalizedCandidateDistrict = normalizeDistrict(candidateDistrict);

    const allowed =
      // PM approvals are reserved only for Super Admin.
      (candidacyType === CANDIDACY_TYPES.PRIME_MINISTER &&
        req.user.role === "superadmin") ||
      (candidacyType === CANDIDACY_TYPES.CHIEF_MINISTER &&
        scope.hierarchyRole === "State" &&
        !!scope.assignedState &&
        equalsCI(scope.assignedState, candidateState)) ||
      (candidacyType === CANDIDACY_TYPES.NORMAL &&
        scope.hierarchyRole === "District" &&
        ["MP", "MLA"].includes(String(candidateRole || "").toUpperCase()) &&
        !!scope.assignedDistrict &&
        normalizedAdminDistrict === normalizedCandidateDistrict);

    if (!allowed) {
      return res.status(403).json({
        error: "Forbidden: candidate verification outside your role/jurisdiction.",
      });
    }

    req.targetCandidate = candidate;
    req.adminScope = scope;
    next();
  } catch (error) {
    next(error);
  }
};

exports.requireElectionCreationAccess = (req, res, next) => {
  const scope = resolveAdminScope(req.user);
  const electionClass = resolveElectionClassFromPayload(req.body);

  if (!electionClass) {
    return res.status(400).json({
      error:
        "Unsupported election type. Allowed: Lok Sabha (National), Vidhan Sabha / By-Election (State).",
    });
  }

  if (scope.hierarchyRole === "National") {
    if (electionClass !== "LOK_SABHA") {
      return res.status(403).json({
        error: "National Admin can create only Lok Sabha elections.",
      });
    }
    req.adminScope = scope;
    req.normalizedElectionClass = electionClass;
    return next();
  }

  if (scope.hierarchyRole === "State") {
    if (!isStateElectionType(electionClass)) {
      return res.status(403).json({
        error: "State Admin can create only Vidhan Sabha or By-Election.",
      });
    }

    if (!scope.assignedState) {
      return res.status(403).json({
        error: "State Admin assignment missing.",
      });
    }

    const requestedState = String(req.body.state || "").trim();
    if (requestedState && !equalsCI(requestedState, scope.assignedState)) {
      return res.status(403).json({
        error: "State Admin can create elections only for their assigned state.",
      });
    }

    req.body.state = scope.assignedState;

    if (electionClass === "BY_ELECTION" && !isSpecificSeatInput(req.body)) {
      return res.status(400).json({
        error: "By-Election must target a specific seat (constituency/target_constituency).",
      });
    }

    req.adminScope = scope;
    req.normalizedElectionClass = electionClass;
    return next();
  }

  return res.status(403).json({
    error: "District Admin cannot create elections.",
  });
};

function canPublishResults(scope, electionClass, electionState) {
  if (scope.hierarchyRole === "National") {
    return electionClass === "LOK_SABHA";
  }
  if (scope.hierarchyRole === "State") {
    return (
      electionClass === "VIDHAN_SABHA" &&
      !!scope.assignedState &&
      equalsCI(scope.assignedState, electionState)
    );
  }
  return false;
}

function canManageElectionLifecycle(scope, electionClass, electionState) {
  if (scope.hierarchyRole === "National") {
    return electionClass === "LOK_SABHA";
  }
  if (scope.hierarchyRole === "State") {
    return (
      isStateElectionType(electionClass) &&
      !!scope.assignedState &&
      equalsCI(scope.assignedState, electionState)
    );
  }
  return false;
}

exports.requireElectionStatusAccess = async (req, res, next) => {
  try {
    const electionId = readElectionIdFromRequest(req);
    const election = await Election.findById(electionId);
    if (!election) return res.status(404).json({ error: "Election not found" });

    const scope = resolveAdminScope(req.user);
    const electionClass = resolveElectionClassFromDoc(election);
    const electionState = String(election.state || "").trim();

    if (!canManageElectionLifecycle(scope, electionClass, electionState)) {
      return res.status(403).json({
        error: "Forbidden: you cannot manage status for this election.",
      });
    }

    req.targetElection = election;
    req.adminScope = scope;
    req.normalizedElectionClass = electionClass;
    next();
  } catch (error) {
    next(error);
  }
};

exports.requireElectionPublishAccess = async (req, res, next) => {
  try {
    const electionId = readElectionIdFromRequest(req);
    const election = await Election.findById(electionId);
    if (!election) return res.status(404).json({ error: "Election not found" });

    const scope = resolveAdminScope(req.user);
    const electionClass = resolveElectionClassFromDoc(election);
    const electionState = String(election.state || "").trim();

    if (!canPublishResults(scope, electionClass, electionState)) {
      return res.status(403).json({
        error:
          "Forbidden: only National (Lok Sabha) or State (Vidhan Sabha in assigned state) can publish results.",
      });
    }

    req.targetElection = election;
    req.adminScope = scope;
    req.normalizedElectionClass = electionClass;
    next();
  } catch (error) {
    next(error);
  }
};