import { ROLES } from "../../auth/session";

const ADMIN_ONLY_ACTIONS = new Set(["sign-in"]);

export function isAdminViewer(role) {
  return role === ROLES.ADMIN;
}

export function filterAuditEntriesForRole(entries = [], role) {
  if (isAdminViewer(role)) return entries;
  return entries.filter((entry) => !ADMIN_ONLY_ACTIONS.has(entry.action));
}

export function visibleIp(role, ip) {
  return isAdminViewer(role) ? ip : null;
}
