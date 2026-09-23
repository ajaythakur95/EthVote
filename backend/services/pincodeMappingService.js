const PincodeMapping = require("../models/PincodeMapping");

function normalizePincode(raw) {
  if (raw == null || raw === "") return "";
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length >= 6) return digits.slice(-6);
  return digits.padStart(6, "0");
}

/**
 * @param {string} pincode
 * @returns {Promise<{ vidhanSabhaAC: string, lokSabhaPC: string, state: string } | null>}
 */
async function resolveByPincode(pincode) {
  const pc = normalizePincode(pincode);
  if (!/^\d{6}$/.test(pc)) return null;

  const doc = await PincodeMapping.findOne({ pincode: pc });
  if (!doc) return null;

  return {
    vidhanSabhaAC: doc.vidhanSabhaAC,
    lokSabhaPC: doc.lokSabhaPC,
    state: doc.state || "",
  };
}

module.exports = {
  normalizePincode,
  resolveByPincode,
};
