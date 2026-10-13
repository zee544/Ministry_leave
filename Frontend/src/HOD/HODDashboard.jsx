import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Eye,
  Check,
  X,
  Clock,
  CheckCircle,
  XCircle,
  ClipboardList,
  BarChart3,
  Hourglass,
  ListChecks,
  Inbox,
} from "lucide-react";
import HODSidebar from "../Components/HODSidebar";
import HODHeader from "../Components/HODHeader";
import DataTable from "../Components/DataTable";
import { useNotifications } from "../hooks/NotificationContext.jsx";
import { useLeaves } from "../hooks/LeaveContext.jsx";
import { useUser } from "../hooks/UserContext.jsx";
import Reports from "../Admin/reports.jsx";
import LeaveApprovalModal from "../hooks/LeaveApprovalModal.jsx";
import HODSettings from "./HODSettings.jsx";
import ConfirmModal from "../Components/ConfirmModal.jsx";

function HODDashboard() {
  const { leaves, hodApprove, fetchLeaves } = useLeaves();
  const { currentUser } = useUser();
  const { addNotification, fetchNotifications } = useNotifications();

  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "dashboard";

  const setActiveTab = (tab) => {
    if (tab === "dashboard") {
      setSearchParams({}, { replace: false });
    } else {
      setSearchParams({ tab }, { replace: false });
    }
  };

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState(null);
  const [showPrintModal, setShowPrintModal] = useState(false);

  const [confirmModal, setConfirmModal] = useState({
    open: false,
    leave: null,
    action: "approve",
  });

  useEffect(() => {
    const loadData = async () => {
      if (fetchLeaves) await fetchLeaves();
      if (fetchNotifications) await fetchNotifications();
    };
    loadData();
  }, [fetchLeaves, fetchNotifications]);

  useEffect(() => {
    const handleFocus = () => {
      if (fetchLeaves) fetchLeaves();
      if (fetchNotifications) fetchNotifications();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchLeaves, fetchNotifications]);

  const userDivision = currentUser?.division || "Administration";
  const divisionLeaves = leaves.filter((l) => {
    const leaveDiv = (l.division || "").toLowerCase();
    const userDiv = userDivision.toLowerCase();
    return (
      leaveDiv === userDiv ||
      leaveDiv.replace("istration", "") === userDiv.replace("istration", "")
    );
  });

  const pendingHODApproval = divisionLeaves.filter(
    (l) => l.status === "Admin Approved"
  );
  const reviewedHODApprovals = divisionLeaves.filter(
    (l) =>
      l.status === "Approved" ||
      (l.status === "Declined" &&
        (l.declinedBy === "HOD" || l.declined_by === "HOD"))
  );

  const totalApproved = divisionLeaves.filter((l) => l.status === "Approved").length;
  const totalDeclined = divisionLeaves.filter((l) => l.status === "Declined").length;
  const totalPending = divisionLeaves.filter((l) => l.status === "Pending").length;

  const stats = [
    {
      label: `Pending ${userDivision} Approvals`,
      value: pendingHODApproval.length,
      icon: <Hourglass className="w-5 h-5 lg:w-7 lg:h-7 text-white" />,
      color: "bg-purple-500",
    },
    {
      label: "Approved Leaves",
      value: totalApproved,
      icon: <CheckCircle className="w-5 h-5 lg:w-7 lg:h-7 text-white" />,
      color: "bg-green-500",
    },
    {
      label: "Declined Leaves",
      value: totalDeclined,
      icon: <XCircle className="w-5 h-5 lg:w-7 lg:h-7 text-white" />,
      color: "bg-red-500",
    },
    {
      label: "Awaiting Admin",
      value: totalPending,
      icon: <ClipboardList className="w-5 h-5 lg:w-7 lg:h-7 text-white" />,
      color: "bg-yellow-500",
    },
  ];

  const askApprove = (leave) => setConfirmModal({ open: true, leave, action: "approve" });
  const askDecline = (leave) => setConfirmModal({ open: true, leave, action: "decline" });
  const closeModal = () => setConfirmModal({ open: false, leave: null, action: "approve" });

  const handleApprove = async (leave) => {
    try {
      await hodApprove(leave.id, "approve");

      addNotification(
        `Your ${leave.type} leave (${leave.from} to ${leave.to}) has been FINAL APPROVED by the Head of Division.`,
        "status_update",
        leave.employee,
        leave.division,
        "/userdashboard?tab=myleaves"
      );

      if (leave.actingOfficer) {
        addNotification(
          `${leave.employee}'s ${leave.type} leave (${leave.from} to ${leave.to}) has been FINAL APPROVED by the Head of Division.`,
          "status_update",
          leave.actingOfficer,
          leave.division,
          "/userdashboard?tab=actingapprovals"
        );
      }

      addNotification(
        `${leave.employee}'s ${leave.type} leave (${leave.from} to ${leave.to}) has been FINAL APPROVED by the Head of Division.`,
        "leave_application",
        "admin",
        leave.division,
        "/Admindashboard?tab=leaves"
      );

      setSelectedLeave({ ...leave, status: "Approved" });
      setShowPrintModal(true);
    } catch (error) {
      alert(`Failed to approve: ${error.message}`);
    }
  };
  const handleDecline = async (leave, reason) => {
    try {
      await hodApprove(leave.id, "decline", { reason: reason || null });

      const reasonText = reason ? ` Reason: ${reason}` : "";

      addNotification(
        `Your ${leave.type} leave (${leave.from} to ${leave.to}) has been DECLINED by the Head of Division.${reasonText}`,
        "status_update",
        leave.employee,
        leave.division,
        "/userdashboard?tab=myleaves"
      );

      if (leave.actingOfficer) {
        addNotification(
          `${leave.employee}'s ${leave.type} leave (${leave.from} to ${leave.to}) was DECLINED by the Head of Division.${reasonText}`,
          "status_update",
          leave.actingOfficer,
          leave.division,
          "/userdashboard?tab=actingapprovals"
        );
      }

      addNotification(
        `${leave.employee}'s ${leave.type} leave (${leave.from} to ${leave.to}) was DECLINED by the Head of Division.${reasonText}`,
        "leave_application",
        "admin",
        leave.division,
        "/Admindashboard?tab=leaves"
      );

      setSelectedLeave({ ...leave, status: "Declined" });
      setShowPrintModal(true);
    } catch (error) {
      alert(`Failed to decline: ${error.message}`);
    }
  };

  const processAction = async (reason) => {
    const { leave, action } = confirmModal;
    if (!leave) return;

    if (action === "approve") {
      await handleApprove(leave);
    } else {
      await handleDecline(leave, reason);
    }

    closeModal();
  };

  // ---- Desktop status renderer (original size, unchanged) ----
  const renderStatusBadge = (item) => {
    if (item.status === "Pending Acting Officer") {
      return (
        <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-700">
          Awaiting Acting Officer
        </span>
      );
    }
    if (item.status === "Pending") {
      return (
        <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-700">
          Awaiting Administration
        </span>
      );
    }
    if (item.status === "Admin Approved") {
  return (
    <span className="whitespace-nowrap px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-700">
      Awaiting HOD
    </span>
  );
}
    if (item.status === "Approved") {
      return (
        <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-700">
          ✓ Approved
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
    if (item.status === "Cancelled") {
      return (
        <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
          Cancelled
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
        {item.status || "—"}
      </span>
    );
  };

  // ---- Compact mobile status renderer ----
  const renderMobileStatus = (item) => {
    const size = "px-2 py-0.5 text-[10px] rounded-md font-semibold whitespace-nowrap inline-block";
    if (item.status === "Pending Acting Officer") {
      return (
        <span className={`${size} bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-700`}>
          Awaiting Acting Officer
        </span>
      );
    }
    if (item.status === "Pending") {
      return (
        <span className={`${size} bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-700`}>
          Awaiting Admin
        </span>
      );
    }
    if (item.status === "Admin Approved") {
      return (
        <span className={`${size} bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-700`}>
          Awaiting HOD
        </span>
      );
    }
    if (item.status === "Approved") {
      return (
        <span className={`${size} bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-700`}>
          ✓ Approved
        </span>
      );
    }
    if (item.status === "Declined") {
      const by = item.declinedBy || item.declined_by || "—";
      const reason = item.declineReason || item.decline_reason;
      return (
        <div className="flex flex-col gap-0.5 items-end max-w-[180px]">
          <span className={`${size} bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-700`}>
            ✗ Declined By {by}
          </span>
          {reason && (
            <span
              className="text-[10px] text-red-600 dark:text-red-400 italic whitespace-normal break-words leading-tight text-right"
              title={reason}
            >
              "{reason}"
            </span>
          )}
        </div>
      );
    }
    if (item.status === "Cancelled") {
      return (
        <span className={`${size} bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600`}>
          Cancelled
        </span>
      );
    }
    return (
      <span className={`${size} bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300`}>
        {item.status || "—"}
      </span>
    );
  };

  const columns = [
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
    { key: "actingOfficer", label: "Acting Officer", render: (item) => <span className="text-gray-800 dark:text-gray-200">{item.actingOfficer}</span> },
    {
      key: "status",
      label: "Status",
      render: renderStatusBadge,
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
            className="flex items-center justify-center gap-1.5 px-3 py-1 bg-purple-500 text-white text-md rounded-lg hover:bg-purple-700 transition-colors shadow-sm font-medium"
            title="View Application Form"
          >
            <span>View</span>
          </button>
          {item.status === "Admin Approved" && (
            <>
              <button
                onClick={() => askApprove(item)}
                className="flex items-center justify-center gap-1.5 px-3 py-1 bg-green-500 text-white text-md rounded-lg hover:bg-green-700 transition-colors shadow-sm font-medium"
              >
                <span>Approve</span>
              </button>
              <button
                onClick={() => askDecline(item)}
                className="flex items-center justify-center gap-1.5 px-3 py-1 bg-red-500 text-white text-md rounded-lg hover:bg-red-700 transition-colors shadow-sm font-medium"
              >
                <span>Decline</span>
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  // ============================================================
  // COMPACT MOBILE RENDER — Pending approvals (3 tight rows)
  // Row 1: Name + Division | small status badge
  // Row 2: Type · From → To | Days
  // Row 3: View / Approve / Decline buttons
  // ============================================================
  const mobileRender = (request) => (
    <div className="p-2.5">
      {/* Row 1 */}
      <div className="flex justify-between items-start gap-2 mb-1.5">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-gray-800 dark:text-white truncate">
            {request.employee}
          </p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
            {request.division}
          </p>
        </div>
        <div className="shrink-0 text-right max-w-[55%]">
          {renderMobileStatus(request)}
        </div>
      </div>

      {/* Row 2 */}
      <div className="flex justify-between items-center text-[11px] mb-2">
        <span className="text-gray-700 dark:text-gray-300 truncate">
          {request.type}
          <span className="text-gray-400 dark:text-gray-500 mx-1">·</span>
          {request.from}
          <span className="text-gray-400 dark:text-gray-500 mx-0.5">→</span>
          {request.to}
        </span>
        <span className="shrink-0 font-semibold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/40 px-1.5 py-0.5 rounded text-[10px]">
          {request.noOfDays || request.days
            ? `${request.noOfDays || request.days}d`
            : ""}
        </span>
      </div>

      {/* Row 3 */}
      <div className="flex gap-1.5 pt-1.5 border-t border-gray-100 dark:border-gray-700">
        <button
          onClick={() => {
            setSelectedLeave(request);
            setShowPrintModal(true);
          }}
          className="flex-1 px-2 py-1.5 bg-purple-500 text-white text-[11px] font-medium rounded-md hover:bg-purple-700 transition-colors shadow-sm"
        >
          View Form
        </button>
        {request.status === "Admin Approved" && (
          <>
            <button
              onClick={() => askApprove(request)}
              className="flex-1 px-2 py-1.5 bg-green-500 text-white text-[11px] font-medium rounded-md hover:bg-green-700 transition-colors shadow-sm"
            >
              Approve
            </button>
            <button
              onClick={() => askDecline(request)}
              className="flex-1 px-2 py-1.5 bg-red-500 text-white text-[11px] font-medium rounded-md hover:bg-red-700 transition-colors shadow-sm"
            >
              Decline
            </button>
          </>
        )}
      </div>
    </div>
  );

  const allLeavesColumns = [
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
    { key: "actingOfficer", label: "Acting Officer", render: (item) => <span className="text-gray-800 dark:text-gray-200">{item.actingOfficer}</span> },
    {
      key: "status",
      label: "Status",
      render: renderStatusBadge,
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
            className="flex items-center justify-center gap-1.5 px-2.5 py-1 bg-purple-500 text-white text-xs rounded-lg hover:bg-purple-700 transition-colors shadow-sm font-medium"
            title="View Application Form"
          >
            <span>View</span>
          </button>
        </div>
      ),
    },
  ];

  // ============================================================
  // COMPACT MOBILE RENDER — All leaves (3 tight rows, View only)
  // ============================================================
  const allLeavesMobileRender = (request) => (
    <div className="p-2.5">
      {/* Row 1 */}
      <div className="flex justify-between items-start gap-2 mb-1.5">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-gray-800 dark:text-white truncate">
            {request.employee}
          </p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
            {request.division}
          </p>
        </div>
        <div className="shrink-0 text-right max-w-[55%]">
          {renderMobileStatus(request)}
        </div>
      </div>

      {/* Row 2 */}
      <div className="flex justify-between items-center text-[11px] mb-2">
        <span className="text-gray-700 dark:text-gray-300 truncate">
          {request.type}
          <span className="text-gray-400 dark:text-gray-500 mx-1">·</span>
          {request.from}
          <span className="text-gray-400 dark:text-gray-500 mx-0.5">→</span>
          {request.to}
        </span>
        <span className="shrink-0 font-semibold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/40 px-1.5 py-0.5 rounded text-[10px]">
          {request.noOfDays || request.days
            ? `${request.noOfDays || request.days}d`
            : ""}
        </span>
      </div>

      {/* Row 3 */}
      <div className="pt-1.5 border-t border-gray-100 dark:border-gray-700">
        <button
          onClick={() => {
            setSelectedLeave(request);
            setShowPrintModal(true);
          }}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-purple-500 text-white text-[11px] font-medium rounded-md hover:bg-purple-700 transition-colors shadow-sm"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>View Form</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      <div className="hidden lg:block lg:w-1/5 shrink-0">
        <HODSidebar
          activeTab={activeTab}
          onTabChange={(key) => setActiveTab(key)}
        />
      </div>

      <div className="lg:hidden">
        <HODSidebar
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
          <HODHeader
            activeTab={activeTab}
            onMenuToggle={() => setSidebarOpen(true)}
          />
        </div>
        <main className="flex-1 overflow-y-auto no-scrollbar p-4 lg:p-8 bg-gray-50 dark:bg-gray-900 transition-colors">
          {activeTab === "dashboard" && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6 mb-6 lg:mb-8">
                {stats.map((stat, index) => (
                  <div
                    key={index}
                    className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 lg:p-6 hover:shadow-2xl transition-all cursor-default"
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
                        className={`w-10 h-10 lg:w-14 lg:h-14 ${stat.color} rounded-xl flex items-center justify-center shadow-lg shrink-0 ml-3`}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4">
                  <button
                    onClick={() => setActiveTab("leaves")}
                    className="p-3 lg:p-4 bg-purple-50 dark:bg-purple-900/30 rounded-xl text-center hover:bg-purple-100 dark:hover:bg-purple-900/50 hover:shadow-lg transition-all"
                  >
                    <ListChecks className="w-7 h-7 lg:w-9 lg:h-9 mx-auto mb-2 text-purple-600 dark:text-purple-400" />
                    <span className="text-xs lg:text-sm font-medium text-purple-700 dark:text-purple-300">
                      Review Pending Approvals
                    </span>
                  </button>
                  <button
                    onClick={() => setActiveTab("reports")}
                    className="p-3 lg:p-4 bg-blue-50 dark:bg-blue-900/30 rounded-xl text-center hover:bg-blue-100 dark:hover:bg-blue-900/50 hover:shadow-lg transition-all"
                  >
                    <BarChart3 className="w-7 h-7 lg:w-9 lg:h-9 mx-auto mb-2 text-blue-600 dark:text-blue-400" />
                    <span className="text-xs lg:text-sm font-medium text-blue-700 dark:text-blue-300">
                      Generate Report
                    </span>
                  </button>
                </div>
              </div>

              {pendingHODApproval.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-purple-200 dark:border-purple-800 overflow-hidden mb-6 lg:mb-8">
                  <div className="p-4 lg:p-6 border-b border-purple-100 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Hourglass className="w-5 h-5 text-purple-700 dark:text-purple-400" />
                        <h3 className="text-base lg:text-lg font-semibold text-purple-800 dark:text-purple-300">
                          Pending Final Approval
                        </h3>
                        <span className="bg-purple-500 text-white text-[10px] lg:text-xs font-bold px-2 py-0.5 rounded-full">
                          {pendingHODApproval.length}
                        </span>
                      </div>
                      <button
                        onClick={() => setActiveTab("leaves")}
                        className="text-xs text-purple-500 dark:text-purple-400 hover:text-purple-700 font-medium"
                      >
                        View All →
                      </button>
                    </div>
                    <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                      These leaves have been pre-approved by admin and are awaiting your final approval
                    </p>
                  </div>
                  <div className="p-4">
                    <DataTable
                      columns={columns}
                      data={pendingHODApproval}
                      mobileRender={mobileRender}
                      options={{
                        searchable: false,
                        showFilters: false,
                        itemsPerPage: 5,
                      }}
                      label="pending approvals"
                    />
                  </div>
                </div>
              )}

              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="p-4 lg:p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                  <h3 className="text-base lg:text-lg font-semibold text-gray-800 dark:text-white">
                    {userDivision} Division Leave Requests
                  </h3>
                  <span className="text-xs bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-semibold px-2.5 py-1 rounded-full">
                    {userDivision} Division
                  </span>
                </div>
                <div className="p-4">
                  <DataTable
                    columns={allLeavesColumns}
                    data={divisionLeaves}
                    mobileRender={allLeavesMobileRender}
                    options={{
                      searchable: false,
                      showFilters: false,
                      itemsPerPage: 5,
                    }}
                    label="all leaves"
                  />
                </div>
              </div>
            </>
          )}

          {activeTab === "leaves" && (
            <>
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-purple-200 dark:border-purple-800 overflow-hidden mb-6">
                <div className="p-4 border-b border-purple-100 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Hourglass className="w-5 h-5 text-purple-700 dark:text-purple-400" />
                      <h4 className="text-lg font-semibold text-purple-800 dark:text-purple-300">
                        Pending Your Final Approval
                      </h4>
                      <span className="bg-purple-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                        {pendingHODApproval.length}
                      </span>
                    </div>
                    <span className="text-xs bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-semibold px-2.5 py-1 rounded-full">
                      {userDivision} Division
                    </span>
                  </div>
                  <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                    These leaves have been pre-approved by admin and are awaiting your final approval.
                  </p>
                </div>
                <div className="p-4">
                  {pendingHODApproval.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 dark:text-gray-500">
                      <p className="text-sm font-medium">No pending approvals</p>
                      <p className="text-xs mt-1">
                        No leaves in {userDivision} division are awaiting your final approval.
                      </p>
                    </div>
                  ) : (
                    <DataTable
                      columns={columns}
                      data={pendingHODApproval}
                      mobileRender={mobileRender}
                      options={{
                        searchFields: ["employee", "division", "type"],
                        filterConfig: [{ key: "type", label: "Leave Type" }],
                        itemsPerPage: 5,
                      }}
                      label="pending approvals"
                    />
                  )}
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ListChecks className="w-5 h-5 text-gray-700 dark:text-gray-300" />
                      <h4 className="text-lg font-semibold text-gray-800 dark:text-white">
                        Reviewed / Handled
                      </h4>
                      
                    </div>
                    <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold px-2.5 py-1 rounded-full">
                      {userDivision} Division
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Leaves you have already approved or declined.
                  </p>
                </div>
                <div className="p-4">
                  <DataTable
                    columns={allLeavesColumns}
                    data={reviewedHODApprovals}
                    mobileRender={allLeavesMobileRender}
                    options={{
                      searchFields: ["employee", "division", "type"],
                      filterConfig: [{ key: "type", label: "Leave Type" }],
                      itemsPerPage: 5,
                    }}
                    label="reviewed approvals"
                    emptyState={{
                      icon: "",
                      title: "No reviewed approvals",
                      message: "You have not reviewed any leaves yet.",
                    }}
                  />
                </div>
              </div>
            </>
          )}

          {activeTab === "reports" && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 lg:p-6 xl:p-8">
              <Reports />
            </div>
          )}

          {activeTab === "settings" && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 lg:p-6 xl:p-8">
              <HODSettings />
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
        tone={confirmModal.action === "approve" ? "approve" : "decline"}
        requireReason={confirmModal.action === "decline"}
        title={confirmModal.action === "approve"
          ? "Give final approval?"
          : "Decline this leave request?"}
        message={confirmModal.leave
          ? confirmModal.action === "approve"
            ? `You are about to give FINAL APPROVAL for ${confirmModal.leave.employee}'s ${confirmModal.leave.type} leave (${confirmModal.leave.from} to ${confirmModal.leave.to}).`
            : `You are about to DECLINE ${confirmModal.leave.employee}'s ${confirmModal.leave.type} leave (${confirmModal.leave.from} to ${confirmModal.leave.to}).`
          : ""}
        confirmLabel={confirmModal.action === "approve" ? "Yes, Approve" : "Yes, Decline"}
        cancelLabel="Cancel"
        reasonLabel="Reason for declining (optional)"
        reasonPlaceholder="Explain why you are declining this leave..."
      />
    </div>
  );
}

export default HODDashboard;