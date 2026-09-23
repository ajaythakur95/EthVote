import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AdminDashboard from "../components/admin/AdminDashboard";
import SuperAdminPanel from "../components/admin/SuperAdminPanel";
import AuditLogsPanel from "../components/admin/AuditLogsPanel";
import NationalDashboardPanel from "../components/admin/NationalDashboardPanel";
import StateDashboardPanel from "../components/admin/StateDashboardPanel";
import CreateElectionForm from "../components/admin/CreateElectionForm";
import ResultsPublisher from "../components/admin/ResultsPublisher";

export default function AdminPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [view, setView] = useState("dashboard");
  const [selectedElectionId, setSelectedElectionId] = useState("");
  const [flashToast, setFlashToast] = useState(null);

  const isAdminUser = !!user && ["admin", "superadmin"].includes(user.role);
  const isSuperAdmin = user?.role === "superadmin";
  const hierarchyRole = user?.adminRole || (isSuperAdmin ? "National" : "District");
  const isNationalAdmin = hierarchyRole === "National";
  const isStateAdmin = hierarchyRole === "State";
  const isDistrictAdmin = hierarchyRole === "District";

  const canManageAdmins = isNationalAdmin || isStateAdmin;
  const canManageElections = isNationalAdmin || isStateAdmin;
  const canPublishResults = isNationalAdmin || isStateAdmin;

  useEffect(() => {
    if (view === "dashboard" && !isDistrictAdmin) {
      if (isNationalAdmin) setView("national");
      else if (isStateAdmin) setView("state");
    }
  }, [view, isDistrictAdmin, isNationalAdmin, isStateAdmin]);

  useEffect(() => {
    const incomingToast = location.state?.toast;
    if (!incomingToast) return;

    setFlashToast(incomingToast);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, navigate]);

  useEffect(() => {
    if (!flashToast) return;

    const timer = setTimeout(() => setFlashToast(null), 3000);
    return () => clearTimeout(timer);
  }, [flashToast]);

  if (!isAdminUser) {
    return <Navigate to="/" replace />;
  }

  const navItems = [
    ...(isDistrictAdmin ? [{ id: "dashboard", label: "District Dashboard" }] : []),
    ...(isNationalAdmin ? [{ id: "national", label: "National Dashboard" }] : []),
    ...(isStateAdmin ? [{ id: "state", label: "State Dashboard" }] : []),
    ...(canManageAdmins ? [{ id: "admins", label: "Manage Admins" }] : []),
    ...(isNationalAdmin ? [{ id: "audit", label: "Audit Logs" }] : []),
    ...(canManageElections ? [{ id: "create", label: "New Election" }] : []),
    ...(canPublishResults ? [{ id: "results", label: "Publish Results" }] : []),
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      {flashToast && (
        <div
          className={`fixed top-20 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-xl ${
            flashToast.type === "error"
              ? "bg-red-900 text-red-200 border border-red-500/40"
              : "bg-emerald-900 text-emerald-200 border border-emerald-500/40"
          }`}
        >
          {flashToast.msg}
        </div>
      )}

      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-white text-3xl font-black">
            {isSuperAdmin ? "Super Admin Panel" : "Admin Panel"}
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            EthVote Election Management · {user.name}
            {!isSuperAdmin && user.adminConstituency && (
              <span className="ml-2 bg-indigo-900/40 text-indigo-300 px-2 py-0.5 rounded text-xs">
                Scope: {user.adminConstituency}
              </span>
            )}
          </p>
        </div>
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${
            isSuperAdmin
              ? "bg-purple-900/30 border-purple-500/40"
              : "bg-red-900/30 border-red-500/40"
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full animate-pulse ${
              isSuperAdmin ? "bg-purple-400" : "bg-red-400"
            }`}
          />
          <span
            className={`text-sm font-medium ${
              isSuperAdmin ? "text-purple-300" : "text-red-300"
            }`}
          >
            {isSuperAdmin ? "National Admin" : `${hierarchyRole} Admin`}
          </span>
        </div>
      </div>

      <div className="flex gap-2 mb-8 flex-wrap">
        {navItems.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              view === id
                ? isSuperAdmin
                  ? "bg-purple-600 text-white"
                  : "bg-indigo-600 text-white"
                : "bg-slate-800 border border-slate-700 text-slate-300 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "dashboard" && isDistrictAdmin && <AdminDashboard />}
      {view === "national" && isNationalAdmin && <NationalDashboardPanel />}
      {view === "state" && isStateAdmin && <StateDashboardPanel />}
      {view === "admins" && canManageAdmins && <SuperAdminPanel />}
      {view === "audit" && isNationalAdmin && <AuditLogsPanel />}

      {view === "create" && canManageElections && (
        <div className="max-w-2xl bg-slate-800/50 border border-slate-700 rounded-2xl p-8">
          <CreateElectionForm
            onCreated={() =>
              setView(isDistrictAdmin ? "dashboard" : isNationalAdmin ? "national" : "state")
            }
          />
        </div>
      )}

      {view === "results" && canPublishResults && (
        <div className="max-w-2xl bg-slate-800/50 border border-slate-700 rounded-2xl p-8 space-y-5">
          <div>
            <label className="text-slate-400 text-sm block mb-2">Select Closed Election</label>
            <input
              type="text"
              placeholder="Paste Election MongoDB ID..."
              value={selectedElectionId}
              onChange={(e) => setSelectedElectionId(e.target.value.trim())}
              className="w-full bg-slate-800 border border-slate-600 text-white rounded-xl px-4 py-3 font-mono text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          {selectedElectionId.length === 24 && (
            <ResultsPublisher
              electionId={selectedElectionId}
              onPublished={() =>
                setView(isDistrictAdmin ? "dashboard" : isNationalAdmin ? "national" : "state")
              }
            />
          )}
        </div>
      )}
    </div>
  );
}