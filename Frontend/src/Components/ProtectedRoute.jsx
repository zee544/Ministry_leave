import { Navigate, useLocation } from "react-router-dom";
import { useUser } from "../hooks/UserContext.jsx";

/**
 * Route guard that redirects to the login page when the user is not authenticated.
 * Optionally restricts access to a specific set of roles.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - The protected content
 * @param {Array<string>} [props.roles] - Allowed roles (e.g. ["admin", "hod", "employee"])
 */
function ProtectedRoute({ children, roles }) {
  const { isAuthenticated, currentUser } = useUser();
  const location = useLocation();

  if (!isAuthenticated) {
    // Not logged in -> redirect to login, remember where they tried to go
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }

  // Role-restricted route
  if (roles && roles.length > 0 && !roles.includes(currentUser.role)) {
    // Logged in but wrong role -> send to their own dashboard
    const fallback = currentUser.role === "admin" ? "/Admindashboard" : currentUser.role === "hod" ? "/hoddashboard" : "/userdashboard";
    return <Navigate to={fallback} replace />;
  }

  return children;
}

export default ProtectedRoute;
