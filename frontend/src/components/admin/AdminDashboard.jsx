import { useState, useEffect } from "react";
import api from "../../utils/api";
import { DISTRICTS } from "../../constants/districts";
import { useAuth } from "../../context/AuthContext";

const StatCard = ({ label, value, color = "indigo", sub }) => {
  const colors = { indigo: "text-indigo-400", emerald: "text-emerald-400", amber: "text-amber-400", red: "text-red-400" };
  return (
    <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
      <p className="text-slate-400 text-sm mb-1">{label}</p>
      <p className={`text-3xl font-bold ${colors[color]}`}>{value ?? "—"}</p>
      {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
    </div>
  );
};

export default function AdminDashboard() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "superadmin";
  /** National + superadmin must pass ?district= (no assigned row) */
  const picksDistrict =
    isSuperAdmin || user?.adminRole === "National";
  const [stats, setStats] = useState(null);
  const [pendingVoters, setPendingVoters] = useState([]);
  const [pendingCandidates, setPendingCandidates] = useState([]);
  const [elections, setElections] = useState([]);
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [toast, setToast] = useState(null);
  const [assignedDistrict, setAssignedDistrict] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState("asc");
  const [pageMeta, setPageMeta] = useState({
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    if (picksDistrict && !selectedDistrict) {
      setSelectedDistrict(DISTRICTS[0] || "");
    }
  }, [picksDistrict, selectedDistrict]);

  const load = async () => {
    setLoading(true);
    try {
      const requestParams = {
        page,
        limit,
        ...(searchTerm ? { search: searchTerm } : {}),
        sortBy,
        sortOrder,
        ...(picksDistrict ? { district: selectedDistrict } : {}),
      };
      const [statsRes, votersRes, candidatesRes, electionsRes] = await Promise.all([
        api.get("/admin/stats"),
        api.get("/admin/requests", { params: requestParams }),
        api.get("/candidate/pending"),
        api.get("/election"),
      ]);
      setStats(statsRes.data.stats);
      setPendingVoters(votersRes.data.requests || []);
      setAssignedDistrict(votersRes.data.district || "");
      setPageMeta({
        total: votersRes.data.total || 0,
        totalPages: votersRes.data.totalPages || 1,
        hasNextPage: !!votersRes.data.hasNextPage,
        hasPrevPage: !!votersRes.data.hasPrevPage,
      });
      setPendingCandidates(candidatesRes.data.candidates);
      setElections(electionsRes.data.elections);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setSearchTerm(searchInput.trim());
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (picksDistrict && !selectedDistrict) return;
    load();
  }, [picksDistrict, selectedDistrict, page, searchTerm, sortBy, sortOrder]);

  const handleVoterAction = async (id, action, reason = "") => {
    setActionLoading((p) => ({ ...p, [id]: true }));
    try {
      if (action === "approve") await api.post(`/admin/voters/${id}/approve`);
      else await api.post(`/admin/voters/${id}/reject`, { reason: reason || "Does not meet eligibility requirements" });
      showToast(`Voter ${action}d successfully`);
      await load();
    } catch (e) { showToast(e.response?.data?.error || "Action failed", "error"); }
    finally { setActionLoading((p) => ({ ...p, [id]: false })); }
  };

  const handleCandidateAction = async (id, action) => {
    setActionLoading((p) => ({ ...p, [`c_${id}`]: true }));
    try {
      if (action === "approve") {
        await api.patch(`/admin/verify-candidate/${id}`, { action: "Verified" });
      } else {
        await api.patch(`/admin/verify-candidate/${id}`, {
          action: "Rejected",
          rejectionReason: "Does not meet candidate eligibility",
        });
      }
      showToast(`Candidate ${action}d`);
      await load();
    } catch (e) { showToast(e.response?.data?.error || "Action failed", "error"); }
    finally { setActionLoading((p) => ({ ...p, [`c_${id}`]: false })); }
  };

  const handleElectionStatus = async (id, status) => {
    try {
      await api.patch(`/election/${id}/status`, { status });
      showToast(`Election set to ${status}`);
      await load();
    } catch (e) { showToast("Failed to update status", "error"); }
  };

  const tabs = [
    { id: "overview", label: "Overview", badge: null },
    { id: "voters", label: "Voters", badge: pendingVoters.length },
    { id: "candidates", label: "Candidates", badge: pendingCandidates.length },
    { id: "elections", label: "Elections", badge: null },
  ];

  const statusColors = {
    CREATED: "bg-slate-700 text-slate-300", ACTIVE: "bg-emerald-900/40 text-emerald-300",
    PAUSED: "bg-amber-900/40 text-amber-300", CLOSED: "bg-red-900/40 text-red-300", FINALIZED: "bg-purple-900/40 text-purple-300",
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-20 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-xl ${
          toast.type === "error" ? "bg-red-900 text-red-200 border border-red-500/40" : "bg-emerald-900 text-emerald-200 border border-emerald-500/40"
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800 p-1 rounded-xl w-fit">
        {tabs.map(({ id, label, badge }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              activeTab === id ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"
            }`}>
            {label}
            {badge > 0 && <span className="bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">{badge}</span>}
          </button>
        ))}
      </div>

      {/* Overview */}
      {activeTab === "overview" && stats && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Voters" value={stats.total} color="indigo" />
            <StatCard label="Pending Review" value={stats.pending} color="amber" />
            <StatCard label="Approved" value={stats.approved} color="emerald" />
            <StatCard label="Rejected" value={stats.rejected} color="red" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
              <p className="text-slate-400 text-sm mb-4">Registration Breakdown</p>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-slate-300 text-sm">⚡ Path A (Existing Voter)</span>
                  <span className="text-indigo-400 font-bold">{stats.pathA}</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2">
                  <div className="bg-indigo-500 h-2 rounded-full" style={{ width: stats.total ? `${(stats.pathA/stats.total)*100}%` : "0%" }} />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-300 text-sm">📋 Path B (First-Time)</span>
                  <span className="text-emerald-400 font-bold">{stats.pathB}</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2">
                  <div className="bg-emerald-500 h-2 rounded-full" style={{ width: stats.total ? `${(stats.pathB/stats.total)*100}%` : "0%" }} />
                </div>
              </div>
            </div>
            <div className="bg-slate-800 rounded-xl p-5 border border-slate-700">
              <p className="text-slate-400 text-sm mb-4">Active Elections</p>
              {elections.filter((e) => e.status === "ACTIVE").length === 0
                ? <p className="text-slate-500 text-sm">No active elections</p>
                : elections.filter((e) => e.status === "ACTIVE").map((e) => (
                  <div key={e._id} className="flex justify-between items-center py-2 border-b border-slate-700 last:border-0">
                    <div>
                      <p className="text-white text-sm font-medium">{e.title}</p>
                      <p className="text-slate-400 text-xs">{e.constituency}</p>
                    </div>
                    <span className="text-emerald-400 font-bold text-sm">{e.totalVotes} votes</span>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      )}

      {/* Pending Voters */}
      {activeTab === "voters" && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-white font-semibold">
              {pageMeta.total} Pending Reviews {assignedDistrict ? `(${assignedDistrict})` : ""}
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              {picksDistrict && (
                <select
                  value={selectedDistrict}
                  onChange={(e) => {
                    setSelectedDistrict(e.target.value);
                    setPage(1);
                  }}
                  className="bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
                >
                  {DISTRICTS.map((district) => (
                    <option key={district} value={district}>{district}</option>
                  ))}
                </select>
              )}
              <input
                type="text"
                placeholder="Search name/mobile/EPIC"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
              />
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  setPage(1);
                }}
                className="bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
              >
                <option value="createdAt">Sort: Created At</option>
                <option value="name">Sort: Name</option>
              </select>
              <select
                value={sortOrder}
                onChange={(e) => {
                  setSortOrder(e.target.value);
                  setPage(1);
                }}
                className="bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
              >
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </div>
          </div>
          {pendingVoters.length === 0 ? (
            <div className="text-center py-12 text-slate-500">✅ No pending voter reviews</div>
          ) : pendingVoters.map((voter) => (
            <div key={voter._id} className="bg-slate-800 rounded-xl p-5 border border-slate-700">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white text-sm font-bold">
                      {voter.name?.[0]}
                    </div>
                    <div>
                      <p className="text-white font-semibold">{voter.name}</p>
                      <p className="text-slate-400 text-xs">{voter.mobileNumber}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs mt-2">
                    <span className="bg-slate-700 text-slate-300 px-2 py-1 rounded">Age: {voter.age}</span>
                    <span className="bg-slate-700 text-slate-300 px-2 py-1 rounded">District: {voter.district || "N/A"}</span>
                    <span className="bg-slate-700 text-slate-300 px-2 py-1 rounded">📋 Path B</span>
                    <span className="bg-slate-700 text-slate-300 px-2 py-1 rounded">
                      {new Date(voter.createdAt).toLocaleDateString("en-IN")}
                    </span>
                  </div>
                  {voter.documents && Object.entries(voter.documents).filter(([, v]) => v).length > 0 && (
                    <div className="flex gap-2 mt-2">
                      {Object.entries(voter.documents).filter(([, v]) => v).map(([key, url]) => (
                        <a key={key} href={url} target="_blank" rel="noopener noreferrer"
                          className="text-indigo-400 hover:text-indigo-300 text-xs underline">
                          {key.replace(/([A-Z])/g, " $1").trim()}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleVoterAction(voter._id, "reject")}
                    disabled={actionLoading[voter._id]}
                    className="px-4 py-2 bg-red-900/40 hover:bg-red-900/60 border border-red-500/40 text-red-300 text-sm rounded-lg disabled:opacity-50">
                    Reject
                  </button>
                  <button onClick={() => handleVoterAction(voter._id, "approve")}
                    disabled={actionLoading[voter._id]}
                    className="px-4 py-2 bg-emerald-900/40 hover:bg-emerald-900/60 border border-emerald-500/40 text-emerald-300 text-sm rounded-lg disabled:opacity-50">
                    {actionLoading[voter._id] ? "…" : "Approve & Mint SBT"}
                  </button>
                </div>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-slate-400">
              Page {page} of {pageMeta.totalPages}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={!pageMeta.hasPrevPage}
                className="px-3 py-1.5 bg-slate-800 border border-slate-600 text-slate-300 text-sm rounded-lg disabled:opacity-50"
              >
                Prev
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!pageMeta.hasNextPage}
                className="px-3 py-1.5 bg-slate-800 border border-slate-600 text-slate-300 text-sm rounded-lg disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pending Candidates */}
      {activeTab === "candidates" && (
        <div className="space-y-4">
          <h3 className="text-white font-semibold">{pendingCandidates.length} Pending Candidates</h3>
          {pendingCandidates.length === 0 ? (
            <div className="text-center py-12 text-slate-500">✅ No pending candidates</div>
          ) : pendingCandidates.map((c) => (
            <div key={c._id} className="bg-slate-800 rounded-xl p-5 border border-slate-700">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-white font-semibold">{c.name}</p>
                  <p className="text-indigo-400 text-sm">{c.partyName}</p>
                  <p className="text-slate-500 text-xs">
                    {c.candidacyType || "NORMAL_CANDIDATE"} - {c.candidateRole || "MP"}
                  </p>
                  <p className="text-slate-400 text-xs">{c.election?.title} · {c.constituency}</p>
                  {c.manifestoText && (
                    <p className="text-slate-400 text-xs max-w-md line-clamp-2 mt-1">{c.manifestoText}</p>
                  )}
                  {c.manifesto && (
                    <a href={c.manifesto} target="_blank" rel="noopener noreferrer" className="text-indigo-400 text-xs underline">
                      View Manifesto PDF
                    </a>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleCandidateAction(c._id, "reject")} disabled={actionLoading[`c_${c._id}`]}
                    className="px-4 py-2 bg-red-900/40 border border-red-500/40 text-red-300 text-sm rounded-lg disabled:opacity-50">
                    Reject
                  </button>
                  <button onClick={() => handleCandidateAction(c._id, "approve")} disabled={actionLoading[`c_${c._id}`]}
                    className="px-4 py-2 bg-emerald-900/40 border border-emerald-500/40 text-emerald-300 text-sm rounded-lg disabled:opacity-50">
                    {actionLoading[`c_${c._id}`] ? "…" : "Approve"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Elections Management */}
      {activeTab === "elections" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold">{elections.length} Elections</h3>
          </div>
          {elections.map((e) => (
            <div key={e._id} className="bg-slate-800 rounded-xl p-5 border border-slate-700">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-white font-semibold">{e.title}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[e.status]}`}>{e.status}</span>
                  </div>
                  <p className="text-slate-400 text-sm">{e.constituency}</p>
                  <div className="flex gap-4 text-xs text-slate-500 mt-1">
                    <span>Start: {new Date(e.startTime).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</span>
                    <span>Votes: <span className="text-indigo-400 font-medium">{e.totalVotes}</span></span>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {e.status === "CREATED" && (
                    <button onClick={() => handleElectionStatus(e._id, "ACTIVE")}
                      className="px-3 py-2 bg-emerald-900/40 border border-emerald-500/40 text-emerald-300 text-xs rounded-lg">
                      ▶ Activate
                    </button>
                  )}
                  {e.status === "ACTIVE" && (
                    <>
                      <button onClick={() => handleElectionStatus(e._id, "PAUSED")}
                        className="px-3 py-2 bg-amber-900/40 border border-amber-500/40 text-amber-300 text-xs rounded-lg">
                        ⏸ Pause
                      </button>
                      <button onClick={() => handleElectionStatus(e._id, "CLOSED")}
                        className="px-3 py-2 bg-red-900/40 border border-red-500/40 text-red-300 text-xs rounded-lg">
                        ■ Close
                      </button>
                    </>
                  )}
                  {e.status === "PAUSED" && (
                    <button onClick={() => handleElectionStatus(e._id, "ACTIVE")}
                      className="px-3 py-2 bg-emerald-900/40 border border-emerald-500/40 text-emerald-300 text-xs rounded-lg">
                      ▶ Resume
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
