import { useCallback, useEffect, useState } from "react";
import { apiUrl } from "../api.js";
import CreateEmployee from "../Admin/CreateEmployee.jsx";
import DataTable from "../Components/DataTable";
import { MINISTRY_DIVISIONS } from "../hooks/UserContext.jsx";
import { useUser } from "../hooks/UserContext.jsx";

const employeeInputClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white";

function formatAppointmentDate(value) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function HODEmployees() {
  const { currentUser } = useUser();
  const division = currentUser?.division || "";
  const [showCreate, setShowCreate] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [toast, setToast] = useState("");

  const loadEmployees = useCallback(async () => {
    const token = localStorage.getItem("token");
    const response = await fetch(apiUrl("/api/admin/hod/employees"), {
      headers: { Authorization: token },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Failed to fetch employees.");
    setEmployees(data);
  }, []);

  useEffect(() => {
    loadEmployees()
      .catch((loadError) => setError(loadError.message))
      .finally(() => setLoading(false));
  }, [loadEmployees]);

  const createEmployee = useCallback(async (employeeData) => {
    const token = localStorage.getItem("token");
    const response = await fetch(apiUrl("/api/admin/hod/employees"), {
      method: "POST",
      headers: {
        Authorization: token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(employeeData),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Failed to create employee.");

    setEmployees((current) => {
      const alreadyAdded = current.some((employee) =>
        Number(employee.id) === Number(result.employee.id) ||
        employee.email.toLowerCase() === result.employee.email.toLowerCase()
      );
      return alreadyAdded
        ? current
        : [...current, result.employee].sort((a, b) => a.name.localeCompare(b.name));
    });
    return result;
  }, []);

  const handleEdit = (employee) => {
    setError("");
    setEditing(employee.id);
    setEditForm({
      name: employee.name || "",
      designation: employee.designation || "",
      division: employee.division || division,
      email: employee.email || "",
      appointment_date: employee.appointment_date?.slice(0, 10) || "",
      status: employee.status || "Active",
    });
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditForm(null);
    setError("");
  };

  const saveEdit = async (event) => {
    event.preventDefault();
    if (!editForm || savingEdit) return;
    setError("");
    setSavingEdit(true);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(apiUrl(`/api/admin/hod/employees/${editing}`), {
        method: "PUT",
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...editForm, division }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Failed to update employee.");

      setEmployees((current) =>
        current.map((employee) =>
          Number(employee.id) === Number(editing)
            ? { ...employee, ...result.employee }
            : employee
        )
      );
      setEditing(null);
      setEditForm(null);
      setToast("Employee updated successfully.");
      window.setTimeout(() => setToast(""), 3000);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSavingEdit(false);
    }
  };

  const toggleStatus = async (employee) => {
    if (processingId != null) return;
    setError("");
    setProcessingId(employee.id);
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(apiUrl(`/api/admin/hod/employees/${employee.id}/status`), {
        method: "PATCH",
        headers: { Authorization: token },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Failed to update employee status.");

      setEmployees((current) =>
        current.map((item) =>
          Number(item.id) === Number(employee.id)
            ? { ...item, status: result.status }
            : item
        )
      );
      setToast(`${employee.name} is now ${result.status}.`);
      window.setTimeout(() => setToast(""), 3000);
    } catch (statusError) {
      setError(statusError.message);
    } finally {
      setProcessingId(null);
    }
  };

  const columns = [
    {
      key: "rowNum",
      label: "#",
      className: "w-12",
      render: (_employee, { index }) => (
        <span className="font-mono text-xs text-gray-400">{index + 1}</span>
      ),
    },
    { key: "name", label: "Employee" },
    {
      key: "designation",
      label: "Designation",
      render: (employee) => employee.designation || "—",
    },
    { key: "email", label: "Email" },
    {
      key: "appointment_date",
      label: "Appointment Date",
      render: (employee) => formatAppointmentDate(employee.appointment_date),
    },
    {
      key: "status",
      label: "Status",
      render: (employee, { getStatusBadge }) => getStatusBadge(employee.status),
    },
    {
      key: "actions",
      label: "Actions",
      className: "text-right",
      render: (employee) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={() => handleEdit(employee)}
            disabled={processingId != null}
            className="rounded bg-blue-500 px-2.5 py-1 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-60"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => toggleStatus(employee)}
            disabled={processingId != null}
            className={`rounded px-2.5 py-1 text-xs font-medium text-white shadow-sm transition-colors disabled:opacity-60 ${
              employee.status === "Active"
                ? "bg-red-500 hover:bg-red-700"
                : "bg-green-600 hover:bg-green-700"
            }`}
          >
            {processingId === employee.id
              ? "Updating..."
              : employee.status === "Active"
                ? "Deactivate"
                : "Activate"}
          </button>
        </div>
      ),
    },
  ];

  const mobileRender = (employee) => (
    <article className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-gray-800 dark:text-white">{employee.name}</h3>
          <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
            {employee.designation || "No designation"}
          </p>
        </div>
        <span className="shrink-0">{employee.status}</span>
      </div>
      <p className="mt-2 break-all text-xs text-gray-600 dark:text-gray-300">{employee.email}</p>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        Appointment Date: {formatAppointmentDate(employee.appointment_date)}
      </p>
      <div className="mt-3 flex gap-2 border-t border-gray-100 pt-2 dark:border-gray-700">
        <button
          type="button"
          onClick={() => handleEdit(employee)}
          disabled={processingId != null}
          className="flex-1 rounded bg-blue-500 px-2 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => toggleStatus(employee)}
          disabled={processingId != null}
          className={`flex-1 rounded px-2 py-1.5 text-xs font-medium text-white disabled:opacity-60 ${
            employee.status === "Active" ? "bg-red-500 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"
          }`}
        >
          {employee.status === "Active" ? "Deactivate" : "Activate"}
        </button>
      </div>
    </article>
  );

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-xl font-bold text-gray-800 dark:text-white">Division Employees</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage employee accounts in your division.
        </p>
      </header>

      {toast && (
        <div role="status" className="fixed right-4 top-4 z-50 rounded-lg bg-green-600 px-4 py-3 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">
          {error}
        </p>
      )}

      {editing !== null && editForm && (
        <form
          onSubmit={saveEdit}
          className="rounded-xl border border-blue-200 bg-white p-4 shadow-sm dark:border-blue-800 dark:bg-gray-800"
        >
          <h2 className="mb-4 text-base font-bold text-gray-800 dark:text-white">Edit Employee</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-gray-600 dark:text-gray-300">
              Full Name
              <input
                type="text"
                required
                maxLength={100}
                value={editForm.name}
                onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
                className={`${employeeInputClass} mt-1`}
              />
            </label>
            <label className="text-xs font-bold text-gray-600 dark:text-gray-300">
              Designation (Optional)
              <input
                type="text"
                maxLength={100}
                value={editForm.designation}
                onChange={(event) => setEditForm({ ...editForm, designation: event.target.value })}
                className={`${employeeInputClass} mt-1`}
              />
            </label>
            <label className="text-xs font-bold text-gray-600 dark:text-gray-300">
              Division
              <select
                required
                value={editForm.division}
                onChange={(event) => setEditForm({ ...editForm, division: event.target.value })}
                className={`${employeeInputClass} mt-1`}
              >
                {Array.from(new Set([...MINISTRY_DIVISIONS, division])).filter(Boolean).map((item) => (
                  <option key={item} value={item} disabled={item.toLowerCase() !== division.toLowerCase()}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-bold text-gray-600 dark:text-gray-300">
              Email
              <input
                type="email"
                required
                maxLength={150}
                value={editForm.email}
                onChange={(event) => setEditForm({ ...editForm, email: event.target.value })}
                className={`${employeeInputClass} mt-1`}
              />
            </label>
            <label className="text-xs font-bold text-gray-600 dark:text-gray-300">
              Appointment Date
              <input
                type="date"
                value={editForm.appointment_date}
                onChange={(event) => setEditForm({ ...editForm, appointment_date: event.target.value })}
                className={`${employeeInputClass} mt-1 dark:[color-scheme:dark]`}
              />
            </label>
            <label className="text-xs font-bold text-gray-600 dark:text-gray-300">
              Status
              <select
                required
                value={editForm.status}
                onChange={(event) => setEditForm({ ...editForm, status: event.target.value })}
                className={`${employeeInputClass} mt-1`}
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
                <option value="On Leave">On Leave</option>
              </select>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={savingEdit}
              className="rounded-lg bg-[#056608] px-4 py-2 text-sm font-medium text-white hover:bg-[#008000] disabled:opacity-60"
            >
              {savingEdit ? "Saving..." : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              disabled={savingEdit}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {showCreate ? (
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <CreateEmployee
            onCreateEmployee={createEmployee}
            onCancel={() => setShowCreate(false)}
            onSuccessDismiss={() => setShowCreate(false)}
            fixedDivision={division}
          />
        </div>
      ) : (
        <>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              <span className="text-base">+</span>
              <span>Create Employee</span>
            </button>
          </div>
          <DataTable
            columns={columns}
            data={employees}
            mobileRender={mobileRender}
            loading={loading}
            options={{
              searchFields: ["name", "designation", "email"],
              itemsPerPage: 10,
            }}
            label="employees"
            emptyState={{
              title: "No employees in this division",
              message: "Create an employee account to add it to this list.",
            }}
          />
        </>
      )}
    </section>
  );
}

export default HODEmployees;
