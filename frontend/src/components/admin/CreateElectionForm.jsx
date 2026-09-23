﻿﻿﻿﻿﻿import { useEffect, useMemo, useState } from "react";
import api from "../../utils/api";
import { useAuth } from "../../context/AuthContext";

const NATIONAL_ELECTION_TYPES = [
  { value: "GENERAL", label: "Lok Sabha" },
];

const STATE_ELECTION_TYPES = [
  { value: "STATE_ASSEMBLY", label: "Vidhan Sabha" },
  { value: "BY_ELECTION", label: "By-Election" },
];

function buildDefaultForm(hierarchyRole, assignedState) {
  if (hierarchyRole === "National") {
    return {
      title: "",
      description: "",
      constituency: "NATIONAL",
      state: "",
      electionType: "GENERAL",
      startTime: "",
      endTime: "",
    };
  }

  if (hierarchyRole === "State") {
    return {
      title: "",
      description: "",
      constituency: "NATIONAL",
      state: assignedState || "",
      electionType: "STATE_ASSEMBLY",
      startTime: "",
      endTime: "",
    };
  }

  return {
    title: "",
    description: "",
    constituency: "",
    state: "",
    electionType: "",
    startTime: "",
    endTime: "",
  };
}

export default function CreateElectionForm({ onCreated }) {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "superadmin";
  const hierarchyRole = user?.adminRole || (isSuperAdmin ? "National" : "District");

  const electionTypes = useMemo(() => {
    if (hierarchyRole === "National") return NATIONAL_ELECTION_TYPES;
    if (hierarchyRole === "State") return STATE_ELECTION_TYPES;
    return [];
  }, [hierarchyRole]);

  const [form, setForm] = useState(() =>
    buildDefaultForm(hierarchyRole, user?.assignedState || "")
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setForm(buildDefaultForm(hierarchyRole, user?.assignedState || ""));
  }, [hierarchyRole, user?.assignedState]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const isNationalLokSabhaElection =
    hierarchyRole === "National" && form.electionType === "GENERAL";
  const isStateWideStateElection =
    hierarchyRole === "State" && form.electionType === "STATE_ASSEMBLY";
  const isAutoScopeElection = isNationalLokSabhaElection || isStateWideStateElection;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const normalizedConstituency =
      (hierarchyRole === "State" && form.electionType === "STATE_ASSEMBLY") ||
      (hierarchyRole === "National" && form.electionType === "GENERAL")
        ? "NATIONAL"
        : form.constituency;

    if (!form.title || !form.startTime || !form.endTime || !form.electionType) {
      setError("Title, election type, start time and end time are required");
      return;
    }

    if (!normalizedConstituency) {
      setError("Constituency is required");
      return;
    }

    if (hierarchyRole === "State" && !form.state) {
      setError("Assigned state is required for State Admin elections");
      return;
    }

    if (form.electionType === "BY_ELECTION" && normalizedConstituency.trim().toUpperCase() === "NATIONAL") {
      setError("By-Election must be created for a specific seat/constituency");
      return;
    }

    if (new Date(form.startTime) <= new Date()) {
      setError("Start time must be in the future");
      return;
    }
    if (new Date(form.endTime) <= new Date(form.startTime)) {
      setError("End time must be after start time");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const payload = {
        ...form,
        constituency: normalizedConstituency,
        state: hierarchyRole === "State" ? (user?.assignedState || form.state) : form.state,
      };
      const res = await api.post("/election", payload);
      setSuccess(true);
      onCreated?.(res.data.election);
      setForm(buildDefaultForm(hierarchyRole, user?.assignedState || ""));
      setTimeout(() => setSuccess(false), 3000);
    } catch (e1) {
      setError(e1.response?.data?.error || "Failed to create election");
    } finally {
      setLoading(false);
    }
  };

  if (!["National", "State"].includes(hierarchyRole)) {
    return (
      <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl px-4 py-3 text-amber-300 text-sm">
        Election creation is available only for National and State Admins.
      </div>
    );
  }

  const constituencyPlaceholder =
    isAutoScopeElection
      ? "All constituencies in your assigned state"
      : form.electionType === "BY_ELECTION"
      ? "e.g. Lucknow Central (specific seat)"
      : hierarchyRole === "National"
        ? "e.g. NATIONAL"
        : "e.g. Amethi";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <h3 className="text-white font-semibold text-lg">Create New Election</h3>

      {error && (
        <div className="bg-red-900/30 border border-red-500/40 text-red-300 text-sm px-4 py-3 rounded-xl">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-emerald-900/30 border border-emerald-500/40 text-emerald-300 text-sm px-4 py-3 rounded-xl">
          Election created successfully.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="text-slate-400 text-sm block mb-2">Election Title *</label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            required
            placeholder={
              hierarchyRole === "National"
                ? "e.g. Lok Sabha General Election 2029"
                : "e.g. Uttar Pradesh Vidhan Sabha 2027"
            }
            className="w-full bg-slate-800 border border-slate-600 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="sm:col-span-2">
          <label className="text-slate-400 text-sm block mb-2">Description</label>
          <textarea
            rows={3}
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Brief description of this election..."
            className="w-full bg-slate-800 border border-slate-600 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500 resize-none"
          />
        </div>

        <div>
          <label className="text-slate-400 text-sm block mb-2">Election Type *</label>
          <select
            value={form.electionType}
            onChange={(e) => {
              const nextType = e.target.value;
              set("electionType", nextType);
              if (hierarchyRole === "National" && nextType === "GENERAL") {
                set("constituency", "NATIONAL");
              }
              if (hierarchyRole === "State" && nextType === "STATE_ASSEMBLY") {
                set("constituency", "NATIONAL");
              }
              if (hierarchyRole === "State" && nextType === "BY_ELECTION") {
                set("constituency", "");
              }
            }}
            className="w-full bg-slate-800 border border-slate-600 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
          >
            {electionTypes.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-slate-400 text-sm block mb-2">Constituency *</label>
          {isAutoScopeElection ? (
            <>
              <input
                type="text"
                value={
                  isNationalLokSabhaElection
                    ? "All constituencies (National)"
                    : `All constituencies (${user?.assignedState || form.state || "Assigned state"})`
                }
                disabled
                className="w-full bg-slate-800 border border-slate-600 text-white rounded-xl px-4 py-3 disabled:opacity-80"
              />
              <p className="text-slate-500 text-xs mt-2">
                {isNationalLokSabhaElection
                  ? "Lok Sabha election automatically covers all constituencies nationwide."
                  : "State Assembly election automatically covers all constituencies of your assigned state."}
              </p>
            </>
          ) : (
            <input
              type="text"
              value={form.constituency}
              onChange={(e) => set("constituency", e.target.value)}
              required
              placeholder={constituencyPlaceholder}
              className="w-full bg-slate-800 border border-slate-600 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
            />
          )}
        </div>

        <div>
          <label className="text-slate-400 text-sm block mb-2">State</label>
          {hierarchyRole === "State" ? (
            <input
              type="text"
              value={user?.assignedState || form.state}
              disabled
              className="w-full bg-slate-800 border border-slate-600 text-white rounded-xl px-4 py-3 disabled:opacity-80"
            />
          ) : (
            <input
              type="text"
              value={form.state}
              onChange={(e) => set("state", e.target.value)}
              placeholder="Optional for Lok Sabha"
              className="w-full bg-slate-800 border border-slate-600 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
            />
          )}
        </div>

        <div>
          <label className="text-slate-400 text-sm block mb-2">Start Date & Time *</label>
          <input
            type="datetime-local"
            value={form.startTime}
            onChange={(e) => set("startTime", e.target.value)}
            required
            min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
            className="w-full bg-slate-800 border border-slate-600 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <label className="text-slate-400 text-sm block mb-2">End Date & Time *</label>
          <input
            type="datetime-local"
            value={form.endTime}
            onChange={(e) => set("endTime", e.target.value)}
            required
            min={form.startTime || new Date(Date.now() + 60000).toISOString().slice(0, 16)}
            className="w-full bg-slate-800 border border-slate-600 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {form.startTime && form.endTime && new Date(form.endTime) > new Date(form.startTime) && (
        <div className="bg-slate-700/50 rounded-xl px-4 py-3 text-slate-400 text-sm">
          Duration: {Math.round((new Date(form.endTime) - new Date(form.startTime)) / 3600000)} hours
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
      >
        {loading ? "Creating Election..." : "Create Election"}
      </button>
    </form>
  );
}