const mongoose = require("mongoose");
const Vote = require("../models/Vote");
const Election = require("../models/Election");
const { resolveElectionClassFromDoc } = require("../utils/electionPolicy");

const COMPLETED_STATUSES = new Set(["COMPLETED", "FINALIZED", "PUBLISHED"]);

function buildHttpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function normalizeStatus(status) {
  return String(status || "").trim().toUpperCase();
}

function isElectionCompletedStatus(status) {
  return COMPLETED_STATUSES.has(normalizeStatus(status));
}

function toObjectId(value, fieldName) {
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (!mongoose.isValidObjectId(value)) {
    throw buildHttpError(400, `${fieldName} is invalid`);
  }
  return new mongoose.Types.ObjectId(value);
}

function sortCandidatesByVotes(a, b) {
  if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
  return String(a.candidateName || "").localeCompare(String(b.candidateName || ""));
}

function sortPartyTally(a, b) {
  if (b.seatsWon !== a.seatsWon) return b.seatsWon - a.seatsWon;
  return String(a.partyName || "").localeCompare(String(b.partyName || ""));
}

function buildPartySeatTallyFromConstituencyResults(constituencyResults = []) {
  const seatCounter = new Map();

  for (const seat of constituencyResults) {
    if (!seat?.winner) continue;
    const partyName = String(
      seat.winner.party?.name ||
      seat.winner.partyName ||
      "Independent"
    ).trim() || "Independent";

    seatCounter.set(partyName, (seatCounter.get(partyName) || 0) + 1);
  }

  return Array.from(seatCounter.entries())
    .map(([partyName, seatsWon]) => ({ partyName, seatsWon }))
    .sort(sortPartyTally);
}

function collapseConstituencyWinners(candidateRows = []) {
  const seatMap = new Map();

  for (const row of candidateRows) {
    const constituencyKey =
      row.constituencyId?.toString() ||
      String(row.constituencyName || "UNSPECIFIED").toLowerCase();

    if (!seatMap.has(constituencyKey)) {
      seatMap.set(constituencyKey, {
        constituency: {
          _id: row.constituencyId || null,
          name: row.constituencyName || "Unknown Constituency",
          level: row.constituencyLevel || "",
          state: row.constituencyState || "",
        },
        candidates: [],
        winner: null,
      });
    }

    const seat = seatMap.get(constituencyKey);
    seat.candidates.push({
      candidateId: row.candidateId,
      candidateName: row.candidateName,
      voteCount: row.voteCount,
      partyName: row.partyName || "Independent",
      partySymbol: row.partySymbol || "",
      party: {
        _id: row.partyId || null,
        name: row.partyName || "Independent",
        symbol: row.partySymbol || "",
      },
    });
  }

  const constituencyResults = Array.from(seatMap.values()).map((seat) => {
    seat.candidates.sort(sortCandidatesByVotes);
    seat.winner = seat.candidates[0] || null;
    return {
      ...seat,
      totalVotesInSeat: seat.candidates.reduce((sum, c) => sum + (c.voteCount || 0), 0),
    };
  });

  constituencyResults.sort((a, b) =>
    String(a?.constituency?.name || "").localeCompare(String(b?.constituency?.name || ""))
  );

  return constituencyResults;
}

async function calculateElectionResults(electionId) {
  const normalizedElectionId = toObjectId(electionId, "electionId");

  const election = await Election.findById(normalizedElectionId)
    .populate("target_constituency", "name level state");

  if (!election) {
    throw buildHttpError(404, "Election not found");
  }

  if (!isElectionCompletedStatus(election.status)) {
    throw buildHttpError(
      403,
      "Results can be accessed only when election status is marked as Completed"
    );
  }

  const voteAggregation = await Vote.aggregate([
    {
      $match: {
        election: election._id,
        candidateId: { $exists: true, $ne: null },
      },
    },
    {
      $group: {
        _id: "$candidateId",
        voteCount: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: "candidates",
        localField: "_id",
        foreignField: "_id",
        as: "candidate",
      },
    },
    { $unwind: "$candidate" },
    {
      $match: {
        "candidate.election": election._id,
      },
    },
    {
      $lookup: {
        from: "parties",
        let: {
          candidatePartyId: "$candidate.partyId",
          candidatePartyName: "$candidate.partyName",
        },
        pipeline: [
          {
            $match: {
              $expr: {
                $or: [
                  {
                    $and: [
                      { $ne: ["$$candidatePartyId", null] },
                      { $eq: ["$_id", "$$candidatePartyId"] },
                    ],
                  },
                  {
                    $and: [
                      { $ne: [{ $ifNull: ["$$candidatePartyName", ""] }, ""] },
                      {
                        $eq: [
                          { $toLower: "$name" },
                          { $toLower: { $ifNull: ["$$candidatePartyName", ""] } },
                        ],
                      },
                    ],
                  },
                ],
              },
            },
          },
          {
            $project: {
              _id: 1,
              name: 1,
              symbol: { $ifNull: ["$symbol", "$logo"] },
            },
          },
          { $limit: 1 },
        ],
        as: "partyDoc",
      },
    },
    {
      $lookup: {
        from: "constituencies",
        let: { constituencyName: "$candidate.constituency" },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: [
                  { $toLower: "$name" },
                  { $toLower: { $ifNull: ["$$constituencyName", ""] } },
                ],
              },
            },
          },
          { $project: { _id: 1, name: 1, level: 1, state: 1 } },
          { $limit: 1 },
        ],
        as: "constituencyDoc",
      },
    },
    {
      $addFields: {
        partyDoc: { $first: "$partyDoc" },
        constituencyDoc: { $first: "$constituencyDoc" },
      },
    },
    {
      $project: {
        _id: 0,
        candidateId: "$candidate._id",
        candidateName: "$candidate.name",
        voteCount: 1,
        partyId: "$partyDoc._id",
        partyName: {
          $ifNull: ["$partyDoc.name", { $ifNull: ["$candidate.partyName", "Independent"] }],
        },
        partySymbol: {
          $ifNull: ["$partyDoc.symbol", { $ifNull: ["$candidate.partySymbol", ""] }],
        },
        constituencyId: "$constituencyDoc._id",
        constituencyName: {
          $ifNull: ["$constituencyDoc.name", { $ifNull: ["$candidate.constituency", election.constituency] }],
        },
        constituencyLevel: { $ifNull: ["$constituencyDoc.level", election.election_type || ""] },
        constituencyState: { $ifNull: ["$constituencyDoc.state", election.state || ""] },
      },
    },
    {
      $sort: {
        constituencyName: 1,
        voteCount: -1,
        candidateName: 1,
      },
    },
  ]);

  const totalRawVotes = await Vote.countDocuments({ election: election._id });
  if (totalRawVotes > 0 && voteAggregation.length === 0) {
    throw buildHttpError(
      422,
      "Votes exist for this election but candidateId is missing. Store candidateId in Vote to compute announced results."
    );
  }

  const constituencyResults = collapseConstituencyWinners(voteAggregation);
  const partySeatTally = buildPartySeatTallyFromConstituencyResults(constituencyResults);
  const totalVotesCounted = voteAggregation.reduce((sum, row) => sum + (row.voteCount || 0), 0);

  return {
    election: {
      _id: election._id,
      title: election.title,
      electionType: election.electionType,
      election_type: election.election_type,
      electionClass: resolveElectionClassFromDoc(election),
      state: election.state || "",
      status: election.status,
      constituency: election.constituency,
      targetConstituency: election.target_constituency
        ? {
            _id: election.target_constituency._id,
            name: election.target_constituency.name,
            level: election.target_constituency.level,
            state: election.target_constituency.state,
          }
        : null,
    },
    totalRawVotes,
    totalVotesCounted,
    constituencyResults,
    partySeatTally,
    candidateTallies: voteAggregation,
  };
}

module.exports = {
  calculateElectionResults,
  isElectionCompletedStatus,
  buildPartySeatTallyFromConstituencyResults,
};
