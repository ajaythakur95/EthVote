const express = require("express");
const router = express.Router();
const { protect, authorize, adminDistrictGuard, checkHierarchy, authorizeNationalAdmin } = require("../middleware/auth");
const adminController = require("../controllers/adminController");
const adminVerificationController = require("../controllers/adminVerificationController");
const pincodeMappingAdminController = require("../controllers/pincodeMappingAdminController");
const {
  requireCandidateVerificationAccess,
  requireVoterVerificationAccess,
} = require("../middleware/rbac");

// ── Public: Admin Login ───────────────────────────────────────────────────────
router.post("/login", adminController.adminLogin);

// ── Protected: Admin + Superadmin ────────────────────────────────────────────
router.use(protect, authorize("admin", "superadmin"));

router.get("/stats",                   adminController.getDashboardStats);
router.get("/state/dashboard",         adminController.getStateDashboard);
router.get("/national/dashboard",      authorizeNationalAdmin, adminController.getNationalDashboard);
router.get("/national",                authorizeNationalAdmin, adminController.getNationalDashboard);
router.get("/dashboard/national",      authorizeNationalAdmin, adminController.getNationalDashboard);
router.get("/results/vidhan-sabha",    adminController.getVidhanSabhaResults);
router.get("/results/lok-sabha",       authorizeNationalAdmin, adminController.getLokSabhaResults);
router.get("/requests",                requireVoterVerificationAccess, adminDistrictGuard, adminController.getDistrictRequests);
router.get("/voters/pending",          requireVoterVerificationAccess, adminDistrictGuard, adminController.getPendingVoters);
router.post("/voters/:id/approve",     requireVoterVerificationAccess, adminController.approveVoter);
router.post("/voters/:id/reject",      requireVoterVerificationAccess, adminController.rejectVoter);

// ── Pincode → AC/PC (National Admin + Superadmin) ────────────────────────────
router.get("/pincode-mappings",            authorizeNationalAdmin, pincodeMappingAdminController.list);
router.get("/pincode-mappings/:pincode",   authorizeNationalAdmin, pincodeMappingAdminController.getOne);
router.post("/pincode-mappings",           authorizeNationalAdmin, pincodeMappingAdminController.create);
router.patch("/pincode-mappings/:pincode", authorizeNationalAdmin, pincodeMappingAdminController.update);
router.delete("/pincode-mappings/:pincode", authorizeNationalAdmin, pincodeMappingAdminController.remove);

router.patch(
  "/verify-candidate/:candidateId",
  requireCandidateVerificationAccess,
  adminVerificationController.verifyCandidate
);

// ── Superadmin Only ───────────────────────────────────────────────────────────
router.get("/admins",                  adminController.listAdmins);
router.post("/admins/create",          checkHierarchy, adminController.createAdmin);
router.delete("/admins/:id",           protect, authorize("superadmin"), adminController.deleteAdmin);
router.get("/audit-logs",              protect, authorize("superadmin"), adminController.getVoterAuditLogs);

module.exports = router;