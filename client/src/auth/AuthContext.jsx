import { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  canAccessFacility,
  canDemoSwitchToRole,
  canSwitchToRole,
  demoSession,
  getDemoPersona,
  isRoleMfaRequired
} from "./session";
import { isDemoEnabled } from "./demoFlag";
import { apiRequest } from "../api/client";
import { SESSION_STORAGE_KEY, TOKEN_STORAGE_KEY } from "../config/storageKeys";

const AuthContext = createContext(null);

function readStoredSession() {
  if (isDemoEnabled()) return null;
  if (typeof window === "undefined" || !window.localStorage) return null;
  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    return null;
  }
}

function defaultInitialSession() {
  if (isDemoEnabled()) return demoSession;
  return readStoredSession();
}

export function AuthProvider({ children, initialSession }) {
  const [session, setSession] = useState(() =>
    initialSession === undefined ? defaultInitialSession() : initialSession
  );

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

  const switchDemoRole = useCallback(
    (role) => {
      if (!isDemoEnabled()) return null;
      if (!session) return null;
      if (!canDemoSwitchToRole(session, role)) return null;

      const persona = getDemoPersona(role);
      const targetHome = persona?.home || "/dashboard";

      setSession((current) => {
        const next = {
          ...current,
          actingRole: role,
          mfaSatisfied: isRoleMfaRequired(role) ? Boolean(current.user?.mfaEnabled) : true
        };

        if (current.demo && persona) {
          next.user = {
            id: persona.userId,
            name: persona.name,
            initials: persona.initials,
            email: persona.email,
            title: persona.title,
            mfaEnabled: persona.mfaEnabled
          };
          next.mfaSatisfied = !persona.mfaEnabled || Boolean(persona.mfaEnabled);
          if (!current.roles.includes(role)) {
            next.roles = [...current.roles, role];
          }
        }

        return next;
      });

      return targetHome;
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

  const logout = useCallback(() => {
    if (!isDemoEnabled()) {
      // Fire-and-forget: dispatch the revocation request before we clear the
      // token, but never block the UI on it. apiRequest reads the token
      // synchronously, so the Authorization header is captured before the
      // localStorage removeItem calls below.
      apiRequest("/api/auth/logout", { method: "POST" }).catch(() => {});
    }
    setSession(null);
    if (!isDemoEnabled() && typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  }, []);

  const login = useCallback((nextSession) => setSession(nextSession), []);

  const value = useMemo(
    () => ({ session, switchRole, switchDemoRole, switchFacility, logout, login }),
    [session, switchRole, switchDemoRole, switchFacility, logout, login]
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
