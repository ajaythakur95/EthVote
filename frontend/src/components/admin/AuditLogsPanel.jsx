import { useEffect, useState } from "react";
import api from "../../utils/api";
import { DISTRICTS } from "../../constants/districts";

export default function AuditLogsPanel() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [district, setDistrict] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [meta, setMeta] = useState({
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });

  const loadLogs = async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/audit-logs", {
        params: {
          page,
          limit,
          ...(district ? { district } : {}),
          ...(searchTerm ? { search: searchTerm } : {}),
          ...(fromDate ? { from: fromDate } : {}),
          ...(toDate ? { to: toDate } : {}),
        },
      });
      setLogs(res.data.logs || []);
      setMeta({
        total: res.data.total || 0,
        totalPages: res.data.totalPages || 1,
        hasNextPage: !!res.data.hasNextPage,
        hasPrevPage: !!res.data.hasPrevPage,
      });
    } catch (error) {
      console.error("Failed to load audit logs", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setSearchTerm(searchInput.trim());
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    loadLogs();
  }, [district, page, searchTerm, fromDate, toDate]);

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const res = await api.get("/admin/audit-logs", {
        params: {
          format: "csv",
          ...(district ? { district } : {}),
          ...(searchTerm ? { search: searchTerm } : {}),
          ...(fromDate ? { from: fromDate } : {}),
          ...(toDate ? { to: toDate } : {}),
        },
        responseType: "blob",
      });

      const blob = new Blob([res.data], { type: "text/csv;charset=utf-8;" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("CSV export failed", error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-white font-semibold">Voter Approval/Rejection Audit Logs ({meta.total})</h3>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={district}
            onChange={(e) => {
              setDistrict(e.target.value);
              setPage(1);
            }}
            className="bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
          >
            <option value="">All Districts</option>
            {DISTRICTS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Search action/reason"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setPage(1);
            }}
            className="bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
            title="From date"
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setPage(1);
            }}
            className="bg-slate-800 border border-slate-600 text-white rounded-lg px-3 py-2 text-sm"
            title="To date"
          />
          <button
            onClick={handleExportCsv}
            disabled={exporting}
            className="px-3 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm rounded-lg"
          >
            {exporting ? "Exporting..." : "Export CSV"}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm py-8">Loading audit logs...</div>
      ) : logs.length === 0 ? (
        <div className="text-slate-500 text-sm py-8">No audit logs found.</div>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => {
            const isApprove = log.action === "VOTER_APPROVED";
            return (
              <div key={log._id} className="bg-slate-800 rounded-xl p-4 border border-slate-700">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className={`text-sm font-semibold ${isApprove ? "text-emerald-300" : "text-red-300"}`}>
                      {isApprove ? "Approved" : "Rejected"} · {log.targetUser?.name || "Unknown Voter"}
                    </p>
                    <p className="text-xs text-slate-400">
                      By: {log.performedBy?.name || "Unknown Admin"} · District: {log.details?.district || log.targetUser?.district || "N/A"}
                    </p>
                    {log.details?.reason && (
                      <p className="text-xs text-slate-400">Reason: {log.details.reason}</p>
                    )}
                    {log.txHash && (
                      <p className="text-xs text-slate-500 break-all">Tx: {log.txHash}</p>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    {new Date(log.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">Page {page} of {meta.totalPages}</p>
        <div className="flex gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={!meta.hasPrevPage}
            className="px-3 py-1.5 bg-slate-800 border border-slate-600 text-slate-300 text-sm rounded-lg disabled:opacity-50"
          >
            Prev
          </button>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={!meta.hasNextPage}
            className="px-3 py-1.5 bg-slate-800 border border-slate-600 text-slate-300 text-sm rounded-lg disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
