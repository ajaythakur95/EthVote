const crypto = require("crypto");

function generateEpicNumber() {
  const randomSevenDigits = crypto.randomInt(1000000, 10000000);
  return `ETH${randomSevenDigits}`;
}

async function generateUniqueEpicNumber(UserModel, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i += 1) {
    const epic = generateEpicNumber();
    const exists = await UserModel.exists({ epicNumber: epic });
    if (!exists) return epic;
  }
  throw new Error("Unable to generate unique EPIC number. Please try again.");
}

function maskEpicNumber(epic) {
  if (!epic || typeof epic !== "string") return "";
  if (epic.length <= 6) return `${epic.slice(0, 3)}***`;
  return `${epic.slice(0, 3)}****${epic.slice(-3)}`;
}

function withMaskedEpic(user) {
  if (!user) return user;
  const plain = user.toObject ? user.toObject() : { ...user };
  plain.epicNumber = maskEpicNumber(plain.epicNumber);
  if (plain.virtualVoterId) plain.virtualVoterId = maskEpicNumber(plain.virtualVoterId);
  return plain;
}

/** Virtual Voter ID: ETH-YYYY-XXXXX (5 base-36 chars) */
function generateVirtualVoterId(year) {
  const y = Number(year) || new Date().getFullYear();
  let suffix = "";
  for (let i = 0; i < 5; i += 1) {
    suffix += "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"[crypto.randomInt(0, 36)];
  }
  return `ETH-${y}-${suffix}`;
}

async function generateUniqueVirtualVoterId(UserModel, year, maxAttempts = 40) {
  const y = Number(year) || new Date().getFullYear();
  for (let i = 0; i < maxAttempts; i += 1) {
    const id = generateVirtualVoterId(y);
    const exists = await UserModel.exists({
      $or: [{ virtualVoterId: id }, { epicNumber: id }],
    });
    if (!exists) return id;
  }
  throw new Error("Unable to generate unique Virtual Voter ID. Please try again.");
}

module.exports = {
  generateEpicNumber,
  generateUniqueEpicNumber,
  generateVirtualVoterId,
  generateUniqueVirtualVoterId,
  maskEpicNumber,
  withMaskedEpic,
};
