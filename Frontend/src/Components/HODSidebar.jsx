import { useNavigate } from "react-router-dom";
import { useUser } from "../hooks/UserContext.jsx";
import {
    LayoutDashboard,
    ClipboardList,
    BarChart3,
    Settings,
    LogOut,
    Anchor,
    X,
} from "lucide-react";

function HODSidebar({ activeTab, onTabChange, isOpen, onClose }) {
    const navigate = useNavigate();
    const { logout, currentUser } = useUser();

    const sidebarItems = [
        { key: "dashboard", label: "Dashboard",       icon: LayoutDashboard },
        { key: "leaves",    label: "Leave Approvals", icon: ClipboardList   },
        { key: "reports",   label: "Reports",         icon: BarChart3       },
        { key: "settings",  label: "Settings",        icon: Settings        },
    ];

    const handleLogout = () => {
        logout();
        navigate("/");
    };

    const handleTabClick = (key) => {
        onTabChange(key);
        if (onClose) onClose();
    };

    return (
        <>
            {isOpen && (
                <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onClose} />
            )}

            <aside
                className={`
                    fixed lg:static inset-y-0 left-0 z-50 w-72 lg:w-full
                    bg-linear-to-b from-purple-600 to-purple-800
                    dark:from-purple-900 dark:to-gray-900
                    text-white
                    flex flex-col shadow-lg h-screen
                    transform transition-transform duration-300 ease-in-out
                    ${isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
                `}
            >
                <div className="px-5 lg:px-6 py-5 border-b border-purple-500 dark:border-gray-700 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h2 className="text-lg lg:text-xl font-bold flex items-center gap-2">
                            <Anchor className="w-5 h-5 lg:w-6 lg:h-6 shrink-0" />
                            <span className="truncate">
                                {currentUser.division} Division Head
                            </span>
                        </h2>
                        <p className="text-purple-200 dark:text-gray-400 text-xs lg:text-sm mt-1.5 leading-snug">
                            Ministry of Fisheries, Aquatic and Ocean Resources
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="lg:hidden text-white/80 hover:text-white p-1 shrink-0"
                        aria-label="Close sidebar"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <nav className="flex-1 px-3 lg:px-4 py-4 space-y-1.5 overflow-y-auto">
                    {sidebarItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = activeTab === item.key;
                        return (
                            <button
                                key={item.key}
                                onClick={() => handleTabClick(item.key)}
                                className={`w-full flex items-center gap-3 px-3.5 lg:px-4 py-2.5 lg:py-3 rounded-lg text-left transition-all duration-200 text-sm lg:text-base ${
                                    isActive
                                        ? "bg-white/20 shadow-md font-medium"
                                        : "hover:bg-white/10"
                                }`}
                            >
                                <Icon className="w-5 h-5 shrink-0" />
                                <span className="truncate">{item.label}</span>
                            </button>
                        );
                    })}
                </nav>

                <div className="px-3 lg:px-4 py-3.5 border-t border-purple-500 dark:border-gray-700">
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-3.5 lg:px-4 py-2.5 lg:py-3 rounded-lg text-left hover:bg-red-500/30 transition-all duration-200 text-sm lg:text-base"
                    >
                        <LogOut className="w-5 h-5 shrink-0" />
                        <span>Logout</span>
                    </button>
                </div>
            </aside>
        </>
    );
}

export default HODSidebar;