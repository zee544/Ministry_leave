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
    { key: "annual", label: "Annual Reports", icon: <CalendarRange /> },
    { key: "monthly", label: "Monthly Reports", icon: <CalendarDays /> },
    { key: "daily", label: "Daily Reports", icon: <FileText /> },
];

    return (
        <div>
            
            <div className="flex flex-wrap gap-2 mb-6">
                {reportTabs.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveReport(tab.key)}
                        className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                            activeReport === tab.key
                                ? "bg-blue-600 text-white shadow-md"
                                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 hover:shadow-sm"
                        }`}
                    >
                        <span>{tab.icon}</span>
                        <span>{tab.label}</span>
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