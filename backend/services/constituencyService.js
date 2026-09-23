const Constituency = require("../models/Constituency");

/**
 * @param {{ name: string, level: "Vidhan Sabha" | "Lok Sabha", state?: string }} opts
 * @returns {Promise<import("mongoose").Types.ObjectId | null>}
 */
async function findOrCreateConstituencyId(opts) {
  const n = String(opts.name || "").trim();
  if (!n) return null;
  const state = String(opts.state || "").trim();
  let doc = await Constituency.findOne({ name: n, level: opts.level });
  if (!doc) {
    doc = await Constituency.create({ name: n, level: opts.level, state });
  }
  return doc._id;
}

/**
 * From pincode mapping strings → ObjectIds on the voter profile.
 * @returns {Promise<{ assigned_vidhan_sabha: import("mongoose").Types.ObjectId | null, assigned_lok_sabha: import("mongoose").Types.ObjectId | null }>}
 */
async function resolveAssignedFromPincodeMapping({ vidhanSabhaAC, lokSabhaPC, state }) {
  const [v, l] = await Promise.all([
    findOrCreateConstituencyId({
      name: vidhanSabhaAC,
      level: "Vidhan Sabha",
      state,
    }),
    findOrCreateConstituencyId({
      name: lokSabhaPC,
      level: "Lok Sabha",
      state,
    }),
  ]);
  return { assigned_vidhan_sabha: v, assigned_lok_sabha: l };
}

/**
 * Path A: at least assembly (string constituency) → one Vidhan Sabha row.
 */
async function resolveVidhanOnlyFromConstituencyName(constituencyName, state) {
  const id = await findOrCreateConstituencyId({
    name: constituencyName,
    level: "Vidhan Sabha",
    state,
  });
  return { assigned_vidhan_sabha: id, assigned_lok_sabha: null };
}

module.exports = {
  findOrCreateConstituencyId,
  resolveAssignedFromPincodeMapping,
  resolveVidhanOnlyFromConstituencyName,
};
