import { isDemoEnabled } from "../auth/demoFlag";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

const SESSION_STORAGE_KEY = "vantage.session";
const TOKEN_STORAGE_KEY = "vantage.session.token";

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

function clearStoredSession() {
  if (typeof window === "undefined" || !window.localStorage) return;
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export async function apiRequest(path, { token, actingRole, ...options } = {}) {
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
    headers
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
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
