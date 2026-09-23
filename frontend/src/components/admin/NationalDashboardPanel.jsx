import { useEffect, useState } from "react";
import api from "../../utils/api";
import { useAuth } from "../../context/AuthContext";

const FORCE_END_ALLOWED_STATUSES = new Set(["CREATED", "ACTIVE", "PAUSED"]);

export default function NationalDashboardPanel() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "superadmin";
  const [data, setData] = useState(null);
  const [pendingCandidates, setPendingCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [actionLoading, setActionLoading] = useState({});
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3200);
  };

  const loadDashboard = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      let dashboardRes;
      try {
        dashboardRes = await api.get("/admin/national/dashboard");
      } catch (primaryErr) {
        if (primaryErr?.response?.status === 404) {
          dashboardRes = await api.get("/admin/national");
        } else {
          throw primaryErr;
        }
      }
      const candidatesRes = await api.get("/candidate/pending");
      setData(dashboardRes.data);
      setPendingCandidates(candidatesRes.data?.candidates || []);
      setErrorMsg("");
    } catch (error) {
      console.error("Failed to load national dashboard", error);
      setErrorMsg(error?.response?.data?.error || "Unable to load national dashboard.");
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

  if (loading) return <div className="text-slate-400 text-sm">Loading national dashboard...</div>;
  if (!data) return <div className="text-red-300 text-sm">{errorMsg || "Unable to load national dashboard."}</div>;

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

      <h3 className="text-white text-lg font-semibold">National Dashboard (Lok Sabha)</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="States Covered" value={data.votersByState?.length || 0} />
        <StatCard label="Total Admins" value={data.totalAdmins || 0} />
        <StatCard label="Lok Sabha Elections" value={data.lokSabhaElections?.length || 0} />
        <StatCard label="Pending PM Candidates" value={pendingCandidates.length} />
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-slate-300 text-sm">Prime Minister Candidate Approvals</p>
          <span className="text-slate-500 text-xs">Super Admin queue</span>
        </div>

        {!isSuperAdmin ? (
          <p className="text-slate-500 text-sm">
            Prime Minister approvals are available only to Super Admin.
          </p>
        ) : pendingCandidates.length === 0 ? (
          <p className="text-slate-500 text-sm">No pending Prime Minister applications.</p>
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
                    {(candidate.election?.title || "Election")} - {candidate.constituency || "National"}
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
        <p className="text-slate-300 text-sm mb-3">Top States by Voter Volume</p>
        <div className="space-y-2">
          {(data.votersByState || []).slice(0, 10).map((row) => (
            <div key={row._id} className="flex justify-between text-sm">
              <span className="text-white">{row._id}</span>
              <span className="text-slate-400">
                {row.totalVoters} voters - {row.pendingVoters} pending
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-slate-300 text-sm">Manage Lok Sabha Elections</p>
          <span className="text-slate-500 text-xs">Force end available for CREATED/ACTIVE/PAUSED</span>
        </div>

        {(data.lokSabhaElections || []).length === 0 ? (
          <p className="text-slate-500 text-sm">No Lok Sabha elections found.</p>
        ) : (
          <div className="space-y-2">
            {(data.lokSabhaElections || []).map((election) => (
              <div
                key={election._id}
                className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between bg-slate-900/50 border border-slate-700 rounded-lg p-3"
              >
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium truncate">{election.title}</p>
                  <p className="text-slate-400 text-xs">
                    {(election.state || "National")} - {election.status} - {election.totalVotes || 0} votes
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