export const LIKELIHOOD_LABELS = Object.freeze([
  "Rare",
  "Unlikely",
  "Possible",
  "Likely",
  "Almost Certain"
]);

export const CONSEQUENCE_LABELS = Object.freeze([
  "No effect",
  "Slight",
  "Minor",
  "Moderate",
  "Major",
  "Catastrophic"
]);

export const CONSEQUENCE_AXES = Object.freeze(["People", "Assets", "Environment", "Reputation"]);

export const RISK_BANDS = Object.freeze({
  LOW: { id: "Low", min: 1, max: 4, fg: "text-risk-low", bg: "bg-risk-low-bg" },
  MEDIUM: { id: "Medium", min: 5, max: 9, fg: "text-risk-medium", bg: "bg-risk-medium-bg" },
  HIGH: { id: "High", min: 10, max: 15, fg: "text-risk-high", bg: "bg-risk-high-bg" },
  VERY_HIGH: { id: "Very High", min: 16, max: 25, fg: "text-risk-very-high", bg: "bg-risk-very-high-bg" }
});

export const SEVERITY_BANDS = RISK_BANDS;

export function calculateRisk(consequence, likelihood) {
  if (consequence === 0 || consequence == null || likelihood == null || likelihood < 1) {
    return { score: null, band: null, label: "—" };
  }

  const score = consequence * likelihood;
  const band = getBandForScore(score);

  return { score, band: band?.id ?? null, label: band ? `${band.id} (${score})` : `${score}` };
}

export function getBandForScore(score) {
  if (score == null) {
    return null;
  }

  if (score >= RISK_BANDS.VERY_HIGH.min) {
    return RISK_BANDS.VERY_HIGH;
  }

  if (score >= RISK_BANDS.HIGH.min) {
    return RISK_BANDS.HIGH;
  }

  if (score >= RISK_BANDS.MEDIUM.min) {
    return RISK_BANDS.MEDIUM;
  }

  return RISK_BANDS.LOW;
}

export function getBandClasses(bandId) {
  const band = Object.values(RISK_BANDS).find((entry) => entry.id === bandId);
  return band ? `${band.fg} ${band.bg}` : "text-slate-600 bg-slate-100";
}
