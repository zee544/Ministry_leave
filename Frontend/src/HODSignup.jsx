import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";

const MINISTRY_DIVISIONS = [
  "Accounts",
  "Administration",
  "Agriculture",
  "Development",
  "Engineering",
  "Fisheries & Ocean Resources",
  "Government Audit",
  "Human Resources",
  "Legal",
  "Planning",
  "Statistics",
  "Technical"
];

function HODSignup() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    division: "",
    password: "",
    confirmPassword: "",
  });

  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [divisionsStatus, setDivisionsStatus] = useState([]);

  useEffect(() => {
    fetch("/api/auth/divisions-status")
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setDivisionsStatus(data);
        }
      })
      .catch((err) => {
        console.warn("Could not fetch divisions status:", err.message);
        // Use default divisions if API fails
        setDivisionsStatus(MINISTRY_DIVISIONS.map(d => ({ name: d, hasHOD: false })));
      });
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });

    if (errors[name]) {
      setErrors({ ...errors, [name]: "" });
    }
    if (serverError) {
      setServerError("");
    }
  };

  const validateForm = () => {
    const tempErrors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!formData.name.trim()) {
      tempErrors.name = "Full Name is required";
    }

    if (!formData.email.trim()) {
      tempErrors.email = "Official Email is required";
    } else if (!emailRegex.test(formData.email.trim())) {
      tempErrors.email = "Please enter a valid email address";
    }

    if (!formData.division) {
      tempErrors.division = "Please select your division";
    }

    if (!formData.password) {
      tempErrors.password = "Password is required";
    } else if (formData.password.length < 8) {
      tempErrors.password = "Password must be at least 8 characters";
    } else if (!/[A-Z]/.test(formData.password)) {
      tempErrors.password = "Password must contain at least one uppercase letter";
    } else if (!/[a-z]/.test(formData.password)) {
      tempErrors.password = "Password must contain at least one lowercase letter";
    } else if (!/[0-9]/.test(formData.password)) {
      tempErrors.password = "Password must contain at least one number";
    } else if (!/[!@#$%^&*(),.?":{}|<>]/.test(formData.password)) {
      tempErrors.password = "Password must contain at least one special character";
    }

    if (!formData.confirmPassword) {
      tempErrors.confirmPassword = "Confirm password is required";
    } else if (formData.password !== formData.confirmPassword) {
      tempErrors.confirmPassword = "Passwords do not match";
    }

    setErrors(tempErrors);
    return Object.keys(tempErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (validateForm()) {
      setIsSubmitting(true);
      setServerError("");
      setSuccessMessage("");

      try {
        const res = await fetch("/api/auth/hod-signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formData.name.trim(),
            email: formData.email.trim(),
            division: formData.division,
            password: formData.password,
          }),
        });

        const data = await res.json();

        if (res.ok) {
          setSuccessMessage(
            `HOD for "${formData.division}" registered successfully! Redirecting to Sign In...`
          );
          setTimeout(() => {
            navigate("/");
          }, 2000);
        } else {
          setServerError(data.message || "HOD registration failed. Please try again.");
        }
      } catch (err) {
        console.error("HOD signup error:", err);
        setServerError("Could not connect to authentication server. Please try again.");
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const inputClass = (fieldName) =>
    errors[fieldName]
      ? "w-full rounded-lg border px-3 py-2 text-white bg-white/10 transition outline-none border-red-500 ring-2 ring-red-500 text-sm"
      : "w-full rounded-lg border border-white/50 bg-white/10 px-3 py-2 text-white transition outline-none placeholder-white/60 focus:border-blue-300 focus:ring-2 focus:ring-blue-300 text-sm";

  return (
<div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-800 to-cyan-700 p-4 lg:p-8 flex items-center justify-center">
      <div className="max-w-5xl w-full grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
        {/* Left Section */}
        <div className="text-white p-6 lg:p-10">
          <span className="inline-block px-3 py-1 bg-white/20 backdrop-blur-md rounded-full text-xs font-semibold tracking-wider uppercase mb-4 border border-white/30">
            Head of Division Registration
          </span>
          <h1 className="text-4xl lg:text-5xl font-bold leading-tight mb-4">
            HOD Registration
          </h1>
          <h3 className="text-xl lg:text-2xl font-light text-white/90 mb-6">
            Ministry of Fisheries, Aquatic and Ocean Resources
          </h3>
          <div className="space-y-4 text-sm text-white/80 border-t border-white/20 pt-6">
            <div>
              <strong className="text-white">HOD Privileges:</strong> Register as the Head of Division for your division. Each division can have only one HOD.
            </div>
            <div>
              <strong className="text-white">Final Approvals:</strong> HODs provide final approval for leave applications after admin pre-approval.
            </div>
            <div>
              <strong className="text-white">Division Isolation:</strong> Your dashboard automatically shows only your division's employees and leave requests.
            </div>
          </div>
        </div>

        {/* Right Card */}
        <div className="w-full rounded-2xl border border-white/40 bg-white/20 p-8 lg:p-10 shadow-2xl backdrop-blur-xl">
          <div className="text-center mb-6">
            <h2 className="text-2xl lg:text-3xl font-bold text-white">Create HOD Account</h2>
            <p className="text-xs text-white/80 mt-1">
              Register as Head of Division for your ministry division
            </p>
          </div>

          {serverError && (
            <div className="mb-4 p-3 rounded-lg bg-red-600/80 border border-red-400 text-white text-xs">
              ⚠️ {serverError}
            </div>
          )}

          {successMessage && (
            <div className="mb-4 p-3 rounded-lg bg-green-600/80 border border-green-400 text-white text-xs font-medium">
              ✅ {successMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-white mb-1">Full Name</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g. Dr. Samuel Kiprop"
                className={inputClass("name")}
              />
              {errors.name && <span className="text-red-300 text-xs mt-1 block">{errors.name}</span>}
            </div>

            <div>
              <label className="block text-xs font-medium text-white mb-1">Official Email Address</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="hod.division@ministry.gov.lk"
                className={inputClass("email")}
              />
              {errors.email && <span className="text-red-300 text-xs mt-1 block">{errors.email}</span>}
            </div>

            <div>
              <label className="block text-xs font-medium text-white mb-1">Assigned Division</label>
              <select
                name="division"
                value={formData.division}
                onChange={handleChange}
                className="w-full rounded-lg border border-white/50 bg-white/20 px-3 py-2 text-white transition outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-300 text-sm [&>option]:text-gray-900"
              >
                <option value="">Select Ministry Division</option>
                {(divisionsStatus.length > 0 ? divisionsStatus : MINISTRY_DIVISIONS.map((d) => ({ name: d, hasHOD: false }))).map((div) => {
                  const divName = typeof div === "string" ? div : div.name;
                  const isTaken = div.hasHOD || false;
                  return (
                    <option key={divName} value={divName}>
                      {divName} {isTaken ? "(HOD Already Registered)" : "(Available)"}
                    </option>
                  );
                })}
              </select>
              {errors.division && <span className="text-red-300 text-xs mt-1 block">{errors.division}</span>}
            </div>

            <div>
              <label className="block text-xs font-medium text-white mb-1">Create Password</label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Minimum 8 characters"
                className={inputClass("password")}
              />
              {errors.password && <span className="text-red-300 text-xs mt-1 block">{errors.password}</span>}
              <span className="text-[10px] text-white/70 mt-1 block">
                Must contain 8+ characters, uppercase, lowercase, number & special symbol.
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-white mb-1">Confirm Password</label>
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Re-enter password"
                className={inputClass("confirmPassword")}
              />
              {errors.confirmPassword && (
                <span className="text-red-300 text-xs mt-1 block">{errors.confirmPassword}</span>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 rounded-lg bg-gray-300 py-2.5 px-4 font-semibold text-black transition duration-300 hover:bg-gray-100 disabled:opacity-50 shadow-lg text-sm"
            >
              {isSubmitting ? "Registering HOD..." : "Sign Up as Head of Division"}
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-white/20 text-center">
            <p className="text-xs text-white/80">
              Already have an account?{" "}
              <Link to="/" className="font-semibold text-white hover:underline">
                Sign In
              </Link>
            </p>
            <p className="text-xs text-white/60 mt-2">
              <Link to="/admin-signup" className="hover:underline">
                Division Admin Signup
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default HODSignup;