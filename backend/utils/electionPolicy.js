const LOK_SABHA_VALUES = new Set([
  "GENERAL",
  "LOKSABHA",
  "LOK_SABHA",
  "LOK SABHA",
  "LokSabha",
  "Lok Sabha",
]);

const VIDHAN_SABHA_VALUES = new Set([
  "STATE_ASSEMBLY",
  "VIDHANSABHA",
  "VIDHAN_SABHA",
  "VIDHAN SABHA",
  "VidhanSabha",
  "Vidhan Sabha",
]);

const BY_ELECTION_VALUES = new Set([
  "BY_ELECTION",
  "BYELECTION",
  "BY ELECTION",
  "ByElection",
  "BY-ELECTION",
]);

function normalizeElectionClass(input) {
  const raw = String(input || "").trim();
  if (!raw) return "";

  if (LOK_SABHA_VALUES.has(raw) || LOK_SABHA_VALUES.has(raw.toUpperCase())) {
    return "LOK_SABHA";
  }
  if (VIDHAN_SABHA_VALUES.has(raw) || VIDHAN_SABHA_VALUES.has(raw.toUpperCase())) {
    return "VIDHAN_SABHA";
  }
  if (BY_ELECTION_VALUES.has(raw) || BY_ELECTION_VALUES.has(raw.toUpperCase())) {
    return "BY_ELECTION";
  }
  return "";
}

function resolveElectionClassFromPayload(body = {}) {
  return (
    normalizeElectionClass(body.electionType) ||
    normalizeElectionClass(body.election_type) ||
    ""
  );
}

function resolveElectionClassFromDoc(election = {}) {
  return (
    normalizeElectionClass(election.electionType) ||
    normalizeElectionClass(election.election_type) ||
    ""
  );
}

function isSpecificSeatInput(body = {}) {
  const constituency = String(body.constituency || "").trim().toUpperCase();
  const targetConstituency = String(body.target_constituency || "").trim();
  if (targetConstituency) return true;
  return !!constituency && constituency !== "NATIONAL";
}

module.exports = {
  resolveElectionClassFromPayload,
  resolveElectionClassFromDoc,
  isSpecificSeatInput,
};