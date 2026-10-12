import { useState } from "react";
import SignatureUpload from "../Components/SignatureUpload.jsx";
import { useUser } from "../hooks/UserContext.jsx";
import { useSignatures } from "../hooks/SignatureContext.jsx";

function Settings() {
  const { currentUser } = useUser();
  const { getSignature } = useSignatures();

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState("");
  const [toastType, setToastType] = useState("success");
  const [savingSignature, setSavingSignature] = useState(false);

  const handleSaveSignature = async () => {
    setSavingSignature(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        showToast("You are not logged in", "error");
        return;
      }

      const signature = getSignature(currentUser.name);

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
      console.error("Save signature error:", err);
      showToast("Network error. Please try again.", "error");
    } finally {
      setSavingSignature(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setPasswordForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const validatePasswordForm = () => {
    let tempErrors = {};

    if (!passwordForm.currentPassword) {
      tempErrors.currentPassword = "Current password is required";
    }

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
    } else if (passwordForm.newPassword === passwordForm.currentPassword) {
      tempErrors.newPassword = "New password must be different";
    }

    if (!passwordForm.confirmPassword) {
      tempErrors.confirmPassword = "Please confirm your new password";
    } else if (passwordForm.confirmPassword !== passwordForm.newPassword) {
      tempErrors.confirmPassword = "Passwords do not match";
    }

    setErrors(tempErrors);
    return Object.keys(tempErrors).length === 0;
  };

  const showToast = (message, type = "success") => {
    setToast(message);
    setToastType(type);
    setTimeout(() => setToast(""), 4000);
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!validatePasswordForm()) return;

    setIsSubmitting(true);
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        showToast("You are not logged in", "error");
        setIsSubmitting(false);
        return;
      }

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
          setErrors((prev) => ({
            ...prev,
            currentPassword: data.message || "Current password is incorrect",
          }));
        } else {
          showToast(data.message || "Failed to change password", "error");
        }
        setIsSubmitting(false);
        return;
      }

      showToast("Password changed successfully!", "success");
      setShowPasswordModal(false);
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setErrors({});
    } catch (err) {
      console.error("Password change failed:", err);
      showToast("Network error. Please try again.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = (fieldName) =>
    errors[fieldName]
      ? "w-full px-3.5 py-2.5 rounded-lg border border-red-400 dark:border-red-500 bg-red-50/40 dark:bg-red-900/20 text-sm text-gray-800 dark:text-white outline-none focus:ring-2 focus:ring-red-400/40 transition"
      : "w-full px-3.5 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-800 dark:text-white outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 transition placeholder-gray-400";

  return (
    <div className="w-full">
      {toast && (
        <div
          className={`fixed top-6 right-6 z-[100] px-5 py-3 text-white text-sm font-medium rounded-xl shadow-xl flex items-center gap-3 ${
            toastType === "error" ? "bg-red-600" : "bg-emerald-600"
          }`}
        >
          <span className="text-base">{toastType === "error" ? "✕" : "✓"}</span>
          <span>{toast}</span>
        </div>
      )}

      <div className="max-w-2xl">
        <div className="space-y-10">
          <section>
            <div className="flex items-start justify-between pb-4 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h2 className="text-xl underline decoration-[#000000] dark:decoration-white font-bold text-gray-900 dark:text-white">
                  My Signature
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Upload and manage your digital signature.
                </p>
              </div>
              <span className="text-[10px] uppercase tracking-wider font-semibold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-900/40 border border-teal-200 dark:border-teal-700 px-2 py-0.5 rounded">
                Required
              </span>
            </div>

            <div className="pt-5">
              <SignatureUpload signatureKey={currentUser.name} label="Signature" />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 flex items-start gap-2">
                <span>
                  This signature will be automatically applied to all printed
                  leave forms you submit.
                </span>
              </p>
            </div>

            <div className="flex justify-end mt-6 pt-5 border-t border-gray-100 dark:border-gray-700">
              <button
                onClick={handleSaveSignature}
                disabled={savingSignature}
                className="px-5 py-2.5 bg-[#0000A0] dark:bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-[#000080] dark:hover:bg-blue-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
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
          </section>

          <section>
            <div className="pb-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl underline decoration-[#000000] dark:decoration-white font-bold text-gray-900 dark:text-white">
                Account Security
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Update your password to keep your account secure.
              </p>
            </div>

            <div className="pt-5">
              <div className="flex items-center justify-between p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/40">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center text-gray-500 dark:text-gray-300">
                    🔒
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800 dark:text-white">Password</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Last changed</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setErrors({});
                    setPasswordForm({
                      currentPassword: "",
                      newPassword: "",
                      confirmPassword: "",
                    });
                    setShowPasswordModal(true);
                  }}
                  className="px-5 py-2.5 bg-[#0000A0] dark:bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-[#000080] dark:hover:bg-blue-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
                >
                  Change
                </button>
              </div>
            </div>
          </section>
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
                disabled={isSubmitting}
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
                  onChange={handleChange}
                  className={inputClass("currentPassword")}
                  autoComplete="current-password"
                  placeholder="Enter current password"
                />
                {errors.currentPassword && (
                  <span className="text-xs text-red-600 dark:text-red-400 mt-1.5 block">
                    {errors.currentPassword}
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
                  onChange={handleChange}
                  className={inputClass("newPassword")}
                  autoComplete="new-password"
                  placeholder="Enter new password"
                />
                {errors.newPassword && (
                  <span className="text-xs text-red-600 dark:text-red-400 mt-1.5 block">
                    {errors.newPassword}
                  </span>
                )}
                {!errors.newPassword && passwordForm.newPassword && (
                  <ul className="mt-2 space-y-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                    <li className={passwordForm.newPassword.length >= 8 ? "text-emerald-600 dark:text-emerald-400" : ""}>
                      • At least 8 characters
                    </li>
                    <li className={/[A-Z]/.test(passwordForm.newPassword) ? "text-emerald-600 dark:text-emerald-400" : ""}>
                      • One uppercase letter
                    </li>
                    <li className={/[0-9]/.test(passwordForm.newPassword) ? "text-emerald-600 dark:text-emerald-400" : ""}>
                      • One number
                    </li>
                    <li className={/[!@#$%^&*(),.?":{}|<>]/.test(passwordForm.newPassword) ? "text-emerald-600 dark:text-emerald-400" : ""}>
                      • One special character
                    </li>
                  </ul>
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
                  onChange={handleChange}
                  className={inputClass("confirmPassword")}
                  autoComplete="new-password"
                  placeholder="Re-enter new password"
                />
                {errors.confirmPassword && (
                  <span className="text-xs text-red-600 dark:text-red-400 mt-1.5 block">
                    {errors.confirmPassword}
                  </span>
                )}
              </div>

              <div className="flex gap-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-[#006A4E] dark:bg-emerald-600 rounded-lg hover:bg-[#1B5448] dark:hover:bg-emerald-700 transition disabled:opacity-60 shadow-sm"
                >
                  {isSubmitting ? "Updating..." : "Update Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Settings;