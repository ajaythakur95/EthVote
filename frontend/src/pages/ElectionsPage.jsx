import { Link } from "react-router-dom";
import { useElections } from "../hooks/useElection";

const statusStyles = {
  ACTIVE: "bg-emerald-900/40 text-emerald-300 border-emerald-500/30",
  CREATED: "bg-slate-700 text-slate-300 border-slate-600",
  PAUSED: "bg-amber-900/40 text-amber-300 border-amber-500/30",
  CLOSED: "bg-red-900/40 text-red-300 border-red-500/30",
  FINALIZED: "bg-purple-900/40 text-purple-300 border-purple-500/30",
  COMPLETED: "bg-purple-900/40 text-purple-300 border-purple-500/30",
};

export default function ElectionsPage() {
  const { elections, loading, error } = useElections();

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return <div className="text-center py-20 text-red-400">{error}</div>;
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <h1 className="text-white text-3xl font-black mb-2">Elections</h1>
      <p className="text-slate-400 mb-8">All elections on the EthVote platform</p>
      {elections.length === 0 ? (
        <div className="text-center py-20 text-slate-500">No elections found</div>
      ) : (
        <div className="space-y-4">
          {elections.map((e) => (
            <Link
              key={e._id}
              to={`/elections/${e._id}`}
              className="block bg-slate-800 border border-slate-700 hover:border-slate-500 rounded-2xl p-6 transition-all group"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <h2 className="text-white font-bold text-lg group-hover:text-indigo-300 transition-colors">
                      {e.title}
                    </h2>
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${statusStyles[e.status]}`}>
                      {e.status}
                    </span>
                  </div>
                  <p className="text-slate-400 text-sm mb-3 line-clamp-2">{e.description}</p>
                  <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                    <span>{e.constituency}</span>
                    <span>{new Date(e.startTime).toLocaleDateString("en-IN")}</span>
                    {e.status === "ACTIVE" || e.status === "FINALIZED" || e.status === "COMPLETED"
                      ? <span>{e.totalVotes} votes cast</span>
                      : null}
                  </div>
                </div>
                <span className="text-slate-500 group-hover:text-white transition-colors text-xl">-</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}