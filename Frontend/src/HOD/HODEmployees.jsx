import { useCallback, useEffect, useState } from "react";
import { apiUrl } from "../api.js";
import CreateEmployee from "../Admin/CreateEmployee.jsx";
import { useUser } from "../hooks/UserContext.jsx";

function HODEmployees() {
  const { currentUser } = useUser();
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadEmployees = async () => {
    const token = localStorage.getItem("token");
    const response = await fetch(apiUrl("/api/admin/hod/employees"), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Failed to fetch employees.");
    setEmployees(data);
  };

  useEffect(() => {
    loadEmployees()
      .catch((loadError) => setError(loadError.message))
      .finally(() => setLoading(false));
  }, []);

  const createEmployee = useCallback(async (employeeData) => {
      const token = localStorage.getItem("token");
      const response = await fetch(apiUrl("/api/admin/hod/employees"), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(employeeData),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Failed to create employee.");

      setEmployees((current) => [...current, result.employee].sort((a, b) => a.name.localeCompare(b.name)));
      return result;
  }, []);

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-xl font-bold text-gray-800 dark:text-white">Division Employees</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Create employee accounts for your division. New employees receive a temporary password.
        </p>
      </header>

      <CreateEmployee
        onCreateEmployee={createEmployee}
        fixedDivision={currentUser?.division || ""}
        generateTemporaryPassword
        requireDesignation
        requireAppointmentDate
      />
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-300">{error}</p>}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Designation</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-gray-800 dark:divide-gray-700 dark:text-gray-200">
            {loading ? (
              <tr><td className="px-4 py-4" colSpan={4}>Loading employees...</td></tr>
            ) : employees.length ? employees.map((employee) => (
              <tr key={employee.id}>
                <td className="px-4 py-3">{employee.name}</td>
                <td className="px-4 py-3">{employee.designation}</td>
                <td className="px-4 py-3">{employee.email}</td>
                <td className="px-4 py-3">{employee.status}</td>
              </tr>
            )) : (
              <tr><td className="px-4 py-4 text-gray-500" colSpan={4}>No employees are registered in this division.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default HODEmployees;
