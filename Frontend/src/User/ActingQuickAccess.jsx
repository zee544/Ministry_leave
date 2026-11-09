import { useEffect } from "react";
import { useLeaves } from "../hooks/LeaveContext.jsx";
import { useUser } from "../hooks/UserContext.jsx";

function RequestList({ title, count, emptyMessage, requests, actions, color }) {
  return (
    <section className={`overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-gray-800 ${color.border}`}>
      <header className={`flex items-center justify-between gap-3 border-b p-4 ${color.header}`}>
        <h3 className={`text-sm font-semibold ${color.title}`}>{title}</h3>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold text-white ${color.count}`}>
          {count}
        </span>
      </header>
      {requests.length === 0 ? (
        <p className="p-4 text-sm text-gray-500 dark:text-gray-400">{emptyMessage}</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {requests.map((leave) => (
            <li key={leave.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="font-medium text-gray-800 dark:text-gray-100">
                  {leave.employee} <span className="font-normal text-gray-500">· {leave.type}</span>
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {leave.from} – {leave.to}
                </p>
                <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${color.status}`}>
                  {leave.status || "Pending"}
                </span>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {actions(leave)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ActingQuickAccess({
  onReview,
  pendingEmployeeLeaves = [],
  onViewLeave,
  onActingAction,
  onEmployeeAction,
  disabled = false,
}) {
  const { getLeavesByActingOfficer, fetchActingOfficerLeaves } = useLeaves();
  const { currentUser } = useUser();

  useEffect(() => {
    if (currentUser?.id != null) {
      fetchActingOfficerLeaves().catch((error) =>
        console.warn("Failed to load Acting Approvals Quick Access:", error.message)
      );
    }
  }, [currentUser?.id, fetchActingOfficerLeaves]);

  useEffect(() => {
    const refreshAssignments = () => {
      fetchActingOfficerLeaves({ force: true }).catch((error) =>
        console.warn("Failed to refresh Acting Approvals Quick Access:", error.message)
      );
    };
    window.addEventListener("leaves:acting-refresh", refreshAssignments);
    return () => window.removeEventListener("leaves:acting-refresh", refreshAssignments);
  }, [fetchActingOfficerLeaves]);

  if (!currentUser) return null;

  const pendingAssignments = getLeavesByActingOfficer(
    currentUser.name,
    currentUser.division,
    currentUser.role,
    currentUser.id
  ).filter((leave) => leave.status === "Pending Acting Officer");

  const buttonClass = "rounded-md px-2.5 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="mb-6 space-y-4">
      <RequestList
        title="Acting Officer Requests"
        count={pendingAssignments.length}
        emptyMessage="No pending Acting Officer requests."
        requests={pendingAssignments}
        color={{
          border: "border-amber-200 dark:border-amber-800",
          header: "border-amber-100 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-900/20",
          title: "text-amber-900 dark:text-amber-200",
          count: "bg-amber-500",
          status: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
        }}
        actions={(leave) => (
          <>
            <button type="button" onClick={() => onViewLeave(leave)} disabled={disabled} className={`${buttonClass} bg-purple-600 hover:bg-purple-700`}>View</button>
            <button type="button" onClick={() => onActingAction(leave, "confirm")} disabled={disabled} className={`${buttonClass} bg-green-600 hover:bg-green-700`}>Confirm</button>
            <button type="button" onClick={() => onActingAction(leave, "decline")} disabled={disabled} className={`${buttonClass} bg-red-600 hover:bg-red-700`}>Decline</button>
          </>
        )}
      />

      
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onReview}
          className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700"
        >
          Review All Acting Approvals
        </button>
      </div>
    </div>
  );
}

export default ActingQuickAccess;
