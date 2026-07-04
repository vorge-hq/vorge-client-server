// P4 · O2 — facility_entitlements reads. Add-on features (anomaly_detection,
// consistency_flagging, offline_mode) are OFF unless an enabled=true row exists.
// Base features (semantic search, tagging, drafted summaries) have NO rows and
// are always on — runAiCall only consults this for the gated features.
//
// The write surface (owner-only toggle) ships in O9; this module stays read-only
// for now.
const { activeConn } = require("../db/requestScope");

// True only when an enabled row exists for (facility, feature). Absent row →
// false (add-on disabled by default), which is the safe posture.
async function isFeatureEnabled({ facilityId, featureKey }, conn = activeConn()) {
  if (!facilityId) {
    return false;
  }
  const row = await conn("facility_entitlements")
    .where({ facility_id: facilityId, feature_key: featureKey })
    .first();
  return Boolean(row && row.enabled);
}

module.exports = { isFeatureEnabled };
