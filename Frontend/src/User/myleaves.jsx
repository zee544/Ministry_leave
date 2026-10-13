import { useState, useEffect } from "react";
import DataTable from "../Components/DataTable";
import { useLeaves } from "../hooks/LeaveContext.jsx";
import { useUser } from "../hooks/UserContext.jsx";
import { useNotifications } from "../hooks/NotificationContext.jsx";
import LeaveApprovalModal from "../hooks/LeaveApprovalModal.jsx";

function Myleaves() {
    const { leaves, updateLeave, cancelLeave, getLeaveById, fetchLeaves } = useLeaves();
    const { currentUser } = useUser();
    const { addNotification } = useNotifications();

    const [editing, setEditing] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [cancelTarget, setCancelTarget] = useState(null);
    const [cancelReason, setCancelReason] = useState("");
    const [toast, setToast] = useState("");
    const [selectedLeave, setSelectedLeave] = useState(null);
    const [showPrintModal, setShowPrintModal] = useState(false);
    const [loading, setLoading] = useState(true);
    const [isCancelling, setIsCancelling] = useState(false);

    useEffect(() => {
        const loadLeaves = async () => {
            setLoading(true);
            if (fetchLeaves) {
                await fetchLeaves();
            }
            setLoading(false);
        };
        loadLeaves();
    }, []);

    const normalize = (s) => (s || "").toString().trim().toLowerCase();

    const myLeaves = leaves.filter(
        (l) =>
            normalize(l.appliedBy) === normalize(currentUser.name)
    );

    const canModify = (status) => status === "Pending" || status === "Pending Acting Officer";

    const calculateDays = (from, resumingDate) => {
        if (!from || !resumingDate) return "";
        const [y1, m1, d1] = from.split("-").map(Number);
        const [y2, m2, d2] = resumingDate.split("-").map(Number);
        const start = new Date(y1, m1 - 1, d1);
        const end = new Date(y2, m2 - 1, d2);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) return "";
        if (end <= start) return "";

        let workingDays = 0;
        const current = new Date(start);
        while (current < end) {
            const dayOfWeek = current.getDay();
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                workingDays++;
            }
            current.setDate(current.getDate() + 1);
        }

        return workingDays > 0 ? workingDays.toString() : "0";
    };

    const handleEdit = (leave) => {
        setEditing(leave.id);
        setEditForm({
            type: leave.type,
            from: leave.from,
            to: leave.to,
            noOfDays: leave.noOfDays || leave.days || "",
            reason: leave.reason || "",
        });
    };

    const handleEditDateChange = (field, val) => {
        setEditForm((prev) => {
            const next = { ...prev, [field]: val };
            if (next.type === "Half-day") {
                next.noOfDays = "0.5";
            } else {
                const from = field === "from" ? val : prev.from;
                const to = field === "to" ? val : prev.to;
                const computed = calculateDays(from, to);
                if (computed) next.noOfDays = computed;
            }
            return next;
        });
    };

    const handleEditTypeChange = (val) => {
        setEditForm((prev) => {
            const next = { ...prev, type: val };
            if (val === "Half-day") {
                next.noOfDays = "0.5";
            } else if (prev.type === "Half-day" && prev.from && prev.to) {
                const computed = calculateDays(prev.from, prev.to);
                if (computed) next.noOfDays = computed;
            }
            return next;
        });
    };

    const handleSaveEdit = async (id) => {
        const result = await updateLeave(id, {
            ...editForm,
            days: editForm.noOfDays,
        });

        if (result?.success) {
            setToast("✅ Leave request updated successfully.");
        } else {
            setToast(`❌ Failed to update: ${result?.message || "Unknown error"}`);
        }

        setEditing(null);
        setEditForm({});
        setTimeout(() => setToast(""), 4000);
    };

    const handleCancelEdit = () => {
        setEditing(null);
        setEditForm({});
    };

    const handleCancelLeave = async (id) => {
        const leave = getLeaveById(id);
        if (!leave) return;

        setIsCancelling(true);

        try {
            const result = await cancelLeave(id, cancelReason);

            if (!result?.success) {
                setToast(`❌ Failed to cancel: ${result?.message || "Unknown error"}`);
                setTimeout(() => setToast(""), 4000);
                return;
            }

            const reasonText = cancelReason ? ` Reason: ${cancelReason}` : "";
            addNotification(
                `Your ${leave.type} leave (${leave.from} to ${leave.to}) has been cancelled.${reasonText}`,
                "status_update",
                currentUser.name
            );

            addNotification(
                `${currentUser.name} cancelled their ${leave.type} leave (${leave.from} to ${leave.to}).${reasonText}`,
                "status_update",
                "admin"
            );

            setToast("✅ Leave request cancelled successfully.");
            setCancelTarget(null);
            setCancelReason("");
            setTimeout(() => setToast(""), 3000);
        } catch (err) {
            console.error("Error cancelling leave:", err);
            setToast(`❌ Failed to cancel: ${err.message}`);
            setTimeout(() => setToast(""), 4000);
        } finally {
            setIsCancelling(false);
        }
    };

    // ---- Shared status renderer (compact for mobile, full for desktop) ----
    const renderStatus = (item, getStatusBadge, compact = false) => {
        const size = compact
            ? "px-2 py-0.5 text-[10px] rounded-md font-medium"
            : "px-3 py-1 rounded-lg text-md font-medium";

        if (item.status === "Admin Approved") {
            return (
                <span className={`${size} bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300`}>
                    Awaiting HOD
                </span>
            );
        }
        if (item.status === "Cancelled") {
            const reason = item.declineReason || item.decline_reason;
            return (
                <div className="flex flex-col gap-0.5 items-start">
                    <span className={`${size} bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300`}>
                        Cancelled
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
        if (item.status === "Declined") {
            const by = item.declinedBy || item.declined_by || "—";
            const reason = item.declineReason || item.decline_reason;
            return (
                <div className="flex flex-col gap-0.5 items-start">
                    <span className={`${size} bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-700`}>
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
        if (item.status === "Pending") {
            return (
                <span className={`${size} bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300`}>
                    Pending Admin
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
        return (
            <span className={`${size} bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300`}>
                {item.status || "—"}
            </span>
        );
    };

    const columns = [
        {
            key: "type",
            label: "Leave Type",
            render: (item) => (
                <span className="font-medium text-gray-800 dark:text-white">{item.type}</span>
            )
        },
        { key: "from", label: "From", render: (item) => <span className="text-gray-800 dark:text-gray-200">{item.from}</span> },
        { key: "to", label: "To", render: (item) => <span className="text-gray-800 dark:text-gray-200">{item.to}</span> },
        {
            key: "noOfDays",
            label: "Days",
            render: (item) => (
                <span className="font-semibold text-gray-700 dark:text-gray-200 bg-green-100 dark:bg-green-900/40 px-2 py-0.5 rounded text-xs">
                    {item.noOfDays || item.days || "—"}
                </span>
            ),
        },
        { key: "appliedOn", label: "Applied On", render: (item) => <span className="text-gray-800 dark:text-gray-200">{item.appliedOn}</span> },
        { key: "actingOfficer", label: "Acting Officer", render: (item) => <span className="text-gray-800 dark:text-gray-200">{item.actingOfficer}</span> },
        {
            key: "status",
            label: "Status",
            render: (item, ctx) => renderStatus(item, ctx?.getStatusBadge, false),
        },
        {
            key: "actions",
            label: "Actions",
            className: "text-right",
            render: (item) => (
                <div className="flex items-center justify-end gap-2">
                    <button
                        onClick={() => {
                            setSelectedLeave(item);
                            setShowPrintModal(true);
                        }}
                        className="px-3 py-1 text-md bg-purple-500 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-1 shadow-sm"
                        title="View Application Form"
                    >
                        View
                    </button>
                    {canModify(item.status) && (
                        <>
                            <button
                                onClick={() => handleEdit(item)}
                                className="px-3 py-1 text-md bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                Edit
                            </button>
                            <button
                                onClick={() => setCancelTarget(item.id)}
                                className="px-3 py-1 text-md bg-red-500 text-white font-medium rounded-lg hover:bg-red-700 transition-colors"
                            >
                                Cancel
                            </button>
                        </>
                    )}
                </div>
            ),
        },
    ];

    // ============================================================
    // MOBILE CARD — compact: name+status on row 1, date+days row 2,
    // buttons row 3. Status badge is small (text-[10px]).
    // ============================================================
    const mobileRender = (leave, { getStatusBadge }) => (
        <div className="p-2.5">
            {/* Row 1: Leave type (left) + compact status badge (right) */}
            <div className="flex justify-between items-start gap-2 mb-1.5">
                <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-gray-800 dark:text-white truncate">
                        {leave.type} Leave
                    </p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">
                        Applied: {leave.appliedOn}
                    </p>
                </div>
                <div className="shrink-0 text-right max-w-[55%]">
                    {renderStatus(leave, getStatusBadge, true)}
                </div>
            </div>

            {/* Row 2: From → To (left) + Days badge (right) */}
            <div className="flex justify-between items-center text-[11px] mb-2">
                <span className="text-gray-700 dark:text-gray-300 truncate">
                    {leave.from} <span className="text-gray-400 dark:text-gray-500 mx-0.5">→</span> {leave.to}
                </span>
                <span className="shrink-0 font-semibold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/40 px-1.5 py-0.5 rounded text-[10px]">
                    {leave.noOfDays || leave.days ? `${leave.noOfDays || leave.days} day(s)` : ""}
                </span>
            </div>

            {/* Row 3: Buttons */}
            <div className="flex gap-1.5 pt-1.5 border-t border-gray-100 dark:border-gray-700">
                <button
                    onClick={() => {
                        setSelectedLeave(leave);
                        setShowPrintModal(true);
                    }}
                    className="flex-1 px-2 py-1.5 bg-purple-500 text-white text-[11px] rounded-md hover:bg-purple-700 transition-colors font-medium"
                >
                    View
                </button>
                {canModify(leave.status) && (
                    <>
                        <button
                            onClick={() => handleEdit(leave)}
                            className="flex-1 px-2 py-1.5 bg-blue-500 text-white text-[11px] rounded-md hover:bg-blue-700 transition-colors font-medium"
                        >
                            Edit
                        </button>
                        <button
                            onClick={() => setCancelTarget(leave.id)}
                            className="flex-1 px-2 py-1.5 bg-red-500 text-white text-[11px] rounded-md hover:bg-red-700 transition-colors font-medium"
                        >
                            Cancel
                        </button>
                    </>
                )}
            </div>
        </div>
    );

    const inputClass =
        "w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500 transition-colors placeholder-gray-400";

    return (
        <div>
            <div className="flex justify-between items-center mb-4">
                
            </div>

            {toast && (
                <div className={`fixed top-4 right-4 z-50 px-4 py-3 text-white text-sm rounded-lg shadow-lg ${
                    toast.includes("❌") ? "bg-red-600" : "bg-green-600"
                }`}>
                    {toast}
                </div>
            )}

            {editing !== null && (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-blue-200 dark:border-blue-800 p-3 sm:p-4 lg:p-6 mb-4 sm:mb-6">
                    <h4 className="text-sm sm:text-base font-bold text-gray-800 dark:text-white mb-3 sm:mb-4">
                        Edit Leave Request
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        <div>
                            <label className="block text-[11px] sm:text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
                                Leave Type
                            </label>
                            <select
                                value={editForm.type || ""}
                                onChange={(e) => handleEditTypeChange(e.target.value)}
                                className={inputClass}
                            >
                                <option value="Annual">Annual</option>
                                <option value="Casual">Casual</option>
                                <option value="Other">Other</option>
                                <option value="Half-day">Half-day</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-[11px] sm:text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
                                No. of Days
                            </label>
                            <input
                                type="number"
                                min="0.5"
                                step="0.5"
                                value={editForm.noOfDays || ""}
                                onChange={(e) => setEditForm({ ...editForm, noOfDays: e.target.value })}
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] sm:text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
                                Date of Commencing Leave
                            </label>
                            <input
                                type="date"
                                value={editForm.from || ""}
                                onChange={(e) => handleEditDateChange("from", e.target.value)}
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] sm:text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
                                Date of Resuming Duties
                            </label>
                            <input
                                type="date"
                                value={editForm.to || ""}
                                onChange={(e) => handleEditDateChange("to", e.target.value)}
                                className={inputClass}
                            />
                        </div>
                        <div className="col-span-1 sm:col-span-2">
                            <label className="block text-[11px] sm:text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
                                Reason
                            </label>
                            <input
                                type="text"
                                value={editForm.reason || ""}
                                onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
                                className={inputClass}
                            />
                        </div>
                    </div>
                    <div className="flex gap-2 mt-3 sm:mt-4">
                        <button
                            onClick={() => handleSaveEdit(editing)}
                            className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-teal-500 text-white text-xs sm:text-sm rounded-lg hover:bg-teal-700 transition-colors font-medium"
                        >
                            Save Changes
                        </button>
                        <button
                            onClick={handleCancelEdit}
                            className="flex-1 sm:flex-none px-3 sm:px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-xs sm:text-sm rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">Loading your leaves...</div>
            ) : myLeaves.length === 0 ? (
                <div className="text-center py-8 text-gray-400 dark:text-gray-500">
                    <p className="text-sm font-medium">No leave requests found</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">You haven't applied for any leave yet.</p>
                </div>
            ) : (
                <DataTable
                    columns={columns}
                    data={myLeaves}
                    mobileRender={mobileRender}
                    options={{
                        searchFields: ["type", "status"],
                        filterConfig: [
                            { key: "type", label: "Leave Type" },
                            { key: "status", label: "Status" },
                        ],
                        itemsPerPage: 10,
                    }}
                    label="leave requests"
                />
            )}

            {cancelTarget !== null && (
                <div
                    onClick={() => {
                        if (!isCancelling) {
                            setCancelTarget(null);
                            setCancelReason("");
                        }
                    }}
                    className="fixed inset-0 z-[9999] flex items-center justify-center p-4
                               bg-gray-900/60 dark:bg-black/70 backdrop-blur-sm"
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-md rounded-2xl p-6
                                   bg-white dark:bg-gray-800
                                   border border-gray-200 dark:border-gray-700
                                   shadow-2xl shadow-gray-900/20 dark:shadow-black/60
                                   animate-[fadeIn_0.25s_ease-out]"
                    >
                        <div className="flex items-start gap-4 mb-4">
                            <div className="flex-shrink-0 flex h-11 w-11 items-center justify-center rounded-full
                                            bg-red-100 dark:bg-red-500/15
                                            ring-8 ring-red-50 dark:ring-red-500/5">
                                <svg
                                    className="h-6 w-6 text-red-600 dark:text-red-400"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                    viewBox="0 0 24 24"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                </svg>
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                                    Cancel Leave Request?
                                </h3>
                                <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                                    This action cannot be undone. Please provide a reason for cancelling (optional).
                                </p>
                            </div>
                        </div>

                        <textarea
                            rows={3}
                            value={cancelReason}
                            onChange={(e) => setCancelReason(e.target.value)}
                            placeholder="Reason for cancellation..."
                            disabled={isCancelling}
                            className={`${inputClass} mb-5 resize-none disabled:opacity-60`}
                        />

                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => {
                                    setCancelTarget(null);
                                    setCancelReason("");
                                }}
                                disabled={isCancelling}
                                className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold
                                           text-gray-700 dark:text-gray-200
                                           bg-white dark:bg-gray-700
                                           border border-gray-300 dark:border-gray-600
                                           hover:bg-gray-50 dark:hover:bg-gray-600
                                           transition-colors duration-150
                                           disabled:opacity-60 disabled:cursor-not-allowed
                                           focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2
                                           dark:focus:ring-offset-gray-800"
                            >
                                Keep Request
                            </button>
                            <button
                                onClick={() => handleCancelLeave(cancelTarget)}
                                disabled={isCancelling}
                                className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold
                                           text-white
                                           bg-red-600 hover:bg-red-700
                                           dark:bg-red-600 dark:hover:bg-red-500
                                           transition-colors duration-150
                                           disabled:opacity-60 disabled:cursor-not-allowed
                                           focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2
                                           dark:focus:ring-offset-gray-800"
                            >
                                {isCancelling ? "Cancelling..." : "Cancel Leave"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

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

export default Myleaves;