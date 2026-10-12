import { createContext, useContext, useState, useCallback, useEffect } from "react";

const UserContext = createContext();

// Current logged-in user (in a real app this comes from auth/session)
const DEFAULT_USER = {
  name: "Nancy Moraa",
  email: "nancy.moraa@ministry.gov.lk",
  designation: "Procurement Officer",
  division: "Administration",
  role: "employee",
  employeeId: "EMP-2023-0042",
};

// Standard leave types across the ministry system
export const LEAVE_TYPES = ["Annual", "Casual", "Half-day", "Other"];

// Leave entitlements per type (used by the profile page to derive balances)
const LEAVE_ENTITLEMENTS = {
  Annual: { total: 24, color: "bg-blue-500" },
  Casual: { total: 21, color: "bg-green-500" },
  Other: { total: 0, color: "bg-purple-500" },
};

export const MINISTRY_DIVISIONS = [
  "Accounts",
  "Administration",
  "Agriculture",
  "Development",
  "Engineering",
  "Fisheries & Ocean Resources",
  "Government Audit",
  "Human Resources",
  "Legal",
  "Planning",
  "Statistics",
  "Technical",
];

// All employees in the system (shared data source / local fallback)
const ALL_EMPLOYEES = [
  { id: 1, name: "John Kamau", designation: "Senior Officer", division: "Agriculture", email: "john.kamau@ministry.gov.lk", appointment_date: "2020-03-15", status: "Active" },
  { id: 2, name: "Mary Wanjiku", designation: "Research Assistant", division: "Planning", email: "mary.wanjiku@ministry.gov.lk", appointment_date: "2021-06-01", status: "Active" },
  { id: 3, name: "Peter Otieno", designation: "Technical Officer", division: "Technical", email: "peter.otieno@ministry.gov.lk", appointment_date: "2019-11-20", status: "Active" },
  { id: 4, name: "Grace Akinyi", designation: "Administrative Officer", division: "Administration", email: "grace.akinyi@ministry.gov.lk", appointment_date: "2022-01-10", status: "Active" },
  { id: 5, name: "David Mwangi", designation: "Accountant", division: "Accounts", email: "david.mwangi@ministry.gov.lk", appointment_date: "2020-07-22", status: "Active" },
  { id: 6, name: "Sarah Chebet", designation: "Development Officer", division: "Development", email: "sarah.chebet@ministry.gov.lk", appointment_date: "2023-02-14", status: "Active" },
  { id: 7, name: "James Omondi", designation: "Engineer", division: "Engineering", email: "james.omondi@ministry.gov.lk", appointment_date: "2021-09-05", status: "Inactive" },
  { id: 8, name: "Emily Nyambura", designation: "Head of Division", division: "Administration", email: "emily.nyambura@ministry.gov.lk", appointment_date: "2018-05-12", status: "Active" },
  { id: 9, name: "Samuel Kiprop", designation: "System Administrator", division: "Administration", email: "samuel.kiprop@ministry.gov.lk", appointment_date: "2022-08-19", status: "Active" },
  { id: 10, name: "Diana Wambui", designation: "Data Analyst", division: "Statistics", email: "diana.wambui@ministry.gov.lk", appointment_date: "2021-11-30", status: "On Leave" },
  { id: 11, name: "Patrick Ochieng", designation: "Senior Accountant", division: "Accounts", email: "patrick.ochieng@ministry.gov.lk", appointment_date: "2017-04-03", status: "Active" },
  { id: 12, name: "Faith Njeri", designation: "Auditor", division: "Government Audit", email: "faith.njeri@ministry.gov.lk", appointment_date: "2020-09-14", status: "Active" },
  { id: 13, name: "George Maina", designation: "Project Coordinator", division: "Development", email: "george.maina@ministry.gov.lk", appointment_date: "2019-02-25", status: "Active" },
  { id: 14, name: "Lucy Akoth", designation: "Junior Officer", division: "Administration", email: "lucy.akoth@ministry.gov.lk", appointment_date: "2023-06-07", status: "Active" },
  { id: 15, name: "Brian Kiplagat", designation: "Civil Engineer", division: "Engineering", email: "brian.kiplagat@ministry.gov.lk", appointment_date: "2021-12-18", status: "Active" },
  { id: 16, name: "Nancy Moraa", designation: "Procurement Officer", division: "Administration", email: "nancy.moraa@ministry.gov.lk", appointment_date: "2020-01-09", status: "Active" },
  { id: 17, name: "Kevin Mutua", designation: "IT Specialist", division: "Technical", email: "kevin.mutua@ministry.gov.lk", appointment_date: "2022-04-22", status: "Active" },
  { id: 18, name: "Agnes Kemunto", designation: "Agricultural Officer", division: "Agriculture", email: "agnes.kemunto@ministry.gov.lk", appointment_date: "2018-08-11", status: "Active" },
  { id: 19, name: "Tom Odhiambo", designation: "Assistant Accountant", division: "Accounts", email: "tom.odhiambo@ministry.gov.lk", appointment_date: "2023-01-28", status: "Active" },
  { id: 20, name: "Rose Wairimu", designation: "Statistician", division: "Statistics", email: "rose.wairimu@ministry.gov.lk", appointment_date: "2021-05-16", status: "Active" },
  { id: 21, name: "Daniel Kariuki", designation: "Senior Engineer", division: "Engineering", email: "daniel.kariuki@ministry.gov.lk", appointment_date: "2016-10-31", status: "Active" },
  { id: 22, name: "Catherine Nekesa", designation: "Administrative Assistant", division: "Administration", email: "catherine.nekesa@ministry.gov.lk", appointment_date: "2022-07-08", status: "Active" },
  { id: 23, name: "Joseph Barasa", designation: "Field Supervisor", division: "Agriculture", email: "joseph.barasa@ministry.gov.lk", appointment_date: "2019-12-01", status: "Active" },
  { id: 24, name: "Hannah Chelangat", designation: "Planning Officer", division: "Planning", email: "hannah.chelangat@ministry.gov.lk", appointment_date: "2023-08-14", status: "Active" },
  { id: 25, name: "Michael Njoroge", designation: "Senior Auditor", division: "Government Audit", email: "michael.njoroge@ministry.gov.lk", appointment_date: "2020-02-20", status: "On Leave" },
  { id: 26, name: "Priscilla Jeptoo", designation: "Compliance Officer", division: "Accounts", email: "priscilla.jeptoo@ministry.gov.lk", appointment_date: "2021-03-26", status: "Active" },
  { id: 27, name: "Sammy Kosgei", designation: "Technical Assistant", division: "Technical", email: "sammy.kosgei@ministry.gov.lk", appointment_date: "2022-10-05", status: "Active" },
  { id: 28, name: "Beatrice Achieng", designation: "HR Assistant", division: "Human Resources", email: "beatrice.achieng@ministry.gov.lk", appointment_date: "2023-04-17", status: "Active" },
  { id: 29, name: "Ken Walela", designation: "Project Manager", division: "Development", email: "ken.walela@ministry.gov.lk", appointment_date: "2017-07-09", status: "Active" },
  { id: 30, name: "Esther Nyang'au", designation: "Senior Statistician", division: "Statistics", email: "esther.nyangau@ministry.gov.lk", appointment_date: "2020-11-23", status: "Inactive" },
  { id: 31, name: "Kavindu Perera", designation: "Marine Biologist", division: "Fisheries & Ocean Resources", email: "kavindu.p@ministry.gov.lk", appointment_date: "2021-04-10", status: "Active" },
  { id: 32, name: "Kasun Fernando", designation: "Legal Officer", division: "Legal", email: "kasun.legal@ministry.gov.lk", appointment_date: "2019-08-15", status: "Active" },
];

function getStoredUser() {
  try {
    const stored = localStorage.getItem("user");
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (parsed && (parsed.division === "Admin" || parsed.division === "admin")) {
      parsed.division = "Administration";
    }
    return parsed;
  } catch (e) {
    return null;
  }
}

export function UserProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => getStoredUser() || DEFAULT_USER);
  const [employees, setEmployees] = useState(ALL_EMPLOYEES);
  const [isAuthenticated, setIsAuthenticated] = useState(() => Boolean(getStoredUser()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchEmployees = useCallback(async (token) => {
    const authToken = token || localStorage.getItem("token");
    
    if (!authToken) {
      setEmployees(ALL_EMPLOYEES);
      return;
    }

    setLoading(true);
    setError(null);
    
    let role = "";
    let userDivision = "";
    let userName = "";
    
    try {
      const userStr = localStorage.getItem("user");
      if (!userStr) {
        setEmployees(ALL_EMPLOYEES);
        setLoading(false);
        return;
      }

      let user;
      try {
        user = JSON.parse(userStr);
      } catch (e) {
        setEmployees(ALL_EMPLOYEES);
        setLoading(false);
        return;
      }

      role = (user.role || "").toLowerCase();
      userDivision = user.division || "";
      userName = user.name || "";

      // EMPLOYEE
      if (role === 'employee') {
        try {
          const actingRes = await fetch("/api/admin/employees/acting-officers", {
            headers: { 
              Authorization: `Bearer ${authToken}`,
              'Content-Type': 'application/json'
            },
          });
          
          if (actingRes.ok) {
            const data = await actingRes.json();
            setEmployees(data);
            setLoading(false);
            return;
          } else if (actingRes.status === 401) {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            setCurrentUser(DEFAULT_USER);
            setIsAuthenticated(false);
            setEmployees(ALL_EMPLOYEES);
            setLoading(false);
            return;
          }
        } catch (err) {
          console.warn("[fetchEmployees] acting-officers fetch failed:", err.message);
        }
        
        const filtered = ALL_EMPLOYEES.filter(emp => 
          emp.division === userDivision && 
          emp.name !== userName &&
          emp.status === 'Active'
        );
        setEmployees(filtered);
        setLoading(false);
        return;
      }

      // ADMIN
      if (role === 'admin') {
        const res = await fetch("/api/admin/employees", {
          headers: { 
            Authorization: `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
        });

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setEmployees(data);
          } else {
            setEmployees(ALL_EMPLOYEES);
          }
          setLoading(false);
          return;
        } else if (res.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          setCurrentUser(DEFAULT_USER);
          setIsAuthenticated(false);
          setEmployees(ALL_EMPLOYEES);
          setLoading(false);
          return;
        }
        
        const filtered = ALL_EMPLOYEES.filter(emp => 
          emp.division === userDivision && 
          emp.status === 'Active'
        );
        setEmployees(filtered);
        setLoading(false);
        return;
      }

      // HOD
      if (role === 'hod') {
        const res = await fetch("/api/admin/employees/acting-officers", {
          headers: { 
            Authorization: `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
        });

        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            setEmployees(data);
          } else {
            setEmployees(ALL_EMPLOYEES);
          }
          setLoading(false);
          return;
        } else if (res.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          setCurrentUser(DEFAULT_USER);
          setIsAuthenticated(false);
          setEmployees(ALL_EMPLOYEES);
          setLoading(false);
          return;
        }
        
        const filtered = ALL_EMPLOYEES.filter(emp => 
          emp.division === userDivision && 
          emp.status === 'Active'
        );
        setEmployees(filtered);
        setLoading(false);
        return;
      }

      setEmployees(ALL_EMPLOYEES);
    } catch (err) {
      console.warn("[fetchEmployees] Error:", err.message);
      setError(err.message);
      
      if (userDivision) {
        const filtered = ALL_EMPLOYEES.filter(emp => 
          emp.division === userDivision && 
          emp.status === 'Active'
        );
        setEmployees(filtered);
      } else {
        setEmployees(ALL_EMPLOYEES);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const userStr = localStorage.getItem("user");
    
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user.role === 'admin' || user.role === 'hod' || user.role === 'employee') {
          fetchEmployees(token);
        }
      } catch (e) {
        console.warn("Failed to parse user on mount");
      }
    }
  }, []);

  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'token' || e.key === 'user') {
        const token = localStorage.getItem("token");
        const userStr = localStorage.getItem("user");
        
        if (token && userStr) {
          try {
            const user = JSON.parse(userStr);
            if (user.role === 'admin' || user.role === 'hod' || user.role === 'employee') {
              fetchEmployees(token);
            }
          } catch (e) {
            console.warn("Failed to parse user on storage change");
          }
        } else {
          setEmployees(ALL_EMPLOYEES);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [fetchEmployees]);

  const addEmployee = useCallback(async (newEmp) => {
    const token = localStorage.getItem("token");
    if (currentUser?.role === "admin" && token) {
      try {
        const res = await fetch("/api/admin/employees", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            name: newEmp.name,
            designation: newEmp.designation,
            email: newEmp.email,
            appointment_date: newEmp.appointment_date,
            password: newEmp.password,
          }),
        });
        if (res.ok) {
          const result = await res.json();
          setEmployees((prev) => [result.employee, ...prev]);
          return result;
        } else {
          const errorData = await res.json();
          throw new Error(errorData.message || "Failed to add employee");
        }
      } catch (err) {
        console.warn("Error saving employee to backend:", err.message);
        throw err;
      }
    }
    
    const newEmployee = {
      id: employees.length ? Math.max(...employees.map((e) => e.id)) + 1 : 1,
      status: "Active",
      ...newEmp,
    };
    setEmployees((prev) => [newEmployee, ...prev]);
    return newEmployee;
  }, [currentUser, employees]);

  const updateEmployee = useCallback(async (id, updatedFields) => {
    const token = localStorage.getItem("token");
    if (currentUser?.role === "admin" && token) {
      try {
        const res = await fetch(`/api/admin/employees/${id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(updatedFields),
        });
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.message || "Failed to update employee");
        }
      } catch (err) {
        console.warn("Error updating employee on backend:", err.message);
        throw err;
      }
    }
    setEmployees((prev) =>
      prev.map((emp) => (emp.id === id ? { ...emp, ...updatedFields } : emp))
    );
  }, [currentUser]);

  const toggleEmployeeStatus = useCallback(async (id) => {
    const token = localStorage.getItem("token");
    if (currentUser?.role === "admin" && token) {
      try {
        const res = await fetch(`/api/admin/employees/${id}/status`, {
          method: "PATCH",
          headers: { 
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
        });
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.message || "Failed to toggle status");
        }
      } catch (err) {
        console.warn("Error toggling employee status on backend:", err.message);
        throw err;
      }
    }
    setEmployees((prev) =>
      prev.map((emp) =>
        emp.id === id
          ? {
              ...emp,
              status: emp.status === "Active" ? "Inactive" : "Active",
            }
          : emp
      )
    );
  }, [currentUser]);

  const login = useCallback((userData, token) => {
    const normalizedData = {
      ...userData,
      division:
        userData.division === "Admin" || userData.division === "admin"
          ? "Administration"
          : userData.division,
    };
    setCurrentUser(normalizedData);
    setIsAuthenticated(true);
    setError(null);
    
    try {
      localStorage.setItem("user", JSON.stringify({ ...DEFAULT_USER, ...normalizedData }));
      if (token) {
        localStorage.setItem("token", token);

        window.dispatchEvent(new Event("auth:login"));

        setTimeout(() => {
          fetchEmployees(token);
        }, 500);
      }
    } catch (e) {
      console.warn("Storage error:", e);
    }
  }, [fetchEmployees]);

  const logout = useCallback(() => {
    setCurrentUser(DEFAULT_USER);
    setIsAuthenticated(false);
    setEmployees(ALL_EMPLOYEES);
    setError(null);
    try {
      localStorage.removeItem("user");
      localStorage.removeItem("token");
      sessionStorage.clear();

      window.dispatchEvent(new Event("auth:logout"));
    } catch (e) {
      // ignore storage errors
    }
  }, []);

  const value = {
    currentUser,
    employees,
    loading,
    error,
    addEmployee,
    updateEmployee,
    toggleEmployeeStatus,
    fetchEmployees,
    leaveEntitlements: LEAVE_ENTITLEMENTS,
    isAuthenticated,
    login,
    logout,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}

export default UserContext;