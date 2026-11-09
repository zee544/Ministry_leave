import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { apiUrl } from "../api.js";

const EMPTY_ACCOUNT = { username: "", email: "", password: "", confirmPassword: "" };

function AccountFields({ number, account, onChange }) {
  return (
    <fieldset className="rounded-xl border border-slate-200 p-4 sm:p-5">
      <legend className="px-2 text-base font-semibold text-slate-800">
        System Admin Account {number}
      </legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Username
          <input
            required
            minLength={3}
            maxLength={80}
            pattern="[A-Za-z0-9._-]+"
            autoComplete="username"
            name="username"
            value={account.username}
            onChange={onChange}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            placeholder={`system-admin-${number}`}
          />
          <span className="mt-1 block text-xs font-normal text-slate-500">
            Letters, numbers, dots, underscores, and hyphens.
          </span>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Email
          <input
            required
            type="email"
            maxLength={150}
            autoComplete="email"
            name="email"
            value={account.email}
            onChange={onChange}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            placeholder="name@example.gov"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Password
          <input
            required
            type="password"
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            name="password"
            value={account.password}
            onChange={onChange}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
          <span className="mt-1 block text-xs font-normal text-slate-500">
            12+ characters with uppercase, lowercase, a number, and a symbol.
          </span>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Confirm password
          <input
            required
            type="password"
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            name="confirmPassword"
            value={account.confirmPassword}
            onChange={onChange}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
          />
        </label>
      </div>
    </fieldset>
  );
}

export default function SystemAdminSetup() {
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState([
    { ...EMPTY_ACCOUNT },
    { ...EMPTY_ACCOUNT },
  ]);
  const [setupKey, setSetupKey] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateAccount = (index, event) => {
    const { name, value } = event.target;
    setAccounts((current) =>
      current.map((account, accountIndex) =>
        accountIndex === index ? { ...account, [name]: value } : account
      )
    );
    setError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    const normalized = accounts.map((account) => ({
      ...account,
      username: account.username.trim(),
      email: account.email.trim().toLowerCase(),
    }));
    if (
      normalized[0].username.toLowerCase() === normalized[1].username.toLowerCase() ||
      normalized[0].email === normalized[1].email
    ) {
      setError("Each System Admin must have a different username and email address.");
      return;
    }
    if (normalized.some((account) => account.password !== account.confirmPassword)) {
      setError("The password and confirmation must match for both accounts.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(apiUrl("/api/auth/system-admin-setup"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          setupKey,
          accounts: normalized.map(({ username, email, password }) => ({
            username,
            email,
            password,
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "System Admin account setup failed.");
      }

      setSuccess(data.message || "Both System Admin accounts were created.");
      setAccounts([{ ...EMPTY_ACCOUNT }, { ...EMPTY_ACCOUNT }]);
      setSetupKey("");
      window.setTimeout(() => navigate("/", { replace: true }), 2500);
    } catch (requestError) {
      setError(requestError.message || "Could not connect to the server.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <Link
          to="/"
          className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-indigo-700 hover:text-indigo-900"
        >
          <ArrowLeft size={16} />
          Back to login
        </Link>

        <section className="rounded-2xl bg-white p-5 shadow-lg sm:p-8">
          <div className="mb-6 flex items-start gap-3">
            <div className="rounded-xl bg-indigo-100 p-3 text-indigo-700">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">System Admin Setup</h1>
              <p className="mt-1 text-sm text-slate-600">
                Create the two independent System Admin accounts. Setup is available only once.
              </p>
            </div>
          </div>

          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Enter the one-time setup key supplied by your backend administrator. The key must be
            configured in the backend and is never stored in the frontend.
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <AccountFields number={1} account={accounts[0]} onChange={(event) => updateAccount(0, event)} />
            <AccountFields number={2} account={accounts[1]} onChange={(event) => updateAccount(1, event)} />

            <label className="block text-sm font-medium text-slate-700">
              One-time setup key
              <input
                required
                type="password"
                minLength={32}
                maxLength={256}
                autoComplete="off"
                value={setupKey}
                onChange={(event) => {
                  setSetupKey(event.target.value);
                  setError("");
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                placeholder="Enter the backend-configured setup key"
              />
            </label>

            {error && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </p>
            )}
            {success && (
              <p role="status" className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                {success} Returning to login…
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting || Boolean(success)}
              className="w-full rounded-lg bg-indigo-700 px-4 py-3 font-semibold text-white transition hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Creating accounts…" : "Create Both System Admin Accounts"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
