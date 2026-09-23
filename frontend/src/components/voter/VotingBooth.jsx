import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { useWallet } from "../../hooks/useWallet";
import { generateVoteCommitment, castVoteOnChain } from "../../utils/blockchain";
import api from "../../utils/api";

export default function VotingBooth({ election, onVoteSuccess }) {
  const { user } = useAuth();
  const { address, hasSBT, connect } = useWallet();
  const [candidates, setCandidates] = useState([]);
  const [selected, setSelected] = useState(null);
  const [step, setStep] = useState("select"); // select | confirm | casting | done
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [txHash, setTxHash] = useState("");
  const [hasVoted, setHasVoted] = useState(false);

  useEffect(() => {
    api.get(`/candidate/election/${election._id}`).then((r) => setCandidates(r.data.candidates));
    api.get(`/voter/has-voted/${election._id}`).then((r) => setHasVoted(r.data.hasVoted));
  }, [election._id]);

  const selectedCandidate = candidates.find((c) => c._id === selected);

  const handleVote = async () => {
    if (!selected) return;
    setStep("casting"); setLoading(true); setError("");
    try {
      // 1. Generate encrypted commitment off-chain
      const { commitment } = generateVoteCommitment(selectedCandidate.onChainCandidateId || 1);

      // 2. Cast on blockchain (MetaMask prompt)
      const { txHash: hash, blockNumber } = await castVoteOnChain(
        election.onChainElectionId, commitment
      );

      // 3. Record in backend DB
      await api.post("/voter/vote", {
        electionId: election._id,
        candidateId: selectedCandidate._id,
        voteCommitment: commitment,
        txHash: hash,
        blockNumber,
      });

      setTxHash(hash);
      setStep("done");
      onVoteSuccess?.();
    } catch (e) {
      setError(e.message || "Vote failed. Please try again.");
      setStep("confirm");
    } finally { setLoading(false); }
  };

  // Guards
  if (hasVoted) return (
    <div className="text-center py-12">
      <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
        <span className="text-3xl">✅</span>
      </div>
      <h3 className="text-white text-xl font-semibold mb-2">You've already voted</h3>
      <p className="text-slate-400 text-sm">Your vote has been recorded on the blockchain.</p>
    </div>
  );

  if (!address) return (
    <div className="text-center py-12 space-y-4">
      <span className="text-4xl">🦊</span>
      <h3 className="text-white text-xl font-semibold">Connect Your Wallet</h3>
      <p className="text-slate-400 text-sm">MetaMask required to cast your vote on-chain</p>
      <button onClick={connect} className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-medium">
        Connect MetaMask
      </button>
    </div>
  );

  if (!hasSBT) return (
    <div className="text-center py-12 space-y-4">
      <span className="text-4xl">🔐</span>
      <h3 className="text-white text-xl font-semibold">No Voter Identity Found</h3>
      <p className="text-slate-400 text-sm">Your wallet doesn't have an EthVote SBT. Please register first.</p>
    </div>
  );

  if (step === "done") return (
    <div className="text-center py-12 space-y-5">
      <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
        <span className="text-4xl">🗳️</span>
      </div>
      <h3 className="text-white text-2xl font-bold">Vote Cast Successfully!</h3>
      <p className="text-slate-400">Your encrypted vote is recorded on the blockchain.</p>
      <div className="bg-slate-800 rounded-xl p-4 text-left">
        <p className="text-slate-400 text-xs mb-1">Transaction Hash</p>
        <p className="text-emerald-400 font-mono text-xs break-all">{txHash}</p>
      </div>
      <p className="text-slate-500 text-xs">Your vote commitment is stored locally for self-verification.</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-white text-lg font-semibold">{election.title}</h3>
        <span className="text-xs text-emerald-400 bg-emerald-900/30 border border-emerald-500/30 px-3 py-1 rounded-full">LIVE</span>
      </div>
      <p className="text-slate-400 text-sm">{election.constituency} · Ends {new Date(election.endTime).toLocaleString("en-IN")}</p>

      {error && (
        <div className="bg-red-900/30 border border-red-500/40 text-red-300 text-sm px-4 py-3 rounded-xl">{error}</div>
      )}

      {/* Candidate selection */}
      {step === "select" && (
        <div className="space-y-3">
          <p className="text-slate-400 text-sm font-medium">Select your candidate:</p>
          {candidates.map((c) => (
            <button key={c._id} onClick={() => setSelected(c._id)}
              className={`w-full text-left rounded-xl p-4 border transition-all ${
                selected === c._id
                  ? "bg-indigo-900/40 border-indigo-500"
                  : "bg-slate-800 border-slate-600 hover:border-slate-400"
              }`}>
              <div className="flex items-center gap-4">
                {c.photo ? (
                  <img src={c.photo} alt={c.name} className="w-12 h-12 rounded-full object-cover" />
                ) : (
                  <div className="w-12 h-12 bg-slate-700 rounded-full flex items-center justify-center text-xl font-bold text-slate-300">
                    {c.name[0]}
                  </div>
                )}
                <div className="flex-1">
                  <p className="text-white font-semibold">{c.name}</p>
                  <p className="text-slate-400 text-sm">{c.partyName}</p>
                </div>
                {c.partySymbol && (
                  <img src={c.partySymbol} alt="symbol" className="w-10 h-10 object-contain" />
                )}
                {selected === c._id && (
                  <div className="w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center text-white text-xs">✓</div>
                )}
              </div>
            </button>
          ))}
          <button onClick={() => setStep("confirm")} disabled={!selected}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold py-3 rounded-xl mt-4 transition-colors">
            Proceed to Confirm →
          </button>
        </div>
      )}

      {/* Confirmation */}
      {step === "confirm" && selectedCandidate && (
        <div className="space-y-5">
          <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4">
            <p className="text-amber-300 text-sm font-medium mb-1">⚠️ Confirm Your Vote</p>
            <p className="text-slate-400 text-sm">This action cannot be undone. Your vote will be permanently recorded on the blockchain.</p>
          </div>
          <div className="bg-slate-800 rounded-xl p-5 border border-indigo-500/40">
            <p className="text-slate-400 text-xs mb-3 uppercase tracking-wider">You are voting for</p>
            <p className="text-white text-xl font-bold">{selectedCandidate.name}</p>
            <p className="text-indigo-400">{selectedCandidate.partyName}</p>
            <p className="text-slate-500 text-sm mt-2">{election.constituency}</p>
          </div>
          <div className="bg-slate-800/50 rounded-xl p-4 space-y-2">
            <p className="text-slate-400 text-xs">🔐 Your vote will be encrypted as a commitment hash before being sent to the blockchain.</p>
            <p className="text-slate-400 text-xs">🔗 MetaMask will prompt you to sign the transaction (gas fee required).</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep("select")} className="flex-1 bg-slate-800 border border-slate-600 text-slate-300 py-3 rounded-xl">
              ← Change
            </button>
            <button onClick={handleVote} disabled={loading}
              className="flex-2 flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors">
              Cast Vote 🗳️
            </button>
          </div>
        </div>
      )}

      {/* Casting animation */}
      {step === "casting" && (
        <div className="text-center py-12 space-y-5">
          <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-white font-medium">Casting vote on blockchain…</p>
          <p className="text-slate-400 text-sm">Please confirm the transaction in MetaMask</p>
        </div>
      )}
    </div>
  );
}