const User = require("../models/User");
const Admin = require("../models/Admin");
const AuditLog = require("../models/AuditLog");
const Candidate = require("../models/Candidate");
const Election = require("../models/Election");
const blockchainService = require("../services/blockchainService");
const jwt = require("jsonwebtoken");
const { resolveDistrict } = require("../constants/districts");
const { generateUniqueVirtualVoterId } = require("../utils/epicUtils");
const ipfsService = require("../services/ipfsService");
const { ethers } = require("ethers");
const crypto = require("crypto");
const {
  getAdminHierarchyRole,
  getAssignedDistrict,
  normalizeTargetRole,
  equalsCI,
} = require("../utils/adminHierarchy");
const {
  resolveAssignedFromPincodeMapping,
  resolveVidhanOnlyFromConstituencyName,
} = require("../services/constituencyService");
const {
  calculateElectionResults,
  isElectionCompletedStatus,
} = require("../services/resultService");
const { resolveElectionClassFromDoc } = require("../utils/electionPolicy");

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "7d",
  });

function getAdminDistrict(user) {
  return getAssignedDistrict(user);
}

function adminDataScope(user) {
  const hierarchyRole = getAdminHierarchyRole(user);
  if (hierarchyRole === "National") return {};
  if (hierarchyRole === "State") return user.assignedState ? { state: user.assignedState } : { _id: null };
  const district = getAdminDistrict(user);
  return district ? { district } : { _id: null };
}

function districtFilter(req) {
  if (req.user.role === "superadmin") return {};
  if (getAdminHierarchyRole(req.user) === "National") return {};
  const assignedDistrict = getAdminDistrict(req.user);
  return assignedDistrict ? { district: assignedDistrict } : { _id: null };
}

function parseDateBoundary(value, endOfDay = false) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setHours(23, 59, 59, 999);
  else date.setHours(0, 0, 0, 0);
  return date;
}

function csvEscape(value) {
  const str = String(value ?? "");
  return `"${str.replace(/"/g, '""')}"`;
}

function aggregatePartySeatTallies(resultSets = []) {
  const partySeatMap = new Map();

  for (const result of resultSets) {
    for (const row of result?.partySeatTally || []) {
      const partyName = String(row.partyName || "Independent").trim() || "Independent";
      const seatsWon = Number(row.seatsWon || 0);
      partySeatMap.set(partyName, (partySeatMap.get(partyName) || 0) + seatsWon);
    }
  }

  return Array.from(partySeatMap.entries())
    .map(([partyName, seatsWon]) => ({ partyName, seatsWon }))
    .sort((a, b) => (b.seatsWon - a.seatsWon) || a.partyName.localeCompare(b.partyName));
}

function generateAdminMobile() {
  const randomPart = crypto.randomBytes(4).toString("hex");
  return `admin_${Date.now()}_${randomPart}`;
}

function generateAdminAadhaarHash() {
  return `admin_aadhaar_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
}

exports.adminLogin = async (req, res, next) => {
  try {
    const { name, password } = req.body;
    if (!name || !password) {
      return res.status(400).json({ error: "Name aur password dono chahiye" });
    }
    const user = await User.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") },
      role: { $in: ["admin", "superadmin"] },
    }).select("+password");

    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ error: "Invalid credentials" });

    await User.findByIdAndUpdate(user._id, { lastLoginAt: new Date() });
    const token = signToken(user._id);
    res.json({
      success: true,
      token,
      user: {
        _id:               user._id,
        name:              user.name,
        role:              user.role,
        adminRole:         getAdminHierarchyRole(user),
        assignedState:     user.assignedState || "",
        adminConstituency: user.adminConstituency,
        assignedDistrict:  getAdminDistrict(user),
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.getDashboardStats = async (req, res, next) => {
  try {
    const voterFilter = { role: "voter", ...adminDataScope(req.user) };

    const [total, pending, approved, rejected, pathA, pathB] = await Promise.all([
      User.countDocuments(voterFilter),
      User.countDocuments({ ...voterFilter, verificationStatus: "PENDING" }),
      User.countDocuments({ ...voterFilter, verificationStatus: "APPROVED" }),
      User.countDocuments({ ...voterFilter, verificationStatus: "REJECTED" }),
      User.countDocuments({ ...voterFilter, registrationPath: "PATH_A_EXISTING" }),
      User.countDocuments({ ...voterFilter, registrationPath: "PATH_B_NEW" }),
    ]);

    let admins = [];
    if (req.user.role === "superadmin") {
      admins = await User.find({ role: { $in: ["admin", "superadmin"] } })
        .select("name role assignedDistrict adminConstituency lastLoginAt createdAt")
        .sort({ createdAt: -1 });
    }

    res.json({ success: true, stats: { total, pending, approved, rejected, pathA, pathB }, admins });
  } catch (error) {
    next(error);
  }
};

exports.getNationalDashboard = async (req, res, next) => {
  try {
    const [votersByState, lokSabhaElections, totalAdmins] = await Promise.all([
      User.aggregate([
        { $match: { role: "voter", state: { $ne: "" } } },
        { $group: { _id: "$state", totalVoters: { $sum: 1 }, pendingVoters: { $sum: { $cond: [{ $eq: ["$verificationStatus", "PENDING"] }, 1, 0] } } } },
        { $sort: { totalVoters: -1 } },
      ]),
      Election.find({
        $or: [
          { electionType: { $in: ["GENERAL", "LokSabha"] } },
          { election_type: "Lok Sabha" },
        ],
      })
        .select("title state status startTime endTime totalVotes")
        .sort({ createdAt: -1 })
        .limit(50),
      User.countDocuments({ role: { $in: ["admin", "superadmin"] } }),
    ]);

    res.json({
      success: true,
      scope: "National",
      totalAdmins,
      lokSabhaElections,
      votersByState,
    });
  } catch (error) {
    next(error);
  }
};

exports.getStateDashboard = async (req, res, next) => {
  try {
    const state = String(req.user.assignedState || "").trim();
    if (!state) {
      return res.status(403).json({ error: "State Admin state assignment missing." });
    }

    const stateVotersFilter = { role: "voter", state };
    const stateCandidateScope = {
      state,
      $or: [
        { candidacyType: "CHIEF_MINISTER_CANDIDATE" },
        { candidacyType: { $exists: false }, candidateRole: "CM" },
      ],
    };

    const [totalVoters, pendingVoters, approvedVoters, rejectedVoters, pendingCandidates, approvedCandidates, stateElections] = await Promise.all([
      User.countDocuments(stateVotersFilter),
      User.countDocuments({ ...stateVotersFilter, verificationStatus: "PENDING" }),
      User.countDocuments({ ...stateVotersFilter, verificationStatus: "APPROVED" }),
      User.countDocuments({ ...stateVotersFilter, verificationStatus: "REJECTED" }),
      Candidate.countDocuments({ ...stateCandidateScope, status: "PENDING" }),
      Candidate.countDocuments({ ...stateCandidateScope, status: "APPROVED" }),
      Election.find({ state }).select("title constituency status electionType startTime endTime totalVotes").sort({ createdAt: -1 }).limit(100),
    ]);

    res.json({
      success: true,
      scope: "State",
      state,
      voters: { total: totalVoters, pending: pendingVoters, approved: approvedVoters, rejected: rejectedVoters },
      candidates: { pending: pendingCandidates, approved: approvedCandidates },
      elections: stateElections,
      filterExample: {
        voterQuery: `User.find({ role: "voter", state: "${state}" })`,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.getPendingVoters = async (req, res, next) => {
  try {
    const voters = await User.find({
      role: "voter",
      verificationStatus: "PENDING",
      ...districtFilter(req),
    })
      .sort({ createdAt: 1 })
      .select("-aadhaarHash");

    res.json({ success: true, count: voters.length, voters });
  } catch (error) { next(error); }
};

exports.approveVoter = async (req, res, next) => {
  try {
    if (getAdminHierarchyRole(req.user) !== "District") {
      return res.status(403).json({ error: "Only District Admin can verify voters." });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "Voter not found" });
    if (user.role !== "voter") return res.status(400).json({ error: "Selected user is not a voter." });

    const assignedDistrict = String(req.adminDistrict || getAdminDistrict(req.user) || "").trim();
    if (!assignedDistrict) {
      return res.status(403).json({ error: "District assignment missing for current admin." });
    }

    if (!equalsCI(user.district, assignedDistrict)) {
      return res.status(403).json({ error: "Aap sirf apne district ke voters approve kar sakte hain" });
    }

    if (user.verificationStatus !== "PENDING") {
      return res.status(400).json({ error: "Voter PENDING status mein nahi hai" });
    }

    if (!user.walletAddress) {
      return res.status(400).json({ error: "Voter ka wallet address nahi hai" });
    }

    const updates = {
      verificationStatus: "APPROVED",
      adminReviewedBy:    req.user._id,
      adminReviewedAt:    new Date(),
    };
    if (!user.epicNumber) {
      const year = new Date().getFullYear();
      const virtualId = await generateUniqueVirtualVoterId(User, year);
      updates.epicNumber = virtualId;
      updates.virtualVoterId = virtualId;
    }

    await User.findByIdAndUpdate(user._id, updates);
    let approvedUser = await User.findById(user._id);

    const jur = {};
    if (approvedUser.vidhanSabhaAC && approvedUser.lokSabhaPC) {
      const r = await resolveAssignedFromPincodeMapping({
        vidhanSabhaAC: approvedUser.vidhanSabhaAC,
        lokSabhaPC: approvedUser.lokSabhaPC,
        state: approvedUser.state,
      });
      jur.assigned_vidhan_sabha = r.assigned_vidhan_sabha;
      jur.assigned_lok_sabha = r.assigned_lok_sabha;
    } else if (approvedUser.constituency) {
      const r = await resolveVidhanOnlyFromConstituencyName(
        approvedUser.constituency,
        approvedUser.state
      );
      if (r.assigned_vidhan_sabha) jur.assigned_vidhan_sabha = r.assigned_vidhan_sabha;
    }
    if (Object.keys(jur).length) {
      await User.findByIdAndUpdate(approvedUser._id, { $set: jur });
      approvedUser = await User.findById(user._id);
    }

    let mintResult = null;
    const chainHash =
      approvedUser.blockchainHash && ethers.isHexString(approvedUser.blockchainHash, 32)
        ? approvedUser.blockchainHash
        : null;

    if (!chainHash) {
      console.warn("[Approve] blockchainHash missing or invalid — SBT mint skipped");
    }

    try {
      if (chainHash) {
        let ipfsMetadata = `ipfs://QmPlaceholder/${approvedUser._id}`;
        try {
          ipfsMetadata = await ipfsService.createVoterMetadata(approvedUser);
        } catch (ipfsErr) {
          console.warn("[Approve] IPFS metadata fallback:", ipfsErr.message);
        }

        mintResult = await blockchainService.mintVoterIdentity(
          approvedUser.walletAddress,
          chainHash,
          ipfsMetadata
        );
        await User.findByIdAndUpdate(approvedUser._id, {
          sbtTokenId:      parseInt(mintResult.tokenId, 10),
          sbtMintedAt:     new Date(),
          sbtTxHash:       mintResult.txHash,
          ipfsMetadataURI: ipfsMetadata,
        });
      }
    } catch (mintErr) {
      if (
        mintErr.message.includes("Wallet already has") ||
        mintErr.message.includes("already registered")
      ) {
        console.warn("[Approve] SBT already exists — approving anyway");
      } else {
        console.error("[Approve] SBT mint failed:", mintErr.message);
      }
    }

    await AuditLog.create({
      action: "VOTER_APPROVED",
      performedBy: req.user._id,
      targetUser: user._id,
      txHash: mintResult?.txHash || undefined,
      ipAddress: req.ip,
      details: {
        district: user.district || "",
        verificationStatus: "APPROVED",
        sbtMinted: !!mintResult,
      },
    });

    res.json({
      success:   true,
      message:   "Voter approved ho gaya.",
      sbtMinted: !!mintResult,
      txHash:    mintResult?.txHash || null,
    });
  } catch (error) {
    next(error);
  }
};

exports.rejectVoter = async (req, res, next) => {
  try {
    if (getAdminHierarchyRole(req.user) !== "District") {
      return res.status(403).json({ error: "Only District Admin can verify voters." });
    }

    const { reason } = req.body;
    if (!reason) return res.status(400).json({ error: "Rejection reason required hai" });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "Voter not found" });
    if (user.role !== "voter") return res.status(400).json({ error: "Selected user is not a voter." });

    const assignedDistrict = String(req.adminDistrict || getAdminDistrict(req.user) || "").trim();
    if (!assignedDistrict) {
      return res.status(403).json({ error: "District assignment missing for current admin." });
    }

    if (!equalsCI(user.district, assignedDistrict)) {
      return res.status(403).json({ error: "Aap sirf apne district ke voters reject kar sakte hain" });
    }

    await User.findByIdAndUpdate(req.params.id, {
      verificationStatus: "REJECTED",
      rejectionReason:    reason,
      adminReviewedBy:    req.user._id,
      adminReviewedAt:    new Date(),
    });

    await AuditLog.create({
      action: "VOTER_REJECTED",
      performedBy: req.user._id,
      targetUser: user._id,
      ipAddress: req.ip,
      details: {
        district: user.district || "",
        verificationStatus: "REJECTED",
        reason,
      },
    });

    res.json({ success: true, message: "Voter rejected." });
  } catch (error) {
    next(error);
  }
};

exports.createAdmin = async (req, res, next) => {
  try {
    const { name, password } = req.body;
    const targetRole = req.targetAdminRole || normalizeTargetRole(req.body.role);
    const creatorRole = getAdminHierarchyRole(req.user);
    const requestedState = String(req.body.assignedState || "").trim();
    const requestedDistrict = String(req.body.assignedDistrict || req.body.adminConstituency || "").trim();

    if (!name || !password || !targetRole) {
      return res.status(400).json({ error: "Name, password aur role required hain" });
    }

    let finalRole = "";
    let finalState = "";
    let finalDistrict = "";

    if (targetRole === "State") {
      if (creatorRole !== "National") {
        return res.status(403).json({ error: "Only National Admin can create State Admin." });
      }
      if (!requestedState) {
        return res.status(400).json({ error: "assignedState is required for State Admin." });
      }
      finalRole = "State";
      finalState = requestedState;
    } else if (targetRole === "District") {
      if (creatorRole !== "State") {
        return res.status(403).json({ error: "Only State Admin can create District Admin." });
      }
      const creatorState = String(req.user.assignedState || "").trim();
      if (!creatorState) {
        return res.status(403).json({ error: "State Admin state assignment missing." });
      }
      if (requestedState && !equalsCI(requestedState, creatorState)) {
        return res.status(403).json({ error: "State Admin can only create District Admins for their own state." });
      }
      finalRole = "District";
      finalState = creatorState;
      const resolvedDistrict = resolveDistrict(requestedDistrict);
      if (!resolvedDistrict) {
        return res.status(400).json({ error: "Invalid assignedDistrict" });
      }
      finalDistrict = resolvedDistrict;
    } else {
      return res.status(400).json({ error: "Only State or District admin can be created." });
    }

    const existing = await User.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") }
    });
    if (existing) {
      return res.status(400).json({ error: `'${name}' naam ka user pehle se hai` });
    }

    const admin = await User.create({
      name:               name.trim(),
      aadhaarHash:        generateAdminAadhaarHash(),
      // User model pre-save hook hashes password once.
      // Passing already-hashed password here causes double-hash and login failure.
      password:           password,
      role:               "admin",
      adminRole:          finalRole,
      assignedState:      finalState,
      assignedDistrict:   finalDistrict,
      adminConstituency:  finalDistrict,
      createdBy:          req.user._id,
      mobileNumber:       generateAdminMobile(),
      dateOfBirth:        new Date("1990-01-01"),
      verificationStatus: "APPROVED",
    });

    await Admin.create({
      user: admin._id,
      role: finalRole,
      assignedState: finalState,
      assignedDistrict: finalDistrict,
      createdBy: req.user._id,
    });

    res.status(201).json({
      success: true,
      message: `Admin '${name}' created as ${finalRole} Admin`,
      admin: {
        _id:               admin._id,
        name:              admin.name,
        role:              admin.role,
        adminRole:         admin.adminRole,
        assignedState:     admin.assignedState,
        assignedDistrict:  admin.assignedDistrict,
        adminConstituency: admin.adminConstituency,
        createdBy:         admin.createdBy,
      },
    });
  } catch (error) {
    if (error?.code === 11000) {
      const duplicateField =
        Object.keys(error?.keyPattern || {})[0] ||
        Object.keys(error?.keyValue || {})[0] ||
        "";
      const duplicateValue = duplicateField ? error?.keyValue?.[duplicateField] : undefined;

      if (duplicateField === "name") {
        return res.status(400).json({ error: "Is naam ka user pehle se exist karta hai." });
      }
      if (duplicateField === "mobileNumber") {
        return res.status(500).json({ error: "Admin create retry karein (mobile key collision)." });
      }
      if (duplicateField) {
        return res.status(400).json({
          error: `Duplicate value for '${duplicateField}'`,
          field: duplicateField,
          value: duplicateValue ?? null,
        });
      }
      return res.status(400).json({ error: "Duplicate record detected (unknown key)." });
    }
    next(error);
  }
};

exports.deleteAdmin = async (req, res, next) => {
  try {
    const admin = await User.findById(req.params.id);
    if (!admin) return res.status(404).json({ error: "Admin not found" });
    if (admin.role === "superadmin") {
      return res.status(400).json({ error: "Superadmin ko delete nahi kar sakte" });
    }
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: `Admin '${admin.name}' delete ho gaya` });
  } catch (error) {
    next(error);
  }
};

exports.listAdmins = async (req, res, next) => {
  try {
    const actorRole = getAdminHierarchyRole(req.user);
    const filter = { role: { $in: ["admin", "superadmin"] } };
    if (actorRole === "State") {
      filter.adminRole = "District";
      filter.assignedState = req.user.assignedState || "";
    } else if (actorRole === "District") {
      return res.status(403).json({ error: "District Admin cannot list admins." });
    }

    const admins = await User.find(filter)
      .select("name role adminRole assignedState assignedDistrict adminConstituency lastLoginAt createdAt")
      .sort({ createdAt: -1 });
    res.json({ success: true, admins });
  } catch (error) {
    next(error);
  }
};

exports.getDistrictRequests = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const skip = (page - 1) * limit;
    const search = (req.query.search || "").trim();
    const sortByAllowed = new Set(["createdAt", "name"]);
    const sortBy = sortByAllowed.has(req.query.sortBy) ? req.query.sortBy : "createdAt";
    const sortOrder = String(req.query.sortOrder || "asc").toLowerCase() === "desc" ? -1 : 1;

    const nationalScope =
      req.user.role === "superadmin" ||
      getAdminHierarchyRole(req.user) === "National";
    const district = nationalScope
      ? resolveDistrict(req.query.district || "")
      : (req.adminDistrict || getAdminDistrict(req.user));

    if (!district) {
      return res.status(400).json({ error: "District required to fetch requests" });
    }

    const query = {
      role: "voter",
      verificationStatus: "PENDING",
      district,
    };

    if (search) {
      const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { name: { $regex: safeSearch, $options: "i" } },
        { mobileNumber: { $regex: safeSearch, $options: "i" } },
        { epicNumber: { $regex: safeSearch, $options: "i" } },
      ];
    }

    const [voters, total] = await Promise.all([
      User.find(query)
        .sort({ [sortBy]: sortOrder, _id: 1 })
        .skip(skip)
        .limit(limit)
        .select("-aadhaarHash"),
      User.countDocuments(query),
    ]);

    res.json({
      success: true,
      district,
      page,
      limit,
      search,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      hasNextPage: skip + voters.length < total,
      hasPrevPage: page > 1,
      sortBy,
      sortOrder: sortOrder === 1 ? "asc" : "desc",
      count: voters.length,
      requests: voters,
      filterQuery: {
        district,
        status: "Pending",
        mongoExample: `User.find({ district: "${district}", verificationStatus: "PENDING", role: "voter" })`,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.getVoterAuditLogs = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const skip = (page - 1) * limit;
    const district = resolveDistrict(req.query.district || "");
    const search = (req.query.search || "").trim();
    const from = parseDateBoundary(req.query.from);
    const to = parseDateBoundary(req.query.to, true);
    const format = String(req.query.format || "").toLowerCase();

    const query = {
      action: { $in: ["VOTER_APPROVED", "VOTER_REJECTED"] },
    };

    if (district) {
      query["details.district"] = district;
    }

    if (search) {
      const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { action: { $regex: safeSearch, $options: "i" } },
        { "details.reason": { $regex: safeSearch, $options: "i" } },
      ];
    }

    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = from;
      if (to) query.createdAt.$lte = to;
    }

    const baseQuery = AuditLog.find(query)
      .populate("performedBy", "name role assignedDistrict")
      .populate("targetUser", "name district mobileNumber epicNumber verificationStatus")
      .sort({ createdAt: -1 });

    if (format === "csv") {
      const csvLogs = await baseQuery.limit(5000);
      const headers = [
        "Timestamp",
        "Action",
        "AdminName",
        "AdminRole",
        "VoterName",
        "VoterDistrict",
        "Status",
        "Reason",
        "TxHash",
        "IPAddress",
      ];

      const rows = csvLogs.map((log) => [
        new Date(log.createdAt).toISOString(),
        log.action,
        log.performedBy?.name || "",
        log.performedBy?.role || "",
        log.targetUser?.name || "",
        log.details?.district || log.targetUser?.district || "",
        log.details?.verificationStatus || "",
        log.details?.reason || "",
        log.txHash || "",
        log.ipAddress || "",
      ]);

      const csvContent = [
        headers.map(csvEscape).join(","),
        ...rows.map((row) => row.map(csvEscape).join(",")),
      ].join("\n");

      const fileSuffix = new Date().toISOString().slice(0, 10);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=\"audit-logs-${fileSuffix}.csv\"`);
      return res.status(200).send(csvContent);
    }

    const [logs, total] = await Promise.all([
      baseQuery
        .skip(skip)
        .limit(limit),
      AuditLog.countDocuments(query),
    ]);

    res.json({
      success: true,
      district: district || "",
      from: req.query.from || "",
      to: req.query.to || "",
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      hasNextPage: skip + logs.length < total,
      hasPrevPage: page > 1,
      logs,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/admin/results/lok-sabha
// Super/National Admin: National view for completed Lok Sabha elections.
exports.getLokSabhaResults = async (req, res, next) => {
  try {
    const hierarchyRole = getAdminHierarchyRole(req.user);
    if (hierarchyRole !== "National") {
      return res.status(403).json({ error: "Only Super Admin can access Lok Sabha result announcements." });
    }

    const electionId = String(req.query.electionId || "").trim();

    if (electionId) {
      const election = await Election.findById(electionId);
      if (!election) return res.status(404).json({ error: "Election not found" });

      const electionClass = resolveElectionClassFromDoc(election);
      if (electionClass !== "LOK_SABHA") {
        return res.status(400).json({ error: "Provided electionId is not a Lok Sabha election." });
      }
      if (!isElectionCompletedStatus(election.status)) {
        return res.status(403).json({ error: "Results can be accessed only when election status is marked as Completed." });
      }

      const result = await calculateElectionResults(election._id);
      return res.json({
        success: true,
        scope: "National",
        mode: "single-election",
        result,
      });
    }

    const completedLokSabhaElections = (await Election.find({}).sort({ endTime: -1 }))
      .filter((e) => resolveElectionClassFromDoc(e) === "LOK_SABHA")
      .filter((e) => isElectionCompletedStatus(e.status));

    const results = await Promise.all(
      completedLokSabhaElections.map((election) => calculateElectionResults(election._id))
    );

    return res.json({
      success: true,
      scope: "National",
      mode: "all-completed-lok-sabha",
      totalElections: results.length,
      partySeatTally: aggregatePartySeatTallies(results),
      elections: results,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/admin/results/vidhan-sabha
// State Admin: assigned state only. Supports ?electionId= (Vidhan) and ?byElectionId= (single seat).
exports.getVidhanSabhaResults = async (req, res, next) => {
  try {
    const hierarchyRole = getAdminHierarchyRole(req.user);
    if (hierarchyRole !== "State") {
      return res.status(403).json({ error: "Only State Admin can access Vidhan Sabha/By-Election announcements." });
    }

    const assignedState = String(req.user.assignedState || "").trim();
    if (!assignedState) {
      return res.status(403).json({ error: "State Admin assigned_state is missing." });
    }

    const electionId = String(req.query.electionId || "").trim();
    const byElectionId = String(req.query.byElectionId || "").trim();

    if (electionId && byElectionId) {
      return res.status(400).json({ error: "Use either electionId or byElectionId, not both." });
    }

    if (byElectionId) {
      const election = await Election.findById(byElectionId);
      if (!election) return res.status(404).json({ error: "By-Election not found" });

      const electionClass = resolveElectionClassFromDoc(election);
      if (electionClass !== "BY_ELECTION") {
        return res.status(400).json({ error: "Provided byElectionId is not a By-Election." });
      }
      if (!equalsCI(assignedState, election.state)) {
        return res.status(403).json({ error: "By-Election is outside your assigned_state scope." });
      }
      if (!isElectionCompletedStatus(election.status)) {
        return res.status(403).json({ error: "Results can be accessed only when election status is marked as Completed." });
      }

      const seatResult = await calculateElectionResults(election._id);
      return res.json({
        success: true,
        scope: "State",
        state: assignedState,
        mode: "single-by-election-seat",
        seatResult,
      });
    }

    if (electionId) {
      const election = await Election.findById(electionId);
      if (!election) return res.status(404).json({ error: "Election not found" });

      const electionClass = resolveElectionClassFromDoc(election);
      if (electionClass !== "VIDHAN_SABHA") {
        return res.status(400).json({ error: "Provided electionId is not a Vidhan Sabha election." });
      }
      if (!equalsCI(assignedState, election.state)) {
        return res.status(403).json({ error: "Election is outside your assigned_state scope." });
      }
      if (!isElectionCompletedStatus(election.status)) {
        return res.status(403).json({ error: "Results can be accessed only when election status is marked as Completed." });
      }

      const result = await calculateElectionResults(election._id);
      return res.json({
        success: true,
        scope: "State",
        state: assignedState,
        mode: "single-vidhan-election",
        result,
      });
    }

    const completedStateElections = (await Election.find({ state: assignedState }).sort({ endTime: -1 }))
      .filter((e) => ["VIDHAN_SABHA", "BY_ELECTION"].includes(resolveElectionClassFromDoc(e)))
      .filter((e) => isElectionCompletedStatus(e.status));

    const results = await Promise.all(
      completedStateElections.map((election) => calculateElectionResults(election._id))
    );

    const vidhanSabhaResults = results.filter((r) => r.election?.electionClass === "VIDHAN_SABHA");
    const byElectionResults = results.filter((r) => r.election?.electionClass === "BY_ELECTION");

    return res.json({
      success: true,
      scope: "State",
      state: assignedState,
      mode: "all-completed-state-results",
      totalElections: results.length,
      partySeatTally: aggregatePartySeatTallies(results),
      vidhanSabhaResults,
      byElectionResults,
    });
  } catch (error) {
    next(error);
  }
};