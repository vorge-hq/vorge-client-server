export function getOfflineModeMessage({ isOnline, hasCheckout, syncQueueLength = 0 }) {
  if (isOnline) {
    return syncQueueLength > 0
      ? `${syncQueueLength} offline change(s) are queued for sync.`
      : "Online: field mode checkout is available for supported sections.";
  }

  if (hasCheckout) {
    return "Offline with checkout: continue in the checked-out section and sync when online.";
  }

  return "Offline read-only: reconnect or check out a section before field edits.";
}

export function isOnlineOnlyFeature(featureName) {
  return ["approvals", "hq-dashboard", "ai"].includes(featureName);
}
