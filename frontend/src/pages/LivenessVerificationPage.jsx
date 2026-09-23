import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import LivenessVerification from "../components/auth/LivenessVerification";
import api from "../utils/api";

export default function LivenessVerificationPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { login } = useAuth();
  const livenessToken = location.state?.livenessToken;
  const aadhaarPhoto = location.state?.aadhaarPhoto;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mountKey, setMountKey] = useState(0);
  const finalizeLock = useRef(false);

  useEffect(() => {
    if (!livenessToken || !aadhaarPhoto) {
      navigate("/login", { replace: true });
    }
  }, [livenessToken, aadhaarPhoto, navigate]);

  const handlePassed = async () => {
    if (!livenessToken || busy || finalizeLock.current) return;
    finalizeLock.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await api.post("/auth/finalize-login", { livenessToken });
      login(res.data.token, res.data.user);
      navigate("/elections", { replace: true });
    } catch (e) {
      const msg = e.response?.data?.error || "Could not finalize login.";
      setError(msg);
      setBusy(false);
      finalizeLock.current = false;
      setMountKey((k) => k + 1);
    }
  };

  if (!livenessToken || !aadhaarPhoto) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg">
        {error && (
          <div className="mb-4 bg-red-900/30 border border-red-500/40 text-red-300 text-sm px-4 py-3 rounded-xl">
            {error}
            <button
              type="button"
              onClick={() => navigate("/login", { replace: true })}
              className="block mt-2 text-red-200 underline text-xs"
            >
              Return to login
            </button>
          </div>
        )}
        {busy && (
          <div className="mb-4 flex items-center gap-2 text-slate-400 text-sm justify-center">
            <span className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            Finalizing session…
          </div>
        )}
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-8">
          <LivenessVerification
            key={mountKey}
            onPassed={handlePassed}
            onCancel={() => navigate("/login", { replace: true })}
            challengeSeconds={10}
            referencePhoto={aadhaarPhoto}
          />
        </div>
      </div>
    </div>
  );
}