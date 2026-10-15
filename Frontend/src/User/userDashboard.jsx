import { useRef, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import UserHeader from "../Components/userHeader";
import UserSidebar from "../Components/usersidebar";
import ApplyLeave from "./ApplyLeave.jsx";
import { ClipboardList, Clock, CheckCircle, Users, User, CalendarPlus, FileText } from "lucide-react";
import Profile from "./profile";
import Myleaves from "./myleaves";
import Settings from "./settings";
import ActingApprovals from "./ActingApprovals";
import DataTable from "../Components/DataTable";
import { useNotifications } from "../hooks/NotificationContext.jsx";
import { useLeaves } from "../hooks/LeaveContext.jsx";
import { useUser } from "../hooks/UserContext.jsx";
import LeaveApprovalModal from "../hooks/LeaveApprovalModal.jsx";
import ConfirmModal from "../Components/ConfirmModal.jsx";

function UserDashboard() {
  const { currentUser } = useUser();
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = searchParams.get("tab") || "dashboard";

  const setActiveTab = (tab) => {
    if (tab === "dashboard") {
      setSearchParams({}, { replace: false });
    } else {
      setSearchParams({ tab }, { replace: false });
    }
  };

  const { getNotificationsForRole, markAsRead, addNotification } =
    useNotifications();
  const {
    leaves,
    getLeavesByActingOfficer,
    confirmActingOfficer,
    fetchLeaves,
    fetchActingOfficerLeaves,
  } = useLeaves();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const actingActionInFlight = useRef(false);

  const [confirmModal, setConfirmModal] = useState({
    open: false,
    leave: null,
    action: "confirm",
  });

  useEffect(() => {
    const loadLeaves = async () => {
      if (fetchLeaves) await fetchLeaves();
      if (fetchActingOfficerLeaves) await fetchActingOfficerLeaves();
    };
    loadLeaves();
  }, [activeTab, fetchLeaves, fetchActingOfficerLeaves]);

  const actingOfficerNotifs = getNotificationsForRole(
    "employee",
    currentUser.name
  ).filter((n) => n.type === "acting_officer" && !n.read);

  const myAssignments = getLeavesByActingOfficer(currentUser.name);
  const pendingConfirmations = myAssignments.filter(
    (l) => l.status === "Pending Acting Officer"
  );

  const askConfirm = (leave) =>
    setConfirmModal({ open: true, leave, action: "confirm" });
  const askDecline = (leave) =>
    setConfirmModal({ open: true, leave, action: "decline" });
  const closeModal = () =>
    setConfirmModal({ open: false, leave: null, action: "confirm" });

  const handleApproveActing = async (leave) => {
    setLoading(true);
    setToast("Processing...");

    try {
      await confirmActingOfficer(leave.id, "confirm");

      addNotification(
        `Leave application: ${leave.employee}'s ${leave.type} leave (${leave.from} to ${leave.to}) has been confirmed by the Acting Officer (${currentUser.name}) and is now awaiting your approval.`,
        "leave_application",
        "admin",
        leave.division,
        "/Admindashboard?tab=leaves"
      );
      addNotification(
        `Your ${leave.type} leave (${leave.from} to ${leave.to}) has been confirmed by your Acting Officer (${currentUser.name}) and forwarded to the Admin for approval.`,
        "status_update",
        leave.employee,
        leave.division,
        "/userdashboard?tab=myleaves"
      );
      addNotification(
        `${leave.employee}'s ${leave.type} leave (${leave.from} to ${leave.to}) has been confirmed by Acting Officer (${currentUser.name}) and is now awaiting Admin approval.`,
        "leave_application",
        "hod",
        leave.division,
        "/hoddashboard?tab=leaves"
      );

      setToast(`Confirmed ${leave.employee}'s leave. Sent to admin.`);
      setTimeout(() => setToast(""), 4000);

    } catch (error) {
      console.error("Error confirming acting officer:", error);
      setToast(`❌ Failed to confirm ${leave.employee}'s leave: ${error.message}`);
      setTimeout(() => setToast(""), 5000);
    } finally {
      setLoading(false);
    }
  };

  const handleDeclineActing = async (leave, reason) => {
    setLoading(true);
    setToast("Processing...");

    try {
      await confirmActingOfficer(leave.id, "decline", reason);

      const reasonText = reason ? ` Reason: ${reason}` : "";

      addNotification(
        `Your ${leave.type} leave (${leave.from} to ${leave.to}) was DECLINED by your Acting Officer (${currentUser.name}).${reasonText}`,
        "status_update",
        leave.employee,
        leave.division,
        "/userdashboard?tab=myleaves"
      );

      addNotification(
        `${leave.employee}'s ${leave.type} leave (${leave.from} to ${leave.to}) was DECLINED by Acting Officer (${currentUser.name}).${reasonText}`,
        "leave_application",
        "admin",
        leave.division,
        "/Admindashboard?tab=leaves"
      );

      addNotification(
        `${leave.employee}'s ${leave.type} leave (${leave.from} to ${leave.to}) was DECLINED by Acting Officer (${currentUser.name}).${reasonText}`,
        "leave_application",
        "hod",
        leave.division,
        "/hoddashboard?tab=leaves"
      );

      setToast(`❌ Declined ${leave.employee}'s leave.`);
      setTimeout(() => setToast(""), 4000);

    } catch (error) {
      console.error("Error declining acting officer:", error);
      setToast(`❌ Failed to decline ${leave.employee}'s leave: ${error.message}`);
      setTimeout(() => setToast(""), 5000);
    } finally {
      setLoading(false);
    }
  };

  const processAction = async (reason) => {
    const { leave, action } = confirmModal;
    if (!leave || actingActionInFlight.current) return;

    actingActionInFlight.current = true;
    try {
      if (action === "confirm") {
        await handleApproveActing(leave);
      } else {
        await handleDeclineActing(leave, reason);
      }
      closeModal();
    } finally {
      actingActionInFlight.current = false;
    }
  };

  const myLeaves = leaves.filter(
    (leave) =>
      Number(leave.applicantUserId ?? leave.applicant_user_id) === Number(currentUser.id) &&
      (leave.applicantRole ?? leave.applicant_role) === currentUser.role
  );
  const pendingCount = myLeaves.filter((l) => l.status === "Pending").length;
  const approvedCount = myLeaves.filter((l) => l.status === "Approved").length;
  const totalTaken = myLeaves.length;

  const stats = [
    {
      label: "Total Leaves Taken",
      value: totalTaken,
      icon: <ClipboardList className="w-6 h-6 lg:w-8 lg:h-8 text-white" />,
      color: "bg-blue-500",
    },
    {
      label: "Pending Requests",
      value: pendingCount,
      icon: <Clock className="w-6 h-6 lg:w-8 lg:h-8 text-white" />,
      color: "bg-yellow-500",
    },
    {
      label: "Approved",
      value: approvedCount,
      icon: <CheckCircle className="w-6 h-6 lg:w-8 lg:h-8 text-white" />,
      color: "bg-green-500",
    },
    {
      label: "Pending Acting Approvals",
      value: pendingConfirmations.length,
      icon: <Users className="w-6 h-6 lg:w-8 lg:h-8 text-white" />,
      color: "bg-amber-500",
    },
  ];

  // ---- Shared compact status renderer for mobile ----
  const renderMobileStatus = (item, getStatusBadge) => {
    const size = "px-2 py-0.5 text-[10px] rounded-md font-medium";

    if (item.status === "Admin Approved") {
      return (
        <span className={`${size} bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300`}>
          Awaiting HOD
        </span>
      );
    }
    if (item.status === "Pending Acting Officer") {
      return (
        <span className={`${size} bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300`}>
          Awaiting Acting Officer
        </span>
      );
    }
    if (item.status === "Declined") {
      const by = item.declinedBy || item.declined_by || "—";
      const reason = item.declineReason || item.decline_reason;
      return (
        <div className="flex flex-col gap-0.5 items-end">
          <span className={`${size} bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-700`}>
            ✗ Declined By {by}
          </span>
          {reason && (
            <span
              className="text-[10px] text-rose-500 dark:text-rose-300 italic whitespace-normal break-words leading-tight text-right"
              title={reason}
            >
              Reason: "{reason}"
            </span>
          )}
        </div>
      );
    }
    if (item.status === "Approved") {
      return (
        <span className={`${size} bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300`}>
          Approved
        </span>
      );
    }
    if (item.status === "Pending") {
      return (
        <span className={`${size} bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300`}>
          Pending
        </span>
      );
    }
    if (item.status === "Cancelled") {
      return (
        <span className={`${size} bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300`}>
          Cancelled
        </span>
      );
    }
    if (getStatusBadge) return getStatusBadge(item.status);
    return (
      <span className={`${size} bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300`}>
        {item.status || "—"}
      </span>
    );
  };

  const dashboardColumns = [
    {
      key: "type",
      label: "Leave Type",
      render: (item) => (
        <span className="font-medium text-gray-800 dark:text-white">{item.type}</span>
      ),
    },
    { key: "from", label: "From", render: (item) => <span className="text-gray-800 dark:text-gray-200">{item.from}</span> },
    { key: "to", label: "To", render: (item) => <span className="text-gray-800 dark:text-gray-200">{item.to}</span> },
    {
      key: "noOfDays",
      label: "Days",
      render: (item) => (
        <span className="font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">
          {item.noOfDays || item.days || "—"}
        </span>
      ),
    },
    { key: "appliedOn", label: "Applied On", render: (item) => <span className="text-gray-800 dark:text-gray-200">{item.appliedOn}</span> },
    { key: "actingOfficer", label: "Acting Officer", render: (item) => <span className="text-gray-800 dark:text-gray-200">{item.actingOfficer}</span> },
    {
      key: "status",
      label: "Status",
      className: "min-w-[220px]",
      render: (item, { getStatusBadge }) => {
        if (item.status === "Admin Approved") {
          return (
            <span className="px-3 py-1 rounded-lg text-md font-medium bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300">
              Awaiting HOD
            </span>
          );
        }
        if (item.status === "Pending Acting Officer") {
          return (
            <span className="px-3 py-1 rounded-lg text-md font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
              Awaiting Acting Officer
            </span>
          );
        }
        if (item.status === "Declined") {
          const by = item.declinedBy || item.declined_by || "—";
          const reason = item.declineReason || item.decline_reason;
          return (
            <div className="flex flex-col gap-1 items-start max-w-[280px]">
              <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-700">
                ✗ Declined By {by}
              </span>
              {reason && (
                <span
                  className="text-sm text-rose-400 dark:text-rose-300 italic whitespace-normal break-words leading-snug"
                  title={reason}
                >
                  <strong className="font-bold not-italic">Reason:</strong> "{reason}"
                </span>
              )}
            </div>
          );
        }
        return getStatusBadge(item.status);
      },
    },
    {
      key: "actions",
      label: "Action",
      className: "text-right",
      render: (item) => (
        <div className="flex items-center justify-end">
          <button
            onClick={() => {
              setSelectedLeave(item);
              setShowPrintModal(true);
            }}
            className="px-3 py-1 text-md font-medium bg-purple-500 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-1 shadow-sm"
          >
            View
          </button>
        </div>
      ),
    },
  ];

  // ============================================================
  // COMPACT MOBILE RENDER — My Recent Leaves
  // Row 1: Type + Applied  |  Status badge
  // Row 2: From → To       |  Days badge
  // Row 3: View Form button
  // ============================================================
  const dashboardMobileRender = (leave, { getStatusBadge }) => (
    <div className="p-2.5">
      {/* Row 1 */}
      <div className="flex justify-between items-start gap-2 mb-1.5">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-gray-800 dark:text-white truncate">
            {leave.type} Leave
          </p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400">
            Applied: {leave.appliedOn}
          </p>
        </div>
        <div className="shrink-0 max-w-[55%] text-right">
          {renderMobileStatus(leave, getStatusBadge)}
        </div>
      </div>

      {/* Row 2 */}
      <div className="flex justify-between items-center text-[11px] mb-2">
        <span className="text-gray-700 dark:text-gray-300 truncate">
          {leave.from} <span className="text-gray-400 dark:text-gray-500 mx-0.5">→</span> {leave.to}
        </span>
        <span className="shrink-0 font-semibold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/40 px-1.5 py-0.5 rounded text-[10px]">
          {leave.noOfDays || leave.days ? `${leave.noOfDays || leave.days} day(s)` : ""}
        </span>
      </div>

      {/* Row 3 */}
      <div className="pt-1.5 border-t border-gray-100 dark:border-gray-700">
        <button
          onClick={() => {
            setSelectedLeave(leave);
            setShowPrintModal(true);
          }}
          className="w-full py-1.5 bg-purple-500 text-white text-[11px] font-medium rounded-md hover:bg-purple-700 transition-colors shadow-sm"
        >
          View Form
        </button>
      </div>
    </div>
  );

  const actingDashboardColumns = [
    {
      key: "employee",
      label: "Employee",
      render: (item) => (
        <span className="font-medium text-gray-800 dark:text-white">{item.employee}</span>
      ),
    },
    { key: "division", label: "Division", render: (item) => <span className="text-gray-800 dark:text-gray-200">{item.division}</span> },
    { key: "type", label: "Type", render: (item) => <span className="text-gray-800 dark:text-gray-200">{item.type}</span> },
    { key: "from", label: "From", render: (item) => <span className="text-gray-800 dark:text-gray-200">{item.from}</span> },
    { key: "to", label: "To", render: (item) => <span className="text-gray-800 dark:text-gray-200">{item.to}</span> },
    {
      key: "noOfDays",
      label: "Days",
      render: (item) => (
        <span className="font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">
          {item.noOfDays || item.days || "—"}
        </span>
      ),
    },
    { key: "appliedOn", label: "Applied On", render: (item) => <span className="text-gray-800 dark:text-gray-200">{item.appliedOn}</span> },
    {
      key: "status",
      label: "Status",
      render: (item, { getStatusBadge }) => {
        if (item.status === "Pending Acting Officer") {
          return (
            <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-700">
              Awaiting Confirmation
            </span>
          );
        }
        if (item.status === "Admin Approved") {
          return (
            <span className="px-3 py-1 rounded-lg text-md font-medium bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300">
              Awaiting HOD
            </span>
          );
        }
        if (item.status === "Declined") {
          const by = item.declinedBy || item.declined_by || "—";
          return (
            <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-700">
              Declined By {by}
            </span>
          );
        }
        return getStatusBadge(item.status);
      },
    },
    {
      key: "actions",
      label: "Action",
      className: "text-right",
      render: (item) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => {
              setSelectedLeave(item);
              setShowPrintModal(true);
            }}
            className="px-2.5 py-1 bg-purple-500 text-white text-xs lg:text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors shadow-sm"
            title="View Application Form"
            disabled={loading}
          >
            View
          </button>
          {item.status === "Pending Acting Officer" && (
            <>
              <button
                onClick={() => askConfirm(item)}
                className="px-2.5 py-1 bg-green-500 text-white text-xs lg:text-sm font-medium rounded-lg hover:bg-green-700 transition-colors shadow-sm"
                disabled={loading}
              >
                Confirm
              </button>
              <button
                onClick={() => askDecline(item)}
                className="px-2.5 py-1 bg-red-500 text-white text-xs lg:text-sm font-medium rounded-lg hover:bg-red-700 transition-colors shadow-sm"
                disabled={loading}
              >
                Decline
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  const actingDashboardMobileRender = (request, { getStatusBadge }) => (
    <div className="p-2.5">
      {/* Row 1 */}
      <div className="flex justify-between items-start gap-2 mb-1.5">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-gray-800 dark:text-white truncate">
            {request.employee}
          </p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
            {request.division} · {request.type}
          </p>
        </div>
        <div className="shrink-0 max-w-[55%] text-right">
          {renderMobileStatus(request, getStatusBadge)}
        </div>
      </div>

      {/* Row 2 */}
      <div className="flex justify-between items-center text-[11px] mb-2">
        <span className="text-gray-700 dark:text-gray-300 truncate">
          {request.from} <span className="text-gray-400 dark:text-gray-500 mx-0.5">→</span> {request.to}
        </span>
        <span className="shrink-0 font-semibold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/40 px-1.5 py-0.5 rounded text-[10px]">
          {request.noOfDays || request.days ? `${request.noOfDays || request.days} day(s)` : ""}
        </span>
      </div>

      {/* Row 3: buttons */}
      <div className="pt-1.5 border-t border-gray-100 dark:border-gray-700 flex items-center gap-1.5">
        <button
          onClick={() => {
            setSelectedLeave(request);
            setShowPrintModal(true);
          }}
          className="flex-1 px-2 py-1.5 bg-purple-500 text-white text-[10px] font-medium rounded-md hover:bg-purple-700 transition-colors shadow-sm"
          disabled={loading}
        >
          View Form
        </button>
        {request.status === "Pending Acting Officer" && (
          <>
            <button
              onClick={() => askConfirm(request)}
              className="flex-1 px-2 py-1.5 bg-green-500 text-white text-[10px] font-medium rounded-md hover:bg-green-700 transition-colors shadow-sm"
              disabled={loading}
            >
              Confirm
            </button>
            <button
              onClick={() => askDecline(request)}
              className="flex-1 px-2 py-1.5 bg-red-500 text-white text-[10px] font-medium rounded-md hover:bg-red-700 transition-colors shadow-sm"
              disabled={loading}
            >
              Decline
            </button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      <div className="hidden lg:block lg:w-1/5 shrink-0">
        <UserSidebar
          activeTab={activeTab}
          onTabChange={(key) => setActiveTab(key)}
        />
      </div>

      <div className="lg:hidden">
        <UserSidebar
          activeTab={activeTab}
          onTabChange={(key) => {
            setActiveTab(key);
            setSidebarOpen(false);
          }}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden w-full lg:w-4/5">
        <div className="shrink-0">
          <UserHeader
            activeTab={activeTab}
            onMenuToggle={() => setSidebarOpen(true)}
          />
        </div>
        <main className="flex-1 overflow-y-auto no-scrollbar p-4 lg:p-8 bg-gray-50 dark:bg-gray-900 transition-colors">
          {toast && (
            <div
              className={`mb-6 p-4 rounded-xl text-sm flex items-center gap-2 shadow-sm ${
                toast.includes("✅")
                  ? "bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 text-green-800 dark:text-green-300"
                  : toast.includes("❌")
                  ? "bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-800 dark:text-red-300"
                  : "bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 text-blue-800 dark:text-blue-300"
              }`}
            >
              <span className="text-lg">
                {toast.includes("✅") ? "✅" : toast.includes("❌") ? "❌" : "⏳"}
              </span>
              <span>{toast}</span>
            </div>
          )}

          {activeTab === "dashboard" && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6 mb-6 lg:mb-8">
                {stats.map((stat, index) => (
                  <div
                    key={index}
                    className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 lg:p-6 hover:shadow-lg transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-xs lg:text-sm text-gray-500 dark:text-gray-400 font-medium truncate">
                          {stat.label}
                        </p>
                        <p className="text-2xl lg:text-3xl font-bold text-gray-800 dark:text-white mt-1">
                          {stat.value}
                        </p>
                      </div>
                      <div
                        className={`w-10 h-10 lg:w-14 lg:h-14 ${stat.color} rounded-xl flex items-center justify-center text-lg lg:text-2xl shadow-lg shrink-0 ml-3`}
                      >
                        {stat.icon}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 lg:p-6 mb-6 lg:mb-8">
                <h3 className="text-base lg:text-lg font-semibold text-gray-800 dark:text-white mb-3 lg:mb-4">
                  Quick Actions
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 lg:gap-4">
                  <button
                    onClick={() => setActiveTab("applyleave")}
                    className="p-3 lg:p-4 bg-teal-50 dark:bg-teal-900/30 rounded-xl text-center hover:bg-teal-100 dark:hover:bg-teal-900/50 hover:shadow-lg transition-all"
                  >
                    <div className="flex justify-center items-center">
                      <CalendarPlus className="w-7 h-7 lg:w-9 lg:h-9 mb-1 lg:mb-2 text-teal-600 dark:text-teal-300" />
                    </div>
                    <span className="text-xs lg:text-sm font-medium text-teal-700 dark:text-teal-300">
                      Apply Leave
                    </span>
                  </button>
                  <button
                    onClick={() => setActiveTab("myleaves")}
                    className="p-3 lg:p-4 bg-blue-50 dark:bg-blue-900/30 rounded-xl text-center hover:bg-blue-100 dark:hover:bg-blue-900/50 hover:shadow-lg transition-all"
                  >
                    <div className="flex justify-center items-center">
                      <FileText className="w-7 h-7 lg:w-9 lg:h-9 mb-1 lg:mb-2 text-blue-600 dark:text-blue-300" />
                    </div>
                    <span className="text-xs lg:text-sm font-medium text-blue-700 dark:text-blue-300">
                      My Leaves
                    </span>
                  </button>
                  <button
                    onClick={() => setActiveTab("profile")}
                    className="p-3 lg:p-4 bg-purple-50 dark:bg-purple-900/30 rounded-xl text-center hover:bg-purple-100 dark:hover:bg-purple-900/50 hover:shadow-lg transition-all"
                  >
                    <div className="flex justify-center items-center">
                      <User className="w-7 h-7 lg:w-9 lg:h-9 mb-1 lg:mb-2 text-purple-600 dark:text-purple-300" />
                    </div>
                    <span className="text-xs lg:text-sm font-medium text-purple-700 dark:text-purple-300">
                      My Profile
                    </span>
                  </button>
                  <button
                    onClick={() => setActiveTab("actingapprovals")}
                    className="p-3 lg:p-4 bg-cyan-50 dark:bg-cyan-900/30 rounded-xl text-center hover:bg-cyan-100 dark:hover:bg-cyan-900/50 hover:shadow-lg transition-all"
                  >
                    <div className="flex justify-center items-center">
                      <Users className="w-7 h-7 lg:w-9 lg:h-9 mb-1 lg:mb-2 text-cyan-600 dark:text-cyan-300" />
                    </div>
                    <span className="text-xs lg:text-sm font-medium text-cyan-700 dark:text-cyan-300">
                      Acting Approvals
                    </span>
                  </button>
                </div>
              </div>

              {actingOfficerNotifs.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-teal-200 dark:border-teal-800 overflow-hidden mb-6 lg:mb-8">
                  <div className="p-4 lg:p-6 border-b border-teal-100 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-900/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base lg:text-lg font-semibold text-teal-800 dark:text-teal-300">
                          Acting Officer Notifications
                        </h3>
                        <span className="bg-teal-500 text-white text-[10px] lg:text-xs font-bold px-2 py-0.5 rounded-full">
                          {actingOfficerNotifs.length} new
                        </span>
                      </div>
                      <button
                        onClick={() => setActiveTab("actingapprovals")}
                        className="text-xs text-teal-500 dark:text-teal-400 hover:text-teal-700 font-medium"
                      >
                        Review in Acting Approvals →
                      </button>
                    </div>
                    <p className="text-xs text-teal-500 dark:text-teal-400 mt-1">
                      You have new notifications for acting officer assignments
                    </p>
                  </div>
                  <div className="divide-y divide-teal-50 dark:divide-teal-900/30">
                    {actingOfficerNotifs.slice(0, 5).map((notif) => (
                      <div
                        key={notif.id}
                        onClick={() => markAsRead(notif.id)}
                        className="p-4 lg:p-5 flex items-start gap-3 cursor-pointer hover:bg-teal-50/30 dark:hover:bg-teal-900/20 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                            {notif.message}
                          </p>
                          <span className="text-[11px] text-gray-400 mt-1 block">
                            {new Date(notif.timestamp).toLocaleDateString(
                              "en-US",
                              {
                                weekday: "short",
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              }
                            )}
                          </span>
                        </div>
                        <span className="w-2 h-2 bg-teal-500 rounded-full shrink-0 mt-2"></span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden mb-6 lg:mb-8">
                <div className="p-4 lg:p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gradient-to-r from-amber-50/40 dark:from-amber-900/20 to-transparent">
                  <div className="flex items-center gap-2.5">
                    <div>
                      <h3 className="text-base lg:text-lg font-semibold text-gray-800 dark:text-white">
                        Pending Acting Approvals
                      </h3>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Leave requests awaiting your acting officer confirmation
                      </p>
                    </div>
                    {pendingConfirmations.length > 0 && (
                      <span className="bg-amber-500 text-white text-[10px] lg:text-xs font-bold px-2 py-0.5 rounded-full ml-1 shadow-sm">
                        {pendingConfirmations.length} Pending
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setActiveTab("actingapprovals")}
                    className="text-xs lg:text-sm text-amber-500 hover:text-amber-700 font-medium"
                  >
                    View All →
                  </button>
                </div>

                <div className="p-4">
                  {pendingConfirmations.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 dark:text-gray-500">
                      <p className="text-sm font-medium">
                        No pending acting approvals at this time.
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        When colleagues nominate you as their acting officer,
                        requests requiring your action will appear here.
                      </p>
                    </div>
                  ) : (
                    <DataTable
                      columns={actingDashboardColumns}
                      data={pendingConfirmations.slice(0, 5)}
                      mobileRender={actingDashboardMobileRender}
                      options={{
                        searchable: false,
                        showFilters: false,
                        itemsPerPage: 5,
                      }}
                      label="pending acting approvals"
                    />
                  )}
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="p-4 lg:p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                  <div>
                    <h3 className="text-base lg:text-lg font-semibold text-gray-800 dark:text-white">
                      My Recent Leaves
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Track the status of your submitted leave applications
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab("myleaves")}
                    className="text-xs lg:text-sm text-teal-500 dark:text-teal-400 hover:text-teal-700 font-medium"
                  >
                    View All →
                  </button>
                </div>

                <div className="p-4">
                  <DataTable
                    columns={dashboardColumns}
                    data={myLeaves.slice(0, 5)}
                    mobileRender={dashboardMobileRender}
                    options={{
                      searchable: false,
                      showFilters: false,
                      itemsPerPage: 5,
                    }}
                    label="leave requests"
                  />
                </div>
              </div>
            </>
          )}

          {activeTab !== "dashboard" && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 lg:p-6 xl:p-8">
              {activeTab === "profile" && <Profile />}
              {activeTab === "applyleave" && <ApplyLeave />}
              {activeTab === "myleaves" && <Myleaves />}
              {activeTab === "actingapprovals" && <ActingApprovals />}
              {activeTab === "settings" && <Settings />}
            </div>
          )}
        </main>
      </div>

      {showPrintModal && selectedLeave && (
        <LeaveApprovalModal
          selectedLeave={selectedLeave}
          setShowPrintModal={setShowPrintModal}
          setSelectedLeave={setSelectedLeave}
        />
      )}

      <ConfirmModal
        open={confirmModal.open}
        onClose={closeModal}
        onConfirm={processAction}
        tone={confirmModal.action === "confirm" ? "approve" : "decline"}
        requireReason={confirmModal.action === "decline"}
        loading={loading}
        title={
          confirmModal.action === "confirm"
            ? "Confirm this leave request?"
            : "Decline this leave request?"
        }
        message={
          confirmModal.leave
            ? confirmModal.action === "confirm"
              ? `You are about to CONFIRM ${confirmModal.leave.employee}'s ${confirmModal.leave.type} leave (${confirmModal.leave.from} to ${confirmModal.leave.to}). It will be forwarded to Admin.`
              : `You are about to DECLINE ${confirmModal.leave.employee}'s ${confirmModal.leave.type} leave (${confirmModal.leave.from} to ${confirmModal.leave.to}).`
            : ""
        }
        confirmLabel={
          confirmModal.action === "confirm" ? "Yes, Confirm" : "Yes, Decline"
        }
        cancelLabel="Cancel"
        reasonLabel="Reason for declining (optional)"
        reasonPlaceholder="Explain why you are declining this leave..."
      />
    </div>
  );
}

export default UserDashboard;