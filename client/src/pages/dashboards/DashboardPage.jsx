import { Navigate } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
import { ROLES } from "../../auth/session";
import { getHomeRouteForRole } from "../../features/navigation/navigation";
import { AdminDashboard } from "./AdminDashboard";
import { ApproverDashboard } from "./ApproverDashboard";
import { AuthorDashboard } from "./AuthorDashboard";
import { HQExecutiveDashboard } from "./HQExecutiveDashboard";
import { ReviewerDashboard } from "./ReviewerDashboard";
import { GuestDashboard } from "./GuestDashboard";
import { Banner } from "../../components/Banner";

export function DashboardPage() {
  const { session } = useAuth();

  switch (session.actingRole) {
    case ROLES.AUTHOR:
      return <AuthorDashboard />;
    case ROLES.REVIEWER:
      return <ReviewerDashboard />;
    case ROLES.APPROVER:
      return <ApproverDashboard />;
    case ROLES.HQ_EXECUTIVE:
      return <HQExecutiveDashboard />;
    case ROLES.ADMIN:
      return <AdminDashboard />;
    case ROLES.MITIGATION_OWNER:
      return <Navigate to={getHomeRouteForRole(ROLES.MITIGATION_OWNER)} replace />;
    case ROLES.GUEST:
      return <GuestDashboard />;
    default:
      return (
        <Banner tone="info" title="Dashboard unavailable">
          No dashboard configured for the current acting role.
        </Banner>
      );
  }
}
