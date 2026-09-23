
const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const KEY_HEX = process.env.VOTE_ENCRYPTION_KEY;

function getKey() {
  if (!KEY_HEX || KEY_HEX.length < 64) {
    throw new Error(
      "VOTE_ENCRYPTION_KEY not set or too short. .env mein 32-byte hex (64 chars) set karo:\n" +
      "  node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  return Buffer.from(KEY_HEX, "hex");
}

/**
 * Vote encrypt karo
 * @param {Object} payload — { candidateId, electionId, voterWallet, votedAt }
 * @returns {string} — "iv:authTag:ciphertext" format mein hex string
 */
function encryptVote(payload) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const plaintext = JSON.stringify(payload);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Vote decrypt karo (result verification ke liye)
 * @param {string} commitment — encryptVote() se aaya string
 * @returns {Object} — original payload
 */
function decryptVote(commitment) {
  const key = getKey();
  const parts = commitment.split(":");
  if (parts.length !== 3) throw new Error("Invalid vote commitment format");

  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8"));
}

/**
 * Verify karo ki commitment tamper nahi hua hai
 * @returns {boolean}
 */
function verifyCommitment(commitment) {
  try {
    decryptVote(commitment);
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = { encryptVote, decryptVote, verifyCommitment };