import { useState, useRef, useEffect } from "react";
import { useNotifications } from "../hooks/NotificationContext.jsx";
import { useUser } from "../hooks/UserContext.jsx";
import ThemeToggle from "./ThemeToggle";
import { User, Megaphone, Bell } from "lucide-react";

function UserHeader({ activeTab, onMenuToggle }) {
    const { currentUser } = useUser();
    const { getNotificationsForRole, unreadCountForRole, markAsRead, markAllAsRead } = useNotifications();
    const [showNotifications, setShowNotifications] = useState(false);
    const notifRef = useRef(null);

    const userNotifications = getNotificationsForRole("employee", currentUser.name);
    const unreadCount = unreadCountForRole("employee", currentUser.name);

    useEffect(() => {
        function handleClickOutside(event) {
            if (notifRef.current && !notifRef.current.contains(event.target)) {
                setShowNotifications(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const formatTimestamp = (ts) => {
        const now = new Date();
        const date = new Date(ts);
        const diffMs = now - date;
        const diffHrs = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffHrs / 24);

        if (diffHrs < 1) return "Just now";
        if (diffHrs < 24) return `${diffHrs}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    };

    return (
        <header className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 lg:px-8 py-3 lg:py-4 rounded-none lg:rounded-2xl transition-colors">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-3 min-w-0">
                    <button
                        onClick={onMenuToggle}
                        className="lg:hidden p-2 text-gray-600 dark:text-gray-300 hover:text-teal-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        aria-label="Open menu"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </button>
                    <div className="min-w-0">
                        <h1 className="text-lg lg:text-2xl font-bold text-gray-800 dark:text-white truncate">
                            {activeTab === "dashboard" && "Dashboard"}
                            {activeTab === "profile" && "My Profile"}
                            {activeTab === "applyleave" && "Apply Leave"}
                            {activeTab === "myleaves" && "My Leaves"}
                            {activeTab === "actingapprovals" && "Acting Approvals"}
                            {activeTab === "reports" && "Reports"}
                            {activeTab === "settings" && "Settings"}
                        </h1>
                        <p className="text-xs lg:text-sm text-gray-500 dark:text-gray-400 truncate hidden sm:block">
                            {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 lg:gap-4 shrink-0 relative" ref={notifRef}>
                    <ThemeToggle />
                    <button
                        onClick={() => setShowNotifications(!showNotifications)}
                        className="relative p-1.5 lg:p-2 text-gray-500 dark:text-gray-300 hover:text-teal-600 dark:hover:text-teal-400 transition-colors"
                        aria-label="Notifications"
                    >
                        <Bell className="w-5 h-5 lg:w-6 lg:h-6" />
                        {unreadCount > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 lg:-top-1 lg:-right-1 min-w-4.5 h-4.5 lg:min-w-5 lg:h-5 bg-red-500 text-white text-[10px] lg:text-xs font-bold rounded-full flex items-center justify-center px-1">
                                {unreadCount > 9 ? "9+" : unreadCount}
                            </span>
                        )}
                    </button>

                    {showNotifications && (
                        <div className="absolute top-full right-0 mt-2 w-80 lg:w-96 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50 max-h-[70vh] flex flex-col">
                            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
                                <h3 className="text-sm font-bold text-gray-800 dark:text-white">Notifications</h3>
                                <div className="flex items-center gap-2">
                                    {unreadCount > 0 && (
                                        <button
                                            onClick={markAllAsRead}
                                            className="text-xs text-teal-600 hover:text-teal-800 font-medium"
                                        >
                                            Mark all read
                                        </button>
                                    )}
                                    <button
                                        onClick={() => setShowNotifications(false)}
                                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none"
                                        aria-label="Close notifications"
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>

                            <div className="overflow-y-auto flex-1 no-scrollbar">
                                {userNotifications.length === 0 ? (
                                    <div className="p-8 text-center">
                                        <Bell className="w-8 h-8 mx-auto mb-2 text-gray-400 dark:text-gray-500" />
                                        <p className="text-sm text-gray-500 dark:text-gray-400">No notifications yet</p>
                                    </div>
                                ) : (
                                    userNotifications.map((notif) => (
                                        <div
                                            key={notif.id}
                                            onClick={() => markAsRead(notif.id)}
                                            className={`px-4 py-3 border-b border-gray-50 dark:border-gray-700 cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 ${notif.read ? "bg-white dark:bg-gray-800" : "bg-teal-50/90 dark:bg-teal-900/20"}`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <span className="shrink-0 mt-0.5">
                                                    {notif.type === "acting_officer" ? (
                                                        <User className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                                                    ) : (
                                                        <Megaphone className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                                    )}
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <p className={`text-xs leading-relaxed ${notif.read ? "text-gray-600 dark:text-gray-200" : "text-gray-800 dark:text-white font-medium"}`}>
                                                        {notif.message}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-1.5">
                                                        {!notif.read && (
                                                            <span className="w-1.5 h-1.5 bg-teal-500 rounded-full shrink-0"></span>
                                                        )}
                                                        <span className="text-[10px] text-gray-400">
                                                            {formatTimestamp(notif.timestamp)}
                                                        </span>
                                                        {notif.type === "acting_officer" && (
                                                            <span className="text-[10px] bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300 px-1.5 py-0.5 rounded-full font-medium">
                                                                Acting Officer
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    <div className="flex items-center gap-2 lg:gap-3">
                        <div className="w-8 h-8 lg:w-10 lg:h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-xs lg:text-sm">
                            {currentUser.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                        </div>
                        <div className="hidden sm:block">
                            <p className="text-xs lg:text-sm font-medium text-gray-700 dark:text-gray-200">{currentUser.name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 hidden lg:block">{currentUser.email}</p>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
}

export default UserHeader;