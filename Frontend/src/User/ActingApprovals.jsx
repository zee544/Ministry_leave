import { useRef, useState, useEffect } from "react";
import DataTable from "../Components/DataTable";
import { useLeaves } from "../hooks/LeaveContext.jsx";
import { useUser } from "../hooks/UserContext.jsx";
import LeaveApprovalModal from "../hooks/LeaveApprovalModal.jsx";
import ConfirmModal from "../Components/ConfirmModal.jsx";

function ActingApprovals() {
    const { confirmActingOfficer, getLeavesByActingOfficer, fetchActingOfficerLeaves } = useLeaves();
    const { currentUser } = useUser();
    const [toast, setToast] = useState("");
    const [selectedLeave, setSelectedLeave] = useState(null);
    const [showPrintModal, setShowPrintModal] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const actionInFlight = useRef(false);
    const [processingLeaveId, setProcessingLeaveId] = useState(null);

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
                if (fetchActingOfficerLeaves) await fetchActingOfficerLeaves();
            } catch (err) {
                console.error("Error loading leaves:", err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        loadLeaves();
    }, [fetchActingOfficerLeaves]);

    useEffect(() => {
        const refreshAssignments = () =>
            fetchActingOfficerLeaves?.({ force: true }).catch((err) =>
                console.warn("Failed to refresh Acting Approvals:", err.message)
            );
        window.addEventListener("leaves:acting-refresh", refreshAssignments);
        return () => window.removeEventListener("leaves:acting-refresh", refreshAssignments);
    }, [fetchActingOfficerLeaves]);

    const myAssignments = getLeavesByActingOfficer(
        currentUser.name,
        currentUser.division,
        currentUser.role,
        currentUser.id
    );

    const pendingConfirmations = myAssignments.filter(
        (l) => l.status === "Pending Acting Officer"
    );

    const handledAssignments = myAssignments.filter(
        (l) => l.status !== "Pending Acting Officer"
    );

    const askConfirm = (leave) => setConfirmModal({ open: true, leave, action: "confirm" });
    const askDecline = (leave) => setConfirmModal({ open: true, leave, action: "decline" });
    const closeModal = () => setConfirmModal({ open: false, leave: null, action: "confirm" });

    const handleConfirm = async (leave) => {
        setError(null);

        try {
            await confirmActingOfficer(leave.id, "confirm");

            setToast(`Approved ${leave.employee}'s leave. Forwarded to the configured approver.`);
            setTimeout(() => setToast(""), 3500);

        } catch (error) {
            console.error("Error confirming leave:", error);
            setError(error.message);
            setToast(`❌ Failed to confirm ${leave.employee}'s leave: ${error.message}`);
            setTimeout(() => setToast(""), 5000);
        }
    };

    const handleDecline = async (leave, reason) => {
        setError(null);

        try {
            await confirmActingOfficer(leave.id, "decline", reason);

            setToast(` Declined ${leave.employee}'s leave.`);
            setTimeout(() => setToast(""), 3500);

        } catch (error) {
            console.error("Error declining leave:", error);
            setError(error.message);
            setToast(`❌ Failed to decline ${leave.employee}'s leave: ${error.message}`);
            setTimeout(() => setToast(""), 5000);
        }
    };

    const processAction = async (reason) => {
        const { leave, action } = confirmModal;
        if (!leave || actionInFlight.current) return;

        actionInFlight.current = true;
        setProcessingLeaveId(leave.id);
        try {
            if (action === "confirm") {
                await handleConfirm(leave);
            } else {
                await handleDecline(leave, reason);
            }
            closeModal();
        } finally {
            actionInFlight.current = false;
            setProcessingLeaveId(null);
        }
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
                item.declined_by === "Acting Officer" ||
                String(item.declinedBy || item.declined_by || "").toLowerCase() === "acting officer")
        ) {
            return (
                <div className="flex min-w-0 flex-col items-start gap-0.5">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-700">
                        ✗ You Declined
                    </span>
                    {(item.declineReason || item.decline_reason) && (
                        <span
                            className="max-w-full whitespace-normal break-words text-[10px] italic leading-tight text-red-600 dark:text-red-400"
                            title={item.declineReason || item.decline_reason}
                        >
                            Reason: {item.declineReason || item.decline_reason}
                        </span>
                    )}
                </div>
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
        { key: "type", label: "Type", render: (item) => <span className="text-gray-800 dark:text-gray-200">{item.type}</span> },
        { key: "from", label: "From", render: (item) => <span className="text-gray-800 dark:text-gray-200">{item.from}</span> },
        { key: "to", label: "To", render: (item) => <span className="text-gray-800 dark:text-gray-200">{item.to}</span> },
        {
            key: "status",
            label: "Status",
            className: "min-w-[200px]",
            render: (item) => item.status === "Pending Acting Officer"
                ? (
                    <span className="whitespace-nowrap inline-block px-3 py-1 rounded-lg text-xs font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-700">
                        Awaiting Your Confirmation
                    </span>
                )
                : renderHistoryStatus(item),
        },
        {
            key: "daysActions",
            label: "Days / Actions",
            className: "min-w-[190px]",
            render: (item) => (
                <div className="flex flex-wrap items-center justify-end gap-2">
                    <span className="font-semibold bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-2 py-0.5 rounded text-xs">
                        {item.noOfDays || item.days || "—"} days
                    </span>
                    <button
                        onClick={() => {
                            setSelectedLeave(item);
                            setShowPrintModal(true);
                        }}
                        className="px-3 py-1 bg-purple-500 text-white text-md rounded-lg hover:bg-purple-700"
                        disabled={loading || String(processingLeaveId) === String(item.id)}
                    >
                        View
                    </button>
                    <button
                        onClick={() => askConfirm(item)}
                        className="px-3 py-1 bg-green-500 text-white text-md font-medium rounded-lg hover:bg-green-700"
                        disabled={loading || String(processingLeaveId) === String(item.id)}
                    >
                        Approve
                    </button>
                    <button
                        onClick={() => askDecline(item)}
                        className="px-3 py-1 bg-red-500 text-white text-md font-medium rounded-lg hover:bg-red-700"
                        disabled={loading || String(processingLeaveId) === String(item.id)}
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
            key: "daysActions",
            label: "Days / Actions",
            className: "min-w-[150px]",
            render: (item) => (
                <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-2 py-0.5 rounded text-xs">
                        {item.noOfDays || item.days || "—"} days
                    </span>
                <button
                    onClick={() => {
                        setSelectedLeave(item);
                        setShowPrintModal(true);
                    }}
                    className="px-3 py-1 bg-purple-500 text-white text-sm rounded-lg hover:bg-purple-700"
                >
                    View
                </button>
                </div>
            ),
        },
    ];


    const PendingMobileCard = ({ item }) => (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-amber-200 dark:border-amber-800 p-2 mb-1.5">
            {/* Row 1 */}
            <div className="flex items-center gap-2 mb-1">
                <p className="font-semibold text-[13px] text-gray-800 dark:text-white truncate">
                    {item.employee}
                </p>
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

            {/* Status stays separate from Days / Actions. */}
            <div className="border-t border-amber-100 pt-1.5 dark:border-amber-800">
                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-700">
                    Awaiting Your Confirmation
                </span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center justify-end gap-1">
                    <span className="mr-auto shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-800 dark:bg-gray-700 dark:text-gray-200">
                        {item.noOfDays || item.days || "—"} days
                    </span>
                    <button
                        onClick={() => {
                            setSelectedLeave(item);
                            setShowPrintModal(true);
                        }}
                        disabled={loading || String(processingLeaveId) === String(item.id)}
                        className="px-2 py-1 bg-purple-500 text-white text-[10px] font-medium rounded hover:bg-purple-700 disabled:opacity-60"
                    >
                        View
                    </button>
                    <button
                        onClick={() => askConfirm(item)}
                        disabled={loading || String(processingLeaveId) === String(item.id)}
                        className="px-2 py-1 bg-green-500 text-white text-[10px] font-medium rounded hover:bg-green-700 disabled:opacity-60"
                    >
                        Approve
                    </button>
                    <button
                        onClick={() => askDecline(item)}
                        disabled={loading || String(processingLeaveId) === String(item.id)}
                        className="px-2 py-1 bg-red-500 text-white text-[10px] font-medium rounded hover:bg-red-700 disabled:opacity-60"
                    >
                        Decline
                    </button>
            </div>
        </div>
    );

    const HistoryMobileCard = ({ item }) => (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-2 mb-1.5">
            {/* Row 1 */}
            <div className="flex items-center gap-2 mb-1">
                <p className="font-semibold text-[13px] text-gray-800 dark:text-white truncate">
                    {item.employee || "—"}
                </p>
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

            <div className="border-t border-gray-100 pt-1.5 dark:border-gray-700">
                <div className="min-w-0">{renderHistoryStatus(item)}</div>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center justify-end gap-1">
                <span className="mr-auto shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-800 dark:bg-gray-700 dark:text-gray-200">
                    {item.noOfDays || item.days || "—"} days
                </span>
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
                loading={Boolean(processingLeaveId)}
                title={
                    confirmModal.action === "confirm"
                        ? "Confirm this leave request?"
                        : "Decline this leave request?"
                }
                message={
                    confirmModal.leave
                        ? confirmModal.action === "confirm"
              ? `You are about to APPROVE ${confirmModal.leave.employee}'s ${confirmModal.leave.type} leave (${confirmModal.leave.from} to ${confirmModal.leave.to}). It will be forwarded according to the configured approval hierarchy.`
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
