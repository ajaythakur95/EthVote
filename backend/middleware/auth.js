const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { normalizeDistrict } = require("../constants/districts");
const {
  getAdminHierarchyRole,
  getAssignedDistrict,
  normalizeTargetRole,
  equalsCI,
} = require("../utils/adminHierarchy");

// ── Protect: verify JWT ───────────────────────────────────────────────────────
exports.protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }
  if (!token) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select("-password");
    if (!req.user) {
      return res.status(401).json({ error: "Token valid but user no longer exists." });
    }
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
};

// ── Authorize: role check ────────────────────────────────────────────────────
// Superadmin har jagah allowed hai automatically
exports.authorize = (...roles) => {
  return (req, res, next) => {
    // Superadmin sab kuch kar sakta hai
    if (req.user.role === "superadmin") return next();

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Role '${req.user.role}' is not authorized for this action.`,
      });
    }
    next();
  };
};
// ── Admin Constituency Guard ──────────────────────────────────────────────────
exports.adminConstituencyGuard = (req, res, next) => {
  if (req.user.role === "superadmin") return next();

  const targetConstituency =
    req.body.constituency ||
    req.query.constituency ||
    req.params.constituency;

  if (
    req.user.adminConstituency &&
    targetConstituency &&
    req.user.adminConstituency !== targetConstituency
  ) {
    return res.status(403).json({
      error: `Aap sirf ${req.user.adminConstituency} constituency manage kar sakte hain`,
    });
  }
  next();
};

exports.adminDistrictGuard = (req, res, next) => {
  if (req.user.role === "superadmin") return next();
  // National admins choose district via ?district= (same as superadmin); no row assignment
  if (getAdminHierarchyRole(req.user) === "National") return next();

  const adminDistrict = normalizeDistrict(getAssignedDistrict(req.user));

  if (!adminDistrict) {
    return res.status(403).json({
      error: "Admin district assignment missing. Contact superadmin.",
    });
  }

  const targetDistrict = normalizeDistrict(
    req.body.district || req.query.district || req.params.district || ""
  );

  if (targetDistrict && targetDistrict !== adminDistrict) {
    return res.status(403).json({
      error: "Aap sirf apne assigned district ka data dekh sakte hain.",
    });
  }

  req.adminDistrict = getAssignedDistrict(req.user);
  next();
};

exports.authorizeNationalAdmin = (req, res, next) => {
  if (getAdminHierarchyRole(req.user) !== "National") {
    return res.status(403).json({ error: "Only National Admin can access this resource." });
  }
  next();
};

exports.checkHierarchy = (req, res, next) => {
  const actorRole = getAdminHierarchyRole(req.user);
  const inferredRole = actorRole === "National" ? "State" : actorRole === "State" ? "District" : "";
  const targetRole = normalizeTargetRole(req.body.role) || inferredRole;

  if (!targetRole) {
    return res.status(400).json({ error: "Target role must be one of National, State, District." });
  }

  if (targetRole === "National") {
    return res.status(403).json({ error: "National Admin can not be created from this endpoint." });
  }

  if (actorRole === "National") {
    if (targetRole !== "State") {
      return res.status(403).json({ error: "National Admin can only create State Admins." });
    }
    req.targetAdminRole = targetRole;
    return next();
  }

  if (actorRole === "State") {
    if (targetRole !== "District") {
      return res.status(403).json({ error: "State Admin can only create District Admins." });
    }
    const creatorState = String(req.user.assignedState || "").trim();
    const requestedState = String(req.body.assignedState || "").trim();
    if (requestedState && !equalsCI(requestedState, creatorState)) {
      return res.status(403).json({ error: "State Admin can only create District Admins in their own state." });
    }
    req.targetAdminRole = targetRole;
    return next();
  }

  return res.status(403).json({ error: "District Admin is not allowed to create admins." });
};

// ── Constituency Guard (voter ke liye) ────────────────────────────────────────
exports.constituencyGuard = (getConstituencyFn) => {
  return async (req, res, next) => {
    if (["superadmin", "admin"].includes(req.user.role)) return next();

    const targetConstituency = await getConstituencyFn(req);
    if (!targetConstituency) {
      return res.status(404).json({ error: "Constituency nahi mili" });
    }

    if (req.user.constituency !== targetConstituency) {
      return res.status(403).json({
        error: `Aap sirf ${req.user.constituency} constituency mein action kar sakte hain`,
      });
    }
    next();
  };
};

// ── Internal service guard (scoped token) ────────────────────────────────────
exports.requireInternalScope = (requiredScope) => {
  return (req, res, next) => {
    const internalToken = req.headers["x-internal-token"];
    const scopesRaw = String(req.headers["x-internal-scope"] || "");
    const scopes = scopesRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (!process.env.INTERNAL_API_TOKEN) {
      return res.status(500).json({ error: "INTERNAL_API_TOKEN is not configured on server." });
    }

    if (!internalToken || internalToken !== process.env.INTERNAL_API_TOKEN) {
      return res.status(401).json({ error: "Invalid internal token." });
    }

    if (!scopes.includes(requiredScope)) {
      return res.status(403).json({ error: `Missing required scope: ${requiredScope}` });
    }

    next();
  };
};