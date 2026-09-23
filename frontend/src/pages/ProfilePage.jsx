import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../utils/api";
import { useWallet } from "../hooks/useWallet";

export default function ProfilePage() {
  const { user } = useAuth();
  const { address, hasSBT, connect } = useWallet();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/voter/profile").then((r) => setProfile(r.data)).finally(() => setLoading(false));
  }, []);

  const statusColors = {
    APPROVED: "bg-emerald-900/40 text-emerald-300 border-emerald-500/30",
    PENDING: "bg-amber-900/40 text-amber-300 border-amber-500/30",
    REJECTED: "bg-red-900/40 text-red-300 border-red-500/30",
  };

  if (loading) return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>;

  const u = profile?.user || user;

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 space-y-6">
      {/* Profile card */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 bg-indigo-600 rounded-full flex items-center justify-center text-2xl font-black text-white flex-shrink-0">
            {u?.name?.[0]}
          </div>
          <div className="flex-1">
            <h2 className="text-white text-xl font-bold">{u?.name}</h2>
            <p className="text-slate-400 text-sm">{u?.mobileNumber}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <span className={`text-xs px-2 py-0.5 rounded-full border ${statusColors[u?.verificationStatus]}`}>
                {u?.verificationStatus}
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full border border-slate-600 text-slate-400">
                {u?.registrationPath === "PATH_A_EXISTING" ? "⚡ Path A" : "📋 Path B"}
              </span>
              {u?.role === "admin" && <span className="text-xs px-2 py-0.5 rounded-full border border-indigo-500/40 text-indigo-300">Admin</span>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-5 pt-5 border-t border-slate-700">
          {[
            { label: "Full Name", value: u?.name },
            { label: "Age", value: u?.age },
            { label: "EPIC No.", value: u?.epicNumber || "—" },
            { label: "Constituency", value: u?.constituency || "—" },
            { label: "District", value: u?.district || "—" },
            { label: "Sub-district", value: u?.subDistrict || "—" },
            { label: "State", value: u?.state || "—" },
            { label: "Pincode", value: u?.pincode || "—" },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-slate-500 text-xs">{label}</p>
              <p className="text-white text-sm font-medium mt-0.5">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Blockchain / SBT status */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6">
        <h3 className="text-white font-semibold mb-4">Blockchain Identity</h3>
        {address ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between bg-slate-700 rounded-xl px-4 py-3">
              <span className="text-slate-400 text-sm">Wallet</span>
              <span className="text-white font-mono text-xs">{address.slice(0, 10)}…{address.slice(-6)}</span>
            </div>
            <div className="flex items-center justify-between bg-slate-700 rounded-xl px-4 py-3">
              <span className="text-slate-400 text-sm">Voter SBT</span>
              <span className={`text-sm font-medium ${hasSBT ? "text-emerald-400" : "text-red-400"}`}>
                {hasSBT ? "✓ Active" : "✗ Not Found"}
              </span>
            </div>
            {u?.sbtTokenId && (
              <div className="flex items-center justify-between bg-slate-700 rounded-xl px-4 py-3">
                <span className="text-slate-400 text-sm">Token ID</span>
                <span className="text-indigo-400 font-mono text-sm">#{u.sbtTokenId}</span>
              </div>
            )}
            {u?.sbtTxHash && (
              <div className="bg-slate-700 rounded-xl px-4 py-3">
                <p className="text-slate-400 text-xs mb-1">Mint Transaction</p>
                <p className="text-indigo-400 font-mono text-xs break-all">{u.sbtTxHash}</p>
              </div>
            )}
          </div>
        ) : (
          <button onClick={connect} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl font-medium">
            🦊 Connect MetaMask
          </button>
        )}
      </div>

      {/* Voting history */}
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6">
        <h3 className="text-white font-semibold mb-4">Voting History</h3>
        {profile?.votingHistory?.length === 0 ? (
          <p className="text-slate-500 text-sm">No votes cast yet</p>
        ) : (
          <div className="space-y-3">
            {profile?.votingHistory?.map((v) => (
              <div key={v._id} className="flex items-center justify-between bg-slate-700 rounded-xl px-4 py-3">
                <div>
                  <p className="text-white text-sm font-medium">{v.election?.title}</p>
                  <p className="text-slate-400 text-xs">{new Date(v.votedAt).toLocaleDateString("en-IN")}</p>
                </div>
                <span className="text-emerald-400 text-xs font-medium">✓ Voted</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
