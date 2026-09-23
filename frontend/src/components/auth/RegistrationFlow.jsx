import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../utils/api";
import { connectWallet } from "../../utils/blockchain";
import { DISTRICTS } from "../../constants/districts";

const STEP = {
  AADHAAR_UPLOAD: 1,
  VERIFYING:      2,
  PATH_SELECT:    3,
  PATH_A:         4,
  PATH_B:         5,
  SUCCESS:        6,
  ALREADY_REGISTERED: 7,
};

export default function RegistrationFlow({ onSuccess }) {
  const navigate = useNavigate();
  const [step, setStep]               = useState(STEP.AADHAAR_UPLOAD);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");
  const [sessionId, setSessionId]     = useState(null);
  const [aadhaarData, setAadhaarData] = useState(null);
  const [form, setForm]               = useState({ epicNumber: "", walletAddress: "", district: "" });
  const [files, setFiles]             = useState({});
  const [txResult, setTxResult]       = useState(null);
  const [aadhaarZip, setAadhaarZip]   = useState(null);
  const [shareCode, setShareCode]     = useState("");
  const [kycSessionToken, setKycSessionToken] = useState("");
  const pollRef = useRef(null);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const err = (e) => {
    setError(e?.response?.data?.error || e?.message || "Something went wrong");
    setLoading(false);
  };

  useEffect(() => () => clearInterval(pollRef.current), []);
  useEffect(() => {
    if (aadhaarData?.district) {
      setForm((prev) => ({ ...prev, district: prev.district || aadhaarData.district }));
    }
  }, [aadhaarData]);

  const handleAadhaarVerify = async () => {
    if (!aadhaarZip)          { setError("Aadhaar ZIP file select karo"); return; }
    if (shareCode.length < 4) { setError("Share Code 4 digit ka hona chahiye"); return; }
    setLoading(true); setError("");
    try {
      const fd = new FormData();
      fd.append("aadhaarZip", aadhaarZip);
      fd.append("shareCode", shareCode);
      const res = await api.post("/auth/aadhaar-offline/verify", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (res.data?.alreadyRegistered) {
        setAadhaarData({
          aadhaarHash: res.data.aadhaarHash,
          name: res.data.voter?.name,
          constituency: res.data.voter?.constituency,
        });
        setError("");
        setStep(STEP.ALREADY_REGISTERED);
        return;
      }
      setAadhaarData(res.data.voter);
      setSessionId("offline_" + Date.now());
      setKycSessionToken(res.data.kycSessionToken || "");
      setStep(STEP.PATH_SELECT);
    } catch (e) { err(e); } finally { setLoading(false); }
  };

  const handleConnectWallet = async () => {
    setLoading(true); setError("");
    try {
      const addr = await connectWallet();
      set("walletAddress", addr);
    } catch (e) { err(e); } finally { setLoading(false); }
  };

  const handlePathA = async () => {
    if (!form.epicNumber)    { setError("EPIC (Voter ID) number is required"); return; }
    if (!form.walletAddress) { setError("MetaMask wallet connect karna zaroori hai"); return; }
    if (!form.district) { setError("District select karna zaroori hai"); return; }
    if (!kycSessionToken) {
      setError("KYC session missing/expired. Aadhaar verify dobara karein.");
      return;
    }
    setLoading(true); setError("");
    try {
      const res = await api.post("/auth/register/path-a", {
        kycSessionToken,
        aadhaarHash:    aadhaarData.aadhaarHash,
        blockchainHash: aadhaarData.blockchainHash,
        name:           aadhaarData.name,
        dob:            aadhaarData.dob,
        gender:         aadhaarData.gender,
        address:        aadhaarData.address,
        district:       form.district,
        subdist:        aadhaarData.subdist || "",
        pc:             aadhaarData.pc || "",
        state:          aadhaarData.state,
        constituency:   aadhaarData.constituency,
        epicNumber:     form.epicNumber,
        walletAddress:  form.walletAddress,
      });
      setTxResult({ token: res.data.token, user: res.data.user });
      setStep(STEP.SUCCESS);
      onSuccess?.(res.data.token, res.data.user);
    } catch (e) { err(e); } finally { setLoading(false); }
  };

  const handlePathB = async () => {
    if (!files.aadhaarFront || !files.aadhaarBack) {
      setError("Aadhaar front aur back dono upload karein"); return;
    }
    if (!form.district) {
      setError("District select karna zaroori hai"); return;
    }
    if (!form.walletAddress) {
      setError("MetaMask wallet connect karna zaroori hai — SBT mint ke liye"); return;
    }
    setLoading(true); setError("");
    try {
      const fd = new FormData();
      fd.append("aadhaarHash",   aadhaarData.aadhaarHash);
      fd.append("session_id",    sessionId);
      fd.append("name",          aadhaarData.name);
      fd.append("dob",           aadhaarData.dob);
      fd.append("gender",        aadhaarData.gender || "");
      fd.append("address",       aadhaarData.address || "");
      fd.append("district",      form.district);
      fd.append("subdist",       aadhaarData.subdist || "");
      fd.append("pc",            aadhaarData.pc || "");
      fd.append("state",         aadhaarData.state || "");
      fd.append("constituency",  aadhaarData.constituency || "");
      fd.append("walletAddress", form.walletAddress);
      if (files.aadhaarFront) fd.append("aadhaarFront", files.aadhaarFront);
      if (files.aadhaarBack)  fd.append("aadhaarBack",  files.aadhaarBack);
      if (files.photo)        fd.append("photo",        files.photo);
      await api.post("/auth/register/path-b", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setStep(STEP.SUCCESS);
    } catch (e) { err(e); } finally { setLoading(false); }
  };

  return (
    <div className="max-w-lg mx-auto">
      {/* Progress bar */}
      <div className="flex items-center justify-between mb-8">
        {["Aadhaar", "Verify", "Path", "Register"].map((label, i) => {
          const active  = step > i + 1;
          const current = step === i + 1
            || (step >= STEP.PATH_SELECT && i === 2)
            || (step >= STEP.PATH_A && i === 3);
          return (
            <div key={label} className="flex items-center gap-2 flex-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0
                ${active ? "bg-emerald-500 text-white" : current ? "bg-indigo-600 text-white" : "bg-slate-700 text-slate-400"}`}>
                {active ? "✓" : i + 1}
              </div>
              <span className={`text-xs hidden sm:block ${current ? "text-white" : "text-slate-500"}`}>{label}</span>
              {i < 3 && <div className={`flex-1 h-px mx-2 ${active ? "bg-emerald-500" : "bg-slate-700"}`} />}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-500/40 text-red-300 text-sm px-4 py-3 rounded-xl mb-5">
          {error}
        </div>
      )}

      {/* STEP 1: Aadhaar ZIP Upload */}
      {step === STEP.AADHAAR_UPLOAD && (
        <div className="space-y-5">
          <div>
            <h2 className="text-white text-xl font-semibold mb-1">Verify Your Identity</h2>
            <p className="text-slate-400 text-sm">Aadhaar Offline KYC ZIP file upload karein — bilkul free & secure</p>
          </div>
          <div className="bg-slate-800 border border-slate-600 rounded-xl p-4 space-y-2">
            <p className="text-slate-300 text-sm font-medium">ZIP file kaise milegi?</p>
            <div className="text-slate-400 text-xs space-y-1">
              <p>1️⃣ &nbsp;<a href="https://myaadhaar.uidai.gov.in" target="_blank" rel="noreferrer" className="text-indigo-400 underline">myaadhaar.uidai.gov.in</a> pe jao</p>
              <p>2️⃣ &nbsp;<strong className="text-slate-300">Offline KYC</strong> → <strong className="text-slate-300">Download XML</strong> click karo</p>
              <p>3️⃣ &nbsp;Share Code (4 digit) banao aur ZIP download karo</p>
              <p>4️⃣ &nbsp;Wahi ZIP aur Share Code yahan daalo</p>
            </div>
          </div>
          <div>
            <label className="text-slate-400 text-sm block mb-2">Aadhaar Offline ZIP File <span className="text-red-400">*</span></label>
            <input type="file" accept=".zip" onChange={(e) => setAadhaarZip(e.target.files[0])}
              className="w-full bg-slate-800 border border-slate-600 text-slate-300 rounded-xl px-4 py-2.5 text-sm file:mr-3 file:bg-indigo-600 file:text-white file:border-0 file:rounded-lg file:px-3 file:py-1 file:text-sm cursor-pointer" />
            {aadhaarZip && <p className="text-emerald-400 text-xs mt-1">✓ {aadhaarZip.name} selected</p>}
          </div>
          <div>
            <label className="text-slate-400 text-sm block mb-2">Share Code (4 digit) <span className="text-red-400">*</span></label>
            <input type="password" maxLength={4} placeholder="••••" value={shareCode}
              onChange={(e) => setShareCode(e.target.value.replace(/\D/, ""))}
              className="w-full bg-slate-800 border border-slate-600 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 font-mono text-center text-xl tracking-widest" />
          </div>
          <button onClick={handleAadhaarVerify} disabled={loading || !aadhaarZip || shareCode.length < 4}
            className="w-full flex items-center justify-center gap-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-4 rounded-xl transition-colors text-lg">
            <LockIcon />
            {loading ? "Verifying…" : "Verify Aadhaar →"}
          </button>
          <p className="text-xs text-slate-500 text-center">🔒 Aapka Aadhaar number plaintext mein store nahi hota</p>
        </div>
      )}

      {/* STEP 3: Path selection */}
      {step === STEP.PATH_SELECT && aadhaarData && (
        <div className="space-y-5">
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-600">
            <p className="text-emerald-400 text-sm font-medium mb-2">✓ Identity Verified via Aadhaar Offline KYC</p>
            <p className="text-white font-semibold">{aadhaarData.name}</p>
            <p className="text-slate-400 text-sm">Age: {aadhaarData.age} · DOB: {aadhaarData.dob} · Aadhaar: XXXX XXXX XXXX {aadhaarData.uidLast4}</p>
          </div>
          <h2 className="text-white text-xl font-semibold">Choose Registration Path</h2>
          <div className="grid gap-4">
            <button onClick={() => setStep(STEP.PATH_A)}
              className="text-left bg-indigo-900/30 border border-indigo-500/50 hover:border-indigo-400 rounded-xl p-4 transition-all">
              <div className="flex items-start gap-3">
                <span className="text-2xl">⚡</span>
                <div>
                  <p className="text-white font-semibold">Path A — Existing Voter</p>
                  <p className="text-slate-400 text-sm mt-1">EPIC (Voter ID) number daalein → <span className="text-emerald-400">Instant SBT minting</span></p>
                </div>
              </div>
            </button>
            <button onClick={() => setStep(STEP.PATH_B)}
              className="text-left bg-slate-800 border border-slate-600 hover:border-slate-400 rounded-xl p-4 transition-all">
              <div className="flex items-start gap-3">
                <span className="text-2xl">📋</span>
                <div>
                  <p className="text-white font-semibold">Path B — First-Time Voter</p>
                  <p className="text-slate-400 text-sm mt-1">Document upload → Admin review (2-3 working days)</p>
                </div>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* STEP 4A: Path A */}
      {step === STEP.PATH_A && (
        <div className="space-y-5">
          <h2 className="text-white text-xl font-semibold">Path A — Quick Registration</h2>
          <div>
            <label className="text-slate-400 text-sm block mb-2">EPIC / Voter ID Number <span className="text-red-400">*</span></label>
            <input type="text" placeholder="e.g. ABC1234567" value={form.epicNumber}
              onChange={(e) => set("epicNumber", e.target.value.toUpperCase())}
              className="w-full bg-slate-800 border border-slate-600 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 font-mono" />
          </div>
          <div>
            <label className="text-slate-400 text-sm block mb-2">MetaMask Wallet <span className="text-red-400">*</span></label>
            {form.walletAddress ? (
              <div className="bg-slate-800 border border-emerald-500/40 rounded-xl px-4 py-3 font-mono text-emerald-400 text-sm">{form.walletAddress}</div>
            ) : (
              <button onClick={handleConnectWallet} disabled={loading}
                className="w-full bg-slate-800 border border-slate-600 hover:border-indigo-500 text-slate-300 py-3 rounded-xl transition-colors">
                🦊 {loading ? "Connecting…" : "Connect MetaMask"}
              </button>
            )}
          </div>
          <div>
            <label className="text-slate-400 text-sm block mb-2">District <span className="text-red-400">*</span></label>
            <select
              value={form.district}
              onChange={(e) => set("district", e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
            >
              <option value="">Select district</option>
              {DISTRICTS.map((district) => (
                <option key={district} value={district}>{district}</option>
              ))}
            </select>
          </div>
          <button onClick={handlePathA} disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors">
            {loading ? "Registering & Minting SBT…" : "⚡ Register & Mint SBT Instantly"}
          </button>
          <button onClick={() => setStep(STEP.PATH_SELECT)} className="w-full text-slate-400 text-sm py-2">← Back</button>
        </div>
      )}

      {/* STEP 4B: Path B */}
      {step === STEP.PATH_B && (
        <div className="space-y-5">
          <h2 className="text-white text-xl font-semibold">Path B — Document Upload</h2>
          <p className="text-slate-400 text-sm">Documents aur MetaMask wallet dono zaroori hain</p>

          {aadhaarData?.name && (
            <div className="bg-slate-800 border border-emerald-600/30 rounded-xl px-4 py-3">
              <p className="text-emerald-400 text-xs font-medium mb-1">Aadhaar Offline KYC se prefilled ✓</p>
              <p className="text-white text-sm font-medium">{aadhaarData.name}</p>
              <p className="text-slate-400 text-xs">{aadhaarData.dob} · {aadhaarData.gender}</p>
            </div>
          )}
          <div>
            <label className="text-slate-400 text-sm block mb-2">District <span className="text-red-400">*</span></label>
            <select
              value={form.district}
              onChange={(e) => set("district", e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
            >
              <option value="">Select district</option>
              {DISTRICTS.map((district) => (
                <option key={district} value={district}>{district}</option>
              ))}
            </select>
          </div>

          {[
            { key: "aadhaarFront", label: "Aadhaar Front", required: true },
            { key: "aadhaarBack",  label: "Aadhaar Back",  required: true },
            { key: "photo",        label: "Passport Photo", required: false },
          ].map(({ key, label, required }) => (
            <div key={key}>
              <label className="text-slate-400 text-sm block mb-2">
                {label} {required && <span className="text-red-400">*</span>}
              </label>
              <input type="file" accept="image/*,.pdf"
                onChange={(e) => setFiles((p) => ({ ...p, [key]: e.target.files[0] }))}
                className="w-full bg-slate-800 border border-slate-600 text-slate-300 rounded-xl px-4 py-2.5 text-sm file:mr-3 file:bg-indigo-600 file:text-white file:border-0 file:rounded-lg file:px-3 file:py-1 file:text-sm cursor-pointer" />
            </div>
          ))}

          {/* Wallet — REQUIRED */}
          <div>
            <label className="text-slate-400 text-sm block mb-2">
              MetaMask Wallet <span className="text-red-400">*</span>
              <span className="text-slate-500 text-xs ml-1">(SBT mint ke liye zaroori)</span>
            </label>
            {form.walletAddress ? (
              <div className="bg-slate-800 border border-emerald-500/40 rounded-xl px-4 py-3 font-mono text-emerald-400 text-sm">{form.walletAddress}</div>
            ) : (
              <button onClick={handleConnectWallet}
                className="w-full bg-slate-800 border border-red-500/40 hover:border-indigo-500 text-slate-300 py-3 rounded-xl transition-colors text-sm">
                🦊 Connect MetaMask (Required)
              </button>
            )}
          </div>

          <button onClick={handlePathB}
            disabled={loading || !files.aadhaarFront || !files.aadhaarBack || !form.walletAddress}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors">
            {loading ? "Submitting…" : "Submit for Review"}
          </button>
          <button onClick={() => setStep(STEP.PATH_SELECT)} className="w-full text-slate-400 text-sm py-2">← Back</button>
        </div>
      )}

      {/* SUCCESS */}
      {step === STEP.SUCCESS && (
        <div className="text-center space-y-5 py-6">
          <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
            <span className="text-4xl">🎉</span>
          </div>
          <div>
            <h2 className="text-white text-2xl font-bold mb-2">{txResult ? "SBT Minted!" : "Submitted!"}</h2>
            <p className="text-slate-400">
              {txResult
                ? "Your Voter Identity SBT has been minted on the blockchain."
                : "Your registration is under review. You'll be notified within 2-3 working days."}
            </p>
          </div>
          {txResult?.user?.sbtTxHash && (
            <div className="bg-slate-800 rounded-xl p-4">
              <p className="text-slate-400 text-xs mb-1">Transaction Hash</p>
              <p className="text-emerald-400 font-mono text-xs break-all">{txResult.user.sbtTxHash}</p>
            </div>
          )}
        </div>
      )}

      {step === STEP.ALREADY_REGISTERED && (
        <div className="text-center space-y-5 py-6">
          <div className="w-20 h-20 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto">
            <span className="text-4xl">i</span>
          </div>
          <div>
            <h2 className="text-white text-2xl font-bold mb-2">Already Registered</h2>
            <p className="text-slate-400">
              Is Aadhaar se account pehle se bana hua hai. Kripya login karein.
            </p>
          </div>
          <button
            onClick={() => navigate("/login")}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            Go to Login
          </button>
          <button onClick={() => setStep(STEP.AADHAAR_UPLOAD)} className="w-full text-slate-400 text-sm py-2">
            Back to Verify
          </button>
        </div>
      )}
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}