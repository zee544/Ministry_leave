import { useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import SecretaryHeader from "../Components/SecretaryHeader";
import SecretarySidebar from "../Components/SecretarySidebar";
import Settings from "../User/settings";
import { ClipboardList, Clock, CheckCircle, XCircle } from "lucide-react";
import DataTable from "../Components/DataTable";
import { useLeaves } from "../hooks/LeaveContext.jsx";
import { useUser } from "../hooks/UserContext.jsx";
import ConfirmModal from "../Components/ConfirmModal.jsx";
import LeaveApprovalModal from "../hooks/LeaveApprovalModal.jsx";
import ApplyLeave from "../User/ApplyLeave.jsx";
import Myleaves from "../User/myleaves.jsx";
import ApprovalSettings from "../Components/ApprovalSettings.jsx";

function SecretaryDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const activeTab = requestedTab === "acting-approvals"
    ? "pending"
    : requestedTab || "dashboard";

  const setActiveTab = (tab) => {
    if (tab === "dashboard") setSearchParams({}, { replace: false });
    else setSearchParams({ tab }, { replace: false });
  };

  const { leaves, secretaryApprove } = useLeaves();
  const { currentUser } = useUser();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const actionInFlight = useRef(false);

  const [confirmModal, setConfirmModal] = useState({
    open: false,
    leave: null,
    action: "approve",
  });

  // ============================================================
  // Split leaves by role and status
  // ============================================================
  const rawLeaves = leaves || [];
  const myId = Number(currentUser?.id || 0);

  const secretaryEmail = String(currentUser?.email || "").trim().toLowerCase();
  
  const isAssignedSecretary = (leave) => {
    const role = leave.applicantRole ?? leave.applicant_role;
    const targetRole = leave.targetApproverRole ?? leave.target_approver_role;
    const targetId = leave.targetApproverId ?? leave.target_approver_id;
    const targetEmail = String(leave.targetApproverEmail ?? leave.target_approver_email ?? "").trim().toLowerCase();
    return role === "hod" &&
      targetRole === "secretary" &&
      (targetId != null
        ? Number(targetId) === myId
        : Boolean(secretaryEmail && targetEmail === secretaryEmail));
  };

  const pendingSecretaryLeaves = rawLeaves.filter(
    (leave) => leave.status === "Pending" && isAssignedSecretary(leave)
  );

  const decidedByCurrentSecretary = (leave) => {
    const decidedById = leave.secretaryDecidedById ?? leave.secretary_decided_by_id;
    const approvedById = leave.approvedById ?? leave.approved_by_id;
    const decidedByName = leave.declinedBy ?? leave.declined_by;
    return (
      Number(decidedById) === myId ||
      Number(approvedById) === myId ||
      (!decidedById && !approvedById && decidedByName === currentUser?.name)
    );
  };

  const secretaryApprovedLeaves = rawLeaves.filter(
    (leave) =>
      isAssignedSecretary(leave) &&
      leave.status === "Approved" &&
      decidedByCurrentSecretary(leave)
  );
  
  const secretaryDeclinedLeaves = rawLeaves.filter(
    (leave) =>
      isAssignedSecretary(leave) &&
      leave.status === "Declined" &&
      decidedByCurrentSecretary(leave)
  );

  // ✅ Dashboard එකේ එකම ටේබල් එකේ පෙන්නන්න Pending + Approved + Declined එකතු කිරීම
  let combinedDashboardLeaves = [
    ...pendingSecretaryLeaves,
    ...secretaryApprovedLeaves,
    ...secretaryDeclinedLeaves,
  ];

  // ✅ අලුත්ම ලීව් එක මුලට එන විදිහට (Latest First) පේළි පිළිවෙල හැදීම
  combinedDashboardLeaves.sort((a, b) => {
    const dateA = new Date(String(a.appliedOn || a.applied_on || "").replace(" ", "T")).getTime();
    const dateB = new Date(String(b.appliedOn || b.applied_on || "").replace(" ", "T")).getTime();
    // අගයන් වැඩි එක (අලුත්ම දිනය) මුලට එන ලෙස
    return (isNaN(dateB) ? 0 : dateB) - (isNaN(dateA) ? 0 : dateA);
  });

  const allLeaves = rawLeaves;

  // ============================================================
  // Actions
  // ============================================================
  const askApprove = (leave) =>
    setConfirmModal({ open: true, leave, action: "approve" });
  const askDecline = (leave) =>
    setConfirmModal({ open: true, leave, action: "decline" });
  const closeModal = () =>
    setConfirmModal({ open: false, leave: null, action: "approve" });

  const processAction = async (reason) => {
    const { leave, action } = confirmModal;
    if (!leave || actionInFlight.current) return;

    actionInFlight.current = true;
    setLoading(true);
    setToast("Processing...");

    try {
      if (action === "approve") {
        await secretaryApprove(leave.id, "approve");
        setToast(`✅ Approved ${leave.employee}'s leave.`);
      } else {
        await secretaryApprove(leave.id, "decline", reason);
        setToast(`❌ Declined ${leave.employee}'s leave.`);
      }
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

  // ============================================================
  // Stats
  // ============================================================
  const stats = [
    {
      label: "Total Leave Records",
      value: allLeaves.length,
      icon: <ClipboardList className="w-6 h-6 lg:w-8 lg:h-8 text-white" />,
      color: "bg-blue-500",
    },
    {
      label: "Pending Your Approval",
      value: pendingSecretaryLeaves.length,
      icon: <Clock className="w-6 h-6 lg:w-8 lg:h-8 text-white" />,
      color: "bg-yellow-500",
    },
    {
      label: "Approved by Secretary",
      value: secretaryApprovedLeaves.length,
      icon: <CheckCircle className="w-6 h-6 lg:w-8 lg:h-8 text-white" />,
      color: "bg-green-500",
    },
    {
      label: "Declined by Secretary",
      value: secretaryDeclinedLeaves.length,
      icon: <XCircle className="w-6 h-6 lg:w-8 lg:h-8 text-white" />,
      color: "bg-red-500",
    },
  ];

  // ============================================================
  // Columns
  // ============================================================
  const baseColumns = [
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
      key: "division",
      label: "Division",
      render: (item) => (
        <span className="text-gray-800 dark:text-gray-200">
          {item.division || "—"}
        </span>
      ),
    },
    {
      key: "type",
      label: "Type",
      render: (item) => (
        <span className="text-gray-800 dark:text-gray-200">{item.type}</span>
      ),
    },
    {
      key: "from",
      label: "From",
      render: (item) => (
        <span className="text-gray-800 dark:text-gray-200">{item.from}</span>
      ),
    },
    {
      key: "to",
      label: "To",
      render: (item) => (
        <span className="text-gray-800 dark:text-gray-200">{item.to}</span>
      ),
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
      render: (item) => (
        <span className="text-gray-800 dark:text-gray-200">{item.appliedOn}</span>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (item, { getStatusBadge }) => {
        if (item.status === "Declined") {
          const reason = item.declineReason || item.decline_reason;
          return (
            <div className="flex flex-col gap-1 items-start max-w-[280px]">
              <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-700 whitespace-nowrap">
                ✗ Declined
              </span>
              {reason && (
                <span
                  className="text-[11px] text-rose-500 dark:text-rose-400 italic whitespace-normal break-words leading-snug"
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
  ];

  const historyColumns = [...baseColumns];

  // ✅ අලුත් Combined Columns එක (Decision Date අයින් කරලා View බට්න් එක එකතු කරලා)
  const combinedDashboardColumns = [
    ...baseColumns,
    {
      key: "actions",
      label: "Action",
      className: "text-right",
      render: (item) => (
        <div className="flex items-center justify-end gap-2">
          {/* හැම ලීව් එකකටම View බට්න් එක පේනවා */}
          <button
            onClick={() => {
              setSelectedLeave(item);
              setShowPrintModal(true);
            }}
            className="px-2.5 py-1 bg-purple-500 text-white text-xs lg:text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors"
            title="View Application Form"
          >
            View
          </button>
          
          {/* Pending නම් විතරක් Approve / Decline බට්න් පේනවා */}
          {item.status === "Pending" && (
            <>
              <button
                onClick={() => askApprove(item)}
                className="px-2.5 py-1 bg-green-500 text-white text-xs lg:text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
                disabled={loading}
              >
                Approve
              </button>
              <button
                onClick={() => askDecline(item)}
                className="px-2.5 py-1 bg-red-500 text-white text-xs lg:text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
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

  const pendingColumns = [
    ...baseColumns,
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
            className="px-2.5 py-1 bg-purple-500 text-white text-xs lg:text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors"
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
            onClick={() => askDecline(item)}
            className="px-2.5 py-1 bg-red-500 text-white text-xs lg:text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
            disabled={loading}
          >
            Decline
          </button>
        </div>
      ),
    },
  ];

  const baseMobileRender = (item, { getStatusBadge }) => {
    const reason = item.declineReason || item.decline_reason;

    return (
      <div className="p-2.5">
        <div className="flex justify-between items-start gap-2 mb-1.5">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-gray-800 dark:text-white truncate">
              {item.employee}
            </p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
              {item.division} · {item.type}
            </p>
          </div>
          <div className="shrink-0">
            {item.status === "Declined" ? (
              <span className="px-2 py-0.5 text-[10px] rounded-md font-semibold bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-700">
                ✗ Declined
              </span>
            ) : (
              getStatusBadge(item.status)
            )}
          </div>
        </div>
        
        <div className="flex justify-between items-center text-[11px]">
          <span className="text-gray-700 dark:text-gray-300">
            {item.from} → {item.to}
          </span>
          <span className="font-semibold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/40 px-1.5 py-0.5 rounded text-[10px]">
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
      </div>
    );
  };

  // ✅ Mobile View එකටත් View බට්න් එක එකතු කළා
  const combinedDashboardMobileRender = (item, ctx) => (
    <div>
      {baseMobileRender(item, ctx)}
      <div className="px-2.5 pb-2 flex gap-1.5 border-t border-gray-100 dark:border-gray-700 pt-1.5">
        <button
          onClick={() => {
            setSelectedLeave(item);
            setShowPrintModal(true);
          }}
          className="flex-1 py-1.5 bg-purple-500 text-white text-[10px] font-medium rounded-md hover:bg-purple-700"
        >
          View
        </button>
        {item.status === "Pending" && (
          <>
            <button
              onClick={() => askApprove(item)}
              className="flex-1 py-1.5 bg-green-500 text-white text-[10px] font-medium rounded-md hover:bg-green-700"
              disabled={loading}
            >
              Approve
            </button>
            <button
              onClick={() => askDecline(item)}
              className="flex-1 py-1.5 bg-red-500 text-white text-[10px] font-medium rounded-md hover:bg-red-700"
              disabled={loading}
            >
              Decline
            </button>
          </>
        )}
      </div>
    </div>
  );

  const pendingMobileRender = (item, ctx) => (
    <div>
      {baseMobileRender(item, ctx)}
      <div className="px-2.5 pb-2 flex gap-1.5 border-t border-gray-100 dark:border-gray-700 pt-1.5">
        <button
          onClick={() => askApprove(item)}
          className="flex-1 py-1.5 bg-green-500 text-white text-[10px] font-medium rounded-md hover:bg-green-700"
          disabled={loading}
        >
          Approve
        </button>
        <button
          onClick={() => askDecline(item)}
          className="flex-1 py-1.5 bg-red-500 text-white text-[10px] font-medium rounded-md hover:bg-red-700"
          disabled={loading}
        >
          Decline
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-900">
      <div className="hidden lg:block lg:w-1/5 shrink-0">
        <SecretarySidebar activeTab={activeTab} onTabChange={setActiveTab} />
      </div>
      <div className="lg:hidden">
        <SecretarySidebar
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
          <SecretaryHeader
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

          {/* ============================================ */}
          {/* DASHBOARD TAB */}
          {/* ============================================ */}
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

              {/* ✅ එකම ටේබල් එකේ Pending, Approved, සහ Declined ලීව්ස් පෙන්වීම */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="p-4 lg:p-6 border-b border-gray-100 dark:border-gray-700 flex items-start justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="text-base lg:text-lg font-semibold text-gray-800 dark:text-white">
                      Recent Leave Records
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Overview of your pending, approved, and declined leave requests
                    </p>
                  </div>
                </div>
                
                <div className="p-4">
                  {combinedDashboardLeaves.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-100 dark:border-gray-700">
                      <p className="text-sm font-medium">
                        No leave records found.
                      </p>
                    </div>
                  ) : (
                    <DataTable
                      columns={combinedDashboardColumns}
                      data={combinedDashboardLeaves}
                      mobileRender={combinedDashboardMobileRender}
                      options={{
                        searchable: true,
                        showFilters: true,
                        itemsPerPage: 10,
                      }}
                      label="leave records"
                    />
                  )}
                </div>
              </div>
            </>
          )}

          {/* ============================================ */}
          {/* ALL LEAVES TAB */}
          {/* ============================================ */}
          {activeTab === "all-leaves" && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 lg:p-6">
              <h3 className="text-base lg:text-lg font-semibold text-gray-800 dark:text-white mb-4">
                All Leave Records
              </h3>
              <DataTable
                columns={baseColumns}
                data={allLeaves}
                mobileRender={baseMobileRender}
                options={{
                  searchable: true,
                  showFilters: true,
                  itemsPerPage: 15,
                }}
                label="leave records"
              />
            </div>
          )}

          {/* ============================================ */}
          {/* PENDING APPROVALS TAB */}
          {/* ============================================ */}
          {activeTab === "pending" && (
            <div className="space-y-6">
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 lg:p-6">
                <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
                  <div>
                    <h3 className="text-base lg:text-lg font-semibold text-gray-800 dark:text-white">
                      Pending Your Approval
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      HOD leave requests assigned to you as the authorized approver
                    </p>
                  </div>
                  {pendingSecretaryLeaves.length > 0 && (
                    <span className="bg-teal-100 dark:bg-teal-900/40 text-teal-800 dark:text-teal-300 text-xs font-semibold px-3 py-1 rounded-full">
                      {pendingSecretaryLeaves.length} pending
                    </span>
                  )}
                </div>

                {pendingSecretaryLeaves.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-100 dark:border-gray-700">
                    <p className="text-sm font-medium">
                      No pending leave applications assigned to you.
                    </p>
                    <p className="text-xs mt-1">
                      HOD requests assigned to you in Approval Settings will appear here.
                    </p>
                  </div>
                ) : (
                  <DataTable
                    columns={pendingColumns}
                    data={pendingSecretaryLeaves}
                    mobileRender={pendingMobileRender}
                    options={{
                      searchable: true,
                      showFilters: false,
                      itemsPerPage: 15,
                    }}
                    label="pending HOD leave requests"
                  />
                )}
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 lg:p-6">
                <div className="flex items-start justify-between mb-4 flex-wrap gap-2">
                  <div>
                    <h3 className="text-base lg:text-lg font-semibold text-gray-800 dark:text-white">
                      Approved Leaves
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Requests already approved by you as authorized approver
                    </p>
                  </div>
                </div>

                {secretaryApprovedLeaves.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-100 dark:border-gray-700">
                    <p className="text-sm font-medium">No approved leaves found.</p>
                    <p className="text-xs mt-1">
                      Your approved requests will remain available here.
                    </p>
                  </div>
                ) : (
                  <DataTable
                    columns={historyColumns}
                    data={secretaryApprovedLeaves}
                    mobileRender={baseMobileRender}
                    options={{
                      searchable: true,
                      showFilters: true,
                      itemsPerPage: 15,
                    }}
                    label="Secretary-approved leaves"
                  />
                )}
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 lg:p-6">
                <div className="mb-4">
                  <h3 className="text-base lg:text-lg font-semibold text-gray-800 dark:text-white">
                    Declined Leaves
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Requests you declined, including the recorded reason
                  </p>
                </div>
                {secretaryDeclinedLeaves.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-100 dark:border-gray-700">
                    <p className="text-sm font-medium">No declined leaves found.</p>
                    <p className="text-xs mt-1">Your declined requests will remain available here.</p>
                  </div>
                ) : (
                  <DataTable
                    columns={historyColumns}
                    data={secretaryDeclinedLeaves}
                    mobileRender={baseMobileRender}
                    options={{
                      searchable: true,
                      showFilters: true,
                      itemsPerPage: 15,
                    }}
                    label="Secretary-declined leaves"
                  />
                )}
              </div>
            </div>
          )}

          {activeTab === "apply-leave" && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 lg:p-6 xl:p-8">
              <ApplyLeave />
            </div>
          )}

          {activeTab === "my-leaves" && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 lg:p-6 xl:p-8">
              <Myleaves />
            </div>
          )}

          {activeTab === "reports" && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 lg:p-6 text-center text-gray-500 dark:text-gray-400">
              <p className="text-sm">Reports module coming soon.</p>
            </div>
          )}

          {activeTab === "settings" && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 lg:p-6">
              <Settings />
            </div>
          )}

          {activeTab === "approval-settings" && (
            <ApprovalSettings role="secretary" />
          )}
        </main>
      </div>

      <ConfirmModal
        open={confirmModal.open}
        onClose={closeModal}
        onConfirm={processAction}
        tone={confirmModal.action === "approve" ? "approve" : "decline"}
        requireReason={confirmModal.action === "decline"} 
        loading={loading}
        title={
          confirmModal.action === "approve"
            ? "Approve this leave request?"
            : "Decline this leave request?"
        }
        message={
          confirmModal.leave
            ? confirmModal.action === "approve"
              ? `You are about to APPROVE ${confirmModal.leave.employee}'s ${confirmModal.leave.type} leave (${confirmModal.leave.from} to ${confirmModal.leave.to}).`
              : `You are about to DECLINE ${confirmModal.leave.employee}'s ${confirmModal.leave.type} leave (${confirmModal.leave.from} to ${confirmModal.leave.to}).`
            : ""
        }
        confirmLabel={
          confirmModal.action === "approve" ? "Yes, Approve" : "Yes, Decline"
        }
        cancelLabel="Cancel"
        reasonLabel="Reason for declining (required)"
        reasonPlaceholder="Explain why you are declining this leave..."
      />

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

export default SecretaryDashboard;