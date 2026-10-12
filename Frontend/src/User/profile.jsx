import { useState, useEffect } from "react";
import { useUser } from "../hooks/UserContext.jsx";
import { useLeaves } from "../hooks/LeaveContext.jsx";

function Profile() {
  const { currentUser, leaveEntitlements, fetchEmployees } = useUser();
  const { leaves } = useLeaves();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    designation: "",
    appointment_date: "",
  });
  const [editErrors, setEditErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const loadProfile = async () => {
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/auth/profile", {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const data = await res.json();

      if (res.ok) {
        setProfile(data);
      } else {
        setError(data.message || "Failed to load profile.");
      }
    } catch (err) {
      console.error("Profile load error:", err);
      setError("Could not connect to server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfile();
  }, []);

  const myLeaves = leaves.filter(
    (l) =>
      l.appliedBy === currentUser.name &&
      (l.status === "Approved" || l.status === "Admin Approved")
  );

  const getLeaveDays = (leave) => {
    if (leave.noOfDays) return parseFloat(leave.noOfDays) || 0;
    if (leave.days) return parseFloat(leave.days) || 0;
    if (leave.type === "Half-day") return 0.5;
    if (!leave.from || !leave.to) return 0;
    const start = new Date(leave.from);
    const end = new Date(leave.to);
    if (isNaN(start) || isNaN(end)) return 0;
    return Math.max(1, Math.round((end - start) / 86400000) + 1);
  };

  const buildBalance = (type) => {
    const entitlement = leaveEntitlements[type];
    if (!entitlement) return null;
    const used = myLeaves
      .filter((l) => l.type === type)
      .reduce((sum, l) => sum + getLeaveDays(l), 0);
    const remaining = Math.max(0, entitlement.total - used);
    const pct =
      entitlement.total > 0
        ? Math.round((remaining / entitlement.total) * 100)
        : 0;
    return { type, ...entitlement, used, remaining, pct };
  };

  const annual = buildBalance("Annual");
  const casual = buildBalance("Casual");
  const other = buildBalance("Other");

  const halfDayCount = myLeaves.filter((l) => l.type === "Half-day").length;

  const balanceRows = [annual, casual, other].filter(Boolean).map((b) => ({
    label: b.type === "Annual"
      ? "Vacation Leave"
      : (b.type.length > 6 ? b.type : `${b.type} Leave`.replace(" Leave Leave", " Leave")),
    remaining: b.remaining,
    total: b.total,
    pct: b.pct,
    color: b.color,
  }));

  balanceRows.push({
    label: "Half-day Leave",
    remaining: null,
    total: null,
    pct: 0,
    color: "bg-purple-500",
    isHalfDay: true,
    used: halfDayCount,
  });

  const handleStartEdit = () => {
    setEditForm({
      name: profile.name || "",
      email: profile.email || "",
      designation: profile.designation || "",
      appointment_date: profile.appointmentDate || "",
    });
    setEditErrors({});
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditErrors({});
  };

  const handleEditChange = (field, value) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
    if (editErrors[field]) {
      setEditErrors((prev) => ({ ...prev, [field]: "" }));
    }
  };

  const validateEdit = () => {
    const errs = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!editForm.name.trim()) errs.name = "Name is required";
    if (!editForm.email.trim()) errs.email = "Email is required";
    else if (!emailRegex.test(editForm.email.trim()))
      errs.email = "Invalid email format";

    setEditErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSaveEdit = async () => {
    if (!validateEdit()) return;

    setSaving(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: editForm.name.trim(),
          email: editForm.email.trim(),
          designation: editForm.designation.trim(),
          appointment_date: editForm.appointment_date || null,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setProfile(data.profile);
        setIsEditing(false);
        setToast("✅ Profile updated successfully");
        setTimeout(() => setToast(""), 4000);

        const token2 = localStorage.getItem("token");
        if (fetchEmployees && token2) {
          await fetchEmployees(token2);
        }
      } else {
        setEditErrors({ general: data.message || "Failed to update profile." });
      }
    } catch (err) {
      console.error("Profile update error:", err);
      setEditErrors({ general: "Could not connect to server." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <span className="text-3xl block mb-2">⏳</span>
        Loading profile...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-xl p-6 text-center">
        <span className="text-3xl block mb-2">⚠️</span>
        <p className="text-sm text-red-700 dark:text-red-300 font-medium">{error}</p>
        <button
          onClick={loadProfile}
          className="mt-4 px-4 py-2 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!profile) return null;

  const infoBlock = [
    { label: "Name", value: profile.name },
    { label: "Email", value: profile.email },
    { label: "Designation", value: profile.designation || "—" },
    { label: "Division", value: profile.division || "—" },
    { label: "Employee ID", value: profile.employeeId || "—" },
    { label: "Appointment Date", value: profile.appointmentDate || "—" },
  ];

  const inputClass = (field) =>
    editErrors[field]
      ? "w-full px-3 py-2 rounded-lg border text-sm outline-none border-red-500 ring-2 ring-red-500 bg-white dark:bg-gray-700 text-gray-800 dark:text-white"
      : "w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500";

  return (
    <div>
      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 bg-green-600 text-white text-sm rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-6 border border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <h4 className="text-m font-semibold underline text-gray-700 dark:text-gray-200 uppercase">
              Personal Information
            </h4>

            {!isEditing ? (
              <button
                onClick={handleStartEdit}
                className="px-3 py-1.5 bg-blue-500 text-white text-xs font-medium rounded-lg hover:bg-blue-600 transition-colors shadow-sm flex items-center gap-1.5"
              >
                Edit Profile
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={handleCancelEdit}
                  disabled={saving}
                  className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-xs font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="px-3 py-1.5 bg-green-500 text-white text-xs font-medium rounded-lg hover:bg-green-600 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            )}
          </div>

          {editErrors.general && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 text-xs">
              ⚠️ {editErrors.general}
            </div>
          )}

          {isEditing ? (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">
                  Name *
                </label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => handleEditChange("name", e.target.value)}
                  className={inputClass("name")}
                />
                {editErrors.name && (
                  <span className="text-xs text-red-500 mt-1 block">{editErrors.name}</span>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => handleEditChange("email", e.target.value)}
                  className={inputClass("email")}
                />
                {editErrors.email && (
                  <span className="text-xs text-red-500 mt-1 block">{editErrors.email}</span>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">
                  Designation
                </label>
                <input
                  type="text"
                  value={editForm.designation}
                  onChange={(e) => handleEditChange("designation", e.target.value)}
                  className={inputClass("designation")}
                />
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600 dark:text-gray-300 block mb-1">
                  Appointment Date
                </label>
                <input
                  type="date"
                  value={editForm.appointment_date || ""}
                  onChange={(e) => handleEditChange("appointment_date", e.target.value)}
                  className={`${inputClass("appointment_date")} [color-scheme:light] dark:[color-scheme:dark]`}
                />
              </div>

              <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                <p className="text-[10px] text-gray-400 dark:text-gray-500">
                  🔒 Division and Employee ID cannot be edited. Contact your administrator for changes.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {infoBlock.map((row) => (
                <div key={row.label}>
                  <span className="text-xs text-gray-500 dark:text-gray-400">{row.label}:</span>
                  <p className="text-sm font-medium text-gray-800 dark:text-white">{row.value}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-6 border border-gray-100 dark:border-gray-700">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 uppercase mb-4">
            Leave Balance
          </h4>
          <div className="space-y-3">
            {balanceRows.map((b) => (
              <div key={b.label}>
                {b.isHalfDay ? (
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600 dark:text-gray-300">{b.label}</span>
                    <span className="text-sm font-bold text-gray-800 dark:text-white">
                      {b.used} time{b.used !== 1 ? "s" : ""} taken
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 dark:text-gray-300">{b.label}</span>
                      <span className="text-sm font-bold text-gray-800 dark:text-white">
                        {b.remaining} / {b.total} days
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className={`${b.color} h-2 rounded-full`}
                        style={{ width: `${b.pct}%` }}
                      />
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Profile;