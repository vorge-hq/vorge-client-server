import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { canAccessFacility, canSwitchToRole, demoSession, isRoleMfaRequired } from "./session";

const AuthContext = createContext(null);

export function AuthProvider({ children, initialSession = demoSession }) {
  const [session, setSession] = useState(initialSession);

  const switchRole = useCallback(
    (role) => {
      if (!session) {
        return false;
      }

      if (!canSwitchToRole(session, role)) {
        return false;
      }

      setSession((current) => ({
        ...current,
        actingRole: role,
        mfaSatisfied: isRoleMfaRequired(role) ? Boolean(current.user?.mfaEnabled) : true
      }));
      return true;
    },
    [session]
  );

  const switchFacility = useCallback(
    (facilityId) => {
      if (!session) {
        return false;
      }

      if (!canAccessFacility(session, facilityId)) {
        return false;
      }

      const next = session.facilities.find((facility) => facility.id === facilityId);
      setSession((current) => ({ ...current, facility: next }));
      return true;
    },
    [session]
  );

  const logout = useCallback(() => setSession(null), []);

  const login = useCallback((nextSession) => setSession(nextSession), []);

  const value = useMemo(
    () => ({ session, switchRole, switchFacility, logout, login }),
    [session, switchRole, switchFacility, logout, login]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);

  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return value;
}
