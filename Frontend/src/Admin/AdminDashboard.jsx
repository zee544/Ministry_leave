import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Check,
  Users,
  Clock,
  ClipboardList,
  CheckCircle,
  UserPlus,
  FileCheck,
  BarChart3,
  Bell,
  FileText,
} from "lucide-react";
import Header from "../Components/Header";
import Sidebar from "../Components/Sidebar";
import Employee from "./Employee";
import LeaveApprove from "./LeaveApprove.jsx";
import Reports from "./reports";
import Settings from "./Settings";
import CreateEmployee from "./CreateEmployee.jsx";
import DataTable from "../Components/DataTable";
import { useNotifications } from "../hooks/NotificationContext.jsx";
import { useLeaves } from "../hooks/LeaveContext.jsx";
import { useUser } from "../hooks/UserContext.jsx";
import LeaveApprovalModal from "../hooks/LeaveApprovalModal.jsx";
import ConfirmModal from "../Components/ConfirmModal.jsx";

function AdminDashboard() {
  const { leaves, updateLeaveStatus, fetchLeaves } = useLeaves();
  const { currentUser, employees } = useUser();
  const { addNotification } = useNotifications();
  const { getNotificationsForRole, markAsRead, fetchNotifications } =
    useNotifications();

  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "dashboard";

  const setActiveTab = (tab) => {
    if (tab === "dashboard") {
      setSearchParams({}, { replace: false });
    } else {
      setSearchParams({ tab }, { replace: false });
    }
  };

  const [openCreateEmployee, setOpenCreateEmployee] = useState(false);
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

  const divisionEmployees = employees.filter((e) => {
    const empDiv = (e.division || "").toLowerCase();
    const userDiv = userDivision.toLowerCase();
    return (
      empDiv === userDiv ||
      empDiv.replace("istration", "") === userDiv.replace("istration", "")
    );
  });

  const leaveApplicationNotifs = getNotificationsForRole(
    "admin",
    null,
    userDivision
  ).filter((n) => n.type === "leave_application" && !n.read);

  const pendingLeaves = divisionLeaves.filter(
    (l) => l.status === "Pending"
  ).length;
  const adminApprovedLeaves = divisionLeaves.filter(
    (l) => l.status === "Admin Approved"
  ).length;
  const totalApproved = divisionLeaves.filter(
    (l) => l.status === "Approved"
  ).length;

  const stats = [
    {
      label: `Employees (${userDivision})`,
      value: divisionEmployees.length,
      icon: <Users className="w-5 h-5 lg:w-7 lg:h-7 text-white" />,
      color: "bg-blue-500",
    },
    {
      label: `Pending (${userDivision})`,
      value: pendingLeaves,
      icon: <Clock className="w-5 h-5 lg:w-7 lg:h-7 text-white" />,
      color: "bg-yellow-500",
    },
    {
      label: "Awaiting HOD",
      value: adminApprovedLeaves,
      icon: <ClipboardList className="w-5 h-5 lg:w-7 lg:h-7 text-white" />,
      color: "bg-purple-500",
    },
    {
      label: "Final Approved",
      value: totalApproved,
      icon: <CheckCircle className="w-5 h-5 lg:w-7 lg:h-7 text-white" />,
      color: "bg-green-500",
    },
  ];

  const askApprove = (item) =>
    setConfirmModal({ open: true, leave: item, action: "approve" });
  const askDecline = (item) =>
    setConfirmModal({ open: true, leave: item, action: "decline" });
  const closeModal = () =>
    setConfirmModal({ open: false, leave: null, action: "approve" });

  const handlePreApprove = (item) => {
    updateLeaveStatus(item.id, "Admin Approved", { recommendedByAdmin: true });

    addNotification(
      `Leave application: ${item.employee}'s ${item.type} leave (${item.from} to ${item.to}) has been pre-approved by Admin and is now awaiting your final approval.`,
      "leave_application",
      "hod",
      item.division,
      "/hoddashboard?tab=leaves"
    );

    addNotification(
      `Your ${item.type} leave (${item.from} to ${item.to}) has been pre-approved by Admin and forwarded to HOD for final approval.`,
      "status_update",
      item.employee,
      item.division,
      "/userdashboard?tab=myleaves"
    );

    if (item.actingOfficer) {
      addNotification(
        `${item.employee}'s ${item.type} leave (${item.from} to ${item.to}) has been pre-approved by Admin and forwarded to HOD for final approval.`,
        "status_update",
        item.actingOfficer,
        item.division,
        "/userdashboard?tab=actingapprovals"
      );
    }
  };

  const handleDecline = (item, reason) => {
    updateLeaveStatus(item.id, "Declined", { declinedBy: "Admin" , reason: reason || null,  });

    const reasonText = reason ? ` Reason: ${reason}` : "";

    addNotification(
      `Your ${item.type} leave (${item.from} to ${item.to}) has been DECLINED by Admin.${reasonText}`,
      "status_update",
      item.employee,
      item.division,
      "/userdashboard?tab=myleaves"
    );

    if (item.actingOfficer) {
      addNotification(
        `${item.employee}'s ${item.type} leave (${item.from} to ${item.to}) was DECLINED by Admin.${reasonText}`,
        "status_update",
        item.actingOfficer,
        item.division,
        "/userdashboard?tab=actingapprovals"
      );
    }

    addNotification(
      `${item.employee}'s ${item.type} leave (${item.from} to ${item.to}) was DECLINED by Admin.${reasonText}`,
      "leave_application",
      "hod",
      item.division,
      "/hoddashboard?tab=leaves"
    );
  };

  const processAction = (reason) => {
    const { leave: item, action } = confirmModal;
    if (!item) return;

    if (action === "approve") {
      handlePreApprove(item);
    } else {
      handleDecline(item, reason);
    }

    closeModal();
  };

  const dashboardColumns = [
    {
      key: "employee",
      label: "Employee",
      render: (item) => (
        <span className="font-medium text-gray-800 dark:text-white">{item.employee}</span>
      ),
    },
    { key: "division", label: "Division", render: (item) => item.division },
    { key: "type", label: "Type" },
    { key: "from", label: "From" },
    { key: "to", label: "To" },
    {
      key: "noOfDays",
      label: "Days",
      render: (item) => (
        <span className="font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">
          {item.noOfDays || item.days || "—"}
        </span>
      ),
    },
    { key: "actingOfficer", label: "Acting Officer" },
    {
  key: "status",
  label: "Status",
  className: "min-w-[200px]",
  render: (item) => {
    if (item.status === "Pending Acting Officer") {
      return (
        <span className="whitespace-nowrap inline-block px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-700">
          Awaiting Acting Officer
        </span>
      );
    }
    if (item.status === "Pending") {
      return (
        <span className="whitespace-nowrap inline-block px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-700">
          Awaiting Admin Approval
        </span>
      );
    }
    if (item.status === "Admin Approved") {
      return (
        <span className="whitespace-nowrap inline-block px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-700">
          Awaiting HOD
        </span>
      );
    }
    if (item.status === "Approved") {
      return (
        <span className="whitespace-nowrap inline-block px-2.5 py-1 rounded-lg text-xs font-semibold bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-700">
          ✓ Approved
        </span>
      );
    }
       if (item.status === "Declined") {
      const by = item.declinedBy || item.declined_by || "—";
      const reason = item.declineReason || item.decline_reason;
      return (
        <div className="flex flex-col gap-1 items-start max-w-[280px]">
          <span className="whitespace-nowrap inline-block px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-700">
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
        <span className="whitespace-nowrap inline-block px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
          Cancelled
        </span>
      );
    }
    return (
      <span className="whitespace-nowrap inline-block px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
        {item.status || "—"}
      </span>
    );
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
            className="flex items-center justify-center gap-1.5 px-3 py-1 bg-purple-500 text-white text-md rounded-lg hover:bg-purple-700 transition-colors shadow-sm font-medium"
            title="View Application Form"
          >
            <span>View</span>
          </button>
          {item.status === "Pending" && (
            <>
              <button
                onClick={() => askApprove(item)}
                className="flex items-center justify-center gap-1.5 px-3 py-1 bg-green-500 text-white text-md rounded-lg hover:bg-green-700 transition-colors shadow-sm font-medium"
                title="Pre-Approve and forward to HOD"
              >
                <span>Approve</span>
              </button>
              <button
                onClick={() => askDecline(item)}
                className="flex items-center justify-center gap-1.5 px-3 py-1 bg-red-500 text-white text-md rounded-lg hover:bg-red-700 transition-colors shadow-sm font-medium"
                title="Decline this leave request"
              >
                <span>Decline</span>
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  const mobileRender = (request) => (
    <div className="p-4 space-y-2">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm font-medium text-gray-800 dark:text-white">
            {request.employee}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">{request.division}</p>
        </div>
        {request.status === "Pending Acting Officer" ? (
  <span className="whitespace-nowrap inline-block px-2 py-1 rounded-lg text-xs font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-700">
    Awaiting Acting Officer
  </span>
) : request.status === "Pending" ? (
  <span className="whitespace-nowrap inline-block px-2 py-1 rounded-lg text-xs font-semibold bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-700">
    Pending Admin
  </span>
) : request.status === "Admin Approved" ? (
  <span className="whitespace-nowrap inline-block px-2 py-1 rounded-lg text-xs font-semibold bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-700">
    Awaiting HOD
  </span>
) : request.status === "Approved" ? (
  <span className="whitespace-nowrap inline-block px-2 py-1 rounded-lg text-xs font-semibold bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-700">
    ✓ Approved
  </span>
) : request.status === "Declined" ? (
  <div className="flex flex-col gap-1 items-end max-w-[180px]">
    <span className="whitespace-nowrap inline-block px-2 py-1 rounded-lg text-xs font-semibold bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-700">
      ✗ Declined By {request.declinedBy || request.declined_by || "—"}
    </span>
    {(request.declineReason || request.decline_reason) && (
      <span
        className="text-[10px] text-red-600 dark:text-red-400 italic whitespace-normal break-words leading-tight text-right"
        title={request.declineReason || request.decline_reason}
      >
        "{request.declineReason || request.decline_reason}"
      </span>
    )}
  </div>
): request.status === "Cancelled" ? (
  <span className="whitespace-nowrap inline-block px-2 py-1 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
    Cancelled
  </span>
) : (
  <span className="whitespace-nowrap inline-block px-2 py-1 rounded-lg text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
    {request.status || "—"}
  </span>
)}
      </div>
      <div className="flex justify-between items-center text-xs text-gray-600 dark:text-gray-400">
        <span>
          {request.type} · {request.from} → {request.to}
        </span>
        <span className="font-semibold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/40 px-2 py-0.5 rounded">
          {request.noOfDays || request.days
            ? `${request.noOfDays || request.days} day(s)`
            : ""}
        </span>
      </div>
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => {
            setSelectedLeave(request);
            setShowPrintModal(true);
          }}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-purple-500 text-white text-xs font-medium rounded-lg hover:bg-purple-700 transition-colors shadow-sm"
        >
          <span>View Form</span>
        </button>
        {request.status === "Pending" && (
          <>
            <button
              onClick={() => askApprove(request)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-green-500 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors shadow-sm"
            >
              <span>Approve</span>
            </button>
            <button
              onClick={() => askDecline(request)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-700 transition-colors shadow-sm"
            >
              <span>Decline</span>
            </button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      <div className="hidden lg:block lg:w-1/5 shrink-0">
        <Sidebar
          activeTab={activeTab}
          onTabChange={(key) => {
            setActiveTab(key);
            if (key === "employees") setOpenCreateEmployee(false);
          }}
        />
      </div>

      <div className="lg:hidden">
        <Sidebar
          activeTab={activeTab}
          onTabChange={(key) => {
            setActiveTab(key);
            setSidebarOpen(false);
            if (key === "employees") setOpenCreateEmployee(false);
          }}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
      </div>

      <div className="flex-1 flex flex-col overflow-hidden w-full lg:w-4/5">
        <div className="shrink-0">
          <Header
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
                    className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 lg:p-6 hover:shadow-2xl transition-all"
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
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-4">
                  <button
                    onClick={() => {
                      setActiveTab("employees");
                      setOpenCreateEmployee(true);
                    }}
                    className="p-3 lg:p-4 bg-blue-50 dark:bg-blue-900/30 rounded-xl text-center hover:bg-blue-100 dark:hover:bg-blue-900/50 hover:shadow-2xl transition-all"
                  >
                    <UserPlus className="w-7 h-7 lg:w-9 lg:h-9 mx-auto mb-2 text-blue-600 dark:text-blue-400" />
                    <span className="text-xs lg:text-sm font-medium text-blue-700 dark:text-blue-300">
                      New Employee
                    </span>
                  </button>
                  <button
                    onClick={() => setActiveTab("leaves")}
                    className="p-3 lg:p-4 bg-green-50 dark:bg-green-900/30 rounded-xl text-center hover:bg-green-100 dark:hover:bg-green-900/50 hover:shadow-2xl transition-all"
                  >
                    <FileCheck className="w-7 h-7 lg:w-9 lg:h-9 mx-auto mb-2 text-green-600 dark:text-green-400" />
                    <span className="text-xs lg:text-sm font-medium text-green-700 dark:text-green-300">
                      Approve Leaves
                    </span>
                  </button>
                  <button
                    onClick={() => setActiveTab("reports")}
                    className="p-3 lg:p-4 bg-purple-50 dark:bg-purple-900/30 rounded-xl text-center hover:bg-purple-100 dark:hover:bg-purple-900/50 hover:shadow-2xl transition-all"
                  >
                    <BarChart3 className="w-7 h-7 lg:w-9 lg:h-9 mx-auto mb-2 text-purple-600 dark:text-purple-400" />
                    <span className="text-xs lg:text-sm font-medium text-purple-700 dark:text-purple-300">
                      Generate Report
                    </span>
                  </button>
                </div>
              </div>

              {leaveApplicationNotifs.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-blue-200 dark:border-blue-800 overflow-hidden mb-6 lg:mb-8">
                  <div className="p-4 lg:p-6 border-b border-blue-100 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Bell className="w-5 h-5 text-blue-700 dark:text-blue-400" />
                        <h3 className="text-base lg:text-lg font-semibold text-blue-800 dark:text-blue-300">
                          New Leave Applications
                        </h3>
                        <span className="bg-blue-500 text-white text-[10px] lg:text-xs font-bold px-2 py-0.5 rounded-full">
                          {leaveApplicationNotifs.length} new
                        </span>
                      </div>
                      <button
                        onClick={() =>
                          leaveApplicationNotifs.forEach((n) =>
                            markAsRead(n.id)
                          )
                        }
                        className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 font-medium"
                      >
                        Dismiss all
                      </button>
                    </div>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      New leave applications received from employees
                    </p>
                  </div>
                  <div className="divide-y divide-blue-50 dark:divide-blue-900/30">
                    {leaveApplicationNotifs.slice(0, 5).map((notif) => (
                      <div
                        key={notif.id}
                        onClick={() => markAsRead(notif.id)}
                        className="p-4 lg:p-5 flex items-start gap-3 cursor-pointer hover:bg-blue-50/30 dark:hover:bg-blue-900/20 transition-colors"
                      >
                        <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
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
                        <span className="w-2 h-2 bg-blue-500 rounded-full shrink-0 mt-2"></span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="p-4 lg:p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                  <h3 className="text-base lg:text-lg font-semibold text-gray-800 dark:text-white">
                    {userDivision} Division Leave Requests
                  </h3>
                  <button
                    onClick={() => setActiveTab("leaves")}
                    className="text-xs lg:text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 font-medium"
                  >
                    View All →
                  </button>
                </div>

                <div className="p-4">
                  <DataTable
                    columns={dashboardColumns}
                    data={divisionLeaves}
                    mobileRender={mobileRender}
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
              {activeTab === "employees" && (
                <Employee openCreate={openCreateEmployee} />
              )}
              {activeTab === "leaves" && <LeaveApprove />}
              {activeTab === "reports" && <Reports />}
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
        tone={confirmModal.action === "approve" ? "approve" : "decline"}
        requireReason={confirmModal.action === "decline"}
        title={confirmModal.action === "approve"
          ? "Approve this leave request?"
          : "Decline this leave request?"}
        message={confirmModal.leave
          ? confirmModal.action === "approve"
            ? `You are about to PRE-APPROVE ${confirmModal.leave.employee}'s ${confirmModal.leave.type} leave (${confirmModal.leave.from} to ${confirmModal.leave.to}). It will be forwarded to HOD for final approval.`
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

export default AdminDashboard;