const crypto = require("crypto");

/** Short-lived session after credential check; consumed when issuing final JWT. */
const store = new Map();
const TTL_MS = Number(process.env.LIVENESS_SESSION_TTL_MS) || 10 * 60 * 1000;

function create(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + TTL_MS;
  store.set(token, { userId: String(userId), expiresAt });
  setTimeout(() => store.delete(token), TTL_MS);
  return token;
}

/** Returns userId if token exists and is not expired (does not remove). */
function peek(token) {
  if (!token || typeof token !== "string") return null;
  const entry = store.get(token);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(token);
    return null;
  }
  return entry.userId;
}

/** Removes token and returns userId if still valid. Call only after all checks pass. */
function consume(token) {
  const userId = peek(token);
  if (userId) store.delete(token);
  return userId;
}

module.exports = { create, peek, consume };
