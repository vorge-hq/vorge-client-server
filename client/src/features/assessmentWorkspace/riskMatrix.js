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
  LOW: {
    id: "Low",
    key: "low",
    min: 1,
    max: 4,
    fg: "text-severity-low-text",
    bg: "bg-severity-low-bg",
    fill: "bg-severity-low-fill"
  },
  MEDIUM: {
    id: "Medium",
    key: "medium",
    min: 5,
    max: 9,
    fg: "text-severity-medium-text",
    bg: "bg-severity-medium-bg",
    fill: "bg-severity-medium-fill"
  },
  HIGH: {
    id: "High",
    key: "high",
    min: 10,
    max: 15,
    fg: "text-severity-high-text",
    bg: "bg-severity-high-bg",
    fill: "bg-severity-high-fill"
  },
  VERY_HIGH: {
    id: "Very High",
    key: "very-high",
    min: 16,
    max: 25,
    fg: "text-severity-very-high-text",
    bg: "bg-severity-very-high-bg",
    fill: "bg-severity-very-high-fill"
  }
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
  return band ? `${band.fg} ${band.bg}` : "text-text-muted bg-surface-muted";
}

export function getBandFillClass(bandId) {
  const band = Object.values(RISK_BANDS).find((entry) => entry.id === bandId);
  return band ? band.fill : "bg-surface-muted";
}
