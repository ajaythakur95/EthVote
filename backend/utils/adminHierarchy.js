function getAdminHierarchyRole(user) {
  if (!user) return "District";
  if (user.role === "superadmin") return "National";
  if (user.adminRole === "National") return "National";
  if (user.adminRole === "State") return "State";
  if (user.adminRole === "District") return "District";
  return "District";
}

function getAssignedState(user) {
  return String(user?.assignedState || "").trim();
}

function getAssignedDistrict(user) {
  return String(user?.assignedDistrict || user?.adminConstituency || "").trim();
}

function normalizeTargetRole(rawRole) {
  const role = String(rawRole || "").trim().toLowerCase();
  if (["state", "stateadmin", "state_admin"].includes(role)) return "State";
  if (["district", "districtadmin", "district_admin"].includes(role)) return "District";
  if (["national", "nationaladmin", "national_admin", "superadmin"].includes(role)) return "National";
  return "";
}

function equalsCI(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

module.exports = {
  getAdminHierarchyRole,
  getAssignedState,
  getAssignedDistrict,
  normalizeTargetRole,
  equalsCI,
};