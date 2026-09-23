import { useEffect, useState } from "react";
import api from "../../utils/api";

const FORCE_END_ALLOWED_STATUSES = new Set(["CREATED", "ACTIVE", "PAUSED"]);

export default function StateDashboardPanel() {
  const [data, setData] = useState(null);
  const [pendingCandidates, setPendingCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  };

  const loadDashboard = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [dashboardRes, candidatesRes] = await Promise.all([
        api.get("/admin/state/dashboard"),
        api.get("/candidate/pending"),
      ]);
      setData(dashboardRes.data);
      setPendingCandidates(candidatesRes.data?.candidates || []);
    } catch (error) {
      console.error("Failed to load state dashboard", error);
      setPendingCandidates([]);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const handleForceEnd = async (election) => {
    if (!FORCE_END_ALLOWED_STATUSES.has(election?.status)) {
      showToast("Only CREATED, ACTIVE, or PAUSED elections can be force-ended.", "error");
      return;
    }

    const confirmed = window.confirm(
      `Force end "${election.title}" now?\nThis will immediately set status to CLOSED.`
    );
    if (!confirmed) return;

    setActionLoading((p) => ({ ...p, [election._id]: true }));
    try {
      await api.patch(`/election/${election._id}/status`, { status: "CLOSED" });
      showToast(`Election "${election.title}" force-ended.`);
      await loadDashboard(true);
    } catch (error) {
      showToast(error?.response?.data?.error || "Force end failed.", "error");
    } finally {
      setActionLoading((p) => ({ ...p, [election._id]: false }));
    }
  };

  const handleCandidateAction = async (candidateId, action) => {
    setActionLoading((p) => ({ ...p, [`candidate_${candidateId}`]: true }));
    try {
      if (action === "approve") {
        await api.patch(`/admin/verify-candidate/${candidateId}`, { action: "Verified" });
      } else {
        await api.patch(`/admin/verify-candidate/${candidateId}`, {
          action: "Rejected",
          rejectionReason: "Does not meet candidate eligibility",
        });
      }
      showToast(`Candidate ${action}d successfully.`);
      await loadDashboard(true);
    } catch (error) {
      showToast(error?.response?.data?.error || "Candidate action failed.", "error");
    } finally {
      setActionLoading((p) => ({ ...p, [`candidate_${candidateId}`]: false }));
    }
  };

  if (loading) return <div className="text-slate-400 text-sm">Loading state dashboard...</div>;
  if (!data) return <div className="text-red-300 text-sm">Unable to load state dashboard.</div>;

  return (
    <div className="space-y-4">
      {toast && (
        <div
          className={`fixed top-20 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-xl ${
            toast.type === "error"
              ? "bg-red-900 text-red-200 border border-red-500/40"
              : "bg-emerald-900 text-emerald-200 border border-emerald-500/40"
          }`}
        >
          {toast.msg}
        </div>
      )}

      <h3 className="text-white text-lg font-semibold">State Dashboard ({data.state})</h3>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Voters" value={data.voters?.total || 0} />
        <StatCard label="Pending Voters" value={data.voters?.pending || 0} />
        <StatCard label="Pending Candidates" value={pendingCandidates.length} />
        <StatCard label="State Elections" value={data.elections?.length || 0} />
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-slate-300 text-sm">Chief Minister Candidate Approvals</p>
          <span className="text-slate-500 text-xs">State scoped pending queue</span>
        </div>

        {pendingCandidates.length === 0 ? (
          <p className="text-slate-500 text-sm">No pending Chief Minister applications in your state.</p>
        ) : (
          <div className="space-y-2">
            {pendingCandidates.map((candidate) => (
              <div
                key={candidate._id}
                className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between bg-slate-900/50 border border-slate-700 rounded-lg p-3"
              >
                <div className="min-w-0">
                  <p className="text-white text-sm font-semibold truncate">{candidate.name}</p>
                  <p className="text-indigo-300 text-xs">
                    {candidate.partyName || "Independent"} - {candidate.candidacyType || candidate.candidateRole}
                  </p>
                  <p className="text-slate-400 text-xs">
                    {(candidate.election?.title || "Election")} - {candidate.state || data.state}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleCandidateAction(candidate._id, "reject")}
                    disabled={actionLoading[`candidate_${candidate._id}`]}
                    className="px-3 py-1.5 bg-red-900/40 border border-red-500/40 text-red-300 text-xs rounded-lg disabled:opacity-50"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => handleCandidateAction(candidate._id, "approve")}
                    disabled={actionLoading[`candidate_${candidate._id}`]}
                    className="px-3 py-1.5 bg-emerald-900/40 border border-emerald-500/40 text-emerald-300 text-xs rounded-lg disabled:opacity-50"
                  >
                    {actionLoading[`candidate_${candidate._id}`] ? "Processing..." : "Approve"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-slate-300 text-sm">Manage State Elections</p>
          <span className="text-slate-500 text-xs">Force end available for CREATED/ACTIVE/PAUSED</span>
        </div>

        {(data.elections || []).length === 0 ? (
          <p className="text-slate-500 text-sm">No elections found in this state.</p>
        ) : (
          <div className="space-y-2">
            {(data.elections || []).slice(0, 20).map((election) => (
              <div
                key={election._id}
                className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between bg-slate-900/50 border border-slate-700 rounded-lg p-3"
              >
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium truncate">{election.title}</p>
                  <p className="text-slate-400 text-xs">
                    {election.constituency} - {election.status} - {election.totalVotes || 0} votes
                  </p>
                </div>
                <button
                  onClick={() => handleForceEnd(election)}
                  disabled={
                    actionLoading[election._id] || !FORCE_END_ALLOWED_STATUSES.has(election.status)
                  }
                  className="px-3 py-1.5 bg-red-900/40 border border-red-500/40 text-red-300 text-xs rounded-lg disabled:opacity-50"
                >
                  {actionLoading[election._id] ? "Ending..." : "Force End"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <p className="text-slate-400 text-xs">{label}</p>
      <p className="text-white text-2xl font-bold">{value}</p>
    </div>
  );
}