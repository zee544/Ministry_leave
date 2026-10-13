import { apiUrl } from "./api.js";
import { useState, useEffect } from "react"
import { useNavigate, Link } from "react-router-dom"
import { hashPassword } from "./utils/passwordHash"
import { useUser } from "./hooks/UserContext.jsx"

// Non-admin demo accounts for testing HOD and Employee roles.
// All 12 Division Admin accounts are stored and authenticated directly via MySQL database.
const DEMO_ACCOUNTS = [
  {
    email: "hod@ministry.gov.lk",
    password: "Hod@1234",
    name: "Emily Nyambura",
    designation: "Head of Division",
    division: "Administration",
    role: "hod",
    employeeId: "EMP-2023-0002",
  },
  {
    email: "nancy.moraa@ministry.gov.lk",
    password: "Nancy@123",
    name: "Nancy Moraa",
    designation: "Procurement Officer",
    division: "Administration",
    role: "employee",
    employeeId: "EMP-2023-0042",
  },
  {
    email: "nancy.moraa@mini.gov.lk",
    password: "Nancy@156",
    name: "pink Noraa",
    designation: "Procurement Officer",
    division: "Administration",
    role: "employee",
    employeeId: "EMP-2023-0047",
  },
];

function App() {
  const navigate = useNavigate();
  const { login, currentUser, isAuthenticated } = useUser();

  const [FormData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [errors, seterrors] = useState({});
  const [credentialError, setCredentialError] = useState("");
  const [isSubmitting, setisSubmitting] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotMsg, setForgotMsg] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // ═══════════════════════════════════════════════
  // ✅ AUTO-REDIRECT: If already logged in, skip login page
  // ═══════════════════════════════════════════════
  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");

    let user = currentUser;
    if (!user && storedUser) {
      try {
        user = JSON.parse(storedUser);
      } catch (e) {
        user = null;
      }
    }

    if (token && user && user.role) {
      if (user.role === "admin") navigate("/Admindashboard", { replace: true });
      else if (user.role === "hod") navigate("/hoddashboard", { replace: true });
      else if (user.role === "employee") navigate("/userdashboard", { replace: true });
    }
  }, [currentUser, isAuthenticated, navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...FormData, [name]: value });

    if (errors[name]) {
      seterrors({ ...errors, [name]: '' });
    }
    if (credentialError) {
      setCredentialError("");
    }
  };

  const validateForm = () => {
    let tempErrors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!FormData.email) {
      tempErrors.email = 'Email is required';
    } else if (!emailRegex.test(FormData.email)) {
      tempErrors.email = 'Please enter a valid email address';
    }

    if (!FormData.password) {
      tempErrors.password = "Password is required";
    } else if (FormData.password.length < 8) {
      tempErrors.password = "Password must be at least 8 characters";
    } else if (!/[A-Z]/.test(FormData.password)) {
      tempErrors.password = "Password must contain at least one uppercase letter";
    } else if (!/[a-z]/.test(FormData.password)) {
      tempErrors.password = "Password must contain at least one lowercase letter";
    } else if (!/[0-9]/.test(FormData.password)) {
      tempErrors.password = "Password must contain at least one number";
    } else if (!/[!@#$%^&*(),.?":{}|<>]/.test(FormData.password)) {
      tempErrors.password = "Password must contain at least one special character";
    }

    seterrors(tempErrors);
    return Object.keys(tempErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (validateForm()) {
      setisSubmitting(true);
      setCredentialError("");

      try {
        let loginAttempted = false;
        try {
          const res = await fetch(apiUrl("/api/auth/login"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: FormData.email.trim(),
              password: FormData.password,
            }),
          });

          loginAttempted = true;

          if (res.ok) {
            const data = await res.json();
            login(data.user, data.token);

            await new Promise((resolve) => setTimeout(resolve, 600));

            if (data.user.role === "admin") navigate("/Admindashboard");
            else if (data.user.role === "hod") navigate("/hoddashboard");
            else navigate("/userdashboard");
            return;
          } else if (res.status === 401) {
            const demoAccount = DEMO_ACCOUNTS.find(
              (acc) =>
                acc.email.toLowerCase() === FormData.email.toLowerCase() &&
                acc.password === FormData.password
            );
            if (demoAccount && demoAccount.role !== "admin") {
              login(demoAccount);
              await new Promise((resolve) => setTimeout(resolve, 600));
              if (demoAccount.role === "hod") navigate("/hoddashboard");
              else navigate("/userdashboard");
              return;
            }

            setCredentialError("Invalid email or password. Please try again.");
            return;
          }
        } catch (apiErr) {
          console.warn("Backend API request error, checking fallback:", apiErr.message);
        }

        if (!loginAttempted) {
          const account = DEMO_ACCOUNTS.find(
            (acc) =>
              acc.email.toLowerCase() === FormData.email.toLowerCase() &&
              acc.password === FormData.password
          );

          if (!account) {
            setCredentialError("Invalid email or password. Please try again.");
            return;
          }

          login({
            name: account.name,
            email: account.email,
            designation: account.designation,
            division: account.division,
            role: account.role,
            employeeId: account.employeeId,
          });
          await new Promise((resolve) => setTimeout(resolve, 600));

          if (account.role === "admin") navigate("/Admindashboard");
          else if (account.role === "hod") navigate("/hoddashboard");
          else navigate("/userdashboard");
        }
      } catch (error) {
        console.error("Login failed:", error);
        setCredentialError("Login error. Please try again.");
      } finally {
        setisSubmitting(false);
      }
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!forgotEmail || !forgotEmail.trim()) {
      setForgotMsg("Please enter your email address.");
      return;
    }
    if (!emailRegex.test(forgotEmail.trim())) {
      setForgotMsg("Please enter a valid email address.");
      return;
    }

    setIsSending(true);
    setForgotMsg("Sending reset link... please wait");

    try {
      const res = await fetch(apiUrl("/api/auth/forgot-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });

      const data = await res.json();

      if (res.ok) {
        const isNotRegistered = data.notRegistered === true;

        if (isNotRegistered) {
          setForgotMsg(
            data.message ||
              "❌ This email is not registered. Please check the email address or contact your division administrator."
          );
        } else {
          setForgotMsg(
            data.message ||
              "A password reset link has been sent. Please check your inbox"
          );
          setTimeout(() => {
            setShowForgot(false);
            setForgotMsg("");
            setForgotEmail("");
          }, 8000);
        }
      } else {
        setForgotMsg(`${data.message || "Failed to send reset link. Try again."}`);
      }
    } catch (err) {
      console.error("Forgot password error:", err);
      setForgotMsg("Could not connect to server. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-red-500 via-cyan-500 to-red-500 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
        <div className="text-white p-4 lg:p-8 text-center lg:text-left">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl text-white">Welcome</h1>
          <br />
          <h3 className="text-white text-2xl sm:text-3xl lg:text-4xl">Ministry of Fisheries,Aquatic<br /> and Ocean Resources</h3>
        </div>

        <div className="w-full rounded-2xl border border-white/40 bg-white/20 p-6 sm:p-8 lg:p-10 shadow-2xl backdrop-blur-xl">
          <h1 className="text-2xl sm:text-3xl text-center text-white">Sign In</h1>
          <br /><br />

          <form onSubmit={handleSubmit}>
            {errors.email && <span className="text-red-600">{errors.email}</span>}
            <div className="mb-4">
              <label className="mb-1 block text-xl font-medium text-white">Email</label>
              <input
                type="email"
                id="email"
                name="email"
                value={FormData.email}
                onChange={handleChange}
                className={errors.email ? 'w-full rounded-lg border px-3 py-2 transition outline-none border-red-500 ring-2 ring-red-500' : "w-full rounded-lg border border-white/50 bg-white/10 px-3 py-2 text-white transition outline-none placeholder-white/60 focus:border-blue-300 focus:ring-2 focus:ring-blue-300"}
              />
            </div>

            {errors.password && <span className="text-red-600">{errors.password}</span>}
            <div className="mb-6">
              <label className="mb-1 block text-xl font-medium text-white">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  name="password"
                  value={FormData.password}
                  onChange={handleChange}
                  className={
                    errors.password
                      ? "w-full rounded-lg border px-3 py-2 pr-12 transition outline-none border-red-500 ring-2 ring-red-500"
                      : "w-full rounded-lg border border-white/50 bg-white/10 px-3 py-2 pr-12 text-white transition outline-none placeholder-white/60 focus:border-blue-300 focus:ring-2 focus:ring-blue-300"
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white transition-colors cursor-pointer"
                  title={showPassword ? "Hide password" : "Show password"}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button type="submit" className="w-full rounded-lg bg-blue-500 px-4 py-2 font-medium text-white transition duration-300 hover:bg-blue-600" disabled={isSubmitting}>{isSubmitting ? 'Signing In...' : 'Sign In'}</button>

            {credentialError && (
              <p className="mt-3 text-sm text-center text-red-600">{credentialError}</p>
            )}

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => setShowForgot(true)}
                className="text-sm text-white hover:text-white/80"
              >
                Forgot Password?
              </button>
            </div>

            <div className="mt-6 pt-4 border-t border-white/20 text-center">
              <p className="text-xs text-white/80 mb-2 font-medium">Division Administrator?</p>
              <Link
                to="/admin-signup"
                className="inline-block w-full rounded-lg border border-white/50 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20 shadow-sm"
              >
                Division Admin Sign Up
              </Link>
              
              <p className="text-xs text-white/60 mt-2">Head of Division?</p>
              <Link
                to="/hod-signup"
                className="inline-block w-full rounded-lg border border-white/50 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20 shadow-sm"
              >
                HOD Sign Up
              </Link>
              
              <p className="text-[10px] text-white/60 mt-2">
                Employee accounts are provisioned exclusively by their division administrator.
              </p>
            </div>
          </form>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgot && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-2">Reset Password</h2>
            <p className="text-sm text-gray-500 mb-4">
              Enter your email address and we will send you a link to reset your password.
            </p>

            <form onSubmit={handleForgotPassword}>
              <input
                type="email"
                value={forgotEmail}
                onChange={(e) => {
                  setForgotEmail(e.target.value);
                  setForgotMsg("");
                }}
                placeholder="youremail@gmail.com"
                disabled={isSending}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 mb-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              />

              {forgotMsg && (
                <p
                  className={`text-xs mb-3 font-medium ${
                    forgotMsg.toLowerCase().includes("sending") || forgotMsg.toLowerCase().includes("please wait")
                      ? "text-blue-600"
                      : forgotMsg.toLowerCase().includes("inbox") || forgotMsg.toLowerCase().includes("sent")
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {forgotMsg}
                </p>
              )}

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  disabled={isSending}
                  onClick={() => {
                    setShowForgot(false);
                    setForgotMsg("");
                    setForgotEmail("");
                  }}
                  className="px-4 py-2 text-sm text-white bg-gray-500 rounded-lg hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSending}
                  className="px-4 py-2 text-sm text-white bg-blue-500 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed min-w-[120px]"
                >
                  {isSending ? "Sending..." : "Send Reset Link"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default App