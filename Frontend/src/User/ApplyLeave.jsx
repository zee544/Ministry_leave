import { useState, useEffect, useCallback, useRef } from "react";
import { useLeaves } from "../hooks/LeaveContext.jsx";
import { useUser } from "../hooks/UserContext.jsx";
import { calculateWorkingDays, yearsInRange } from "../utils/leaveDays.js";
import { apiUrl } from "../api.js";

function ApplyLeave() {
    const { addLeave } = useLeaves();
    const { currentUser } = useUser();
    const actingUserId = currentUser?.id;
    const actingUserRole = currentUser?.role;
    const actingUserDivision = currentUser?.division;
    const isAdmin = currentUser?.role === "admin";
    const isSenior = ["admin", "hod", "secretary", "executive_officer"].includes(currentUser?.role);
    
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
    const [successMessage, setSuccessMessage] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [actingOfficers, setActingOfficers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [holidayCache, setHolidayCache] = useState({});
    const holidayCacheRef = useRef(new Map());
    const holidayRequestsRef = useRef(new Map());

    const loadHolidaysForYear = useCallback(async (year) => {
        if (holidayCacheRef.current.has(year)) return holidayCacheRef.current.get(year);

        try {
            const token = localStorage.getItem("token");
            if (!token) return null;

            const res = await fetch(apiUrl(`/api/admin/holidays?year=${year}`), {
                headers: { Authorization: `Bearer ${token}` },
            });

            if (res.ok) {
                const data = await res.json();
                const dates = data.holidays || [];
                holidayCacheRef.current.set(year, dates);
                setHolidayCache((prev) => ({ ...prev, [year]: dates }));
                return dates;
            }
        } catch (err) {
            console.warn(`Failed to load holidays for ${year}:`, err);
        }
        return null;
    }, []);

    const fetchHolidaysForYear = useCallback((year) => {
        if (holidayCacheRef.current.has(year)) {
            return Promise.resolve(holidayCacheRef.current.get(year));
        }
        if (holidayRequestsRef.current.has(year)) {
            return holidayRequestsRef.current.get(year);
        }

        const request = loadHolidaysForYear(year).finally(() => {
            holidayRequestsRef.current.delete(year);
        });
        holidayRequestsRef.current.set(year, request);
        return request;
    }, [loadHolidaysForYear]);

    useEffect(() => {
        const now = new Date().getFullYear();
        fetchHolidaysForYear(now);
        fetchHolidaysForYear(now + 1);
    }, [fetchHolidaysForYear]);

    useEffect(() => {
        const { fromDate, toDate } = formData;
        if (!fromDate || !toDate) return;
        yearsInRange(fromDate, toDate).forEach((y) => fetchHolidaysForYear(y));
    }, [formData.fromDate, formData.toDate, fetchHolidaysForYear]);

    useEffect(() => {
        if (actingUserId == null) {
            setActingOfficers([]);
            setLoading(false);
            return;
        }
        const token = localStorage.getItem("token");
        setLoading(true);
        fetch(apiUrl("/api/admin/employees/acting-officers"), {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then((res) => res.ok ? res.json() : [])
            .then((rows) => setActingOfficers(rows.filter((officer) =>
                !(officer.role === actingUserRole && Number(officer.id) === Number(actingUserId)) &&
                (!isAdmin || officer.role === "employee")
            )))
            .catch((error) => {
                console.warn("Failed to load Acting Officers:", error);
                setActingOfficers([]);
            })
            .finally(() => setLoading(false));
    }, [actingUserId, actingUserRole, actingUserDivision, isAdmin]);
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

        // ✅ 1. Basic Validation
        if (!formData.leaveType || !formData.fromDate || !formData.toDate || !formData.noOfDays) {
            alert("Please fill in all required fields");
            return;
        }

        // ✅ 2. Enforce Acting Officer only for regular employees
        if (!isSenior && !formData.actingOfficer) {
            alert("Please select an Acting Officer.");
            return;
        }

        setIsSubmitting(true);

        try {
            const selectedActingOfficer = actingOfficers.find(
                (officer) => `${officer.role}:${officer.id}` === formData.actingOfficer
            );
            const hasActingOfficer = Boolean(selectedActingOfficer);

            const leaveData = {
                employee: currentUser.name,
                division: currentUser.division,
                type: formData.leaveType,
                from: formData.fromDate,
                to: formData.toDate,
                noOfDays: formData.noOfDays,
                days: formData.noOfDays,
                appliedBy: currentUser.name,
                actingOfficer: selectedActingOfficer?.name || null,
                actingOfficerUserId: selectedActingOfficer?.id || null,
                actingOfficerRole: selectedActingOfficer?.role || null,
                applicantUserId: currentUser.id,
                applicantRole: currentUser.role,
                applicantEmail: currentUser.email,
                reason: formData.reason,
                address: formData.address,
                additionalInfo: formData.additionalInfo,
                status: isAdmin
                    ? "Admin Approved"
                    : (hasActingOfficer ? "Pending Acting Officer" : "Pending"),
            };

            const savedLeave = await addLeave(leaveData);
            console.log("Leave submitted successfully:", savedLeave);

            setSuccessMessage(hasActingOfficer
                ? "Your request has been sent to the selected Acting Officer."
                : "Your request has been sent to the next approver in your workflow.");
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
                            {successMessage}
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

                                      {/* ✅ 3. Acting Officer field — required for employees and EOs */}
                    {["employee", "admin", "hod", "secretary", "executive_officer"].includes(currentUser.role) && (
                        <div className="col-span-1 sm:col-span-2">
                            <label className={labelClass}>
                                Acting Officer{isSenior ? "" : " *"}
                            </label>
                            <select
                                name="actingOfficer"
                                value={formData.actingOfficer}
                                onChange={handleChange}
                                className={inputBaseClass}
                                required={!isSenior}
                            >
                                <option value="">
                                    {isSenior ? "Select an Acting Officer (Optional)" : "Select an Acting Officer (Required)"}
                                </option>
                                {/* ... rest of the options ... */}{loading ? (
                                    <option disabled>Loading officers...</option>
                                ) : actingOfficers.length === 0 ? (
                                    <option disabled>No officers available in your division</option>
                                ) : (
                                    actingOfficers.map((officer) => (
                                        <option key={`${officer.role}:${officer.id}`} value={`${officer.role}:${officer.id}`}>
                                            {officer.name} — {officer.designation || "Officer"}
                                        </option>
                                    ))
                                )}
                            </select>
                            <p className="text-[10px] sm:text-xs text-gray-400 dark:text-gray-400 mt-1">
                                {loading
                                    ? "Loading..."
                                    : actingOfficers.length === 0
                                        ? "No active officers in your division. Please contact your administrator."
                                        : isAdmin
                                            ? "Choose an active employee in your division to act for you during your leave."
                                            : isSenior
                                                ? "Optionally choose an Acting Officer from your division."
                                                : "Select an Acting Officer to handle your duties while on leave."}
                            </p>
                        </div>
                    )}

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
                            disabled={
                                isSubmitting || 
                                loading || 
                                (!['admin', 'hod', 'secretary', 'executive_officer'].includes(currentUser?.role) && !formData.actingOfficer)
                            }
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
