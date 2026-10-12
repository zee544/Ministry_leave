import { useState, useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";

function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setServerError("Missing password reset token. Please request a new reset link.");
    }
  }, [token]);

  const validate = () => {
    const temp = {};
    if (!password) temp.password = "Password is required";
    else if (password.length < 8) temp.password = "Password must be at least 8 characters";
    else if (!/[A-Z]/.test(password)) temp.password = "Must contain at least one uppercase letter";
    else if (!/[a-z]/.test(password)) temp.password = "Must contain at least one lowercase letter";
    else if (!/[0-9]/.test(password)) temp.password = "Must contain at least one number";
    else if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) temp.password = "Must contain at least one special character";

    if (!confirmPassword) temp.confirmPassword = "Please confirm your password";
    else if (password !== confirmPassword) temp.confirmPassword = "Passwords do not match";

    setErrors(temp);
    return Object.keys(temp).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError("");
    setSuccessMsg("");

    if (!validate()) return;
    if (!token) {
      setServerError("Missing password reset token.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccessMsg(data.message || "Password reset successfully! Redirecting to sign in...");
        setTimeout(() => navigate("/"), 2500);
      } else {
        setServerError(data.message || "Failed to reset password.");
      }
    } catch (err) {
      console.error("Reset password error:", err);
      setServerError("Could not connect to server. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = (field) =>
    errors[field]
      ? "w-full rounded-lg border px-3 py-2 text-white bg-white/10 transition outline-none border-red-500 ring-2 ring-red-500"
      : "w-full rounded-lg border border-white/50 bg-white/10 px-3 py-2 text-white transition outline-none placeholder-white/60 focus:border-blue-300 focus:ring-2 focus:ring-blue-300";

  return (
    <div className="min-h-screen bg-linear-to-br from-red-500 via-cyan-500 to-red-500 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/40 bg-white/20 p-8 shadow-2xl backdrop-blur-xl">
        <h1 className="text-2xl sm:text-3xl text-center text-white font-bold mb-2">
          Reset Password
        </h1>
        <p className="text-xs text-white/80 text-center mb-6">
          Enter a new password for your account
        </p>

        {serverError && (
          <div className="mb-4 p-3 rounded-lg bg-red-600/80 border border-red-400 text-white text-xs">
            ⚠️ {serverError}
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 rounded-lg bg-green-600/80 border border-green-400 text-white text-xs font-medium">
            ✅ {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-white">New Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setErrors({ ...errors, password: "" });
              }}
              placeholder="Minimum 8 characters"
              className={inputClass("password")}
            />
            {errors.password && <span className="text-red-300 text-xs mt-1 block">{errors.password}</span>}
            <span className="text-[10px] text-white/70 mt-1 block">
              Must contain 8+ chars, uppercase, lowercase, number & special char.
            </span>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-white">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setErrors({ ...errors, confirmPassword: "" });
              }}
              placeholder="Re-enter password"
              className={inputClass("confirmPassword")}
            />
            {errors.confirmPassword && <span className="text-red-300 text-xs mt-1 block">{errors.confirmPassword}</span>}
          </div>

          <button
            type="submit"
            disabled={isSubmitting || !token}
            className="w-full mt-2 rounded-lg bg-blue-500 py-2.5 px-4 font-semibold text-white transition duration-300 hover:bg-blue-600 disabled:opacity-50"
          >
            {isSubmitting ? "Resetting..." : "Reset Password"}
          </button>

          <div className="text-center pt-2">
            <Link to="/" className="text-xs text-white hover:underline">
              ← Back to Sign In
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ResetPassword;