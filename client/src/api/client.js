const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

export class ApiError extends Error {
  constructor(error, status) {
    super(error?.message || "API request failed");
    this.name = "ApiError";
    this.status = status;
    this.code = error?.code || "API_ERROR";
    this.details = error?.details || {};
  }
}

export async function apiRequest(path, { token, actingRole, ...options } = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
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
    throw new ApiError(payload.error, response.status);
  }

  return payload;
}
