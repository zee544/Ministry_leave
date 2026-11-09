import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Eye,
  FileText,
  List,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  Menu,
  X,
  Filter,
  User,
  Moon,
  Sun,
  Save,
} from "lucide-react";
import { apiUrl } from "../api.js";
import Reports from "../Admin/reports.jsx";
import LeaveApprovalModal from "../hooks/LeaveApprovalModal.jsx";
import { useUser } from "../hooks/UserContext.jsx";

const EMPTY_FILTERS = {
  employee: "",
  division: "",
  leaveType: "",
  dateFrom: "",
  dateTo: "",
};
const PAGE_SIZE = 20;

function displayDate(value) {
  if (!value) return "—";
  return String(value).replace("T", " ").replace(/\.000Z$/, "");
}

export default function SystemAdminDashboard() {
  const navigate = useNavigate();
  const { currentUser, logout, updateCurrentUser } = useUser();
  const [leaves, setLeaves] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeSection, setActiveSection] = useState("leaves");
  const [selectedLeave, setSelectedLeave] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(
    () => localStorage.getItem("systemAdminTheme") === "dark"
  );
  const [profile, setProfile] = useState({
    name: currentUser?.name || "",
    email: currentUser?.email || "",
    username: currentUser?.username || "",
    phone: currentUser?.phone || "",
    designation: currentUser?.designation || "System Administrator",
    role: "system_admin",
  });
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileMessage, setProfileMessage] = useState("");

  const loadApprovedLeaves = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setError("Your session has expired. Please sign in again.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError("");
    try {
      const response = await fetch(apiUrl("/api/admin/system-admin/approved-leaves"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to load approved leave records.");
      if (!Array.isArray(data)) throw new Error("The approved leave response was not a list.");
      setLeaves(data.filter((leave) => leave.status === "Approved"));
    } catch (loadError) {
      setError(loadError.message || "Unable to load approved leave records.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadSystemAdminProfile = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setProfileError("Your session has expired. Please sign in again.");
      return;
    }

    setIsProfileLoading(true);
    setProfileError("");
    try {
      const response = await fetch(apiUrl("/api/auth/system-admin/profile"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to load your profile.");
      setProfile(data.profile);
      updateCurrentUser(data.profile);
    } catch (loadError) {
      setProfileError(loadError.message || "Unable to load your profile.");
    } finally {
      setIsProfileLoading(false);
    }
  }, [updateCurrentUser]);

  useEffect(() => {
    loadApprovedLeaves();
  }, [loadApprovedLeaves]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDarkMode);
    try {
      localStorage.setItem("systemAdminTheme", isDarkMode ? "dark" : "light");
    } catch (storageError) {
      console.warn("Unable to save System Admin theme preference:", storageError);
    }
  }, [isDarkMode]);

  useEffect(() => () => document.documentElement.classList.remove("dark"), []);

  const divisions = useMemo(
    () => [...new Set(leaves.map((leave) => leave.division).filter(Boolean))].sort(),
    [leaves]
  );
  const leaveTypes = useMemo(
    () => [...new Set(leaves.map((leave) => leave.type).filter(Boolean))].sort(),
    [leaves]
  );

  const filteredLeaves = useMemo(() => {
    const employeeQuery = filters.employee.trim().toLowerCase();
    return leaves.filter((leave) => {
      const submittedDate = String(leave.submittedAt || leave.createdAt || leave.appliedOn || "").slice(0, 10);
      if (employeeQuery && !String(leave.employee || "").toLowerCase().includes(employeeQuery)) return false;
      if (filters.division && leave.division !== filters.division) return false;
      if (filters.leaveType && leave.type !== filters.leaveType) return false;
      if (filters.dateFrom && submittedDate < filters.dateFrom) return false;
      if (filters.dateTo && submittedDate > filters.dateTo) return false;
      return true;
    });
  }, [leaves, filters]);
  const totalPages = Math.max(1, Math.ceil(filteredLeaves.length / PAGE_SIZE));
  const displayPage = Math.min(currentPage, totalPages);
  const paginatedLeaves = useMemo(
    () => filteredLeaves.slice((displayPage - 1) * PAGE_SIZE, displayPage * PAGE_SIZE),
    [filteredLeaves, displayPage]
  );

  const handleLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  const updateFilter = (event) => {
    const { name, value } = event.target;
    setFilters((current) => ({ ...current, [name]: value }));
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setCurrentPage(1);
  };

  const updateProfileField = (event) => {
    const { name, value } = event.target;
    setProfile((current) => ({ ...current, [name]: value }));
    setProfileError("");
    setProfileMessage("");
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setProfileError("");
    setProfileMessage("");
    setIsProfileSaving(true);
    try {
      const response = await fetch(apiUrl("/api/auth/system-admin/profile"), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          name: profile.name,
          email: profile.email,
          phone: profile.phone,
          designation: profile.designation,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Unable to update your profile.");
      setProfile(data.profile);
      updateCurrentUser(data.profile);
      setProfileMessage(data.message || "Profile updated successfully.");
    } catch (saveError) {
      setProfileError(saveError.message || "Unable to update your profile.");
    } finally {
      setIsProfileSaving(false);
    }
  };

  // ==========================================
  // 🎨 THEME COLOR SETTINGS
  // Change "blue" below to "indigo", "teal", "emerald", or "slate" to match your brand.
  // ==========================================
  const primaryBg = "bg-blue-600 dark:bg-blue-600";
  const primaryHover = "hover:bg-blue-700 dark:hover:bg-blue-700";
  const primaryText = "text-blue-600 dark:text-blue-400";
  const primaryLightBg = "bg-blue-50 dark:bg-blue-900/30";
  const primaryRing = "focus:ring-blue-500 focus:border-blue-500";
  const activeTabStyle = `${primaryBg} text-white shadow-md shadow-blue-200 dark:shadow-blue-900/30`;
  const inactiveTabStyle = "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800";

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden font-sans">
      
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      {/* SIDEBAR */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 w-72 bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 
        flex flex-col transition-transform duration-300 ease-in-out
        ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
      `}>
        <div className="p-6 flex items-center justify-between border-b border-slate-100 dark:border-slate-800/50">
          <div className="flex items-center gap-3">
            <div className={`${primaryLightBg} ${primaryText} p-2.5 rounded-xl`}>
              <ShieldCheck size={24} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-white leading-tight">System Admin</h1>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Read-Only Access</p>
            </div>
          </div>
          <button className="lg:hidden text-slate-500 hover:text-slate-800 dark:hover:text-white" onClick={() => setIsMobileMenuOpen(false)}>
            <X size={24} />
          </button>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          <button
            onClick={() => { setActiveSection("leaves"); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium text-sm ${activeSection === "leaves" ? activeTabStyle : inactiveTabStyle}`}
          >
            <List size={18} />
            Approved Leaves
          </button>
          <button
            onClick={() => { setActiveSection("reports"); setIsMobileMenuOpen(false); }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium text-sm ${activeSection === "reports" ? activeTabStyle : inactiveTabStyle}`}
          >
            <FileText size={18} />
            Reports
          </button>
          <button
            onClick={() => {
              setActiveSection("profile");
              setIsMobileMenuOpen(false);
              loadSystemAdminProfile();
            }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 font-medium text-sm ${activeSection === "profile" ? activeTabStyle : inactiveTabStyle}`}
          >
            <User size={18} />
            Profile
          </button>
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
          <div className="mb-4 px-2 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400">
              <User size={20} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-800 dark:text-white truncate">{currentUser?.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{currentUser?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 dark:text-red-400 dark:bg-red-900/20 dark:hover:bg-red-900/40 rounded-xl transition-colors"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        
        {/* HEADER */}
        <header className="bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 lg:px-8 py-4 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <button className="lg:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg dark:text-slate-300 dark:hover:bg-slate-800" onClick={() => setIsMobileMenuOpen(true)}>
              <Menu size={20} />
            </button>
            <h2 className="text-lg lg:text-xl font-bold text-slate-800 dark:text-white capitalize">
              {activeSection === "leaves"
                ? "Approved Leave Records"
                : activeSection === "reports" ? "System Reports" : "Profile Settings"}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsDarkMode((dark) => !dark)}
              aria-label={`Switch to ${isDarkMode ? "light" : "dark"} mode`}
              title={`Switch to ${isDarkMode ? "light" : "dark"} mode`}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
              <span className="hidden sm:inline">{isDarkMode ? "Light Mode" : "Dark Mode"}</span>
            </button>
            {activeSection === "leaves" && (
              <button
                onClick={loadApprovedLeaves}
                disabled={isLoading}
                className="hidden sm:flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-800 transition-colors shadow-sm disabled:opacity-50"
              >
                <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
                Refresh Data
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-8">
          {activeSection === "leaves" ? (
            <div className="max-w-7xl mx-auto space-y-6">
              
              {/* FILTERS */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2 mb-4">
                  <Filter size={18} className={primaryText} />
                  <h3 className="text-sm font-bold text-slate-800 dark:text-white">Filter Records</h3>
                </div>
                
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                  <div className="relative">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">Search Employee</span>
                    <Search size={16} className="absolute left-3 top-9 text-slate-400" />
                    <input
                      name="employee" value={filters.employee} onChange={updateFilter} placeholder="Name..."
                      className={`w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 py-2.5 pl-10 pr-3 text-sm text-slate-800 dark:text-white outline-none focus:ring-2 transition-shadow ${primaryRing}`}
                    />
                  </div>
                  <div>
                    <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">Division</span>
                    <select name="division" value={filters.division} onChange={updateFilter} className={`w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm text-slate-800 dark:text-white outline-none focus:ring-2 ${primaryRing}`}>
                      <option value="">All divisions</option>
                      {divisions.map((division) => <option key={division} value={division}>{division}</option>)}
                    </select>
                  </div>
                  <div>
                    <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">Leave Type</span>
                    <select name="leaveType" value={filters.leaveType} onChange={updateFilter} className={`w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm text-slate-800 dark:text-white outline-none focus:ring-2 ${primaryRing}`}>
                      <option value="">All types</option>
                      {leaveTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                    </select>
                  </div>
                  <div>
                    <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">Date From</span>
                    <input type="date" name="dateFrom" value={filters.dateFrom} onChange={updateFilter} className={`w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm text-slate-800 dark:text-white outline-none focus:ring-2 ${primaryRing}`} />
                  </div>
                  <div>
                    <span className="mb-1.5 block text-xs font-semibold text-slate-600 dark:text-slate-400">Date To</span>
                    <input type="date" name="dateTo" value={filters.dateTo} onChange={updateFilter} className={`w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm text-slate-800 dark:text-white outline-none focus:ring-2 ${primaryRing}`} />
                  </div>
                </div>
                
                <div className="mt-4 flex justify-end">
                  <button onClick={clearFilters} className={`text-xs font-semibold ${primaryText} hover:underline`}>
                    Clear all filters
                  </button>
                </div>
              </div>

              {error && (
                <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
                  {error}
                </div>
              )}

              {/* TABLE */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1000px] text-left text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800">
                      <tr>
                        <th className="px-5 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Employee / Division</th>
                        <th className="px-5 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Leave Details</th>
                        <th className="px-5 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Duration</th>
                        <th className="px-5 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Apply Date</th>
                        <th className="px-5 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Final Approver</th>
                        <th className="px-5 py-4 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                      {paginatedLeaves.map((leave) => (
                        <tr key={leave.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group">
                          <td className="px-5 py-4">
                            <div className="font-semibold text-slate-800 dark:text-white">{leave.employee}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{leave.division}</div>
                          </td>
                          <td className="px-5 py-4">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                              {leave.type}
                            </span>
                            <div className="text-xs text-slate-500 mt-1">{leave.noOfDays} Days</div>
                          </td>
                          <td className="px-5 py-4 whitespace-nowrap text-slate-700 dark:text-slate-300">
                            <div className="flex flex-col gap-1 text-xs">
                              <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded w-max dark:bg-emerald-900/30 dark:text-emerald-400">From: {leave.from}</span>
                              <span className="bg-rose-50 text-rose-700 px-2 py-0.5 rounded w-max dark:bg-rose-900/30 dark:text-rose-400">To: {leave.to}</span>
                            </div>
                          </td>
                          <td className="px-5 py-4 whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                            {displayDate(leave.submittedAt || leave.createdAt || leave.appliedOn)}
                          </td>
                          <td className="px-5 py-4">
                            <div className="font-medium text-slate-800 dark:text-slate-200">{leave.approvedBy || leave.secretaryName || "System Admin"}</div>
                            <div className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-500 mt-0.5">{leave.approverRole || "Completed"}</div>
                          </td>
                          <td className="px-5 py-4 text-center">
                            <button
                              type="button"
                              onClick={() => { setSelectedLeave(leave); setShowForm(true); }}
                              className={`inline-flex items-center gap-1.5 rounded-lg ${primaryLightBg} ${primaryText} px-3 py-1.5 text-xs font-bold ${primaryHover} hover:text-white transition-colors`}
                            >
                              <Eye size={14} />
                              View Form
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!isLoading && filteredLeaves.length === 0 && (
                        <tr>
                          <td colSpan="6" className="px-5 py-16 text-center">
                            <div className="flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
                              <Search size={40} className="mb-3 opacity-20" />
                              <p className="text-base font-semibold text-slate-600 dark:text-slate-300">No records found</p>
                              <p className="text-sm mt-1">Try adjusting your search or filter criteria.</p>
                            </div>
                          </td>
                        </tr>
                      )}
                      {isLoading && (
                        <tr>
                          <td colSpan="6" className="px-5 py-16 text-center">
                            <RefreshCw size={30} className={`animate-spin mx-auto mb-3 ${primaryText}`} />
                            <p className="text-sm font-medium text-slate-500">Loading approved leaves...</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {filteredLeaves.length === 0
                      ? "0 matching records"
                      : `Showing ${(displayPage - 1) * PAGE_SIZE + 1}–${Math.min(displayPage * PAGE_SIZE, filteredLeaves.length)} of ${filteredLeaves.length} matching records`}
                  </p>
                  <div className="flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      disabled={displayPage <= 1}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Previous
                    </button>
                    <span className="min-w-24 text-center text-sm font-medium text-slate-700 dark:text-slate-300">
                      Page {displayPage} of {totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                      disabled={displayPage >= totalPages}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : activeSection === "reports" ? (
            <div className="max-w-7xl mx-auto">
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
                <Reports leaves={leaves} />
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl">
              <form
                onSubmit={saveProfile}
                className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <div>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-white">Your System Admin Profile</h3>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Update your own contact details. Username and role cannot be changed.
                  </p>
                </div>
                {profileError && (
                  <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                    {profileError}
                  </p>
                )}
                {profileMessage && (
                  <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400">
                    {profileMessage}
                  </p>
                )}
                {isProfileLoading ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">Loading profile…</p>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Full name
                      <input
                        required
                        maxLength={100}
                        name="name"
                        value={profile.name || ""}
                        onChange={updateProfileField}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-blue-900/40"
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Email
                      <input
                        required
                        type="email"
                        maxLength={150}
                        name="email"
                        value={profile.email || ""}
                        onChange={updateProfileField}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-blue-900/40"
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Phone number
                      <input
                        type="tel"
                        maxLength={30}
                        name="phone"
                        value={profile.phone || ""}
                        onChange={updateProfileField}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-blue-900/40"
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Designation
                      <input
                        required
                        maxLength={100}
                        name="designation"
                        value={profile.designation || ""}
                        onChange={updateProfileField}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-blue-900/40"
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Username
                      <input
                        readOnly
                        value={profile.username || ""}
                        className="mt-1 w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400"
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Account role
                      <input
                        readOnly
                        value={profile.role || "system_admin"}
                        className="mt-1 w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400"
                      />
                    </label>
                  </div>
                )}
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isProfileLoading || isProfileSaving}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Save size={16} />
                    {isProfileSaving ? "Saving…" : "Save Profile"}
                  </button>
                </div>
              </form>
            </div>
          )}
        </main>
      </div>

      {showForm && selectedLeave && (
        <LeaveApprovalModal
          selectedLeave={selectedLeave}
          setShowPrintModal={setShowForm}
          setSelectedLeave={setSelectedLeave}
          leaveRecords={leaves}
        />
      )}
    </div>
  );
}