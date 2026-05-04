import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { ROLES } from "./auth/session";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { AppShell } from "./layouts/AppShell";
import { LoginPage } from "./pages/auth/LoginPage";
import { DashboardPage } from "./pages/dashboards/DashboardPage";
import { AssessmentsListPage } from "./pages/assessments/AssessmentsListPage";
import { AssessmentWorkspacePage } from "./pages/assessments/AssessmentWorkspacePage";
import { MitigationsPage } from "./pages/mitigations/MitigationsPage";
import { AdminPage } from "./pages/admin/AdminPage";
import { AuditPage } from "./pages/audit/AuditPage";
import { FieldModePage } from "./pages/fieldMode/FieldModePage";
import { NotificationsPage } from "./pages/notifications/NotificationsPage";
import { WorkspaceProvider } from "./features/assessmentWorkspace/WorkspaceContext";
import { Toast } from "./components/Toast";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/assessments" element={<AssessmentsListPage />} />
          <Route
            path="/assessments/:assessmentId/sections/:sectionId"
            element={<AssessmentWorkspacePage />}
          />
          <Route element={<ProtectedRoute requiredRoles={[ROLES.MITIGATION_OWNER]} />}>
            <Route path="/mitigations" element={<MitigationsPage />} />
          </Route>
          <Route element={<ProtectedRoute requiredRoles={[ROLES.ADMIN]} />}>
            <Route path="/admin" element={<AdminPage />} />
          </Route>
          <Route path="/audit" element={<AuditPage />} />
          <Route path="/field-mode" element={<FieldModePage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <WorkspaceProvider>
        <AppRoutes />
        <Toast />
      </WorkspaceProvider>
    </AuthProvider>
  );
}
