export const NOTIFICATION_TYPES = Object.freeze([
  "assessment-submitted",
  "review-complete",
  "approved",
  "send-back",
  "rejection",
  "comment",
  "lock",
  "ai-flag",
  "version-created",
  "mitigation-overdue",
  "mitigation-done",
  "mitigation-inherited"
]);

const SEVERITY_STYLES = Object.freeze({
  warn: "bg-amber-50 text-amber-900 border-amber-200",
  danger: "bg-red-50 text-red-900 border-red-200",
  info: "bg-zinc-50 text-zinc-800 border-zinc-200"
});

export function getNotificationToneClasses(severity) {
  return SEVERITY_STYLES[severity] || SEVERITY_STYLES.info;
}

export function countUnread(notifications, role) {
  return notifications.filter(
    (notification) =>
      !notification.read && (!role || notification.targetRoles.includes(role) || notification.targetRoles.includes("*"))
  ).length;
}

export function filterForRole(notifications, role) {
  if (!role) {
    return notifications;
  }

  return notifications.filter(
    (notification) => notification.targetRoles.includes(role) || notification.targetRoles.includes("*")
  );
}
