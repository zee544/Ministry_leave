import { useUser } from "../hooks/UserContext.jsx";
import ThemeToggle from "./ThemeToggle";

function SecretaryHeader({ activeTab, onMenuToggle }) {
  const { currentUser } = useUser();

  return (
    <header className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 lg:px-8 py-3 lg:py-4 rounded-none lg:rounded-2xl transition-colors">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onMenuToggle}
            className="lg:hidden p-2 text-gray-600 dark:text-gray-300 hover:text-purple-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            aria-label="Open menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="min-w-0">
            <h1 className="text-lg lg:text-2xl font-bold text-gray-800 dark:text-white truncate">
              {activeTab === "dashboard" && "Secretary Dashboard"}
              {activeTab === "all-leaves" && "All Leave Records"}
              {activeTab === "pending" && "Pending Approvals"}
              {activeTab === "reports" && "Reports"}
              {activeTab === "settings" && "Settings"}
            </h1>
            <p className="text-xs lg:text-sm text-gray-500 dark:text-gray-400 truncate hidden sm:block">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 lg:gap-4 shrink-0">
          <ThemeToggle />
          <div className="flex items-center gap-2 lg:gap-3">
            <div className="w-8 h-8 lg:w-10 lg:h-10 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold text-xs lg:text-sm">
              {currentUser.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </div>
            <div className="hidden sm:block">
              <p className="text-xs lg:text-sm font-medium text-gray-700 dark:text-gray-200">
                {currentUser.name}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 hidden lg:block">
                {currentUser.designation || "Secretary"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export default SecretaryHeader;