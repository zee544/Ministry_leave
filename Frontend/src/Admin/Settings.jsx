import { useState, useEffect } from "react";
import { useUser } from "../hooks/UserContext.jsx";
import { useSignatures } from "../hooks/SignatureContext.jsx";
import SignatureUpload from "../Components/SignatureUpload.jsx";

function Settings() {
  const { currentUser } = useUser();
  const { getSignature } = useSignatures();

  const [profile, setProfile] = useState(null);
  const [hodInfo, setHodInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingSignature, setSavingSignature] = useState(false);
  const [toast, setToast] = useState("");
  const [toastType, setToastType] = useState("success");

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    designation: "",
  });
  const [editErrors, setEditErrors] = useState({});

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);

  const showToast = (message, type = "success") => {
    setToast(message);
    setToastType(type);
    setTimeout(() => setToast(""), 4000);
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem("token");

        const profileRes = await fetch("/api/auth/profile", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          setProfile(profileData);
          setEditForm({
            name: profileData.name || "",
            email: profileData.email || "",
            designation: profileData.designation || "",
          });
        }

        const hodRes = await fetch("/api/auth/hod-info", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (hodRes.ok) {
          const hodData = await hodRes.json();
          setHodInfo(hodData);
        } else {
          setHodInfo(null);
        }
      } catch (err) {
        console.warn("Failed to load settings:", err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const handleStartEditProfile = () => {
    setEditForm({
      name: profile?.name || "",
      email: profile?.email || "",
      designation: profile?.designation || "",
    });
    setEditErrors({});
    setIsEditingProfile(true);
  };

  const handleCancelEditProfile = () => {
    setIsEditingProfile(false);
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

  const handleSaveProfile = async () => {
    if (!validateEdit()) return;
    setSavingProfile(true);
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
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setProfile(data.profile);
        setIsEditingProfile(false);
        showToast("Profile updated successfully!", "success");
      } else {
        setEditErrors({ general: data.message || "Failed to update profile." });
      }
    } catch (err) {
      setEditErrors({ general: "Network error. Please try again." });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveSignature = async () => {
    setSavingSignature(true);
    try {
      const token = localStorage.getItem("token");
      const signature = getSignature("admin");
      const res = await fetch("/api/auth/signature", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ signature: signature || null }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast("Signature saved successfully!", "success");
      } else {
        showToast(data.message || "Failed to save signature", "error");
      }
    } catch (err) {
      showToast("Network error. Please try again.", "error");
    } finally {
      setSavingSignature(false);
    }
  };

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordForm((prev) => ({ ...prev, [name]: value }));
    if (passwordErrors[name]) {
      setPasswordErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const validatePasswordForm = () => {
    const tempErrors = {};
    if (!passwordForm.currentPassword)
      tempErrors.currentPassword = "Current password is required";

    if (!passwordForm.newPassword) {
      tempErrors.newPassword = "New password is required";
    } else if (passwordForm.newPassword.length < 8) {
      tempErrors.newPassword = "Password must be at least 8 characters";
    } else if (!/[A-Z]/.test(passwordForm.newPassword)) {
      tempErrors.newPassword = "Must contain at least one uppercase letter";
    } else if (!/[a-z]/.test(passwordForm.newPassword)) {
      tempErrors.newPassword = "Must contain at least one lowercase letter";
    } else if (!/[0-9]/.test(passwordForm.newPassword)) {
      tempErrors.newPassword = "Must contain at least one number";
    } else if (!/[!@#$%^&*(),.?":{}|<>]/.test(passwordForm.newPassword)) {
      tempErrors.newPassword = "Must contain at least one special character";
    }

    if (!passwordForm.confirmPassword) {
      tempErrors.confirmPassword = "Please confirm your new password";
    } else if (passwordForm.confirmPassword !== passwordForm.newPassword) {
      tempErrors.confirmPassword = "Passwords do not match";
    }
    setPasswordErrors(tempErrors);
    return Object.keys(tempErrors).length === 0;
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!validatePasswordForm()) return;
    setIsSubmittingPassword(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          setPasswordErrors((prev) => ({
            ...prev,
            currentPassword: data.message || "Current password is incorrect",
          }));
        } else {
          showToast(data.message || "Failed to change password", "error");
        }
        return;
      }
      showToast("Password changed successfully!", "success");
      setShowPasswordModal(false);
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setPasswordErrors({});
    } catch (err) {
      showToast("Network error. Please try again.", "error");
    } finally {
      setIsSubmittingPassword(false);
    }
  };

  const inputClass = (field, errorsObj) =>
    errorsObj[field]
      ? "w-full px-3.5 py-2.5 rounded-lg border border-red-400 dark:border-red-500 bg-red-50/40 dark:bg-red-900/20 text-sm text-gray-800 dark:text-white outline-none focus:ring-2 focus:ring-red-400/40 transition"
      : "w-full px-3.5 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-800 dark:text-white placeholder-gray-400 outline-none focus:border-[#0000A0] dark:focus:border-blue-500 focus:ring-2 focus:ring-[#0000A0]/30 dark:focus:ring-blue-500/30 transition";

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-500 dark:text-gray-400">
        <svg className="animate-spin h-8 w-8 mb-3 text-[#0000A0] dark:text-blue-400" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        <span className="text-sm">Loading settings...</span>
      </div>
    );
  }

  return (
    <div className="w-full">
      {toast && (
        <div
          className={`fixed top-6 right-6 z-[100] px-5 py-3 text-white text-sm font-medium rounded-xl shadow-xl flex items-center gap-3 ${
            toastType === "error" ? "bg-red-600" : "bg-emerald-600"
          }`}
        >
          <span>{toastType === "error" ? "✕" : "✓"}</span>
          <span>{toast}</span>
        </div>
      )}

      <div className="max-w-3xl">
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-start justify-between">
              <div>
                <h2 className="text-xl underline decoration-[#000000] dark:decoration-white font-bold text-gray-900 dark:text-white">
                  My Profile
                </h2>
              </div>
              {!isEditingProfile ? (
                <button
                  onClick={handleStartEditProfile}
                  className="px-5 py-2.5 bg-[#0000A0] dark:bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-[#000080] dark:hover:bg-blue-700 transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  Edit
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={handleCancelEditProfile}
                    disabled={savingProfile}
                    className="px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveProfile}
                    disabled={savingProfile}
                    className="px-4 py-2 text-sm font-semibold text-white bg-[#0000A0] dark:bg-blue-600 rounded-lg hover:bg-[#000080] dark:hover:bg-blue-700 transition disabled:opacity-60"
                  >
                    {savingProfile ? "Saving..." : "Save"}
                  </button>
                </div>
              )}
            </div>

            <div className="px-6 py-5">
              {editErrors.general && (
                <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 text-xs">
                  {editErrors.general}
                </div>
              )}

              {isEditingProfile ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-1.5">
                      Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) => handleEditChange("name", e.target.value)}
                      className={inputClass("name", editErrors)}
                      placeholder="Enter full name"
                    />
                    {editErrors.name && (
                      <span className="text-xs text-red-500 mt-1.5 block">
                        {editErrors.name}
                      </span>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-1.5">
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={(e) => handleEditChange("email", e.target.value)}
                      className={inputClass("email", editErrors)}
                      placeholder="name@example.com"
                    />
                    {editErrors.email && (
                      <span className="text-xs text-red-500 mt-1.5 block">
                        {editErrors.email}
                      </span>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-1.5">
                      Designation
                    </label>
                    <input
                      type="text"
                      value={editForm.designation}
                      onChange={(e) =>
                        handleEditChange("designation", e.target.value)
                      }
                      className={inputClass("designation", editErrors)}
                      placeholder="e.g. Administrative Officer"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <InfoRow label="Name" value={profile?.name} />
                  <InfoRow label="Email" value={profile?.email} />
                  <InfoRow label="Designation" value={profile?.designation} />
                  <InfoRow label="Employee ID" value={profile?.employeeId} />
                </div>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-xl underline decoration-[#000000] dark:decoration-white font-bold text-gray-900 dark:text-white">
                Division Information
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Your assigned division and ministry details.
              </p>
            </div>

            <div className="px-6 py-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <InfoRow
                  label="Division"
                  value={profile?.division || currentUser?.division}
                />
                <InfoRow
                  label="Ministry"
                  value="Ministry of Fisheries, Aquatic and Ocean Resources"
                />
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-start justify-between">
              <div>
                <h2 className="text-xl underline decoration-[#000000] dark:decoration-white font-bold text-gray-900 dark:text-white">
                  Admin Signature
                </h2>
              </div>
              <span className="text-[10px] uppercase tracking-wider font-semibold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-900/40 border border-teal-200 dark:border-teal-700 px-2 py-0.5 rounded">
                Required
              </span>
            </div>

            <div className="px-6 py-5">
              <SignatureUpload signatureKey="admin" />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                This signature will be automatically applied to all printed
                leave forms as the Supervising Officer.
              </p>
            </div>

            <div className="px-6 py-4 bg-gray-50/60 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-700 flex justify-end">
              <button
                onClick={handleSaveSignature}
                disabled={savingSignature}
                className="px-5 py-2.5 bg-[#0000A0] dark:bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-[#000080] dark:hover:bg-blue-700 transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {savingSignature ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    Saving...
                  </>
                ) : (
                  "Save Signature"
                )}
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-xl underline decoration-[#000000] dark:decoration-white font-bold text-gray-900 dark:text-white">
                Security
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Update your password to keep your account secure.
              </p>
            </div>

            <div className="px-6 py-5">
              <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/40">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center text-gray-500 dark:text-gray-300">
                    🔒
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-white">
                      Password
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Last changed
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setPasswordErrors({});
                    setPasswordForm({
                      currentPassword: "",
                      newPassword: "",
                      confirmPassword: "",
                    });
                    setShowPasswordModal(true);
                  }}
                  className="px-5 py-2.5 bg-[#0000A0] dark:bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-[#000080] dark:hover:bg-blue-700 transition disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  Change
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/60 dark:bg-black/70">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100 dark:border-gray-700">
            <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-700 flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  Change Password
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Choose a strong password you haven't used before.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                disabled={isSubmittingPassword}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition text-xl leading-none disabled:opacity-50"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <form onSubmit={handlePasswordSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-1.5">
                  Current Password
                </label>
                <input
                  type="password"
                  name="currentPassword"
                  value={passwordForm.currentPassword}
                  onChange={handlePasswordChange}
                  className={inputClass("currentPassword", passwordErrors)}
                  autoComplete="current-password"
                  placeholder="Enter current password"
                />
                {passwordErrors.currentPassword && (
                  <span className="text-xs text-red-600 dark:text-red-400 mt-1.5 block">
                    {passwordErrors.currentPassword}
                  </span>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-1.5">
                  New Password
                </label>
                <input
                  type="password"
                  name="newPassword"
                  value={passwordForm.newPassword}
                  onChange={handlePasswordChange}
                  className={inputClass("newPassword", passwordErrors)}
                  autoComplete="new-password"
                  placeholder="Enter new password"
                />
                {passwordErrors.newPassword && (
                  <span className="text-xs text-red-600 dark:text-red-400 mt-1.5 block">
                    {passwordErrors.newPassword}
                  </span>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-1.5">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  name="confirmPassword"
                  value={passwordForm.confirmPassword}
                  onChange={handlePasswordChange}
                  className={inputClass("confirmPassword", passwordErrors)}
                  autoComplete="new-password"
                  placeholder="Re-enter new password"
                />
                {passwordErrors.confirmPassword && (
                  <span className="text-xs text-red-600 dark:text-red-400 mt-1.5 block">
                    {passwordErrors.confirmPassword}
                  </span>
                )}
              </div>

              <div className="flex gap-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  disabled={isSubmittingPassword}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPassword}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-[#006A4E] dark:bg-emerald-600 rounded-lg hover:bg-[#1B5448] dark:hover:bg-emerald-700 transition disabled:opacity-60 shadow-sm"
                >
                  {isSubmittingPassword ? "Updating..." : "Update Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        {label}
      </p>
      <p className="text-sm font-medium text-gray-800 dark:text-white mt-1">{value || "—"}</p>
    </div>
  );
}

export default Settings;