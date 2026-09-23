

const { resolveElectionClassFromDoc } = require("./electionPolicy");

function idEquals(a, b) {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

function equalsCI(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

/**
 * @param {import("mongoose").Document | object} election
 */
function usesStrictJurisdiction(election) {
  const et = election.election_type;
  const target = election.target_constituency;
  if (!target) return false;
  return et === "Vidhan Sabha" || et === "Lok Sabha";
}

/**
 * @param {import("mongoose").Document | object} user — voter document
 * @param {import("mongoose").Document | object} election
 * @returns {boolean}
 */
function isVoterEligibleForElection(user, election) {
  if (!user || user.role !== "voter") return false;

  if (usesStrictJurisdiction(election)) {
    if (election.election_type === "Vidhan Sabha") {
      return idEquals(user.assigned_vidhan_sabha, election.target_constituency);
    }
    if (election.election_type === "Lok Sabha") {
      return idEquals(user.assigned_lok_sabha, election.target_constituency);
    }
    return false;
  }

  const electionClass = resolveElectionClassFromDoc(election);
  const c = String(election.constituency || "").trim().toUpperCase();

  if (electionClass === "VIDHAN_SABHA" && c === "NATIONAL") {
    return !!user.state && !!election.state && equalsCI(user.state, election.state);
  }

  if (c === "NATIONAL") return true;
  if (!user.constituency) return false;
  return equalsCI(user.constituency, election.constituency);
}

/**
 * @param {import("mongoose").Document | object} user
 * @param {import("mongoose").Document | object} election
 * @returns {{ eligible: boolean, code?: string, message?: string }}
 */
function assertVoterEligibleForElection(user, election) {
  if (!user || user.role !== "voter") {
    return { eligible: false, code: "NOT_VOTER", message: "Only voters may access this election." };
  }
  if (user.verificationStatus !== "APPROVED") {
    return { eligible: false, code: "NOT_VERIFIED", message: "Voter is not approved." };
  }

  if (usesStrictJurisdiction(election)) {
    const ok = isVoterEligibleForElection(user, election);
    if (!ok) {
      return {
        eligible: false,
        code: "JURISDICTION_MISMATCH",
        message:
          election.election_type === "Vidhan Sabha"
            ? "You are not registered in this Vidhan Sabha constituency."
            : "You are not registered in this Lok Sabha constituency.",
      };
    }
    return { eligible: true };
  }

  const ok = isVoterEligibleForElection(user, election);
  if (!ok) {
    const electionClass = resolveElectionClassFromDoc(election);
    const c = String(election.constituency || "").trim().toUpperCase();
    if (electionClass === "VIDHAN_SABHA" && c === "NATIONAL" && election.state) {
      return {
        eligible: false,
        code: "STATE_MISMATCH",
        message: `This election is for ${election.state} state only.`,
      };
    }

    return {
      eligible: false,
      code: "CONSTITUENCY_MISMATCH",
      message: `This election is for ${election.constituency} only.`,
    };
  }
  return { eligible: true };
}

module.exports = {
  usesStrictJurisdiction,
  isVoterEligibleForElection,
  assertVoterEligibleForElection,
};