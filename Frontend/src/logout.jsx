import { useNavigate } from "react-router-dom";
import { useUser } from "./hooks/UserContext.jsx";

/**
 * Hook that logs the user out via UserContext and redirects to the login page.
 * Use this in any component that needs a logout action.
 */
export function useLogout() {
    const navigate = useNavigate();
    const { logout } = useUser();

    const handleLogout = () => {
        try {
            logout(); // clears context + localStorage/sessionStorage
            navigate("/");
        } catch (error) {
            console.error("Logout failed:", error);
        }
    };

    return handleLogout;
}

export default useLogout;
