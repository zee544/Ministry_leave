import { useRef, useState } from "react";
import DataTable from "../Components/DataTable";
import { useLeaves } from "../hooks/LeaveContext.jsx";
import { useUser } from "../hooks/UserContext.jsx";
import { useNotifications } from "../hooks/NotificationContext.jsx";
import LeaveApprovalModal from "../hooks/LeaveApprovalModal.jsx";
import ConfirmModal from "../Components/ConfirmModal.jsx";

function LeaveApprove() {
    const { leaves, updateLeaveStatus } = useLeaves();
    const { currentUser } = useUser();
    const { addNotification } = useNotifications();
    const [selectedLeave, setSelectedLeave] = useState(null);
    const [showPrintModal, setShowPrintModal] = useState(false);

    const [confirmModal, setConfirmModal] = useState({
        open: false,
        leave: null,
        action: "approve",
    });
    const [approvalLoading, setApprovalLoading] = useState(false);
    const approvalInFlight = useRef(false);

    const userDivision = currentUser?.division || "Administration";
    const divisionLeaves = leaves.filter(
        (l) => l.division === userDivision && (l.applicantRole ?? l.applicant_role) !== "admin"
    );

    const askApprove = (item) => setConfirmModal({ open: true, leave: item, action: "approve" });
    const askDecline = (item) => setConfirmModal({ open: true, leave: item, action: "decline" });
    const closeModal = () => setConfirmModal({ open: false, leave: null, action: "approve" });

    const handleApprove = async (item) => {
        await updateLeaveStatus(item.id, "Admin Approved", { recommendedByAdmin: true });

        addNotification(
            `${item.employee}'s ${item.type} leave (${item.from} to ${item.to}) has been pre-approved by Admin and is now awaiting your final approval.`,
            "leave_application",
            "hod",
            item.division
        );
        addNotification(
            `Your ${item.type} leave (${item.from} to ${item.to}) has been pre-approved by Admin and forwarded to HOD for final approval.`,
            "status_update",
            item.employee,
            item.division
        );

        if (item.actingOfficer) {
            addNotification(
                `${item.employee}'s ${item.type} leave (${item.from} to ${item.to}) has been pre-approved by Admin and forwarded to HOD for final approval.`,
                "status_update",
                item.actingOfficer,
                item.division
            );
        }
    };

    const handleDecline = async (item, reason) => {
        await updateLeaveStatus(item.id, "Declined", { declinedBy: "Admin", reason: reason || null });

        const reasonText = reason ? ` Reason: ${reason}` : "";

        addNotification(
            `Your ${item.type} leave (${item.from} to ${item.to}) has been DECLINED by Admin.${reasonText}`,
            "status_update",
            item.employee,
            item.division
        );

        if (item.actingOfficer) {
            addNotification(
                `${item.employee}'s ${item.type} leave (${item.from} to ${item.to}) was DECLINED by Admin.${reasonText}`,
                "status_update",
                item.actingOfficer,
                item.division
            );
        }

        addNotification(
            `${item.employee}'s ${item.type} leave (${item.from} to ${item.to}) was DECLINED by Admin.${reasonText}`,
            "leave_application",
            "hod",
            item.division
        );
    };

    const processAction = async (reason) => {
        const { leave: item, action } = confirmModal;
        if (!item || approvalInFlight.current) return;

        approvalInFlight.current = true;
        setApprovalLoading(true);
        try {
            if (action === "approve") {
                await handleApprove(item);
            } else {
                await handleDecline(item, reason);
            }
            closeModal();
        } catch (error) {
            alert(`Failed to ${action === "approve" ? "approve" : "decline"}: ${error.message}`);
        } finally {
            approvalInFlight.current = false;
            setApprovalLoading(false);
        }
    };

    // ---- Same colors as desktop table; compact size for mobile ----
    const renderStatus = (item, getStatusBadge, compact = false) => {
        const size = compact
            ? "px-2 py-0.5 text-[10px] rounded-md font-medium"
            : "px-3 py-1 rounded-lg font-medium";

        if (item.status === "Admin Approved") {
            return (
                <span className={`${size} bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300`}>
                    Awaiting HOD
                </span>
            );
        }
        if (item.status === "Pending") {
            return (
                <span className={`${size} bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300`}>
                    Pending Admin
                </span>
            );
        }
        // Desktop: use DataTable's original badge
        if (!compact && getStatusBadge) return getStatusBadge(item.status);

        // Mobile fallback — same colors as desktop badges
        if (item.status === "Approved") {
            return (
                <span className={`${size} bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300`}>
                    Approved
                </span>
            );
        }
        if (item.status === "Declined") {
            return (
                <span className={`${size} bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300`}>
                    Declined
                </span>
            );
        }
        if (item.status === "Pending Acting Officer") {
            return (
                <span className={`${size} bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300`}>
                    Pending Acting Officer
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
        return (
            <span className={`${size} bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300`}>
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
            render: (item, ctx) => renderStatus(item, ctx?.getStatusBadge, false),
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
                    >
                        View
                    </button>
                    {item.status === "Pending" && (
                        <>
                            <button
                                onClick={() => askApprove(item)}
                                className="px-3 py-1 bg-green-500 text-white text-md rounded-lg hover:bg-green-700"
                            >
                                Approve
                            </button>
                            <button
                                onClick={() => askDecline(item)}
                                className="px-3 py-1 bg-red-500 text-white text-md rounded-lg hover:bg-red-700"
                            >
                                Decline
                            </button>
                        </>
                    )}
                </div>
            ),
        },
    ];

    // ============================================================
    // MOBILE CARD — 4-row compact layout (matches ActingApprovals / Myleaves)
    // ============================================================
    const MobileLeaveCard = ({ item }) => (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-2 mb-1.5">
            {/* Row 1: Name + Days badge */}
            <div className="flex justify-between items-center gap-2 mb-1">
                <p className="font-semibold text-[13px] text-gray-800 dark:text-white truncate">
                    {item.employee}
                </p>
                <span className="shrink-0 text-[10px] font-semibold bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-1.5 py-0.5 rounded">
                    {item.noOfDays || item.days || "—"}d
                </span>
            </div>

            {/* Row 2: Division · Type */}
            <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate mb-1">
                {item.division} · {item.type}
            </p>

            {/* Row 3: From → To inline */}
            <p className="text-[11px] text-gray-800 dark:text-gray-200 mb-1.5">
                <span className="text-gray-500 dark:text-gray-400">From: </span>
                <span className="font-medium">{item.from}</span>
                <span className="text-gray-400 dark:text-gray-500 mx-1">→</span>
                <span className="text-gray-500 dark:text-gray-400">To: </span>
                <span className="font-medium">{item.to}</span>
            </p>

            {/* Row 4: Status badge (left) + action buttons (right) */}
            <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-gray-100 dark:border-gray-700">
                <div className="min-w-0">
                    {renderStatus(item, null, true)}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <button
                        onClick={() => {
                            setSelectedLeave(item);
                            setShowPrintModal(true);
                        }}
                        className="px-2 py-1 bg-purple-500 text-white text-[10px] font-medium rounded hover:bg-purple-700"
                    >
                        View
                    </button>
                    {item.status === "Pending" && (
                        <>
                            <button
                                onClick={() => askApprove(item)}
                                className="px-2 py-1 bg-green-500 text-white text-[10px] font-medium rounded hover:bg-green-700"
                            >
                                Approve
                            </button>
                            <button
                                onClick={() => askDecline(item)}
                                className="px-2 py-1 bg-red-500 text-white text-[10px] font-medium rounded hover:bg-red-700"
                            >
                                Decline
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );

    return (
        <div>
            <div className="flex justify-between items-center mb-3 gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-bold text-gray-800 dark:text-white">Leave Requests</h2>
                <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold px-3 py-1 rounded-full">
                    {userDivision} Division
                </span>
            </div>

            {/* Mobile: compact card view */}
            <div className="block md:hidden">
                {divisionLeaves.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                        <p className="text-sm font-medium">No leave requests</p>
                        <p className="text-xs mt-1">No leave requests found for your division.</p>
                    </div>
                ) : (
                    divisionLeaves.map((item) => (
                        <MobileLeaveCard key={item.id} item={item} />
                    ))
                )}
            </div>

            {/* Desktop: table view */}
            <div className="hidden md:block">
                <DataTable
                    columns={columns}
                    data={divisionLeaves}
                    options={{
                        searchFields: ["employee", "division", "type"],
                        filterConfig: [
                            { key: "type", label: "Leave Type" },
                            { key: "status", label: "Status" },
                        ],
                        itemsPerPage: 5,
                    }}
                    label="leave requests"
                />
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
                loading={approvalLoading}
                tone={confirmModal.action === "approve" ? "approve" : "decline"}
                requireReason={confirmModal.action === "decline"}
                title={confirmModal.action === "approve"
                    ? "Approve this leave request?"
                    : "Decline this leave request?"}
                message={confirmModal.leave
                    ? confirmModal.action === "approve"
                        ? `You are about to PRE-APPROVE ${confirmModal.leave.employee}'s ${confirmModal.leave.type} leave (${confirmModal.leave.from} to ${confirmModal.leave.to}).`
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

export default LeaveApprove;