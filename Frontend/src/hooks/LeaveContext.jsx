import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { apiUrl } from "../api.js";

const LeaveContext = createContext();

const sortByAppliedDateDesc = (items) => {
  return [...items].sort((a, b) => {
    const dateA = new Date(a.appliedOn || a.from || 0).getTime();
    const dateB = new Date(b.appliedOn || b.from || 0).getTime();
    return dateB - dateA;
  });
};

const normalizeLeave = (leave) => ({
  ...leave,
  applicantUserId: leave.applicantUserId ?? leave.applicant_user_id,
  applicantRole: leave.applicantRole ?? leave.applicant_role,
  actingOfficerConfirmed:
    leave.acting_officer_confirmed ?? leave.actingOfficerConfirmed ?? false,
  approvedBy: leave.approvedBy ?? leave.approved_by ?? null,
  approverRole: leave.approverRole ?? leave.approver_role ?? null,
});

const INITIAL_LEAVES = [];

export function LeaveProvider({ children }) {
  const [leaves, setLeaves] = useState(INITIAL_LEAVES);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchLeaves = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setLeaves([]);
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
        setIsLoading(false);
        return;
      }
      if (res.status === 403) {
        setLeaves([]);
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
          setLeaves(sortByAppliedDateDesc(mapped));
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

  const fetchActingOfficerLeaves = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const res = await fetch(apiUrl("/api/admin/leaves/acting-officer"), {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          const mapped = data.map(normalizeLeave);
          setLeaves((prev) => {
            const fetchedById = new Map(mapped.map((l) => [String(l.id), l]));
            const merged = prev.map((l) => fetchedById.get(String(l.id)) || l);
            const existingIds = new Set(prev.map((l) => String(l.id)));
            merged.push(...mapped.filter((l) => !existingIds.has(String(l.id))));
            return sortByAppliedDateDesc(merged);
          });
        }
      }
    } catch (err) {
      console.warn("[Acting Leaves] Error:", err.message);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) fetchLeaves();
    else setLeaves([]);
  }, [fetchLeaves]);

  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === "token" || e.key === "user") {
        const token = localStorage.getItem("token");
        if (token) fetchLeaves();
        else setLeaves([]);
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [fetchLeaves]);

  useEffect(() => {
    const handleLogin = () => {
      const token = localStorage.getItem("token");
      if (token) fetchLeaves();
    };
    const handleLogout = () => {
      setLeaves([]);
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
          reason: leaveData.reason || "",
          address: leaveData.address || "",
        }),
      });

      if (response.ok) {
        const data = await response.json();
        savedLeave = {
          id: data.leaveId,
          ...leaveData,
          applicantUserId: leaveData.applicantUserId,
          applicantRole: leaveData.applicantRole,
          status: data.status,
          appliedOn: new Date().toISOString().split("T")[0],
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
      savedLeave = {
        id: Date.now(),
        ...leaveData,
        appliedOn: new Date().toISOString().split("T")[0],
      };
    }

    setLeaves((prev) => sortByAppliedDateDesc([savedLeave, ...prev]));
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
      await fetchLeaves();
      await fetchActingOfficerLeaves();
      if (data.leave) {
        const updatedLeave = normalizeLeave(data.leave);
        setLeaves((prev) =>
          sortByAppliedDateDesc(
            prev.map((leave) =>
              String(leave.id) === String(updatedLeave.id)
                ? { ...leave, ...updatedLeave }
                : leave
            )
          )
        );
      }
      return data;
    },
    [fetchLeaves, fetchActingOfficerLeaves]
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
        sortByAppliedDateDesc(
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
      await fetchLeaves();
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
        sortByAppliedDateDesc(
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
      await fetchLeaves();
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
        sortByAppliedDateDesc(
          prev.map((leave) =>
            String(leave.id) === String(id)
              ? {
                  ...leave,
                  status:
                    data.status ||
                    (action === "approve" ? "Approved" : "Declined"),
                  approvedBy:
                    data.approvedBy ||
                    (action === "approve" ? "Secretary" : null),
                  approverRole:
                    data.approverRole ||
                    (action === "approve" ? "secretary" : null),
                  ...(action === "decline"
                    ? {
                        declinedBy: "Secretary",
                        declineReason: reason || null,
                      }
                    : { declinedBy: null, declineReason: null }),
                }
              : leave
          )
        )
      );

      await fetchLeaves();
      return data;
    },
    [fetchLeaves]
  );

  const updateLeave = useCallback(
    async (id, updates) => {
      setLeaves((prev) =>
        sortByAppliedDateDesc(
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
        sortByAppliedDateDesc(
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
    (officerName, officerDivision = null, officerRole = null) => {
      if (!officerName) return [];
      const normalize = (s) => (s || "").toString().trim().toLowerCase();
      const target = normalize(officerName);
      return leaves.filter((l) => {
        const assigned = normalize(l.actingOfficer || l.acting_officer);
        const sameDivision = officerRole === "secretary" || !officerDivision || normalize(l.division) === normalize(officerDivision);
        return assigned === target && sameDivision;
      });
    },
    [leaves]
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
