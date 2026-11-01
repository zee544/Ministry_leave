import { useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import ExecutiveOfficerHeader from "../Components/ExecutiveOfficerHeader";
import ExecutiveOfficerSidebar from "../Components/ExecutiveOfficerSidebar";
import ApplyLeave from "./../User/applyLeave";
import MyLeaves from "../User/myleaves";
import EOProfile from "./EOProfile"; 
import Settings from "../User/settings";
import { ClipboardList, Clock, CheckCircle } from "lucide-react";
import DataTable from "../Components/DataTable";
import { useNotifications } from "../hooks/NotificationContext.jsx";
import { useLeaves } from "../hooks/LeaveContext.jsx";
import { useUser } from "../hooks/UserContext.jsx";
import ConfirmModal from "../Components/ConfirmModal.jsx";
import LeaveApprovalModal from "../hooks/LeaveApprovalModal.jsx";
import { apiUrl } from "../api.js";

function ExecutiveOfficerDashboard() {
  const { currentUser } = useUser();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "dashboard";

  const setActiveTab = (tab) => {
    if (tab === "dashboard") setSearchParams({}, { replace: false });
    else setSearchParams({ tab }, { replace: false });
  };

  const { addNotification } = useNotifications();
  const { leaves } = useLeaves();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const actionInFlight = useRef(false);

  // Modal states
  const [confirmModal, setConfirmModal] = useState({
    open: false,
    leave: null,
    action: "approve",
  });
  const [selectedLeave, setSelectedLeave] = useState(null);
  const [showPrintModal, setShowPrintModal] = useState(false);

  // 1. Leaves waiting for EO review — status "Pending" for EO's division
  const pendingLeaves = leaves.filter(
    (l) =>
      l.status === "Pending" &&
      String(l.division || "").toLowerCase() ===
        String(currentUser.division || "").toLowerCase() &&
      (l.applicantRole ?? l.applicant_role) !== "executive_officer"
  );

  // 2. History: Employees processed by this EO AND the EO's own leaves
  const eoProcessedLeaves = leaves.filter((l) => {
    const role = l.applicantRole ?? l.applicant_role;
    const isMyOwnLeave = Number(l.applicantUserId ?? l.applicant_user_id) === Number(currentUser.id);

    // ✅ 1. Show the EO's own leaves (to track status & acting officer)
    if (isMyOwnLeave) {
      return true; // Show all statuses (Pending, Approved, Declined)
    }

    // ✅ 2. Show employee leaves processed by this specific EO
    if (role !== "employee") return false;
    if (l.status !== "Approved" && l.status !== "Declined") return false;

    const approvedBy = l.approvedBy ?? l.approved_by;
    const declinedBy = l.declinedBy ?? l.declined_by;
    
    const wasApprovedByMe = l.status === "Approved" && approvedBy === currentUser.name;
    const wasDeclinedByMe = l.status === "Declined" && declinedBy === currentUser.name;

    return wasApprovedByMe || wasDeclinedByMe;
  });

  // 3. EO's own leave applications (for stats)
  const myLeaves = leaves.filter(
    (l) =>
      Number(l.applicantUserId ?? l.applicant_user_id) === Number(currentUser.id) &&
      (l.applicantRole ?? l.applicant_role) === currentUser.role
  );

  const stats = [
    {
      label: "Pending Requests",
      value: pendingLeaves.length,
      icon: <Clock className="w-6 h-6 lg:w-8 lg:h-8 text-white" />,
      color: "bg-yellow-500",
    },
    {
      label: "Handled by You",
      value: eoProcessedLeaves.length,
      icon: <CheckCircle className="w-6 h-6 lg:w-8 lg:h-8 text-white" />,
      color: "bg-green-500",
    },
    {
      label: "My Leaves",
      value: myLeaves.length,
      icon: <ClipboardList className="w-6 h-6 lg:w-8 lg:h-8 text-white" />,
      color: "bg-blue-500",
    },
  ];

  const askApprove = (leave) =>
    setConfirmModal({ open: true, leave, action: "approve" });
  const askReject = (leave) =>
    setConfirmModal({ open: true, leave, action: "reject" });
  const closeModal = () =>
    setConfirmModal({ open: false, leave: null, action: "approve" });

  const processAction = async (reason) => {
    const { leave, action } = confirmModal;
    if (!leave || actionInFlight.current) return;

    actionInFlight.current = true;
    setLoading(true);
    setToast("Processing...");

    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found");

      const res = await fetch(apiUrl(`/api/admin/leaves/${leave.id}/eo-approve`), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: action === "approve" ? "approve" : "decline",
          reason: reason || null,
        }),
      });

      const data = await res.json().catch(() => ({}));
      
      if (!res.ok) {
        throw new Error(data.message || `Failed to ${action} leave (${res.status}).`);
      }

      if (action === "approve") {
        addNotification(
          `Your ${leave.type} leave (${leave.from} to ${leave.to}) has been approved by the Executive Officer (${currentUser.name}).`,
          "status_update",
          leave.employee,
          leave.division,
          "/userdashboard?tab=myleaves"
        );
        addNotification(
          `${leave.employee}'s ${leave.type} leave was approved by Executive Officer (${currentUser.name}).`,
          "status_update",
          "admin",
          leave.division,
          "/Admindashboard?tab=leaves"
        );
        setToast(`✅ Approved ${leave.employee}'s leave.`);
      } else {
        const reasonText = reason ? ` Reason: ${reason}` : "";
        addNotification(
          `Your ${leave.type} leave (${leave.from} to ${leave.to}) was rejected by the Executive Officer (${currentUser.name}).${reasonText}`,
          "status_update",
          leave.employee,
          leave.division,
          "/userdashboard?tab=myleaves"
        );
        setToast(`❌ Rejected ${leave.employee}'s leave.`);
      }

      await fetchLeaves();
      setTimeout(() => setToast(""), 4000);
      closeModal();
    } catch (err) {
      console.error(err);
      setToast(`❌ Failed: ${err.message || "Unknown error"}`);
      setTimeout(() => setToast(""), 5000);
    } finally {
      setLoading(false);
      actionInFlight.current = false;
    }
  };

  // Columns for Pending Requests Table
  const pendingColumns = [
    {
      key: "employee",
      label: "Employee",
      render: (item) => (
        <span className="font-medium text-gray-800 dark:text-white">
          {item.employee}
        </span>
      ),
    },
    {
      key: "type",
      label: "Type",
      render: (item) => <span className="text-gray-800 dark:text-gray-200">{item.type}</span>,
    },
    {
      key: "from",
      label: "From",
      render: (item) => <span className="text-gray-800 dark:text-gray-200">{item.from}</span>,
    },
    {
      key: "to",
      label: "To",
      render: (item) => <span className="text-gray-800 dark:text-gray-200">{item.to}</span>,
    },
    {
      key: "noOfDays",
      label: "Days",
      render: (item) => (
        <span className="font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">
          {item.noOfDays || item.days || "—"}
        </span>
      ),
    },
    {
      key: "appliedOn",
      label: "Applied On",
      render: (item) => <span className="text-gray-800 dark:text-gray-200">{item.appliedOn}</span>,
    },
    {
      key: "status",
      label: "Status",
      render: (item, { getStatusBadge }) => getStatusBadge(item.status),
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
          >
            View
          </button>
          <button
            onClick={() => askApprove(item)}
            className="px-2.5 py-1 bg-green-500 text-white text-xs lg:text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
            disabled={loading}
          >
            Approve
          </button>
          <button
            onClick={() => askReject(item)}
            className="px-2.5 py-1 bg-red-500 text-white text-xs lg:text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
            disabled={loading}
          >
            Reject
          </button>
        </div>
      ),
    },
  ];

  // ✅ Columns for History Table (with View Button added)
  const historyColumns = [
    {
      key: "employee",
      label: "Employee",
      render: (item) => <span className="font-medium text-gray-800 dark:text-white">{item.employee}</span>,
    },
    {
      key: "type",
      label: "Leave Type",
      render: (item) => <span className="text-gray-800 dark:text-gray-200">{item.type}</span>,
    },
    {
      key: "from",
      label: "From",
      render: (item) => <span className="text-gray-800 dark:text-gray-200">{item.from}</span>,
    },
    {
      key: "to",
      label: "To",
      render: (item) => <span className="text-gray-800 dark:text-gray-200">{item.to}</span>,
    },
    {
      key: "noOfDays",
      label: "Days",
      render: (item) => (
        <span className="font-semibold text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">
          {item.noOfDays || item.days || "—"}
        </span>
      ),
    },
    {
      key: "actingOfficer",
      label: "Acting Officer",
      render: (item) => <span className="text-gray-800 dark:text-gray-200">{item.actingOfficer || item.acting_officer || "—"}</span>,
    },
    {
      key: "appliedOn",
      label: "Applied On",
      render: (item) => <span className="text-gray-800 dark:text-gray-200">{item.appliedOn}</span>,
    },
    {
      key: "status",
      label: "Status",
      render: (item, { getStatusBadge }) => {
        if (item.status === "Declined") {
          const reason = item.declineReason || item.decline_reason;
          return (
            <div className="flex flex-col gap-1 items-start max-w-[200px]">
              <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-700 whitespace-nowrap">
                ✗ Declined
              </span>
              {reason && (
                <span className="text-[11px] text-rose-500 dark:text-rose-400 italic">
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
            className="px-2.5 py-1 bg-purple-500 text-white text-xs lg:text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors shadow-sm"
          >
            View
          </button>
        </div>
      ),
    },
  ];

  const pendingMobileRender = (item, { getStatusBadge }) => (
    <div className="p-2.5">
      <div className="flex justify-between items-start gap-2 mb-1.5">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-gray-800 dark:text-white truncate">
            {item.employee}
          </p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
            {item.type} · Applied {item.appliedOn}
          </p>
        </div>
        <div className="shrink-0">{getStatusBadge(item.status)}</div>
      </div>
      <div className="flex justify-between items-center text-[11px] mb-2">
        <span className="text-gray-700 dark:text-gray-300">
          {item.from} → {item.to}
        </span>
        <span className="font-semibold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/40 px-1.5 py-0.5 rounded text-[10px]">
          {item.noOfDays || item.days} day(s)
        </span>
      </div>
      <div className="pt-1.5 border-t border-gray-100 dark:border-gray-700 flex gap-1.5">
        <button
          onClick={() => {
            setSelectedLeave(item);
            setShowPrintModal(true);
          }}
          className="flex-1 py-1.5 bg-purple-500 text-white text-[10px] font-medium rounded-md hover:bg-purple-700"
        >
          View
        </button>
        <button
          onClick={() => askApprove(item)}
          className="flex-1 py-1.5 bg-green-500 text-white text-[10px] font-medium rounded-md hover:bg-green-700"
          disabled={loading}
        >
          Approve
        </button>
        <button
          onClick={() => askReject(item)}
          className="flex-1 py-1.5 bg-red-500 text-white text-[10px] font-medium rounded-md hover:bg-red-700"
          disabled={loading}
        >
          Reject
        </button>
      </div>
    </div>
  );

  const historyMobileRender = (item, { getStatusBadge }) => {
    const reason = item.declineReason || item.decline_reason;
    return (
      <div className="p-2.5">
        <div className="flex justify-between items-start gap-2 mb-1.5">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-gray-800 dark:text-white truncate">
              {item.employee}
            </p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
              {item.type} · Applied: {item.appliedOn}
            </p>
          </div>
          <div className="shrink-0">{getStatusBadge(item.status)}</div>
        </div>
        <div className="flex justify-between items-center text-[11px]">
          <span className="text-gray-700 dark:text-gray-300">
            {item.from} → {item.to}
          </span>
          <span className="font-semibold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/40 px-1.5 py-0.5 rounded text-[10px]">
            {item.noOfDays || item.days} day(s)
          </span>
        </div>
        {item.status === "Declined" && reason && (
          <div className="mt-2 pt-1.5 border-t border-gray-100 dark:border-gray-700">
            <p className="text-[10px] text-rose-500 dark:text-rose-400 italic">
              <strong className="font-bold not-italic">Reason:</strong> "{reason}"
            </p>
          </div>
        )}
        {/* ✅ Add View button for mobile */}
        <div className="pt-1.5 mt-1.5 border-t border-gray-100 dark:border-gray-700 flex gap-1.5">
          <button
            onClick={() => {
              setSelectedLeave(item);
              setShowPrintModal(true);
            }}
            className="w-full py-1.5 bg-purple-500 text-white text-[10px] font-medium rounded-md hover:bg-purple-700"
          >
            View
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      <div className="hidden lg:block lg:w-1/5 shrink-0">
        <ExecutiveOfficerSidebar activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
      <div className="lg:hidden">
        <ExecutiveOfficerSidebar
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
          <ExecutiveOfficerHeader
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
              <span>{toast}</span>
            </div>
          )}

          {activeTab === "dashboard" && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6 mb-6">
                {stats.map((stat, i) => (
                  <div
                    key={i}
                    className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 lg:p-6"
                  >
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-xs lg:text-sm text-gray-500 dark:text-gray-400 font-medium truncate">
                          {stat.label}
                        </p>
                        <p className="text-2xl lg:text-3xl font-bold text-gray-800 dark:text-white mt-1 truncate">
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

              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="p-4 lg:p-6 border-b border-gray-100 dark:border-gray-700">
                  <h3 className="text-base lg:text-lg font-semibold text-gray-800 dark:text-white">
                    Pending Leave Requests
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Requests awaiting your approval for {currentUser.division}
                  </p>
                </div>
                <div className="p-4">
                  {pendingLeaves.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 dark:text-gray-500">
                      <p className="text-sm font-medium">No pending leave requests.</p>
                    </div>
                  ) : (
                    <DataTable
                      columns={pendingColumns}
                      data={pendingLeaves}
                      mobileRender={pendingMobileRender}
                      options={{ searchable: true, showFilters: false, itemsPerPage: 10 }}
                      label="pending requests"
                    />
                  )}
                </div>
              </div>
            </>
          )}

          {activeTab === "apply-leave" && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 lg:p-6">
              <ApplyLeave />
            </div>
          )}

          {activeTab === "my-leaves" && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 lg:p-6">
              <MyLeaves />
            </div>
          )}

          {activeTab === "leave-history" && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 lg:p-6">
              <div className="mb-4">
                <h3 className="text-base lg:text-lg font-semibold text-gray-800 dark:text-white">
                  Employee Leave History
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Employee leave requests you have approved or rejected
                </p>
              </div>
              
              {eoProcessedLeaves.length === 0 ? (
                <div className="text-center py-12 text-gray-400 dark:text-gray-500">
                  <p className="text-sm font-medium">No processed leaves yet.</p>
                  <p className="text-xs mt-1">Employee requests you approve or reject will appear here.</p>
                </div>
              ) : (
                <DataTable
                  columns={historyColumns}
                  data={eoProcessedLeaves}
                  mobileRender={historyMobileRender}
                  options={{ searchable: true, showFilters: true, itemsPerPage: 10 }}
                  label="employee leave history"
                />
              )}
            </div>
          )}

          {activeTab === "profile" && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 lg:p-6">
              <EOProfile />
            </div>
          )}

          {activeTab === "settings" && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 lg:p-6">
              <Settings />
            </div>
          )}

          {activeTab === "reports" && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 lg:p-6 text-center text-gray-500 dark:text-gray-400">
              <p className="text-sm">Reports coming soon.</p>
            </div>
          )}
        </main>
      </div>

      {/* Approval Modal */}
      <ConfirmModal
        open={confirmModal.open}
        onClose={closeModal}
        onConfirm={processAction}
        tone={confirmModal.action === "approve" ? "approve" : "decline"}
        requireReason={confirmModal.action === "reject"}
        loading={loading}
        title={
          confirmModal.action === "approve"
            ? "Approve this leave request?"
            : "Reject this leave request?"
        }
        message={
          confirmModal.leave
            ? confirmModal.action === "approve"
              ? `You are about to APPROVE ${confirmModal.leave.employee}'s ${confirmModal.leave.type} leave (${confirmModal.leave.from} to ${confirmModal.leave.to}).`
              : `You are about to REJECT ${confirmModal.leave.employee}'s ${confirmModal.leave.type} leave (${confirmModal.leave.from} to ${confirmModal.leave.to}).`
            : ""
        }
        confirmLabel={confirmModal.action === "approve" ? "Yes, Approve" : "Yes, Reject"}
        cancelLabel="Cancel"
        reasonLabel="Reason for rejecting (optional)"
        reasonPlaceholder="Explain why you are rejecting this leave..."
      />

      {/* View Form Modal */}
      {showPrintModal && selectedLeave && (
        <LeaveApprovalModal
          selectedLeave={selectedLeave}
          setShowPrintModal={setShowPrintModal}
          setSelectedLeave={setSelectedLeave}
        />
      )}
    </div>
  );
}

export default ExecutiveOfficerDashboard;