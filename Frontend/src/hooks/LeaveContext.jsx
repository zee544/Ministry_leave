import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { apiUrl } from "../api.js";

const LeaveContext = createContext();

const sortBySubmissionFifo = (items) => {
  const timestamp = (leave) => {
    const submittedAt =
      leave.submittedAt || leave.createdAt || leave.appliedOn || 0;
    const parsed = new Date(String(submittedAt).replace(" ", "T")).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  };
  return [...items].sort((a, b) =>
    timestamp(a) - timestamp(b) || Number(a.id || 0) - Number(b.id || 0)
  );
};

const normalizeLeave = (leave) => ({
  ...leave,
  applicantUserId: leave.applicantUserId ?? leave.applicant_user_id,
  applicantRole: leave.applicantRole ?? leave.applicant_role,
  actingOfficerUserId: leave.actingOfficerUserId ?? leave.acting_officer_user_id,
  actingOfficerRole: leave.actingOfficerRole ?? leave.acting_officer_role,
  actingOfficerConfirmed:
    leave.acting_officer_confirmed ?? leave.actingOfficerConfirmed ?? false,
  adminApprovalRequired:
    leave.adminApprovalRequired ?? leave.admin_approval_required ?? false,
  approvedBy: leave.approvedBy ?? leave.approved_by ?? null,
  approverRole: leave.approverRole ?? leave.approver_role ?? null,
  adminSignature: leave.adminSignature ?? leave.admin_signature ?? null,
  recommendedByAdmin:
    leave.recommendedByAdmin ?? leave.recommended_by_admin ?? false,
});

const INITIAL_LEAVES = [];

export function LeaveProvider({ children }) {
  const [leaves, setLeaves] = useState(INITIAL_LEAVES);
  const [actingOfficerLeaves, setActingOfficerLeaves] = useState(INITIAL_LEAVES);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const actingRequestRef = useRef(null);
  const actingFetchedAtRef = useRef(0);
  const actingFetchedUserRef = useRef("");

  const fetchLeaves = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLeaves([]);
      setActingOfficerLeaves([]);
      actingFetchedAtRef.current = 0;
      actingFetchedUserRef.current = "";
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const userStr = localStorage.getItem("user");
      if (!userStr) {
        setLeaves([]);
        setIsLoading(false);
        return;
      }

      const user = JSON.parse(userStr);

      let endpoint;
      if (user.role === "admin") {
        endpoint = "/api/admin/leaves";
      } else if (user.role === "hod") {
        endpoint = "/api/admin/hod/leaves";
      } else if (user.role === "secretary") {
        endpoint = "/api/admin/leaves/all";
      } else if (user.role === "executive_officer") {
        endpoint = "/api/admin/leaves/division";
      } else {
        endpoint = "/api/admin/leaves/employee";
      }

      const res = await fetch(apiUrl(endpoint), {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (res.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setLeaves([]);
        setActingOfficerLeaves([]);
        actingFetchedAtRef.current = 0;
        actingFetchedUserRef.current = "";
        setIsLoading(false);
        return;
      }
      if (res.status === 403) {
        setLeaves([]);
        setActingOfficerLeaves([]);
        actingFetchedAtRef.current = 0;
        actingFetchedUserRef.current = "";
        setIsLoading(false);
        return;
      }

      if (res.ok) {
        const data = await res.json();

        const needsPersonalLeaves = ["admin", "hod", "executive_officer"].includes(user.role);
        let personalLeaves = [];

        if (needsPersonalLeaves) {
          const personalResponse = await fetch(
            apiUrl("/api/admin/leaves/employee"),
            {
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
            }
          );
          if (personalResponse.ok) {
            personalLeaves = await personalResponse.json();
          }
        }

        const allLeaves = [
          ...(Array.isArray(data) ? data : []),
          ...(Array.isArray(personalLeaves)
            ? personalLeaves.filter(
                (p) =>
                  !Array.isArray(data) ||
                  !data.some((leave) => leave.id === p.id)
              )
            : []),
        ];

        if (allLeaves.length > 0) {
          const mapped = allLeaves.map(normalizeLeave);
          setLeaves(sortBySubmissionFifo(mapped));
        } else {
          setLeaves([]);
        }
      } else {
        setLeaves([]);
      }
    } catch (err) {
      console.warn("Error fetching leaves:", err.message);
      setError(err.message);
      setLeaves([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchActingOfficerLeaves = useCallback(async ({ force = false } = {}) => {
    const token = localStorage.getItem("token");
    const user = JSON.parse(localStorage.getItem("user") || "null");
    if (!token || !user?.id) {
      setActingOfficerLeaves([]);
      actingFetchedAtRef.current = 0;
      actingFetchedUserRef.current = "";
      return;
    }
    const userKey = `${user.role}:${user.id}`;

    if (actingFetchedUserRef.current && actingFetchedUserRef.current !== userKey) {
      setActingOfficerLeaves([]);
      actingFetchedAtRef.current = 0;
      actingFetchedUserRef.current = "";
    }

    if (actingRequestRef.current?.userKey === userKey) {
      return force
        ? actingRequestRef.current.promise.then(() => fetchActingOfficerLeaves({ force: true }))
        : actingRequestRef.current.promise;
    }
    if (
      !force &&
      actingFetchedUserRef.current === userKey &&
      Date.now() - actingFetchedAtRef.current < 10000
    ) {
      return;
    }

    let finishRequest;
    const requestPromise = new Promise((resolve) => {
      finishRequest = resolve;
    });
    actingRequestRef.current = { userKey, promise: requestPromise };
    try {
      const res = await fetch(apiUrl("/api/admin/leaves/acting-officer"), {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (!res.ok) {
        const message = await res.text();
        throw new Error(message || `Failed to load Acting Approvals (${res.status}).`);
      }
      const data = await res.json();
      if (!Array.isArray(data)) {
        throw new Error("The Acting Approvals response was not a leave list.");
      }
      setActingOfficerLeaves(sortBySubmissionFifo(data.map(normalizeLeave)));
      actingFetchedAtRef.current = Date.now();
      actingFetchedUserRef.current = userKey;
    } catch (err) {
      console.warn("[Acting Leaves] Error:", err.message);
      throw err;
    } finally {
      finishRequest();
      if (actingRequestRef.current?.promise === requestPromise) {
        actingRequestRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) fetchLeaves();
    else {
      setLeaves([]);
      setActingOfficerLeaves([]);
    }
  }, [fetchLeaves]);

  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === "token" || e.key === "user") {
        const token = localStorage.getItem("token");
        if (token) fetchLeaves();
        else {
          setLeaves([]);
          setActingOfficerLeaves([]);
          actingFetchedAtRef.current = 0;
          actingFetchedUserRef.current = "";
        }
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [fetchLeaves]);

  useEffect(() => {
    const handleLogin = () => {
      const token = localStorage.getItem("token");
      if (token) {
        setActingOfficerLeaves([]);
        actingFetchedAtRef.current = 0;
        actingFetchedUserRef.current = "";
        fetchLeaves();
      }
    };
    const handleLogout = () => {
      setLeaves([]);
      setActingOfficerLeaves([]);
      actingFetchedAtRef.current = 0;
      actingFetchedUserRef.current = "";
    };
    window.addEventListener("auth:login", handleLogin);
    window.addEventListener("auth:logout", handleLogout);
    return () => {
      window.removeEventListener("auth:login", handleLogin);
      window.removeEventListener("auth:logout", handleLogout);
    };
  }, [fetchLeaves]);

  useEffect(() => {
    const handleLeaveRefresh = () => {
      if (localStorage.getItem("token")) fetchLeaves();
    };
    window.addEventListener("leaves:refresh", handleLeaveRefresh);
    return () => window.removeEventListener("leaves:refresh", handleLeaveRefresh);
  }, [fetchLeaves]);

  const addLeave = useCallback(async (leaveData) => {
    const token = localStorage.getItem("token");
    let savedLeave = null;

    if (!token) {
      throw new Error("Please sign in before submitting a leave application.");
    }

    try {
      const response = await fetch(apiUrl("/api/admin/leaves"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          employee: leaveData.employee,
          division: leaveData.division,
          type: leaveData.type,
          fromDate: leaveData.from,
          toDate: leaveData.to,
          noOfDays: leaveData.noOfDays,
          actingOfficer: leaveData.actingOfficer,
          actingOfficerUserId: leaveData.actingOfficerUserId,
          actingOfficerRole: leaveData.actingOfficerRole,
          reason: leaveData.reason || "",
          address: leaveData.address || "",
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const submittedAt = new Date().toISOString();
        savedLeave = {
          id: data.leaveId,
          ...leaveData,
          applicantUserId: leaveData.applicantUserId,
          applicantRole: leaveData.applicantRole,
          status: data.status,
          appliedOn: submittedAt.split("T")[0],
          submittedAt,
          createdAt: submittedAt,
        };
      } else {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          data.message || `Leave submission failed (${response.status}).`
        );
      }
    } catch (err) {
      console.error("Error saving leave to backend:", err.message);
      throw err;
    }

    if (!savedLeave) {
      const submittedAt = new Date().toISOString();
      savedLeave = {
        id: Date.now(),
        ...leaveData,
        appliedOn: submittedAt.split("T")[0],
        submittedAt,
        createdAt: submittedAt,
      };
    }

    setLeaves((prev) => sortBySubmissionFifo([savedLeave, ...prev]));
    return savedLeave;
  }, []);

  const confirmActingOfficer = useCallback(
    async (id, action, reason) => {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found");

      const response = await fetch(
        apiUrl(`/api/admin/leaves/${id}/acting-confirm`),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action, reason: reason || null }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to ${action} leave: ${errorText}`);
      }

      const data = await response.json();
      const declinedBy = action === "decline" ? "Acting Officer" : null;
      const declineReason = action === "decline" ? (reason?.trim() || null) : null;
      setLeaves((prev) =>
        sortBySubmissionFifo(
          prev.map((leave) =>
            String(leave.id) === String(id)
              ? {
                  ...leave,
                  status: data.status || (action === "confirm" ? "Pending" : "Declined"),
                  actingOfficerConfirmed: action === "confirm",
                  acting_officer_confirmed: action === "confirm",
                  declinedBy,
                  declined_by: declinedBy,
                  declineReason,
                  decline_reason: declineReason,
                }
              : leave
          )
        )
      );
      setActingOfficerLeaves((prev) =>
        sortBySubmissionFifo(
          prev.map((leave) =>
            String(leave.id) === String(id)
              ? {
                  ...leave,
                  status: data.status || (action === "confirm" ? "Pending" : "Declined"),
                  actingOfficerConfirmed: action === "confirm",
                  acting_officer_confirmed: action === "confirm",
                  declinedBy,
                  declined_by: declinedBy,
                  declineReason,
                  decline_reason: declineReason,
                }
              : leave
          )
        )
      );
      return data;
    },
    []
  );

  const updateLeaveStatus = useCallback(
    async (id, newStatus, extraProps = {}) => {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found");

      const payload = {
        status: newStatus,
        recommendedByAdmin: extraProps.recommendedByAdmin || false,
        declinedBy: extraProps.declinedBy || null,
        reason: extraProps.reason || null,
        approvedBy: extraProps.approvedBy || null,
        approverRole: extraProps.approverRole || null,
      };

      const res = await fetch(apiUrl(`/api/admin/leaves/${id}/status`), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data.message || `Failed to update leave status (${res.status}).`
        );
      }

      setLeaves((prev) =>
        sortBySubmissionFifo(
          prev.map((leave) =>
            String(leave.id) === String(id)
              ? {
                  ...leave,
                  status: data.status || newStatus,
                  recommendedByAdmin: payload.recommendedByAdmin,
                  declinedBy: payload.declinedBy,
                  declineReason: payload.reason,
                  approvedBy: data.approvedBy || payload.approvedBy,
                  approverRole: data.approverRole || payload.approverRole,
                }
              : leave
          )
        )
      );
      void fetchLeaves().catch((error) =>
        console.warn("Failed to refresh leaves after Admin action:", error)
      );
      return data;
    },
    [fetchLeaves]
  );

  const hodApprove = useCallback(
    async (id, action, extra = {}) => {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found");

      const res = await fetch(
        apiUrl(`/api/admin/leaves/${id}/hod-approve`),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action,
            reason: extra.reason || null,
          }),
        }
      );

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `Failed with status ${res.status}`);
      }

      const data = await res.json();
      setLeaves((prev) =>
        sortBySubmissionFifo(
          prev.map((leave) =>
            String(leave.id) === String(id)
              ? {
                  ...leave,
                  status:
                    data.status ||
                    (action === "approve" ? "Approved" : "Declined"),
                  approvedBy:
                    data.approvedBy || (action === "approve" ? "HOD" : null),
                  approverRole:
                    data.approverRole || (action === "approve" ? "hod" : null),
                  ...(action === "decline"
                    ? {
                        declinedBy: "HOD",
                        declineReason: extra.reason || null,
                      }
                    : { declinedBy: null, declineReason: null }),
                }
              : leave
          )
        )
      );
      void fetchLeaves().catch((error) =>
        console.warn("Failed to refresh leaves after HOD action:", error)
      );
      return data;
    },
    [fetchLeaves]
  );

  const secretaryApprove = useCallback(
    async (id, action, reason = null) => {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("No authentication token found");

      const res = await fetch(
        apiUrl(`/api/admin/leaves/${id}/secretary-approve`),
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action, reason }),
        }
      );

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data.message || `Failed to ${action} leave (${res.status}).`
        );
      }

      setLeaves((prev) =>
        sortBySubmissionFifo(
          prev.map((leave) =>
            String(leave.id) === String(id)
              ? {
                  ...leave,
                  status:
                    data.status ||
                    (action === "approve" ? "Approved" : "Declined"),
                  secretaryName: data.secretaryName || null,
                  secretarySignature: data.secretarySignature || null,
                  secretaryDecidedAt:
                    data.secretaryDecidedAt || new Date().toISOString(),
                  secretaryDecidedById: data.secretaryDecidedById || null,
                  ...(action === "decline"
                    ? {
                        declinedBy: "Secretary",
                        declineReason: reason?.trim() || null,
                      }
                    : { declinedBy: null, declineReason: null }),
                }
              : leave
          )
        )
      );

      return data;
    },
    []
  );

  const updateLeave = useCallback(
    async (id, updates) => {
      setLeaves((prev) =>
        sortBySubmissionFifo(
          prev.map((l) => (l.id === id ? { ...l, ...updates } : l))
        )
      );

      const token = localStorage.getItem("token");
      if (!token) return { success: false };

      try {
        const res = await fetch(apiUrl(`/api/admin/leaves/${id}`), {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            type: updates.type,
            from: updates.from,
            to: updates.to,
            noOfDays: updates.noOfDays || updates.days,
            reason: updates.reason,
            address: updates.address,
            actingOfficer: updates.actingOfficer,
            actingOfficerUserId: updates.actingOfficerUserId,
            actingOfficerRole: updates.actingOfficerRole,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          await fetchLeaves();
          return { success: false, message: data.message };
        }
        await fetchLeaves();
        return { success: true, leave: data.leave };
      } catch (err) {
        await fetchLeaves();
        return { success: false, message: err.message };
      }
    },
    [fetchLeaves]
  );

  const cancelLeave = useCallback(async (id, reason = "") => {
    const token = localStorage.getItem("token");
    if (!token) return { success: false, message: "No auth token" };

    try {
      const res = await fetch(apiUrl(`/api/admin/leaves/${id}/cancel`), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason }),
      });

      const data = await res.json();
      if (!res.ok)
        return { success: false, message: data.message || "Failed to cancel leave" };

      setLeaves((prev) =>
        sortBySubmissionFifo(
          prev.map((l) =>
            l.id === id
              ? {
                  ...l,
                  status: "Cancelled",
                  declinedBy: "Employee",
                  declineReason: reason,
                }
              : l
          )
        )
      );
      return { success: true };
    } catch (err) {
      console.error("Cancel leave error:", err);
      return { success: false, message: err.message };
    }
  }, []);

  const getLeavesByStatus = useCallback(
    (status) => leaves.filter((l) => l.status === status),
    [leaves]
  );

  const getLeavesByEmployee = useCallback(
    (userId, role) =>
      leaves.filter(
        (leave) =>
          Number(leave.applicantUserId ?? leave.applicant_user_id) ===
            Number(userId) &&
          (role ? (leave.applicantRole ?? leave.applicant_role) === role : true)
      ),
    [leaves]
  );

  const getLeavesByActingOfficer = useCallback(
    (officerName, officerDivision = null, officerRole = null, officerId = null) => {
      if (!officerName) return [];
      const normalize = (s) => (s || "").toString().trim().toLowerCase();
      const target = normalize(officerName);
      const mergedById = new Map(
        actingOfficerLeaves.map((leave) => [String(leave.id), leave])
      );
      leaves.forEach((leave) => mergedById.set(String(leave.id), leave));
      return sortBySubmissionFifo([...mergedById.values()].filter((l) => {
        const assignedId = l.actingOfficerUserId ?? l.acting_officer_user_id;
        const assignedRole = l.actingOfficerRole ?? l.acting_officer_role;
        if (assignedId != null && assignedRole) {
          return officerId != null &&
            Number(assignedId) === Number(officerId) &&
            assignedRole === officerRole;
        }
        const assigned = normalize(l.actingOfficer || l.acting_officer);
        const sameDivision = officerRole === "secretary" || !officerDivision || normalize(l.division) === normalize(officerDivision);
        return assigned === target && sameDivision;
      }));
    },
    [leaves, actingOfficerLeaves]
  );

  const getLeaveById = useCallback(
    (id) => leaves.find((l) => l.id === id),
    [leaves]
  );

  const value = {
    leaves,
    isLoading,
    error,
    addLeave,
    confirmActingOfficer,
    updateLeaveStatus,
    hodApprove,
    secretaryApprove, // ✅ NEW
    updateLeave,
    cancelLeave,
    getLeavesByStatus,
    getLeavesByEmployee,
    getLeavesByActingOfficer,
    getLeaveById,
    fetchLeaves,
    fetchActingOfficerLeaves,
  };

  return (
    <LeaveContext.Provider value={value}>{children}</LeaveContext.Provider>
  );
}

export function useLeaves() {
  const context = useContext(LeaveContext);
  if (!context) {
    throw new Error("useLeaves must be used within a LeaveProvider");
  }
  return context;
}

export default LeaveContext;
