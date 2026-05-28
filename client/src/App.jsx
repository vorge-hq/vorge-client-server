import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { ROLES } from "./auth/session";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { AppShell } from "./layouts/AppShell";
import { LoginPage } from "./pages/auth/LoginPage";
import { ForgotPasswordPage } from "./pages/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/auth/ResetPasswordPage";
import { MfaVerifyPage } from "./pages/auth/MfaVerifyPage";
import { MfaEnrollPage } from "./pages/auth/MfaEnrollPage";
import { MfaLockoutPage } from "./pages/auth/MfaLockoutPage";
import { MfaSettingsPage } from "./pages/auth/MfaSettingsPage";
import { DashboardPage } from "./pages/dashboards/DashboardPage";
import { AssessmentsListPage } from "./pages/assessments/AssessmentsListPage";
import { AssessmentWorkspacePage } from "./pages/assessments/AssessmentWorkspacePage";
import { MitigationsPage } from "./pages/mitigations/MitigationsPage";
import { AdminPage } from "./pages/admin/AdminPage";
import { AuditPage } from "./pages/audit/AuditPage";
import { FieldModePage } from "./pages/fieldMode/FieldModePage";
import { NotificationsPage } from "./pages/notifications/NotificationsPage";
import { WorkspaceProvider } from "./features/assessmentWorkspace/WorkspaceContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { DemoMobileGate } from "./components/demo/DemoMobileGate";
import { Toast } from "./components/Toast";
import { useTheme } from "./hooks/useTheme";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      {/* MFA pages: outside AppShell so they render full-screen. They self-check
          that a session token is present and redirect to /login if not. */}
      <Route path="/mfa/verify" element={<MfaVerifyPage />} />
      <Route path="/mfa/enroll" element={<MfaEnrollPage />} />
      <Route path="/mfa/lockout" element={<MfaLockoutPage />} />
      <Route path="/settings/mfa" element={<MfaSettingsPage />} />
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
  useTheme();
  return (
    <ErrorBoundary>
      <DemoMobileGate>
        <AuthProvider>
          <WorkspaceProvider>
            <AppRoutes />
            <Toast />
          </WorkspaceProvider>
        </AuthProvider>
      </DemoMobileGate>
    </ErrorBoundary>
  );
}
