import { useAuth } from "../../auth/AuthContext";
import { detectAssetAnomaly } from "../../data/assets";
import { useWorkspace } from "./WorkspaceContext";

/* Rule id for the Section-3 asset criticality-vs-consequences anomaly.
   Acknowledgements are keyed by this id so AD-2 rules can add their own
   ids without collision. */
export const ASSET_ANOMALY_RULE_ID = "asset-criticality-consequences";

/* AD-1 advisory acknowledgement for a Section-3 asset.

   An acknowledgement is only "valid" (warning suppressed) when it belongs
   to the current Author AND the criticality/consequences snapshot stored
   at ack time still matches the asset. Editing either field invalidates
   the snapshot, so the warning re-fires with no explicit clear. Dismissal
   is per-Author: a different user sees the warning fresh. */
export function useAnomalyAcknowledgement(asset) {
  const { session } = useAuth();
  const { acknowledgeAnomaly } = useWorkspace();
  const userId = session?.user?.id || null;

  const message = asset ? detectAssetAnomaly(asset) : null;
  const ack = asset?.anomalyAcks?.[ASSET_ANOMALY_RULE_ID];
  const acknowledged = Boolean(
    message &&
      ack &&
      ack.userId === userId &&
      ack.criticalityAt === asset.criticality &&
      ack.consequencesAt === asset.consequences
  );

  function acknowledge(reason, note) {
    return acknowledgeAnomaly({
      assetId: asset.id,
      ruleId: ASSET_ANOMALY_RULE_ID,
      reason,
      note,
      actor: { userId, name: session?.user?.name, role: session?.actingRole }
    });
  }

  return {
    message,
    flagged: Boolean(message),
    acknowledged,
    ackReason: acknowledged ? ack.reason : null,
    acknowledge
  };
}
