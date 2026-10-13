import { useState, useEffect } from "react";
import DataTable from "../Components/DataTable";
import { useLeaves } from "../hooks/LeaveContext.jsx";
import { useNotifications } from "../hooks/NotificationContext.jsx";
import { useUser } from "../hooks/UserContext.jsx";
import LeaveApprovalModal from "../hooks/LeaveApprovalModal.jsx";
import ConfirmModal from "../Components/ConfirmModal.jsx";

function ActingApprovals() {
    const { confirmActingOfficer, getLeavesByActingOfficer, fetchLeaves, fetchActingOfficerLeaves, leaves } = useLeaves();
    const { addNotification } = useNotifications();
    const { currentUser } = useUser();
    const [toast, setToast] = useState("");
    const [selectedLeave, setSelectedLeave] = useState(null);
    const [showPrintModal, setShowPrintModal] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [confirmModal, setConfirmModal] = useState({
        open: false,
        leave: null,
        action: "confirm",
    });

    useEffect(() => {
        const loadLeaves = async () => {
            setLoading(true);
            setError(null);
            try {
                if (fetchLeaves) await fetchLeaves();
                if (fetchActingOfficerLeaves) await fetchActingOfficerLeaves();
            } catch (err) {
                console.error("Error loading leaves:", err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        loadLeaves();
    }, []);

    const myAssignments = getLeavesByActingOfficer(currentUser.name);

    const pendingConfirmations = myAssignments.filter(
        (l) => l.status === "Pending Acting Officer"
    );

    const handledAssignments = myAssignments.filter(
        (l) => l.status !== "Pending Acting Officer"
    );

    const askConfirm = (leave) => setConfirmModal({ open: true, leave, action: "confirm" });
    const askDecline = (leave) => setConfirmModal({ open: true, leave, action: "decline" });
    const closeModal = () => setConfirmModal({ open: false, leave: null, action: "confirm" });

    const handleConfirm = async (leave, reason) => {
        setLoading(true);
        setError(null);

        try {
            await confirmActingOfficer(leave.id, "confirm");

            setToast(`Confirmed ${leave.employee}'s leave. Sent to admin.`);
            setTimeout(() => setToast(""), 3500);

            addNotification(
                `Leave application: ${leave.employee}'s ${leave.type} leave (${leave.from} to ${leave.to}) has been confirmed by Acting Officer (${currentUser.name}) and is now awaiting your approval.`,
                "leave_application",
                "admin",
                leave.division
            );

            addNotification(
                `Your ${leave.type} leave (${leave.from} to ${leave.to}) has been confirmed by your Acting Officer (${currentUser.name}) and forwarded to Admin for approval.`,
                "status_update",
                leave.employee,
                leave.division
            );

            addNotification(
                `${leave.employee}'s ${leave.type} leave (${leave.from} to ${leave.to}) has been confirmed by Acting Officer (${currentUser.name}) and is now awaiting Admin approval.`,
                "leave_application",
                "hod",
                leave.division
            );

            if (fetchLeaves) await fetchLeaves();
        } catch (error) {
            console.error("Error confirming leave:", error);
            setError(error.message);
            setToast(`❌ Failed to confirm ${leave.employee}'s leave: ${error.message}`);
            setTimeout(() => setToast(""), 5000);
        } finally {
            setLoading(false);
        }
    };

    const handleDecline = async (leave, reason) => {
        setLoading(true);
        setError(null);

        try {
            await confirmActingOfficer(leave.id, "decline", reason);

            setToast(` Declined ${leave.employee}'s leave.`);
            setTimeout(() => setToast(""), 3500);

            const reasonText = reason ? ` Reason: ${reason}` : "";

            addNotification(
                `Your ${leave.type} leave (${leave.from} to ${leave.to}) was DECLINED by your Acting Officer (${currentUser.name}).${reasonText}`,
                "status_update",
                leave.employee,
                leave.division
            );

            addNotification(
                `${leave.employee}'s ${leave.type} leave (${leave.from} to ${leave.to}) was DECLINED by Acting Officer (${currentUser.name}).${reasonText}`,
                "leave_application",
                "admin",
                leave.division
            );

            addNotification(
                `${leave.employee}'s ${leave.type} leave (${leave.from} to ${leave.to}) was DECLINED by Acting Officer (${currentUser.name}).${reasonText}`,
                "leave_application",
                "hod",
                leave.division
            );

            if (fetchLeaves) await fetchLeaves();
        } catch (error) {
            console.error("Error declining leave:", error);
            setError(error.message);
            setToast(`❌ Failed to decline ${leave.employee}'s leave: ${error.message}`);
            setTimeout(() => setToast(""), 5000);
        } finally {
            setLoading(false);
        }
    };

    const processAction = async (reason) => {
        const { leave, action } = confirmModal;
        if (!leave) return;

        if (action === "confirm") {
            await handleConfirm(leave, reason);
        } else {
            await handleDecline(leave, reason);
        }

        closeModal();
    };

    // ---- Status badge renderer (shared between history table & mobile card) ----
    const renderHistoryStatus = (item) => {
        if (item.status === "Pending" && item.actingOfficerConfirmed) {
            return (
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-700">
                    ✓ You Confirmed
                </span>
            );
        }
        if (item.status === "Admin Approved") {
            return (
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-700">
                    Awaiting HOD
                </span>
            );
        }
        if (item.status === "Approved") {
            return (
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 border border-green-200 dark:border-green-700">
                    ✓ Fully Approved
                </span>
            );
        }
        if (item.status === "Cancelled") {
            const by = item.declinedBy || item.declined_by || "Employee";
            const reason = item.declineReason || item.decline_reason;
            return (
                <div className="flex flex-col gap-0.5 items-start">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600">
                        Cancelled by {by}
                    </span>
                    {reason && (
                        <span
                            className="text-[10px] text-gray-600 dark:text-gray-400 italic whitespace-normal break-words leading-tight"
                            title={reason}
                        >
                            Reason: "{reason}"
                        </span>
                    )}
                </div>
            );
        }
        if (
            item.status === "Declined" &&
            (item.declinedBy === "Acting Officer" ||
                item.declined_by === "Acting Officer")
        ) {
            return (
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-700">
                    ✗ You Declined
                </span>
            );
        }
        if (item.status === "Declined") {
            const by = item.declinedBy || item.declined_by || "—";
            const reason = item.declineReason || item.decline_reason;
            return (
                <div className="flex flex-col gap-0.5 items-start">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-700">
                        ✗ Declined By {by}
                    </span>
                    {reason && (
                        <span
                            className="text-[10px] text-red-600 dark:text-red-400 italic whitespace-normal break-words leading-tight"
                            title={reason}
                        >
                            Reason: "{reason}"
                        </span>
                    )}
                </div>
            );
        }
        return (
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                {item.status || "—"}
            </span>
        );
    };

    const columns = [
        { key: "employee", label: "Employee", render: (item) => <span className="text-gray-800 dark:text-white">{item.employee}</span> },
        { key: "division", label: "Division", render: (item) => <span className="text-gray-800 dark:text-gray-200">{item.division}</span> },
        { key: "type", label: "Type", render: (item) => <span className="text-gray-800 dark:text-gray-200">{item.type}</span> },
        { key: "from", label: "From", render: (item) => <span className="text-gray-800 dark:text-gray-200">{item.from}</span> },
        { key: "to", label: "To", render: (item) => <span className="text-gray-800 dark:text-gray-200">{item.to}</span> },
        {
            key: "noOfDays",
            label: "Days",
            render: (item) => (
                <span className="font-semibold bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-2 py-0.5 rounded text-xs">
                    {item.noOfDays || item.days || "—"}
                </span>
            ),
        },
        {
            key: "status",
            label: "Status",
            className: "min-w-[200px]",
            render: () => (
                <span className="whitespace-nowrap inline-block px-3 py-1 rounded-lg text-xs font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-700">
                    Awaiting Your Confirmation
                </span>
            ),
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
                        className="px-3 py-1 bg-purple-500 text-white text-md rounded-lg hover:bg-purple-700"
                        disabled={loading}
                    >
                        View
                    </button>
                    <button
                        onClick={() => askConfirm(item)}
                        className="px-3 py-1 bg-green-500 text-white text-md font-medium rounded-lg hover:bg-green-700"
                        disabled={loading}
                    >
                        Confirm
                    </button>
                    <button
                        onClick={() => askDecline(item)}
                        className="px-3 py-1 bg-red-500 text-white text-md font-medium rounded-lg hover:bg-red-700"
                        disabled={loading}
                    >
                        Decline
                    </button>
                </div>
            ),
        },
    ];

    const historyColumns = [
        {
            key: "employee",
            label: "Employee",
            render: (item) => (
                <span className="font-medium text-gray-800 dark:text-white">{item.employee || "—"}</span>
            ),
        },
        {
            key: "type",
            label: "Type",
            render: (item) => <span className="text-gray-800 dark:text-gray-200">{item.type || "—"}</span>,
        },
        {
            key: "from",
            label: "From",
            render: (item) => <span className="text-gray-800 dark:text-gray-200">{item.from || "—"}</span>,
        },
        {
            key: "to",
            label: "To",
            render: (item) => <span className="text-gray-800 dark:text-gray-200">{item.to || "—"}</span>,
        },
        {
            key: "status",
            label: "Status",
            render: (item) => renderHistoryStatus(item),
        },
        {
            key: "actions",
            label: "Action",
            render: (item) => (
                <button
                    onClick={() => {
                        setSelectedLeave(item);
                        setShowPrintModal(true);
                    }}
                    className="px-3 py-1 bg-purple-500 text-white text-sm rounded-lg hover:bg-purple-700"
                >
                    View
                </button>
            ),
        },
    ];

    // ============================================================
    // COMPACT MOBILE CARDS — 4 tight rows
    // Row 1: Name + Days      Row 2: Division · Type
    // Row 3: From → To        Row 4: Status (left) + buttons (right)
    // ============================================================

    const PendingMobileCard = ({ item }) => (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-amber-200 dark:border-amber-800 p-2 mb-1.5">
            {/* Row 1 */}
            <div className="flex justify-between items-center gap-2 mb-1">
                <p className="font-semibold text-[13px] text-gray-800 dark:text-white truncate">
                    {item.employee}
                </p>
                <span className="shrink-0 text-[10px] font-semibold bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-1.5 py-0.5 rounded">
                    {item.noOfDays || item.days || "—"}d
                </span>
            </div>

            {/* Row 2 */}
            <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate mb-1">
                {item.division} · {item.type}
            </p>

            {/* Row 3 */}
            <p className="text-[11px] text-gray-800 dark:text-gray-200 mb-1.5">
                <span className="text-gray-500 dark:text-gray-400">From: </span>
                <span className="font-medium">{item.from}</span>
                <span className="text-gray-400 dark:text-gray-500 mx-1">→</span>
                <span className="text-gray-500 dark:text-gray-400">To: </span>
                <span className="font-medium">{item.to}</span>
            </p>

            {/* Row 4: status + buttons on same row */}
            <div className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-amber-100 dark:border-amber-800">
                <span className="shrink-0 inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-700">
                    Awaiting Confirmation
                </span>
                <div className="flex items-center gap-1 shrink-0">
                    <button
                        onClick={() => {
                            setSelectedLeave(item);
                            setShowPrintModal(true);
                        }}
                        disabled={loading}
                        className="px-2 py-1 bg-purple-500 text-white text-[10px] font-medium rounded hover:bg-purple-700 disabled:opacity-60"
                    >
                        View
                    </button>
                    <button
                        onClick={() => askConfirm(item)}
                        disabled={loading}
                        className="px-2 py-1 bg-green-500 text-white text-[10px] font-medium rounded hover:bg-green-700 disabled:opacity-60"
                    >
                        Confirm
                    </button>
                    <button
                        onClick={() => askDecline(item)}
                        disabled={loading}
                        className="px-2 py-1 bg-red-500 text-white text-[10px] font-medium rounded hover:bg-red-700 disabled:opacity-60"
                    >
                        Decline
                    </button>
                </div>
            </div>
        </div>
    );

    const HistoryMobileCard = ({ item }) => (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-2 mb-1.5">
            {/* Row 1 */}
            <div className="flex justify-between items-center gap-2 mb-1">
                <p className="font-semibold text-[13px] text-gray-800 dark:text-white truncate">
                    {item.employee || "—"}
                </p>
                <span className="shrink-0 text-[10px] font-semibold bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-1.5 py-0.5 rounded">
                    {item.noOfDays || item.days || "—"}d
                </span>
            </div>

            {/* Row 2 */}
            <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate mb-1">
                {item.division || "—"} · {item.type || "—"}
            </p>

            {/* Row 3 */}
            <p className="text-[11px] text-gray-800 dark:text-gray-200 mb-1.5">
                <span className="text-gray-500 dark:text-gray-400">From: </span>
                <span className="font-medium">{item.from || "—"}</span>
                <span className="text-gray-400 dark:text-gray-500 mx-1">→</span>
                <span className="text-gray-500 dark:text-gray-400">To: </span>
                <span className="font-medium">{item.to || "—"}</span>
            </p>

            {/* Row 4: status + View on same row */}
            <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-gray-100 dark:border-gray-700">
                <div className="min-w-0">{renderHistoryStatus(item)}</div>
                <button
                    onClick={() => {
                        setSelectedLeave(item);
                        setShowPrintModal(true);
                    }}
                    className="shrink-0 px-2 py-1 bg-purple-500 text-white text-[10px] font-medium rounded hover:bg-purple-700"
                >
                    View
                </button>
            </div>
        </div>
    );

    return (
        <div>
            <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4">
                Acting Officer Approvals
            </h3>

            {error && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-red-700 dark:text-red-300 text-sm">
                    ❌ Error: {error}
                </div>
            )}

            {toast && (
                <div className="fixed top-4 right-4 z-50 px-4 py-3 bg-teal-600 dark:bg-teal-700 text-white text-sm rounded-lg shadow-lg">
                    {toast}
                </div>
            )}

            {/* Awaiting Your Confirmation */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-amber-200 dark:border-amber-800 overflow-hidden mb-6">
                <div className="p-3 sm:p-4 border-b border-amber-100 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/20">
                    <div className="flex items-center gap-2">
                        <h4 className="text-base sm:text-lg font-semibold text-amber-800 dark:text-amber-300">
                            Awaiting Your Confirmation
                        </h4>
                        <span className="bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                            {pendingConfirmations.length}
                        </span>
                    </div>
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        You have {pendingConfirmations.length} leave request(s) awaiting your confirmation as acting officer.
                    </p>
                </div>
                <div className="p-2 sm:p-4">
                    {loading ? (
                        <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                            Loading...
                        </div>
                    ) : pendingConfirmations.length === 0 ? (
                        <div className="text-center py-6 text-gray-400 dark:text-gray-500">
                            <p className="text-sm font-medium">No pending confirmations</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                You have no leave requests awaiting your confirmation.
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* Mobile: compact card view */}
                            <div className="block md:hidden">
                                {pendingConfirmations.map((item) => (
                                    <PendingMobileCard key={item.id} item={item} />
                                ))}
                            </div>
                            {/* Desktop: table view */}
                            <div className="hidden md:block">
                                <DataTable
                                    columns={columns}
                                    data={pendingConfirmations}
                                    options={{
                                        searchFields: ["employee", "division", "type"],
                                        itemsPerPage: 5,
                                    }}
                                    label="pending confirmations"
                                />
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Handled Assignments */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                <div className="p-3 sm:p-4 border-b border-gray-100 dark:border-gray-700">
                    <h4 className="text-base sm:text-lg font-semibold text-gray-800 dark:text-white">
                        Handled Assignments
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Leave requests you have already confirmed or declined
                    </p>
                </div>
                <div className="p-2 sm:p-4">
                    {/* Mobile: compact card view */}
                    <div className="block md:hidden">
                        {handledAssignments.length === 0 ? (
                            <div className="text-center py-6 text-gray-400 dark:text-gray-500">
                                <p className="text-sm font-medium">No handled assignments</p>
                                <p className="text-xs mt-1">
                                    You have not handled any acting officer assignments yet.
                                </p>
                            </div>
                        ) : (
                            handledAssignments.map((item) => (
                                <HistoryMobileCard key={item.id} item={item} />
                            ))
                        )}
                    </div>
                    {/* Desktop: table view */}
                    <div className="hidden md:block">
                        <DataTable
                            columns={historyColumns}
                            data={handledAssignments}
                            options={{ itemsPerPage: 5 }}
                            label="handled assignments"
                            emptyState={{
                                icon: "",
                                title: "No handled assignments",
                                message: "You have not handled any acting officer assignments yet.",
                            }}
                        />
                    </div>
                </div>
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
                confirmLabel={confirmModal.action === "confirm" ? "Yes, Confirm" : "Yes, Decline"}
                cancelLabel="Cancel"
                reasonLabel="Reason for declining (optional)"
                reasonPlaceholder="Explain why you are declining this leave..."
            />
        </div>
    );
}

export default ActingApprovals;