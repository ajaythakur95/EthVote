

const crypto = require("crypto");

const SECRET = process.env.FACE_LIVENESS_SECRET || "ethvote_face_liveness_secret_change_in_prod";
const NONCE_TTL_MS = 90 * 1000;
const SCORE_THRESHOLD = 0.75;

// Used nonces — replay attack prevent karta hai
const usedNonces = new Set();

// Memory leak prevent karo — har 5 min mein purane nonces saaf karo
setInterval(() => {
  const now = Date.now();
  for (const entry of usedNonces) {
    try {
      const ts = parseInt(entry.split(".")[0], 10);
      if (now - ts > NONCE_TTL_MS * 2) usedNonces.delete(entry);
    } catch (_) {
      usedNonces.delete(entry);
    }
  }
}, 5 * 60 * 1000);

function signNonce(nonce) {
  return crypto
    .createHmac("sha256", SECRET)
    .update(nonce)
    .digest("hex");
}

class FaceService {
  /**
   * Step 1: Server-signed challenge generate karo
   * GET /api/auth/face/challenge
   */
  generateChallenge() {
    const challenges = ["BLINK", "TURN_LEFT", "TURN_RIGHT", "SMILE", "NOD"];
    const action = challenges[Math.floor(Math.random() * challenges.length)];

    const nonce = `${Date.now()}.${crypto.randomBytes(16).toString("hex")}`;
    const sig = signNonce(nonce);
    const expiresAt = Date.now() + NONCE_TTL_MS;

    const token = Buffer.from(JSON.stringify({ nonce, sig, action, expiresAt })).toString("base64url");

    return { action, token, expiresAt };
  }

  /**
   * Step 2: Frontend ka result verify karo — HMAC + expiry + replay check
   */
  verifyLivenessToken(token, score) {
    if (!token) return { verified: false, reason: "No liveness token provided" };

    let payload;
    try {
      payload = JSON.parse(Buffer.from(token, "base64url").toString("utf8"));
    } catch {
      return { verified: false, reason: "Token malformed" };
    }

    const { nonce, sig, expiresAt } = payload;

    if (!expiresAt || Date.now() > expiresAt) {
      return { verified: false, reason: "Challenge expired — please retry" };
    }

    const expectedSig = signNonce(nonce);
    let sigValid = false;
    try {
      sigValid = crypto.timingSafeEqual(
        Buffer.from(sig || "", "hex"),
        Buffer.from(expectedSig, "hex")
      );
    } catch (_) {
      sigValid = false;
    }

    if (!sigValid) {
      return { verified: false, reason: "Invalid challenge token — possible tampering" };
    }

    if (usedNonces.has(nonce)) {
      return { verified: false, reason: "Challenge already used — please get a new one" };
    }
    usedNonces.add(nonce);

    const numScore = parseFloat(score);
    if (isNaN(numScore) || numScore < SCORE_THRESHOLD) {
      return {
        verified: false,
        reason: `Liveness score too low: ${numScore?.toFixed(2)} (minimum ${SCORE_THRESHOLD})`,
      };
    }

    return { verified: true, score: numScore };
  }

  /**
   * Face descriptors compare karo (128-d vectors from face-api.js)
   */
  compareFaceDescriptors(desc1, desc2) {
    if (!Array.isArray(desc1) || !Array.isArray(desc2) || desc1.length !== desc2.length) {
      return { match: false, distance: 1.0 };
    }
    const distance = Math.sqrt(
      desc1.reduce((sum, val, i) => sum + Math.pow(val - desc2[i], 2), 0)
    );
    return { match: distance < 0.6, distance: parseFloat(distance.toFixed(4)) };
  }
}

module.exports = new FaceService();