import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ROLES, isAuthenticated } from "../auth/session";
import { getHomeRouteForRole } from "../features/navigation/navigation";

export function ProtectedRoute({ requiredRoles = [] }) {
  const { session } = useAuth();

  if (!isAuthenticated(session)) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRoles.length > 0 && !requiredRoles.includes(session.actingRole)) {
    return <Navigate to={getHomeRouteForRole(session.actingRole)} replace />;
  }

  if (
    session.actingRole === ROLES.MITIGATION_OWNER &&
    requiredRoles.length === 0
  ) {
    return <Outlet />;
  }

  return <Outlet />;
}
