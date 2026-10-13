import { useState, useEffect } from "react";
import { useNotifications } from "../hooks/NotificationContext.jsx";
import { useLeaves } from "../hooks/LeaveContext.jsx";
import { useUser } from "../hooks/UserContext.jsx";
import { calculateWorkingDays, yearsInRange } from "../utils/leaveDays.js";
import { apiUrl } from "../api.js";

function ApplyLeave() {
    const { addNotification } = useNotifications();
    const { addLeave } = useLeaves();
    const { currentUser, employees, fetchEmployees } = useUser();
    const [formData, setFormData] = useState({
        leaveType: "",
        reason: "",
        fromDate: "",
        toDate: "",
        noOfDays: "",
        address: "",
        actingOfficer: "",
        additionalInfo: "",
    });
    const [showSuccess, setShowSuccess] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [actingOfficers, setActingOfficers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [holidayCache, setHolidayCache] = useState({});

    useEffect(() => {
        const loadEmployees = async () => {
            setLoading(true);
            try {
                const token = localStorage.getItem("token");
                if (token && fetchEmployees) {
                    await fetchEmployees(token);
                }
            } catch (err) {
                console.warn("Error fetching employees:", err);
            } finally {
                setLoading(false);
            }
        };
        loadEmployees();
    }, []);

    const fetchHolidaysForYear = async (year) => {
        if (holidayCache[year]) return holidayCache[year];

        try {
            const token = localStorage.getItem("token");
            if (!token) return null;

            const res = await fetch(apiUrl(`/api/admin/holidays?year=${year}`), {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (res.ok) {
                const data = await res.json();
                const dates = data.holidays || [];
                setHolidayCache((prev) => ({ ...prev, [year]: dates }));
                return dates;
            }
        } catch (err) {
            console.warn(`Failed to load holidays for ${year}:`, err);
        }
        return null;
    };

    useEffect(() => {
        const now = new Date().getFullYear();
        fetchHolidaysForYear(now);
        fetchHolidaysForYear(now + 1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const { fromDate, toDate } = formData;
        if (!fromDate || !toDate) return;
        yearsInRange(fromDate, toDate).forEach((y) => fetchHolidaysForYear(y));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formData.fromDate, formData.toDate]);

    useEffect(() => {
        if (!employees || employees.length === 0 || !currentUser) {
            setActingOfficers([]);
            return;
        }

        const userDivision = currentUser.division || "";
        const userDivisionLower = userDivision.toLowerCase().trim();

        const filtered = employees.filter((emp) => {
            if (emp.name?.toLowerCase() === currentUser.name?.toLowerCase()) return false;
            if (emp.status !== "Active") return false;

            const empDivision = (emp.division || "").toLowerCase().trim();
            const userDivClean = userDivisionLower.replace("istration", "").replace("istrator", "");
            const empDivClean = empDivision.replace("istration", "").replace("istrator", "");

            return userDivisionLower === empDivision || userDivClean === empDivClean;
        });

        setActingOfficers(filtered);
    }, [employees, currentUser]);

    const getAllHolidaysForRange = (from, to) => {
        const years = yearsInRange(from, to);
        const merged = new Set();
        years.forEach((y) => {
            (holidayCache[y] || []).forEach((d) => merged.add(d));
        });
        return Array.from(merged);
    };

    const calculateDays = (from, resumingDate) => {
        return calculateWorkingDays(
            from,
            resumingDate,
            getAllHolidaysForRange(from, resumingDate)
        );
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => {
            const next = { ...prev, [name]: value };

            if (name === "leaveType") {
                if (value === "Half-day") {
                    next.noOfDays = "0.5";
                } else if (prev.leaveType === "Half-day" && prev.fromDate && prev.toDate) {
                    const computed = calculateDays(prev.fromDate, prev.toDate);
                    if (computed) next.noOfDays = computed;
                }
            } else if (name === "fromDate" || name === "toDate") {
                if (next.leaveType === "Half-day") {
                    next.noOfDays = "0.5";
                } else {
                    const from = name === "fromDate" ? value : prev.fromDate;
                    const to = name === "toDate" ? value : prev.toDate;
                    const computed = calculateDays(from, to);
                    if (computed) next.noOfDays = computed;
                }
            }
            return next;
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.leaveType || !formData.fromDate || !formData.toDate || !formData.noOfDays || !formData.actingOfficer) {
            alert("Please fill in all required fields");
            return;
        }

        setIsSubmitting(true);

        try {
            const leaveData = {
                employee: currentUser.name,
                division: currentUser.division,
                type: formData.leaveType,
                from: formData.fromDate,
                to: formData.toDate,
                noOfDays: formData.noOfDays,
                days: formData.noOfDays,
                appliedBy: currentUser.name,
                actingOfficer: formData.actingOfficer,
                reason: formData.reason,
                address: formData.address,
                additionalInfo: formData.additionalInfo,
                status: "Pending Acting Officer",
            };

            const savedLeave = await addLeave(leaveData);
            console.log("Leave submitted successfully:", savedLeave);

            addNotification(
                `You have been assigned as Acting Officer for ${currentUser.name}'s ${formData.leaveType} leave (${formData.fromDate} to ${formData.toDate}). Please confirm.`,
                "acting_officer",
                formData.actingOfficer,
                currentUser.division,
            );

            addNotification(
                `Your ${formData.leaveType} leave (${formData.fromDate} to ${formData.toDate}) has been submitted and is awaiting confirmation from ${formData.actingOfficer}.`,
                "status_update",
                currentUser.name,
                currentUser.division,
            );

            addNotification(
                `New leave application: ${currentUser.name}'s ${formData.leaveType} leave (${formData.fromDate} to ${formData.toDate}) has been submitted and is awaiting Acting Officer confirmation.`,
                "leave_application",
                "admin",
                currentUser.division,
            );

            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 5000);

            setFormData({
                leaveType: "",
                reason: "",
                fromDate: "",
                toDate: "",
                noOfDays: "",
                address: "",
                actingOfficer: "",
                additionalInfo: "",
            });
        } catch (error) {
            console.error("Error submitting leave:", error);
            alert(`Failed to submit leave application: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

   const inputBaseClass =
    "w-full px-2.5 sm:px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white text-xs sm:text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500 transition-colors placeholder-gray-400 [color-scheme:light] dark:[color-scheme:dark]";
    const labelClass =
        "block text-[11px] sm:text-sm font-medium text-gray-600 dark:text-gray-300 mb-1";

    return (
        <div className="w-full">
            <div className="mb-3 sm:mb-6">
                <h1 className="text-lg sm:text-2xl font-bold text-gray-800 dark:text-white">
                    Apply for Leave
                </h1>
                <p className="text-[11px] sm:text-sm text-gray-500 dark:text-gray-400">
                    Fill out the form below to submit a new leave request.
                </p>
            </div>

            {showSuccess && (
                <div className="mb-3 sm:mb-4 p-2.5 sm:p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-xl flex items-center gap-2.5 sm:gap-3">
                    <span className="text-green-600 dark:text-green-400 text-base sm:text-lg">✅</span>
                    <div>
                        <p className="text-xs sm:text-sm font-semibold text-green-800 dark:text-green-300">
                            Leave Application Submitted!
                        </p>
                        <p className="text-[10px] sm:text-xs text-green-600 dark:text-green-400">
                            Your request has been forwarded to your acting officer.
                        </p>
                    </div>
                </div>
            )}

            <form
                onSubmit={handleSubmit}
                className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-3 sm:p-6"
            >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                        <label className={labelClass}>Leave Type *</label>
                        <select
                            name="leaveType"
                            value={formData.leaveType}
                            onChange={handleChange}
                            className={inputBaseClass}
                        >
                            <option value="">Select leave type</option>
                            <option value="Annual">Vacation</option>
                            <option value="Casual">Casual</option>
                            <option value="Other">Other</option>
                            <option value="Half-day">Half-day</option>
                        </select>
                    </div>
                    <div>
                        <label className={labelClass}>Reason</label>
                        <input
                            type="text"
                            name="reason"
                            value={formData.reason}
                            onChange={handleChange}
                            className={inputBaseClass}
                        />
                    </div>
                    <div>
                        <label className={labelClass}>Date of Commencing Leave *</label>
                        <input
                            type="date"
                            name="fromDate"
                            value={formData.fromDate}
                            onChange={handleChange}
                            className={inputBaseClass}
                        />
                    </div>
                    <div>
                        <label className={labelClass}>Date of Resuming Duties *</label>
                        <input
                            type="date"
                            name="toDate"
                            value={formData.toDate}
                            onChange={handleChange}
                            className={inputBaseClass}
                        />
                    </div>
                    <div>
                        <label className={labelClass}>No. of Days *</label>
                        <input
                            type="number"
                            name="noOfDays"
                            min="0.5"
                            step="0.5"
                            value={formData.noOfDays}
                            onChange={handleChange}
                            className={inputBaseClass}
                        />
                    </div>
                    <div>
                        <label className={labelClass}>Address on Leave</label>
                        <input
                            type="text"
                            name="address"
                            value={formData.address}
                            onChange={handleChange}
                            className={inputBaseClass}
                        />
                    </div>
                    <div className="col-span-1 sm:col-span-2">
                        <label className={labelClass}>Acting Officer *</label>
                        <select
                            name="actingOfficer"
                            value={formData.actingOfficer}
                            onChange={handleChange}
                            className={inputBaseClass}
                        >
                            <option value="">Select acting officer</option>
                            {loading ? (
                                <option disabled>Loading officers...</option>
                            ) : actingOfficers.length === 0 ? (
                                <option disabled>No officers available in your division</option>
                            ) : (
                                actingOfficers.map((officer) => (
                                    <option key={officer.id} value={officer.name}>
                                        {officer.name} — {officer.designation || "Officer"}
                                    </option>
                                ))
                            )}
                        </select>
                        <p className="text-[10px] sm:text-xs text-gray-400 dark:text-gray-400 mt-1">
                            {loading
                                ? "Loading..."
                                : actingOfficers.length === 0
                                    ? "No active officers in your division"
                                    : `${actingOfficers.length} officer(s) from ${currentUser?.division}`}
                        </p>
                    </div>
                    <div className="col-span-1 sm:col-span-2">
                        <label className={labelClass}>Additional Information</label>
                        <textarea
                            rows={3}
                            name="additionalInfo"
                            value={formData.additionalInfo}
                            onChange={handleChange}
                            className={inputBaseClass}
                            placeholder="Provide additional information..."
                        />
                    </div>
                    <div className="col-span-1 sm:col-span-2">
                        <button
                            type="submit"
                            disabled={isSubmitting || loading || actingOfficers.length === 0}
                            className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-2.5 bg-teal-500 text-white text-xs sm:text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? "Submitting..." : "Submit Leave Request"}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
}

export default ApplyLeave;