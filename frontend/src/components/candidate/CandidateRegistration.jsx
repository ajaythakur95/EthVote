import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import api from "../../utils/api";

const CANDIDACY_OPTIONS = [
  { value: "NORMAL_CANDIDATE", label: "Normal Candidate" },
  { value: "PRIME_MINISTER_CANDIDATE", label: "Prime Minister Candidate" },
  { value: "CHIEF_MINISTER_CANDIDATE", label: "Chief Minister Candidate" },
];

export default function CandidateRegistration() {
  const { user } = useAuth();
  const [elections, setElections] = useState([]);
  const [form, setForm] = useState({
    electionId: "",
    candidacyType: "NORMAL_CANDIDATE",
    partyName: "",
    manifestoText: "",
    qualification: "",
  });
  const [files, setFiles] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    api.get("/election?status=created").then((r) => setElections(r.data.elections));
  }, []);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.electionId || !form.partyName || !form.candidacyType) {
      setError("Election, candidacy type and party name are required");
      return;
    }
    setLoading(true); setError("");
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (files.partySymbol) fd.append("partySymbol", files.partySymbol);
      if (files.manifesto) fd.append("manifesto", files.manifesto);
      if (files.photo) fd.append("photo", files.photo);
      await api.post("/candidate/register", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setSuccess(true);
    } catch (e) { setError(e.response?.data?.error || "Registration failed"); }
    finally { setLoading(false); }
  };

  if (user?.verificationStatus !== "APPROVED") return (
    <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-6 text-center">
      <span className="text-3xl">🔐</span>
      <p className="text-amber-300 font-medium mt-3">Verified Voters Only</p>
      <p className="text-slate-400 text-sm mt-1">You must have an approved Voter Identity SBT to register as a candidate.</p>
    </div>
  );

  if (success) return (
    <div className="text-center py-12 space-y-4">
      <span className="text-5xl">📋</span>
      <h3 className="text-white text-xl font-bold">Candidacy Submitted!</h3>
      <p className="text-slate-400">Your registration is pending admin review. You'll be added to the ballot upon approval.</p>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-lg">
      <div>
        <h2 className="text-white text-xl font-semibold mb-1">Register as Candidate</h2>
        <p className="text-slate-400 text-sm">All registrations require admin approval before appearing on the ballot.</p>
      </div>

      {error && <div className="bg-red-900/30 border border-red-500/40 text-red-300 text-sm px-4 py-3 rounded-xl">{error}</div>}

      <div>
        <label className="text-slate-400 text-sm block mb-2">Select Election *</label>
        <select value={form.electionId} onChange={(e) => set("electionId", e.target.value)} required
          className="w-full bg-slate-800 border border-slate-600 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500">
          <option value="">Choose an election…</option>
          {elections.map((e) => (
            <option key={e._id} value={e._id}>{e.title} — {e.constituency}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-slate-400 text-sm block mb-2">Candidacy Type *</label>
        <select
          value={form.candidacyType}
          onChange={(e) => set("candidacyType", e.target.value)}
          required
          className="w-full bg-slate-800 border border-slate-600 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
        >
          {CANDIDACY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-slate-400 text-sm block mb-2">Party Name *</label>
        <input type="text" value={form.partyName} onChange={(e) => set("partyName", e.target.value)} required placeholder="e.g. Indian National Congress"
          className="w-full bg-slate-800 border border-slate-600 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500" />
      </div>

      <div>
        <label className="text-slate-400 text-sm block mb-2">Qualification</label>
        <input type="text" value={form.qualification} onChange={(e) => set("qualification", e.target.value)} placeholder="e.g. B.Tech, MBA"
          className="w-full bg-slate-800 border border-slate-600 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500" />
      </div>

      <div>
        <label className="text-slate-400 text-sm block mb-2">Manifesto (brief) — max 5000 chars</label>
        <textarea rows={5} value={form.manifestoText} onChange={(e) => set("manifestoText", e.target.value)} maxLength={5000}
          placeholder="Your key promises and agenda…"
          className="w-full bg-slate-800 border border-slate-600 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 resize-none" />
        <p className="text-slate-500 text-xs text-right mt-1">{form.manifestoText.length}/5000</p>
      </div>

      {[
        { key: "partySymbol", label: "Party Symbol (Image)" },
        { key: "manifesto", label: "Full Manifesto (PDF)" },
        { key: "photo", label: "Candidate Photo" },
      ].map(({ key, label }) => (
        <div key={key}>
          <label className="text-slate-400 text-sm block mb-2">{label}</label>
          <input type="file" accept={key === "manifesto" ? ".pdf" : "image/*"}
            onChange={(e) => setFiles((p) => ({ ...p, [key]: e.target.files[0] }))}
            className="w-full bg-slate-800 border border-slate-600 text-slate-300 rounded-xl px-4 py-2.5 text-sm file:mr-3 file:bg-indigo-600 file:text-white file:border-0 file:rounded-lg file:px-3 file:py-1 cursor-pointer" />
        </div>
      ))}

      <button type="submit" disabled={loading}
        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors">
        {loading ? "Submitting…" : "Submit Candidacy"}
      </button>
    </form>
  );
}