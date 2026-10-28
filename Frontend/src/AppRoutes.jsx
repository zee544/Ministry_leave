import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import Login from "./App.jsx";
import ProtectedRoute from "./Components/ProtectedRoute.jsx";

const AdminSignup = lazy(() => import("./AdminSignup.jsx"));
const AdminDashboard = lazy(() => import("./Admin/AdminDashboard.jsx"));
const UserDashboard = lazy(() => import("./User/userDashboard.jsx"));
const HODDashboard = lazy(() => import("./HOD/hoddashboard.jsx"));
const HODSignup = lazy(() => import("./HODSignup.jsx"));
const ResetPassword = lazy(() => import("./ResetPassword.jsx"));
const SecretaryDashboard = lazy(() => import("./Secretary/SecretaryDashboard.jsx"));
const ExecutiveOfficerDashboard = lazy(() => import("./Executive/ExecutiveOfficerDashboard.jsx"));
const SecretarySignup = lazy(() => import("./pages/SecretarySignup.jsx"));
const ExecutiveOfficerSignup = lazy(() => import("./pages/ExecutiveOfficerSignup.jsx"));

export default function AppRoutes() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-500">Loading page...</div>}>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/admin-signup" element={<AdminSignup />} />
        <Route path="/hod-signup" element={<HODSignup />} />
        <Route path="/secretary-signup" element={<SecretarySignup />} />
        <Route path="/executive-officer-signup" element={<ExecutiveOfficerSignup />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route
          path="/Admindashboard"
          element={
            <ProtectedRoute roles={["admin"]}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/userdashboard"
          element={
            <ProtectedRoute roles={["employee"]}>
              <UserDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/hoddashboard"
          element={
            <ProtectedRoute roles={["hod"]}>
              <HODDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/secretarydashboard"
          element={
            <ProtectedRoute roles={["secretary"]}>
              <SecretaryDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/executive-officer-dashboard"
          element={
            <ProtectedRoute roles={["executive_officer"]}>
              <ExecutiveOfficerDashboard />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Suspense>
  );
}
