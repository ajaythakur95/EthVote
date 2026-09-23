import { useParams } from "react-router-dom";
import { useElection } from "../hooks/useElection";
import { useAuth } from "../context/AuthContext";
import VotingBooth from "../components/voter/VotingBooth";

export default function ElectionDetailPage() {
  const { id } = useParams();
  const { election, loading, error } = useElection(id);
  const { user } = useAuth();

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (error || !election) return <div className="text-center py-20 text-red-400">{error || "Election not found"}</div>;

  const canVote = election.status === "ACTIVE" && user && user.verificationStatus === "APPROVED";

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <div className="mb-8">
        <h1 className="text-white text-3xl font-black mb-2">{election.title}</h1>
        <p className="text-slate-400">{election.description}</p>
        <div className="flex flex-wrap gap-4 text-sm text-slate-400 mt-3">
          <span>📍 {election.constituency}</span>
          <span>📅 {new Date(election.startTime).toLocaleDateString("en-IN")} – {new Date(election.endTime).toLocaleDateString("en-IN")}</span>
          <span>🗳️ {election.totalVotes} votes</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          {canVote ? (
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6">
              <VotingBooth election={election} />
            </div>
          ) : ["FINALIZED", "COMPLETED"].includes(election.status) ? (
            <div className="space-y-4">
              <h2 className="text-white text-xl font-bold">Results</h2>
              {election.candidates?.sort((a, b) => b.voteCount - a.voteCount).map((c, i) => (
                <div key={c._id} className={`bg-slate-800 rounded-xl p-4 border ${c.isWinner ? "border-emerald-500/50" : "border-slate-700"}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`text-xl font-black ${i === 0 ? "text-yellow-400" : "text-slate-500"}`}>#{i + 1}</span>
                      <div>
                        <p className="text-white font-semibold">{c.name} {c.isWinner && "🏆"}</p>
                        <p className="text-slate-400 text-sm">{c.partyName}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-white font-bold">{c.voteCount}</p>
                      <p className="text-slate-400 text-xs">{c.votePercentage}%</p>
                    </div>
                  </div>
                  <div className="mt-3 bg-slate-700 rounded-full h-2">
                    <div className={`h-2 rounded-full ${c.isWinner ? "bg-emerald-500" : "bg-indigo-500"}`}
                      style={{ width: `${c.votePercentage}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 text-center text-slate-400">
              {election.status === "CREATED" && "Election hasn't started yet. Check back soon."}
              {election.status === "PAUSED" && "Voting is temporarily paused."}
              {election.status === "CLOSED" && "Voting has ended. Results pending."}
              {!user && <div className="mt-4"><a href="/login" className="text-indigo-400 underline">Login to vote</a></div>}
            </div>
          )}
        </div>

        {/* Candidates sidebar */}
        <div className="space-y-3">
          <h3 className="text-white font-semibold">Candidates ({election.candidates?.length || 0})</h3>
          {election.candidates?.map((c) => (
            <div key={c._id} className="bg-slate-800 border border-slate-700 rounded-xl p-3 flex items-center gap-3">
              {c.photo ? (
                <img src={c.photo} alt={c.name} className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 bg-slate-700 rounded-full flex items-center justify-center text-slate-300 font-bold">
                  {c.name[0]}
                </div>
              )}
              <div>
                <p className="text-white text-sm font-medium">{c.name}</p>
                <p className="text-slate-400 text-xs">{c.partyName}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}