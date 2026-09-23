import { useState, useEffect } from "react";
import api from "../../utils/api";

/**
 * ResultsPublisher — Admin tool to enter and publish election results
 * After off-chain tally verification, admin enters final vote counts
 * and publishes them to MongoDB + Blockchain
 */
export default function ResultsPublisher({ electionId, onPublished }) {
  const [candidates, setCandidates] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!electionId) return;
    api.get(`/candidate/election/${electionId}`)
      .then((r) => {
        const approved = r.data.candidates.filter((c) => c.status === "APPROVED");
        setCandidates(approved);
        const initial = {};
        approved.forEach((c) => { initial[c._id] = ""; });
        setCounts(initial);
      })
      .finally(() => setFetching(false));
  }, [electionId]);

  const total = Object.values(counts).reduce((s, v) => s + (parseInt(v) || 0), 0);

  const handlePublish = async () => {
    const hasEmpty = Object.values(counts).some((v) => v === "" || isNaN(parseInt(v)));
    if (hasEmpty) { setError("Enter vote counts for all candidates"); return; }
    if (total === 0) { setError("Total votes cannot be zero"); return; }

    setLoading(true); setError("");
    try {
      const candidateResults = candidates.map((c) => ({
        candidateId: c._id,
        voteCount: parseInt(counts[c._id]),
      }));
      await api.post(`/election/${electionId}/results`, { candidateResults });
      setSuccess(true);
      onPublished?.();
    } catch (e) {
      setError(e.response?.data?.error || "Failed to publish results");
    } finally { setLoading(false); }
  };

  if (fetching) return <div className="text-slate-400 text-sm">Loading candidates…</div>;
  if (candidates.length === 0) return <div className="text-slate-500 text-sm">No approved candidates found for this election.</div>;

  const winner = candidates.reduce((best, c) => {
    const count = parseInt(counts[c._id]) || 0;
    const bestCount = parseInt(counts[best?._id]) || 0;
    return count > bestCount ? c : best;
  }, candidates[0]);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-white font-semibold text-lg mb-1">Publish Election Results</h3>
        <p className="text-slate-400 text-sm">Enter verified vote counts. This action is final and will update the blockchain.</p>
      </div>

      {error && <div className="bg-red-900/30 border border-red-500/40 text-red-300 text-sm px-4 py-3 rounded-xl">{error}</div>}
      {success && <div className="bg-emerald-900/30 border border-emerald-500/40 text-emerald-300 text-sm px-4 py-3 rounded-xl">✓ Results published successfully!</div>}

      <div className="space-y-3">
        {candidates.map((c) => {
          const count = parseInt(counts[c._id]) || 0;
          const pct = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
          const isLeading = c._id === winner?._id && count > 0;
          return (
            <div key={c._id} className={`bg-slate-800 rounded-xl p-4 border ${isLeading ? "border-emerald-500/40" : "border-slate-700"}`}>
              <div className="flex items-center justify-between gap-4 mb-3">
                <div>
                  <p className="text-white font-medium">{c.name} {isLeading && "🏆"}</p>
                  <p className="text-slate-400 text-sm">{c.partyName}</p>
                </div>
                <input type="number" min="0" value={counts[c._id]}
                  onChange={(e) => setCounts((p) => ({ ...p, [c._id]: e.target.value }))}
                  placeholder="0"
                  className="w-28 bg-slate-700 border border-slate-600 text-white rounded-lg px-3 py-2 text-right focus:outline-none focus:border-indigo-500 font-mono" />
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-slate-700 rounded-full h-2">
                  <div className={`h-2 rounded-full transition-all ${isLeading ? "bg-emerald-500" : "bg-indigo-500"}`}
                    style={{ width: `${pct}%` }} />
                </div>
                <span className="text-slate-400 text-xs w-12 text-right">{pct}%</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-slate-800 rounded-xl px-4 py-3 flex justify-between text-sm border border-slate-700">
        <span className="text-slate-400">Total votes</span>
        <span className="text-white font-bold">{total.toLocaleString("en-IN")}</span>
      </div>

      <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl px-4 py-3 text-amber-300 text-sm">
        ⚠️ Publishing results is irreversible. Verify all counts before proceeding.
      </div>

      <button onClick={handlePublish} disabled={loading || success}
        className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors">
        {loading ? "Publishing to Blockchain…" : "Publish Final Results"}
      </button>
    </div>
  );
}