import { useState } from "react";
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

    const userDivision = currentUser?.division || "Administration";
    const divisionLeaves = leaves.filter((l) => l.division === userDivision);

    const askApprove = (item) => setConfirmModal({ open: true, leave: item, action: "approve" });
    const askDecline = (item) => setConfirmModal({ open: true, leave: item, action: "decline" });
    const closeModal = () => setConfirmModal({ open: false, leave: null, action: "approve" });

    const handleApprove = (item) => {
        updateLeaveStatus(item.id, "Admin Approved", { recommendedByAdmin: true });

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

    const handleDecline = (item, reason) => {
        updateLeaveStatus(item.id, "Declined", { declinedBy: "Admin" });

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

    const processAction = (reason) => {
        const { leave: item, action } = confirmModal;
        if (!item) return;

        if (action === "approve") {
            handleApprove(item);
        } else {
            handleDecline(item, reason);
        }

        closeModal();
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
            render: (item, { getStatusBadge }) => {
                if (item.status === "Admin Approved") {
                    return <span className="px-3 py-1 rounded-lg font-medium bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300">Awaiting HOD</span>;
                }
                if (item.status === "Pending") {
                    return <span className="px-3 py-1 rounded-lg font-medium bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300">Pending Admin</span>;
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

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-800 dark:text-white">Leave Requests</h2>
                <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold px-3 py-1 rounded-full">
                    {userDivision} Division
                </span>
            </div>
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