import { useEffect, useState } from "react";
import { apiUrl } from "../api.js";

function ApprovalSettings({ role }) {
  const [candidates, setCandidates] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadSettings = async () => {
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(apiUrl("/api/admin/approval-settings"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Failed to load approval settings.");
      setCandidates(data.candidates || []);
      setSelectedId(data.selected?.id ? `${data.selected.role}:${data.selected.id}` : "");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSettings(); }, []);

  const saveSettings = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const token = localStorage.getItem("token");
      const [approverRole, approverId] = selectedId ? selectedId.split(":") : [null, null];
      const response = await fetch(apiUrl("/api/admin/approval-settings"), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          approverId: approverId || null,
          approverRole,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Failed to save approval settings.");
      setMessage(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const approverLabel = role === "admin" ? "authorized HOD" : "authorized approver";

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-gray-700">
        <h2 className="text-base sm:text-xl underline decoration-[#000000] dark:decoration-white font-bold text-gray-900 dark:text-white">
          Approval Settings
        </h2>
        <p className="text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          Choose the registered {approverLabel} who should receive your new leave requests.
        </p>
      </div>
      <form onSubmit={saveSettings} className="px-4 sm:px-6 py-4 sm:py-5 space-y-3">
        <label className="block text-[10px] sm:text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
          Approving {approverLabel}
          <select
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
            disabled={loading || saving}
            className="mt-1.5 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2.5 text-xs sm:text-sm font-normal text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Use default workflow</option>
            {candidates.map((officer) => (
              <option key={`${officer.role}:${officer.id}`} value={`${officer.role}:${officer.id}`}>
                {officer.name} — {officer.designation || approverLabel}{officer.email ? ` (${officer.email})` : ""}
              </option>
            ))}
          </select>
        </label>
        {loading && <p className="text-xs text-gray-500">Loading registered officers…</p>}
        {!loading && !candidates.length && <p className="text-xs text-amber-600 dark:text-amber-400">No authorized {approverLabel}s are registered for this workflow yet.</p>}
        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        {message && <p className="text-xs text-emerald-600 dark:text-emerald-400">{message}</p>}
        <div className="flex justify-end pt-2">
          <button type="submit" disabled={loading || saving || !!error} className="px-4 py-2.5 bg-[#0000A0] dark:bg-blue-600 text-white text-xs sm:text-sm font-semibold rounded-lg hover:bg-[#000080] dark:hover:bg-blue-700 transition disabled:opacity-60">
            {saving ? "Saving…" : "Save Approval Setting"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default ApprovalSettings;
