import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import Login from './App.jsx'
import AdminSignup from './AdminSignup.jsx'
import AdminDashboard from './Admin/AdminDashboard.jsx'
import UserDashboard from './User/userDashboard.jsx'
import HODDashboard from './HOD/hoddashboard.jsx'
import ProtectedRoute from './Components/ProtectedRoute.jsx'
import { NotificationProvider } from './hooks/NotificationContext.jsx'
import { LeaveProvider } from './hooks/LeaveContext.jsx'
import { UserProvider } from './hooks/UserContext.jsx'
import { SignatureProvider } from './hooks/SignatureContext.jsx'
import {ThemeProvider} from './hooks/ThemeContext.jsx'
import HODSignup from './HODSignup.jsx'
import ResetPassword from './ResetPassword.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    
<BrowserRouter>
<ThemeProvider>
      <UserProvider>
        <SignatureProvider>
          <NotificationProvider>
            <LeaveProvider>
              <Routes>
                <Route path="/" element={<Login />} />
                <Route path="/admin-signup" element={<AdminSignup />} />
                <Route path="/hod-signup" element={<HODSignup />} />
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
              </Routes>
            </LeaveProvider>
          </NotificationProvider>
        </SignatureProvider>
      </UserProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)
