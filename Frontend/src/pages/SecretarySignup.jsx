import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { apiUrl } from "../api.js";

export default function SecretarySignup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [errors, setErrors] = useState({});
  const [serverMsg, setServerMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    setErrors({ ...errors, [e.target.name]: "" });
    setServerMsg("");
  };

  const validate = () => {
    const err = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!form.name.trim()) err.name = "Full name is required.";
    if (!form.email.trim()) err.email = "Email is required.";
    else if (!emailRegex.test(form.email.trim())) err.email = "Invalid email address.";
    if (!form.password) err.password = "Password is required.";
    else if (form.password.length < 8) err.password = "At least 8 characters.";
    else if (!/[A-Z]/.test(form.password)) err.password = "Add an uppercase letter.";
    else if (!/[a-z]/.test(form.password)) err.password = "Add a lowercase letter.";
    else if (!/[0-9]/.test(form.password)) err.password = "Add a number.";
    else if (!/[!@#$%^&*(),.?\":{}|<>]/.test(form.password)) err.password = "Add a special character.";
    if (form.password !== form.confirm) err.confirm = "Passwords do not match.";

    setErrors(err);
    return Object.keys(err).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setServerMsg("");
    try {
      const res = await fetch(apiUrl("/api/auth/secretary-signup"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
        }),
      });
      const data = await res.json();

      if (res.ok) {
        setServerMsg(`✅ ${data.message} Redirecting to login...`);
        setTimeout(() => navigate("/"), 2000);
      } else {
        setServerMsg(`❌ ${data.message || "Signup failed."}`);
      }
    } catch (err) {
      setServerMsg("❌ Could not connect to server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-red-500 via-cyan-500 to-red-500 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl border border-white/40 bg-white/20 p-6 sm:p-8 shadow-2xl backdrop-blur-xl">
        <h1 className="text-2xl sm:text-3xl text-center text-white mb-2">Secretary Sign Up</h1>
        <p className="text-xs text-center text-white/70 mb-6">Only one Secretary account is allowed for the entire ministry.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-white mb-1">Full Name</label>
            <input
              name="name" value={form.name} onChange={handleChange}
              className="w-full rounded-lg border border-white/50 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-300"
              placeholder="Jane Perera"
            />
            {errors.name && <p className="text-red-600 text-xs mt-1">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-sm text-white mb-1">Email</label>
            <input
              name="email" type="email" value={form.email} onChange={handleChange}
              className="w-full rounded-lg border border-white/50 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-300"
              placeholder="secretary@ministry.gov.lk"
            />
            {errors.email && <p className="text-red-600 text-xs mt-1">{errors.email}</p>}
          </div>

          <div>
            <label className="block text-sm text-white mb-1">Password</label>
            <div className="relative">
              <input
                name="password" type={showPassword ? "text" : "password"} value={form.password} onChange={handleChange}
                className="w-full rounded-lg border border-white/50 bg-white/10 px-3 py-2 pr-12 text-white placeholder-white/60 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-300"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white text-xs"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            {errors.password && <p className="text-red-600 text-xs mt-1">{errors.password}</p>}
          </div>

          <div>
            <label className="block text-sm text-white mb-1">Confirm Password</label>
            <input
              name="confirm" type="password" value={form.confirm} onChange={handleChange}
              className="w-full rounded-lg border border-white/50 bg-white/10 px-3 py-2 text-white placeholder-white/60 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-300"
              placeholder="••••••••"
            />
            {errors.confirm && <p className="text-red-600 text-xs mt-1">{errors.confirm}</p>}
          </div>

          {serverMsg && (
            <p className={`text-sm text-center ${serverMsg.startsWith("✅") ? "text-green-600" : "text-red-600"}`}>
              {serverMsg}
            </p>
          )}

          <button
            type="submit" disabled={loading}
            className="w-full rounded-lg bg-blue-500 px-4 py-2 font-medium text-white hover:bg-blue-600 disabled:opacity-60"
          >
            {loading ? "Creating account..." : "Sign Up"}
          </button>

          <p className="text-center text-sm text-white/80">
            Already have an account?{" "}
            <Link to="/" className="underline hover:text-white">Sign In</Link>
          </p>
        </form>
      </div>
    </div>
  );
}