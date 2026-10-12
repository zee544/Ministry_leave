import { Sun, Moon } from "lucide-react";
import { useTheme } from "../hooks/ThemeContext.jsx";

export default function ThemeToggle({ className = "" }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle theme"
      className={`p-1.5 lg:p-2 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-yellow-300 dark:hover:bg-gray-700 transition-colors ${className}`}
    >
      {theme === "dark" ? (
        <Sun className="w-5 h-5 lg:w-6 lg:h-6" />
      ) : (
        <Moon className="w-5 h-5 lg:w-6 lg:h-6" />
      )}
    </button>
  );
}