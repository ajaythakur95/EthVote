import { useState, useEffect } from "react";
import { useWallet } from "../../hooks/useWallet";
import { getVoterIdentityContract } from "../../utils/blockchain";

export default function SBTViewer({ walletAddress }) {
  const { address } = useWallet();
  const target = walletAddress || address;
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!target) return;
    setLoading(true); setError("");
    const fetch = async () => {
      try {
        const contract = await getVoterIdentityContract();
        const tokenId = await contract.walletToTokenId(target);
        if (tokenId === 0n) {
          setError("No Voter Identity SBT found for this wallet");
          return;
        }
        const isActive = await contract.isVerifiedVoter(target);
        const isLocked = await contract.locked(tokenId);
        const uri = await contract.tokenURI(tokenId);
        setRecord({ tokenId: tokenId.toString(), isActive, isLocked, metadataURI: uri });
      } catch (e) {
        setError(e.message || "Failed to fetch SBT data");
      } finally { setLoading(false); }
    };
    fetch();
  }, [target]);

  if (!target) return (
    <div className="text-center py-8 text-slate-500">Connect wallet to view your SBT</div>
  );

  if (loading) return (
    <div className="flex justify-center py-8">
      <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error) return (
    <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4 text-red-300 text-sm">{error}</div>
  );

  if (!record) return null;

  return (
    <div className="bg-gradient-to-br from-indigo-900/40 to-slate-800 border border-indigo-500/30 rounded-2xl p-6 space-y-4">
      {/* SBT Card Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-2xl">🗳️</div>
          <div>
            <p className="text-white font-bold">Voter Identity SBT</p>
            <p className="text-indigo-400 text-sm font-mono">Token #{record.tokenId}</p>
          </div>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-medium border ${
          record.isActive
            ? "bg-emerald-900/40 text-emerald-300 border-emerald-500/30"
            : "bg-red-900/40 text-red-300 border-red-500/30"
        }`}>
          {record.isActive ? "ACTIVE" : "SUSPENDED"}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="bg-slate-800/60 rounded-xl px-4 py-3">
          <p className="text-slate-500 text-xs mb-1">Standard</p>
          <p className="text-white font-medium">EIP-5192 SBT</p>
        </div>
        <div className="bg-slate-800/60 rounded-xl px-4 py-3">
          <p className="text-slate-500 text-xs mb-1">Transferable</p>
          <p className="text-red-400 font-medium">🔒 Locked</p>
        </div>
        <div className="bg-slate-800/60 rounded-xl px-4 py-3 col-span-2">
          <p className="text-slate-500 text-xs mb-1">Wallet Address</p>
          <p className="text-white font-mono text-xs break-all">{target}</p>
        </div>
        {record.metadataURI && (
          <div className="bg-slate-800/60 rounded-xl px-4 py-3 col-span-2">
            <p className="text-slate-500 text-xs mb-1">Metadata URI</p>
            <p className="text-indigo-400 text-xs break-all">{record.metadataURI}</p>
          </div>
        )}
      </div>

      <div className="border-t border-slate-700 pt-3 text-xs text-slate-500 text-center">
        This token is non-transferable and permanently bound to your wallet
      </div>
    </div>
  );
}
