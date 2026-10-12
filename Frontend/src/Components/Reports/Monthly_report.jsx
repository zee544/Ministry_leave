import { useState, useMemo, Fragment } from "react";
import { useSearchFilter, Pagination } from "../../hooks/useSearchFilter.jsx";
import { useLeaves } from "../../hooks/LeaveContext.jsx";
import { useUser, LEAVE_TYPES } from "../../hooks/UserContext.jsx";
import LeaveApprovalModal from "../../hooks/LeaveApprovalModal.jsx";
import { ClipboardList, Check,Clock, X , FileDown, Search} from "lucide-react";

function MonthlyReports() {
    const { leaves } = useLeaves();
    const { currentUser } = useUser();
    const [selectedLeave, setSelectedLeave] = useState(null);
    const [showPrintModal, setShowPrintModal] = useState(false);

    const userDivision = currentUser?.division || "Administration";

    const divisionLeaves = useMemo(() => {
        return leaves.filter((l) => {
            const leaveDiv = (l.division || "").toLowerCase();
            const uDiv = userDivision.toLowerCase();
            return leaveDiv === uDiv || leaveDiv.replace("istration", "") === uDiv.replace("istration", "");
        });
    }, [leaves, userDivision]);

    const allData = useMemo(() => divisionLeaves.map((l) => ({
        id: l.id,
        date: l.appliedOn || l.from || "",
        employee: l.employee,
        division: l.division,
        leaveType: l.type,
        status: l.status,
        actingOfficer: l.actingOfficer || "",
        from: l.from || "",
        to: l.to || "",
        noOfDays: l.noOfDays || l.days || "",
        appliedOn: l.appliedOn || "",
        reason: l.reason || "",
        raw: l,
    })), [divisionLeaves]);

    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [selectedLeaveTypes, setSelectedLeaveTypes] = useState([]);
    const [selectedStatuses, setSelectedStatuses] = useState([]);

    const filterOptions = useMemo(() => {
        const types = [...new Set([...LEAVE_TYPES, ...allData.map((d) => d.leaveType).filter(Boolean)])].sort();
        const statuses = ["Approved", "Admin Approved", "Pending", "Pending Acting Officer", "Declined"];
        return { leaveTypes: types, statuses };
    }, [allData]);

    const filteredByParams = useMemo(() => {
        return allData.filter((item) => {
            if (dateFrom && item.date < dateFrom) return false;
            if (dateTo && item.date > dateTo) return false;
            if (selectedLeaveTypes.length > 0) {
                const matchesLeaveType = selectedLeaveTypes.some((t) => {
                    if (t === item.leaveType) return true;
                    if (t === "Casual" && item.leaveType === "Half-day") return true;
                    return false;
                });
                if (!matchesLeaveType) return false;
            }
            if (selectedStatuses.length > 0 && !selectedStatuses.includes(item.status)) return false;
            return true;
        });
    }, [allData, dateFrom, dateTo, selectedLeaveTypes, selectedStatuses]);

    const groupedData = useMemo(() => {
        const groups = {};
        filteredByParams.forEach((item) => {
            const d = new Date(item.date);
            const month = d.toLocaleString("en-US", { month: "long" });
            const key = `${month} ${d.getFullYear()}`;
            if (!groups[key]) {
                groups[key] = { period: key, total: 0, approved: 0, pending: 0, declined: 0, items: [] };
            }
            groups[key].total++;
            if (item.status === "Approved") groups[key].approved++;
            else if (item.status === "Pending") groups[key].pending++;
            else if (item.status === "Declined") groups[key].declined++;
            groups[key].items.push(item);
        });
        return Object.values(groups).sort((a, b) => {
            const [aM, aY] = a.period.split(" ");
            const [bM, bY] = b.period.split(" ");
            const months = "January February March April May June July August September October November December".split(" ");
            return aY - bY || months.indexOf(aM) - months.indexOf(bM);
        });
    }, [filteredByParams]);

    const {
        searchQuery, handleSearchChange,
        currentPage, totalPages, indexOfFirstItem, indexOfLastItem,
        currentItems, filteredData, goToPage, getPageNumbers,
    } = useSearchFilter(groupedData, {
        searchFields: ["period"],
        filterConfig: [],
        itemsPerPage: 10,
    });

    const totals = useMemo(() => filteredData.reduce((acc, g) => ({
        total: acc.total + g.total, approved: acc.approved + g.approved,
        pending: acc.pending + g.pending, declined: acc.declined + g.declined,
    }), { total: 0, approved: 0, pending: 0, declined: 0 }), [filteredData]);

    const toggleSelection = (arr, v) => arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
    const toggleSelectAll = (arr, opts) => arr.length === opts.length ? [] : [...opts];

    const handleExport = () => {
        let filename = "monthly_report";
        if (dateFrom && dateTo) {
            const fromYear = dateFrom.substring(0, 4);
            const toYear = dateTo.substring(0, 4);
            if (fromYear === toYear) {
                filename = fromYear + "_monthly_report";
            } else {
                filename = fromYear + "_" + toYear + "_monthly_report";
            }
        }
        const rows = [["Period", "Employee", "Division", "Leave Type", "Days", "Status", "From Date", "To Date", "Applied On", "Acting Officer", "Reason"]];
        filteredData.forEach((g) => {
            g.items.forEach((item) => {
                rows.push([g.period, item.employee, item.division, item.leaveType, item.noOfDays, item.status, item.from, item.to, item.appliedOn, item.actingOfficer, item.reason]);
            });
        });
        const csv = rows.map((r) => r.map((v) => '"' + v + '"').join(",")).join(String.fromCharCode(10));
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = filename + ".csv"; a.click();
        URL.revokeObjectURL(url);
    };

    const handleDownloadPeriod = (group) => {
        const safeName = group.period.replace(/\s+/g, "_");
        const rows = [["Period", "Employee", "Division", "Leave Type", "Days", "Status", "From Date", "To Date", "Applied On", "Acting Officer", "Reason"]];
        group.items.forEach((item) => {
            rows.push([group.period, item.employee, item.division, item.leaveType, item.noOfDays, item.status, item.from, item.to, item.appliedOn, item.actingOfficer, item.reason]);
        });
        const csv = rows.map((r) => r.map((v) => '"' + v + '"').join(",")).join(String.fromCharCode(10));
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = safeName + "_monthly_report.csv"; a.click();
        URL.revokeObjectURL(blob);
    };

    const [expandedPeriod, setExpandedPeriod] = useState(null);

    const getStatusStyle = (s) => ({
        Approved: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
        Pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
        Declined: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    }[s] || "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300");

    const CheckboxGroup = ({ label, options, selected, onChange, onSelectAll }) => (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-white dark:bg-gray-800">
            <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">{label}</span>
                <button type="button" onClick={() => onSelectAll(options)} className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800">
                    {selected.length === options.length ? "Clear All" : "Select All"}
                </button>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {options.map((opt) => (
                    <label key={opt} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs cursor-pointer transition-colors ${selected.includes(opt) ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"}`}>
                        <input type="checkbox" checked={selected.includes(opt)} onChange={() => onChange(opt)} className="hidden" />
                        {opt}
                    </label>
                ))}
            </div>
            {selected.length > 0 && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{selected.length} selected</p>}
        </div>
    );

    const inputClass = "w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 transition-colors";

    return (
        <div>
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 lg:p-6 mb-4 lg:mb-6">
                <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-4 flex items-center gap-2">
                  Report Configuration
                </h3>
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
                    <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">From Date</label>
                        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputClass} />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">To Date</label>
                        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputClass} />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Quick Select</label>
                        <div className="flex flex-wrap gap-1">
                            {[
                                { label: "This Year", from: `${new Date().getFullYear()}-01-01`, to: `${new Date().getFullYear()}-12-31` },
                                { label: "Last Year", from: `${new Date().getFullYear() - 1}-01-01`, to: `${new Date().getFullYear() - 1}-12-31` },
                                { label: "All Time", from: "2023-01-01", to: "2025-12-31" },
                            ].map((p) => (
                                <button key={p.label} type="button" onClick={() => { setDateFrom(p.from); setDateTo(p.to); }} className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">{p.label}</button>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <CheckboxGroup label="Leave Types" options={filterOptions.leaveTypes} selected={selectedLeaveTypes} onChange={(v) => setSelectedLeaveTypes(toggleSelection(selectedLeaveTypes, v))} onSelectAll={(opts) => setSelectedLeaveTypes(toggleSelectAll(selectedLeaveTypes, opts))} />
                    <CheckboxGroup label="Statuses" options={filterOptions.statuses} selected={selectedStatuses} onChange={(v) => setSelectedStatuses(toggleSelection(selectedStatuses, v))} onSelectAll={(opts) => setSelectedStatuses(toggleSelectAll(selectedStatuses, opts))} />
                </div>
                <div className="flex justify-between items-center mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        <strong>{filteredByParams.length}</strong> records match your criteria
                        {(selectedLeaveTypes.length > 0 || selectedStatuses.length > 0) && (<span> | Filters active</span>)}
                    </p>
                    <button
                        type="button"
                        onClick={() => { setDateFrom(""); setDateTo(""); setSelectedLeaveTypes([]); setSelectedStatuses([]); }}
                        className="px-4 py-1.5 text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors font-medium"
                    >
                        ✕ Reset All Filters
                    </button>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 lg:p-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-lg font-bold text-gray-800 dark:text-white">Monthly Report</h3>
                            {userDivision && (
                                <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold px-2.5 py-0.5 rounded-full">
                                    {userDivision} Division
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{filteredData.length} months found ({dateFrom} → {dateTo})</p>
                    </div>
                    <button
        onClick={handleExport}
        className="flex items-center gap-1.5 px-4 py-2 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
    >
        <FileDown className="w-4 h-4" />
        Export CSV
    </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                    {[
                         { label: "Total Requests", value: totals.total, icon: <ClipboardList className="w-5 h-5 lg:w-7 lg:h-7 text-white" />, color: "bg-blue-500" },
        { label: "Approved", value: totals.approved, icon:<Check className="w-5 h-5 lg:w-7 lg:h-7 text-white" />, color: "bg-green-500" },
        { label: "Pending", value: totals.pending, icon: <Clock className="w-5 h-5 lg:w-7 lg:h-7 text-white" />, color: "bg-yellow-500" },
        { label: "Declined", value: totals.declined, icon: <X className="w-5 h-5 lg:w-7 lg:h-7 text-white" />, color: "bg-red-500" },
    ].map((stat, i) => (
                        <div key={i} className="bg-gray-50 dark:bg-gray-900/40 rounded-xl p-3 border border-gray-100 dark:border-gray-700">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{stat.label}</p>
                                    <p className="text-xl font-bold text-gray-800 dark:text-white mt-0.5">{stat.value}</p>
                                </div>
                                <div className={`w-9 h-9 ${stat.color} rounded-lg flex items-center justify-center text-base shadow-sm`}>{stat.icon}</div>
                            </div>
                        </div>
                    ))}
                </div>

              <div className="relative w-full mb-4">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />

    <input
        type="text"
        placeholder="Search months..."
        value={searchQuery}
        onChange={handleSearchChange}
        className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
    />
</div>

                {filteredData.length === 0 ? (
                    <div className="py-12 text-center">
                        <span className="text-4xl block mb-3">📭</span>
                        <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-1">No data found</h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Try adjusting your filters or date range</p>
                    </div>
                ) : (
                    <>
                        <div className="block lg:hidden divide-y divide-gray-100 dark:divide-gray-700 border border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden mb-4">
                            {currentItems.map((g) => (
                                <div key={g.period} className="p-4 space-y-2 bg-white dark:bg-gray-800">
                                    <div className="flex items-center justify-between">
                                        <p className="text-sm font-semibold text-gray-800 dark:text-white">{g.period}</p>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">{g.total} requests</span>
                                    </div>
                                    <div className="flex gap-2 text-xs">
                                        <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 rounded-full">✓ {g.approved}</span>
                                        <span className="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300 rounded-full">⏳ {g.pending}</span>
                                        <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 rounded-full">✕ {g.declined}</span>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleDownloadPeriod(g)} className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 font-medium">Download</button>
                                        <button onClick={() => setExpandedPeriod(expandedPeriod === g.period ? null : g.period)} className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800">{expandedPeriod === g.period ? "Hide ▲" : "Show Details ▼"}</button>
                                    </div>
                                    {expandedPeriod === g.period && (
                                        <div className="mt-2 space-y-2 border-t border-gray-100 dark:border-gray-700 pt-2">
                                            {g.items.map((item) => (
                                                <div key={item.id} className="flex items-center justify-between text-xs bg-gray-50 dark:bg-gray-900/40 p-2 rounded-lg gap-2">
                                                    <div>
                                                        <p className="font-medium text-gray-800 dark:text-white">{item.employee}</p>
                                                        <p className="text-gray-500 dark:text-gray-400">{item.division} · {item.leaveType} · {item.noOfDays ? `${item.noOfDays} day(s)` : "—"}</p>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <button onClick={() => { setSelectedLeave(item.raw || item); setShowPrintModal(true); }} className="px-2 py-1 bg-purple-500 text-white rounded text-[11px] hover:bg-purple-700 transition-colors font-medium shadow-sm">View</button>
                                                        <span className={`px-2 py-0.5 rounded-lg ${getStatusStyle(item.status)}`}>{item.status}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        <div className="hidden lg:block overflow-hidden border border-gray-100 dark:border-gray-700 rounded-xl mb-4">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-gray-500 dark:bg-gray-700 text-white">
                                        <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-left">Month</th>
                                        <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-center">Total</th>
                                        <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-center">Approved</th>
                                        <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-center">Pending</th>
                                        <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-center">Declined</th>
                                        <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-center">Rate</th>
                                        <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-right">Details</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                    {currentItems.map((g) => {
                                        const rate = g.total > 0 ? Math.round((g.approved / g.total) * 100) : 0;
                                        return (
                                            <Fragment key={g.period}>
                                                <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                                    <td className="px-6 py-4 text-sm font-medium text-gray-800 dark:text-white">{g.period}</td>
                                                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300 text-center">{g.total}</td>
                                                    <td className="px-6 py-4 text-sm text-center"><span className="px-3 py-1 bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 text-xs font-medium rounded-lg">{g.approved}</span></td>
                                                    <td className="px-6 py-4 text-sm text-center"><span className="px-3 py-1 bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300 text-xs font-medium rounded-lg">{g.pending}</span></td>
                                                    <td className="px-6 py-4 text-sm text-center"><span className="px-3 py-1 bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 text-xs font-medium rounded-lg">{g.declined}</span></td>
                                                    <td className="px-6 py-4 text-center">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <div className="w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                                                                <div className="h-2 rounded-full" style={{ width: `${rate}%`, backgroundColor: rate >= 75 ? "#22c55e" : rate >= 50 ? "#f59e0b" : "#ef4444" }} />
                                                            </div>
                                                            <span className="text-xs text-gray-500 dark:text-gray-400">{rate}%</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <button onClick={() => handleDownloadPeriod(g)} className="text-xs text-green-600 dark:text-green-400 hover:text-green-800 font-medium">Download</button>
                                                            <button onClick={() => setExpandedPeriod(expandedPeriod === g.period ? null : g.period)} className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 font-medium">{expandedPeriod === g.period ? "Hide ▲" : "View ▼"}</button>
                                                        </div>
                                                    </td>
                                                </tr>
                                                {expandedPeriod === g.period && (
                                                    <tr className="bg-gray-50 dark:bg-gray-900/40">
                                                        <td colSpan={7} className="px-6 py-4">
                                                            <h4 className="text-sm font-semibold text-gray-800 dark:text-white mb-3">📋 Detailed Records — {g.period}</h4>
                                                            <table className="w-full text-xs">
                                                                <thead>
                                                                    <tr className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                                                                        <th className="px-4 py-2 text-left font-semibold">Date</th>
                                                                        <th className="px-4 py-2 text-left font-semibold">Employee</th>
                                                                        <th className="px-4 py-2 text-left font-semibold">Division</th>
                                                                        <th className="px-4 py-2 text-left font-semibold">Leave Type</th>
                                                                        <th className="px-4 py-2 text-left font-semibold">Days</th>
                                                                        <th className="px-4 py-2 text-left font-semibold">Status</th>
                                                                        <th className="px-4 py-2 text-right font-semibold">Action</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                                                    {g.items.map((item) => (
                                                                        <tr key={item.id} className="hover:bg-white dark:hover:bg-gray-800 transition-colors">
                                                                            <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{item.date}</td>
                                                                            <td className="px-4 py-2 font-medium text-gray-800 dark:text-white">{item.employee}</td>
                                                                            <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{item.division}</td>
                                                                            <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{item.leaveType}</td>
                                                                            <td className="px-4 py-2 font-semibold text-gray-700 dark:text-gray-200">{item.noOfDays || "—"}</td>
                                                                            <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded-lg text-xs font-medium ${getStatusStyle(item.status)}`}>{item.status}</span></td>
                                                                            <td className="px-4 py-2 text-right">
                                                                                <div className="flex items-center justify-end">
                                                                                    <button onClick={() => { setSelectedLeave(item.raw || item); setShowPrintModal(true); }} className="px-2.5 py-1 bg-purple-500 text-white rounded text-xs hover:bg-purple-700 transition-colors font-medium shadow-sm">View</button>
                                                                                </div>
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </td>
                                                    </tr>
                                                )}
                                            </Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <Pagination currentPage={currentPage} totalPages={totalPages} indexOfFirstItem={indexOfFirstItem} indexOfLastItem={indexOfLastItem} filteredCount={filteredData.length} goToPage={goToPage} getPageNumbers={getPageNumbers} label="months" />
                    </>
                )}
            </div>

            {showPrintModal && selectedLeave && (
                <LeaveApprovalModal selectedLeave={selectedLeave} setShowPrintModal={setShowPrintModal} setSelectedLeave={setSelectedLeave} />
            )}
        </div>
    );
}

export default MonthlyReports;