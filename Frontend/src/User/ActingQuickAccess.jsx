import { useEffect } from "react";
import { useLeaves } from "../hooks/LeaveContext.jsx";
import { useUser } from "../hooks/UserContext.jsx";

function ActingQuickAccess({ onReview }) {
  const { getLeavesByActingOfficer, fetchActingOfficerLeaves } = useLeaves();
  const { currentUser } = useUser();

  useEffect(() => {
    if (currentUser?.id != null) {
      fetchActingOfficerLeaves();
    }
  }, [currentUser?.id, fetchActingOfficerLeaves]);

  if (!currentUser) return null;

  const pendingAssignments = getLeavesByActingOfficer(
    currentUser.name,
    currentUser.division,
    currentUser.role,
    currentUser.id
  ).filter((leave) => leave.status === "Pending Acting Officer");

  return (
    <section className="mb-6 rounded-xl border border-amber-200 bg-white shadow-sm dark:border-amber-800 dark:bg-gray-800">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-100 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-900/20 lg:p-6">
        <div>
          <h2 className="text-base font-semibold text-amber-900 dark:text-amber-200">
            Pending Acting Approvals
            <span className="ml-2 rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
              {pendingAssignments.length}
            </span>
          </h2>
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
            Requests assigned to you that are waiting for your decision.
          </p>
        </div>
        <button
          type="button"
          onClick={onReview}
          className="rounded-lg bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700"
        >
          Review Acting Approvals
        </button>
      </header>

      {pendingAssignments.length === 0 ? (
        <p className="p-4 text-sm text-gray-500 dark:text-gray-400">
          You have no pending acting officer requests.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {pendingAssignments.map((leave) => (
            <li
              key={leave.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3"
            >
              <span className="font-medium text-gray-800 dark:text-gray-100">
                {leave.employee} · {leave.type}
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {leave.from} – {leave.to} · {leave.noOfDays || leave.days || "—"} day(s)
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default ActingQuickAccess;
