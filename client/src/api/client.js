import { isDemoEnabled } from "../auth/demoFlag";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

const SESSION_STORAGE_KEY = "vantage.session";
const TOKEN_STORAGE_KEY = "vantage.session.token";
const REFRESH_PATH = "/api/auth/refresh";

let refreshPromise = null;

export class ApiError extends Error {
  constructor(error, status) {
    super(error?.message || "API request failed");
    this.name = "ApiError";
    this.status = status;
    this.code = error?.code || "API_ERROR";
    this.details = error?.details || {};
  }
}

function readStoredToken() {
  if (isDemoEnabled()) return null;
  if (typeof window === "undefined" || !window.localStorage) return null;
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

function readStoredSession() {
  if (typeof window === "undefined" || !window.localStorage) return null;
  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeSession(session, token) {
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

function clearStoredSession() {
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

async function performRefresh() {
  const response = await fetch(`${API_BASE_URL}${REFRESH_PATH}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" }
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(payload.error, response.status);
  }

  const { token, user, actingRole, roles, facilities } = payload;
  const existing = readStoredSession() || {};
  const nextSession = {
    ...existing,
    user: user || existing.user,
    actingRole: actingRole || existing.actingRole,
    roles: roles || existing.roles,
    facilities: facilities || existing.facilities,
    facility: existing.facility || facilities?.[0],
    token,
    mfaSatisfied: existing.mfaSatisfied ?? true,
    demo: false
  };
  writeSession(nextSession, token);
  return token;
}

function refreshAccessToken() {
  if (refreshPromise) {
    return refreshPromise;
  }
  refreshPromise = performRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

export async function apiRequest(path, { token, actingRole, _isRetry, ...options } = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  const storedToken = token ?? readStoredToken();
  if (storedToken) {
    headers.Authorization = `Bearer ${storedToken}`;
  }

  if (actingRole) {
    headers["X-Acting-Role"] = actingRole;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: "include"
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorCode = payload?.error?.code;

    // Refreshable 401: try one refresh + retry. Only when:
    //   - status is 401 AND code is INVALID_TOKEN (not credentials, not role)
    //   - not already inside a retry attempt
    //   - not the refresh endpoint itself (avoid infinite loop)
    //   - not demo mode
    //   - we have a stored token (no point refreshing if we never had one)
    if (
      response.status === 401 &&
      errorCode === "INVALID_TOKEN" &&
      !_isRetry &&
      path !== REFRESH_PATH &&
      !isDemoEnabled() &&
      readStoredToken()
    ) {
      try {
        const newToken = await refreshAccessToken();
        return apiRequest(path, { ...arguments[1], token: newToken, _isRetry: true });
      } catch (refreshError) {
        clearStoredSession();
        if (typeof window !== "undefined") {
          window.location.href = "/login";
        }
        throw refreshError;
      }
    }

    // Non-refreshable 401 with a stored token: existing behavior — clear + redirect.
    if (
      response.status === 401 &&
      !isDemoEnabled() &&
      !token &&
      readStoredToken() &&
      typeof window !== "undefined"
    ) {
      clearStoredSession();
      window.location.href = "/login";
    }
    throw new ApiError(payload.error, response.status);
  }

  return payload;
}
