// src/hooks/NotificationContext.jsx

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";

const NotificationContext = createContext();

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const broadcastRef = useRef(null);
  const eventSourceRef = useRef(null);

  // BroadcastChannel for cross-tab updates
  useEffect(() => {
    if (typeof BroadcastChannel !== "undefined") {
      broadcastRef.current = new BroadcastChannel("ministry_notifications");
      broadcastRef.current.onmessage = (event) => {
        if (event.data?.type === "REFRESH_NOTIFICATIONS") {
          fetchNotifications();
        }
      };
    }
    return () => {
      if (broadcastRef.current) broadcastRef.current.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch notifications
  const fetchNotifications = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setNotifications([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/notifications", {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (res.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setNotifications([]);
        return;
      }

      if (!res.ok) {
        setNotifications([]);
        return;
      }

      const data = await res.json();
      if (Array.isArray(data)) {
        setNotifications(data);
      } else {
        setNotifications([]);
      }
    } catch (err) {
      console.warn("[Notifications] Error:", err.message);
      setError(err.message);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // SSE connection
  const openSSEConnection = useCallback((token) => {
    if (!token) return;

    if (eventSourceRef.current) {
      try { eventSourceRef.current.close(); } catch (e) {}
      eventSourceRef.current = null;
    }

    const url = `/api/notifications/stream?token=${encodeURIComponent(token)}`;
    console.log("[SSE] Connecting to", url);

    let es;
    try {
      es = new EventSource(url);
    } catch (err) {
      console.warn("[SSE] Failed to create EventSource:", err);
      return;
    }

    eventSourceRef.current = es;

    es.addEventListener("connected", () => {
      console.log("[SSE]  Connected");
    });

    es.addEventListener("notification", (event) => {
      try {
        const notif = JSON.parse(event.data);
        console.log("[SSE] Received notification:", notif.id);
        setNotifications((prev) => {
          if (prev.some((n) => n.id === notif.id)) return prev;
          return [notif, ...prev];
        });
      } catch (err) {
        console.warn("[SSE] Failed to parse notification:", err);
      }
    });

    es.onerror = (err) => {
      console.warn("[SSE] Connection error (browser will auto-reconnect):", err);
    };
  }, []);

  const closeSSEConnection = useCallback(() => {
    if (eventSourceRef.current) {
      console.log("[SSE] Closing connection");
      try { eventSourceRef.current.close(); } catch (e) {}
      eventSourceRef.current = null;
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      console.log("[Notifications] Mounted with token — initial fetch + SSE");
      fetchNotifications();
      openSSEConnection(token);
    }
    return () => closeSSEConnection();
  }, [openSSEConnection, closeSSEConnection, fetchNotifications]);

  // Cross-tab sync
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === "token" || e.key === "user") {
        const token = localStorage.getItem("token");
        if (token) {
          console.log("[Notifications] Cross-tab token change — reconnecting");
          fetchNotifications();
          openSSEConnection(token);
        } else {
          setNotifications([]);
          closeSSEConnection();
        }
      }
    };
    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [fetchNotifications, openSSEConnection, closeSSEConnection]);

  // ✅ Same-tab login/logout events (NEW)
  useEffect(() => {
    const handleLogin = () => {
      console.log("[Notifications] auth:login — fetching + SSE reconnect");
      const token = localStorage.getItem("token");
      if (token) {
        fetchNotifications();
        openSSEConnection(token);
      }
    };

    const handleLogout = () => {
      console.log("[Notifications] auth:logout — clearing + closing SSE");
      setNotifications([]);
      closeSSEConnection();
    };

    window.addEventListener("auth:login", handleLogin);
    window.addEventListener("auth:logout", handleLogout);
    return () => {
      window.removeEventListener("auth:login", handleLogin);
      window.removeEventListener("auth:logout", handleLogout);
    };
  }, [fetchNotifications, openSSEConnection, closeSSEConnection]);

  // Refresh on focus
  useEffect(() => {
    const handleFocus = () => {
      const token = localStorage.getItem("token");
      if (token) fetchNotifications();
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchNotifications]);

  // Fallback polling every 60s
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    const interval = setInterval(() => fetchNotifications(), 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Custom refresh event
  useEffect(() => {
    const handleRefresh = () => {
      const token = localStorage.getItem("token");
      if (token) fetchNotifications();
    };
    window.addEventListener("notifications:refresh", handleRefresh);
    return () => window.removeEventListener("notifications:refresh", handleRefresh);
  }, [fetchNotifications]);

  const addNotification = useCallback(
    async (message, type = "acting_officer", recipient = "admin", division = null, link = null) => {
      const token = localStorage.getItem("token");
      if (!token) return;

      try {
        const res = await fetch("/api/notifications", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message, type, recipient, division, link }),
        });

        if (res.ok) {
          const newNotif = await res.json();
          setNotifications((prev) => {
            if (prev.some((n) => n.id === newNotif.id)) return prev;
            return [newNotif, ...prev];
          });
          window.dispatchEvent(new Event("notifications:refresh"));
          if (broadcastRef.current) {
            broadcastRef.current.postMessage({ type: "REFRESH_NOTIFICATIONS" });
          }
        }
      } catch (err) {
        console.warn("[Notifications] Error adding:", err.message);
      }
    },
    []
  );

  const markAsRead = useCallback(
    async (id) => {
      const token = localStorage.getItem("token");
      if (!token) return;

      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );

      try {
        await fetch(`/api/notifications/${id}/read`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });
      } catch (err) {
        console.warn("[Notifications] Error marking read:", err.message);
        fetchNotifications();
      }
    },
    [fetchNotifications]
  );

  const markAllAsRead = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await fetch("/api/notifications/read-all", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
    } catch (err) {
      fetchNotifications();
    }
  }, [fetchNotifications]);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const getNotificationsForRole = useCallback(
    (role, userName, division = null) => {
      const normalize = (s) => (s || "").toString().trim().toLowerCase();

      return notifications.filter((n) => {
        let divisionMatch = true;

        if (role === "admin" || role === "hod") {
          if (!division) {
            divisionMatch = !n.division;
          } else {
            const nDiv = normalize(n.division);
            const uDiv = normalize(division);
            divisionMatch =
              !nDiv ||
              nDiv === uDiv ||
              nDiv.replace("istration", "") === uDiv.replace("istration", "");
          }
        }

        if (role === "admin") return n.recipient === "admin" && divisionMatch;
        if (role === "hod") return n.recipient === "hod" && divisionMatch;

        if (role === "employee") {
          return (
            n.recipient === userName ||
            (n.type === "acting_officer" && n.recipient === userName) ||
            (n.type === "status_update" && n.recipient === userName)
          );
        }
        return false;
      });
    },
    [notifications]
  );

  const unreadCountForRole = useCallback(
    (role, userName, division = null) => {
      return getNotificationsForRole(role, userName, division).filter(
        (n) => !n.read
      ).length;
    },
    [getNotificationsForRole]
  );

  const markAndNavigate = useCallback(
    async (notification, navigate) => {
      await markAsRead(notification.id);
      if (notification.link && navigate) {
        navigate(notification.link);
      }
    },
    [markAsRead]
  );

  const value = {
    notifications,
    loading,
    error,
    fetchNotifications,
    addNotification,
    markAsRead,
    markAllAsRead,
    clearNotifications,
    getNotificationsForRole,
    unreadCountForRole,
    markAndNavigate,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
}

export default NotificationContext;