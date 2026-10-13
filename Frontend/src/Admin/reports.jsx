import { useState } from "react";
import AnnualReports from "../Components/Reports/Annual_reports.jsx";
import MonthlyReports from "../Components/Reports/Monthly_report.jsx";
import DailyReports from "../Components/Reports/Daily_reports.jsx";
import {
    CalendarRange,
    CalendarDays,
    FileText
} from "lucide-react";

function Reports() {
    const [activeReport, setActiveReport] = useState("annual");

    const reportTabs = [
        { key: "annual", label: "Annual Reports", shortLabel: "Annual", icon: <CalendarRange /> },
        { key: "monthly", label: "Monthly Reports", shortLabel: "Monthly", icon: <CalendarDays /> },
        { key: "daily", label: "Daily Reports", shortLabel: "Daily", icon: <FileText /> },
    ];

    return (
        <div>
            {/* Tabs — compact on mobile, full size on desktop */}
            <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-4 sm:mb-6">
                {reportTabs.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveReport(tab.key)}
                        className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 py-1.5 rounded-lg text-[11px] sm:text-sm font-medium transition-all duration-200 ${
                            activeReport === tab.key
                                ? "bg-blue-600 text-white shadow-md"
                                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:shadow-sm"
                        }`}
                    >
                        <span className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full">
                            {tab.icon}
                        </span>
                        <span className="hidden sm:inline">{tab.label}</span>
                        <span className="sm:hidden">{tab.shortLabel}</span>
                    </button>
                ))}
            </div>

            {activeReport === "annual" && <AnnualReports />}
            {activeReport === "monthly" && <MonthlyReports />}
            {activeReport === "daily" && <DailyReports />}
        </div>
    );
}

export default Reports;