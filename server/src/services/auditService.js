const crypto = require("crypto");

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

function hashAuditEntry(entry, previousHash = null) {
  return crypto
    .createHash("sha256")
    .update(stableStringify({ ...entry, previousHash }))
    .digest("hex");
}

function createAuditEntry({
  actionType,
  userId,
  actingRole,
  facilityId,
  assessmentId = null,
  entityType,
  entityId = null,
  diff = null,
  metadata = {},
  traceId,
  previousHash = null,
  timestamp = new Date()
}) {
  if (!actionType || !userId || !actingRole || !facilityId || !entityType || !traceId) {
    throw new Error("Missing required audit fields");
  }

  const entry = {
    actionType,
    userId,
    actingRole,
    facilityId,
    assessmentId,
    entityType,
    entityId,
    diff,
    metadata,
    traceId,
    timestamp: timestamp.toISOString(),
    previousHash
  };

  return Object.freeze({
    ...entry,
    hash: hashAuditEntry(entry, previousHash)
  });
}

function appendAuditEntry(entries, event) {
  const previousHash = entries.length > 0 ? entries[entries.length - 1].hash : null;
  return [...entries, createAuditEntry({ ...event, previousHash })];
}

module.exports = {
  createAuditEntry,
  appendAuditEntry,
  hashAuditEntry
};
