import { useState, useEffect } from "react";
import api from "../../utils/api";
import { INDIAN_STATES, STATE_DISTRICTS_MAP } from "../../constants/stateDistricts";
import { useAuth } from "../../context/AuthContext";

export default function SuperAdminPanel() {
  const { user } = useAuth();
  const hierarchyRole = user?.adminRole || (user?.role === "superadmin" ? "National" : "District");
  const canCreateAdmins = hierarchyRole === "National" || hierarchyRole === "State";

  const [admins, setAdmins]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [creating, setCreating]   = useState(false);
  const [toast, setToast]         = useState(null);
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState({
    name: "",
    password: "",
    role: hierarchyRole === "National" ? "State" : "District",
    assignedState: hierarchyRole === "State" ? (user?.assignedState || "") : "",
    assignedDistrict: "",
  });
  const selectedStateForDistricts = hierarchyRole === "State"
    ? (user?.assignedState || "")
    : form.assignedState;
  const filteredDistricts = STATE_DISTRICTS_MAP[selectedStateForDistricts] || [];

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadAdmins = async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/admins");
      setAdmins(res.data.admins);
    } catch (e) {
      showToast(e.response?.data?.error || "Load failed", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAdmins(); }, []);

  const handleCreate = async () => {
    if (!form.name || !form.password || !form.role) {
      showToast("Sab fields fill karo", "error");
      return;
    }
    if (form.role === "State" && !form.assignedState) {
      showToast("State Admin ke liye assignedState required hai", "error");
      return;
    }
    if (form.role === "District" && !form.assignedDistrict) {
      showToast("District Admin ke liye assignedDistrict required hai", "error");
      return;
    }
    setCreating(true);
    try {
      await api.post("/admin/admins/create", form);
      showToast(`Admin '${form.name}' create ho gaya!`);
      setForm({
        name: "",
        password: "",
        role: hierarchyRole === "National" ? "State" : "District",
        assignedState: hierarchyRole === "State" ? (user?.assignedState || "") : "",
        assignedDistrict: "",
      });
      setShowForm(false);
      await loadAdmins();
    } catch (e) {
      showToast(e.response?.data?.error || "Create failed", "error");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`'${name}' admin ko delete karna chahte hain?`)) return;
    try {
      await api.delete(`/admin/admins/${id}`);
      showToast(`Admin '${name}' delete ho gaya`);
      await loadAdmins();
    } catch (e) {
      showToast(e.response?.data?.error || "Delete failed", "error");
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-20 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-xl ${
          toast.type === "error"
            ? "bg-red-900 text-red-200 border border-red-500/40"
            : "bg-emerald-900 text-emerald-200 border border-emerald-500/40"
        }`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white text-xl font-bold">
            {hierarchyRole === "National" ? "State Admin Management" : "District Admin Management"}
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            {hierarchyRole === "National"
              ? "National Admin se state admins create aur monitor karein"
              : "State Admin se district admins create aur monitor karein"}
          </p>
        </div>
        {canCreateAdmins && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-xl transition-colors"
          >
            {showForm ? "✕ Cancel" : "+ New Admin"}
          </button>
        )}
      </div>

      {/* Create Admin Form */}
      {showForm && canCreateAdmins && (
        <div className="bg-slate-800/50 border border-purple-500/30 rounded-2xl p-6 space-y-4">
          <h3 className="text-white font-semibold">
            {hierarchyRole === "National" ? "Naya State Admin Banao" : "Naya District Admin Banao"}
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="text-slate-400 text-sm block mb-2">Admin Name</label>
              <input
                type="text"
                placeholder="e.g. Lucknow_Admin"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-600 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 text-sm"
              />
            </div>
            <div>
              <label className="text-slate-400 text-sm block mb-2">Password</label>
              <input
                type="password"
                placeholder="Strong password"
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                className="w-full bg-slate-800 border border-slate-600 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 text-sm"
              />
            </div>
            <div>
              <label className="text-slate-400 text-sm block mb-2">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm((p) => ({
                  ...p,
                  role: e.target.value,
                  assignedDistrict: e.target.value === "District" ? p.assignedDistrict : "",
                }))}
                disabled
                className="w-full bg-slate-800 border border-slate-600 text-white rounded-xl px-4 py-3 focus:outline-none text-sm disabled:opacity-80"
              >
                {hierarchyRole === "National" ? <option value="State">State Admin</option> : <option value="District">District Admin</option>}
              </select>
            </div>
            <div>
              <label className="text-slate-400 text-sm block mb-2">Assigned State</label>
              {hierarchyRole === "National" ? (
                <select
                  value={form.assignedState}
                  onChange={(e) => setForm((p) => ({ ...p, assignedState: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-600 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 text-sm"
                >
                  <option value="">-- Select State --</option>
                  {INDIAN_STATES.map((stateName) => (
                    <option key={stateName} value={stateName}>{stateName}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={user?.assignedState || ""}
                  disabled
                  className="w-full bg-slate-800 border border-slate-600 text-white rounded-xl px-4 py-3 text-sm disabled:opacity-80"
                />
              )}
            </div>
            <div>
              <label className="text-slate-400 text-sm block mb-2">Assigned District</label>
              <select
                value={form.assignedDistrict}
                onChange={(e) => setForm((p) => ({ ...p, assignedDistrict: e.target.value }))}
                disabled={form.role !== "District"}
                className="w-full bg-slate-800 border border-slate-600 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-purple-500 text-sm"
              >
                <option value="">{filteredDistricts.length ? "-- Select --" : "-- No districts available --"}</option>
                {filteredDistricts.map((district) => (
                  <option key={district} value={district}>{district}</option>
                ))}
              </select>
              {form.role === "District" && filteredDistricts.length === 0 && (
                <p className="text-amber-400 text-xs mt-1">
                  No district mapping configured for "{selectedStateForDistricts || "selected state"}".
                </p>
              )}
            </div>
          </div>

          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium rounded-xl transition-colors"
          >
            {creating ? "Creating…" : "✅ Admin Create Karo"}
          </button>
        </div>
      )}

      {/* Admins List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : admins.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          Koi admin nahi hai — "New Admin" se banao
        </div>
      ) : (
        <div className="space-y-3">
          {admins.map((admin) => (
            <div key={admin._id} className="bg-slate-800 rounded-xl p-5 border border-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg ${
                  admin.role === "superadmin" ? "bg-purple-600" : "bg-indigo-600"
                }`}>
                  {admin.name[0].toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-white font-semibold">{admin.name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      admin.role === "superadmin"
                        ? "bg-purple-900/40 text-purple-300 border border-purple-500/30"
                        : "bg-indigo-900/40 text-indigo-300 border border-indigo-500/30"
                    }`}>
                      {admin.role === "superadmin" ? "⚡ Super Admin" : (admin.adminRole ? `${admin.adminRole} Admin` : "Admin")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    {admin.assignedState && (
                      <span className="text-slate-400 text-xs">🏛 {admin.assignedState}</span>
                    )}
                    {(admin.assignedDistrict || admin.adminConstituency) && (
                      <span className="text-slate-400 text-xs">
                        📍 {admin.assignedDistrict || admin.adminConstituency}
                      </span>
                    )}
                    {admin.lastLoginAt && (
                      <span className="text-slate-500 text-xs">
                        Last login: {new Date(admin.lastLoginAt).toLocaleDateString("en-IN")}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {hierarchyRole === "National" && admin.role !== "superadmin" && (
                <button
                  onClick={() => handleDelete(admin._id, admin.name)}
                  className="px-4 py-2 bg-red-900/30 hover:bg-red-900/50 border border-red-500/30 text-red-300 text-sm rounded-lg transition-colors"
                >
                  🗑 Delete
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}