import { useState, useEffect } from "react";
import CreateEmployee from "./CreateEmployee.jsx";
import DataTable from "../Components/DataTable";
import { useUser, MINISTRY_DIVISIONS } from "../hooks/UserContext.jsx";

function Employee({ openCreate }) {
    const [showCreate, setShowCreate] = useState(false);
    const { employees, currentUser, updateEmployee, toggleEmployeeStatus } = useUser();

    const userDivision = currentUser?.division || "Administration";
    const divisionEmployees = employees.filter((e) => {
        const empDiv = (e.division || "").toLowerCase();
        const uDiv = userDivision.toLowerCase();
        return empDiv === uDiv || empDiv.replace("istration", "") === uDiv.replace("istration", "");
    });

    useEffect(() => {
        if (openCreate) {
            setShowCreate(true);
        }
    }, [openCreate]);

    const [editing, setEditing] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [toast, setToast] = useState("");

    const handleToggleStatus = (id) => {
        if (toggleEmployeeStatus) {
            toggleEmployeeStatus(id);
        }
        const emp = employees.find((e) => e.id === id);
        setToast(`${emp?.name || "Employee"} status toggled.`);
        setTimeout(() => setToast(""), 3000);
    };

    const handleEdit = (emp) => {
        setEditing(emp.id);
        setEditForm({ ...emp });
    };

    const handleSaveEdit = (id) => {
        if (updateEmployee) {
            updateEmployee(id, editForm);
        }
        setToast("Employee updated successfully.");
        setEditing(null);
        setEditForm({});
        setTimeout(() => setToast(""), 3000);
    };

    const handleCancelEdit = () => {
        setEditing(null);
        setEditForm({});
    };

    const columns = [
        {
            key: "rowNum",
            label: "#",
            render: (item, { index }) => <span className="text-gray-400 dark:text-gray-500 font-mono text-xs">{index + 1}</span>,
            className: "w-12"
        },
        {
            key: "name",
            label: "Employee",
            render: (item) => (
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-[10px] shrink-0">
                        {item.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                    </div>
                    <p className="text-xs sm:text-sm font-medium text-gray-800 dark:text-white">{item.name}</p>
                </div>
            ),
        },
        {
            key: "designation",
            label: "Designation",
            render: (item) => <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-[10px] sm:text-xs font-medium rounded-full">{item.designation}</span>,
        },
        {
            key: "email",
            label: "Email",
            render: (item) => <span className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-300">{item.email}</span>
        },
        {
            key: "appointment_date",
            label: "Appointment Date",
            render: (item) => new Date(item.appointment_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
        },
        {
            key: "status",
            label: "Status",
            render: (item, { getStatusBadge }) => getStatusBadge(item.status),
        },
        {
            key: "actions",
            label: "Actions",
            className: "text-right",
            render: (item) => (
                <div className="flex items-center justify-end gap-1.5">
                    <button
                        onClick={() => handleEdit(item)}
                        className="px-2.5 py-1 bg-blue-500 text-white text-[10px] sm:text-xs rounded hover:bg-blue-700 transition-colors shadow-sm font-medium"
                    >
                        Edit
                    </button>
                    <button
                        onClick={() => handleToggleStatus(item.id)}
                        className="px-2.5 py-1 bg-red-500 text-white text-[10px] sm:text-xs rounded hover:bg-red-700 transition-colors shadow-sm font-medium"
                    >
                        {item.status === "Active" ? "Deactivate" : "Activate"}
                    </button>
                </div>
            ),
        },
    ];

    // ============================================================
    // COMPACT MOBILE CARD
    // Row 1: avatar + name/email  |  small status badge
    // Row 2: Designation · Division (inline)
    // Row 3: Appointed: date
    // Row 4: Edit / Deactivate buttons
    // ============================================================
    const mobileRender = (emp, { getStatusBadge }) => (
        <div className="p-2.5">
            {/* Row 1: avatar + name/email + status */}
            <div className="flex items-center gap-2 mb-1.5">
                <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-[10px] shrink-0">
                    {emp.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-gray-800 dark:text-white truncate">
                        {emp.name}
                    </p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                        {emp.email}
                    </p>
                </div>
                <div className="shrink-0">
                    {getStatusBadge(emp.status)}
                </div>
            </div>

            {/* Row 2: Designation · Division inline */}
            <p className="text-[11px] text-gray-700 dark:text-gray-300 truncate mb-0.5">
                <span className="text-gray-500 dark:text-gray-400">Designation: </span>
                <span className="font-medium">{emp.designation}</span>
                <span className="text-gray-400 dark:text-gray-500 mx-1">·</span>
                <span className="text-gray-500 dark:text-gray-400">Division: </span>
                <span className="font-medium">{emp.division}</span>
            </p>

            {/* Row 3: Appointed date */}
            <p className="text-[11px] text-gray-700 dark:text-gray-300 mb-2">
                <span className="text-gray-500 dark:text-gray-400">Appointed: </span>
                <span className="font-medium">
                    {new Date(emp.appointment_date).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                    })}
                </span>
            </p>

            {/* Row 4: Buttons */}
            <div className="flex gap-1.5 pt-1.5 border-t border-gray-100 dark:border-gray-700">
                <button
                    onClick={() => handleEdit(emp)}
                    className="flex-1 px-2 py-1.5 text-[10px] bg-blue-500 text-white rounded hover:bg-blue-700 transition-colors font-medium"
                >
                    Edit
                </button>
                <button
                    onClick={() => handleToggleStatus(emp.id)}
                    className="flex-1 px-2 py-1.5 text-[10px] bg-red-500 text-white rounded hover:bg-red-700 transition-colors font-medium"
                >
                    {emp.status === "Active" ? "Deactivate" : "Activate"}
                </button>
            </div>
        </div>
    );

    return (
        <div>
            {toast && (
                <div className="fixed top-4 right-4 z-50 px-4 py-3 bg-green-600 text-white text-sm rounded-lg shadow-lg">
                    ✅ {toast}
                </div>
            )}

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4">
                <div>
                    <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-800 dark:text-white"></h1>
                    
                </div>
                <button
                    onClick={() => setShowCreate(!showCreate)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors shadow-sm whitespace-nowrap"
                >
                    <span className="text-base">{showCreate ? "✕" : "+"}</span>
                    <span className="hidden sm:inline">{showCreate ? "Cancel" : "Create New Employee"}</span>
                    <span className="sm:hidden">{showCreate ? "Cancel" : "New"}</span>
                </button>
            </div>

            {editing !== null && (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-blue-200 dark:border-blue-800 p-4 mb-4">
                    <h2 className="text-base font-bold text-gray-800 dark:text-white mb-3">Edit Employee</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-gray-600 dark:text-white mb-1">Full Name</label>
                            <input
                                type="text"
                                value={editForm.name || ""}
                                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                className="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">Designation</label>
                            <input
                                type="text"
                                value={editForm.designation || ""}
                                onChange={(e) => setEditForm({ ...editForm, designation: e.target.value })}
                                className="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">Division</label>
                            <select
                                value={editForm.division || ""}
                                onChange={(e) => setEditForm({ ...editForm, division: e.target.value })}
                                className="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">Select Division</option>
                                {MINISTRY_DIVISIONS.map((div) => (
                                    <option key={div} value={div}>{div}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">Email</label>
                            <input
                                type="email"
                                value={editForm.email || ""}
                                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                                className="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">Appointment Date</label>
                            <input
                                type="date"
                                value={editForm.appointment_date || ""}
                                onChange={(e) => setEditForm({ ...editForm, appointment_date: e.target.value })}
                                className="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-600 dark:text-gray-300 mb-1">Status</label>
                            <select
                                value={editForm.status || ""}
                                onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                                className="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-white text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="Active">Active</option>
                                <option value="Inactive">Inactive</option>
                                <option value="On Leave">On Leave</option>
                            </select>
                        </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                        <button
                            onClick={() => handleSaveEdit(editing)}
                            className="px-4 py-1.5 bg-[#056608] text-white text-sm rounded-lg hover:bg-[#008000] transition-colors font-medium"
                        >
                            Save Changes
                        </button>
                        <button
                            onClick={handleCancelEdit}
                            className="px-4 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-sm rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {showCreate ? (
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-4 mb-4">
                    <CreateEmployee />
                </div>
            ) : (
                <DataTable
                    columns={columns}
                    data={divisionEmployees}
                    mobileRender={mobileRender}
                    options={{
                        searchFields: ["name", "designation", "division", "email"],
                        filterConfig: [
                            { key: "designation", label: "Designation" },
                            { key: "division", label: "Division", options: MINISTRY_DIVISIONS },
                            { key: "status", label: "Status" },
                        ],
                        itemsPerPage: 10,
                    }}
                    label="employees"
                />
            )}
        </div>
    );
}

export default Employee;