const DEFAULT_BANDS = Object.freeze([
  { min: 1, max: 4, label: "Low" },
  { min: 5, max: 9, label: "Medium" },
  { min: 10, max: 16, label: "High" },
  { min: 17, max: 25, label: "Very High" }
]);

function getBand(score, bands = DEFAULT_BANDS) {
  return bands.find((band) => score >= band.min && score <= band.max)?.label || null;
}

function calculateRiskRating({ consequence, likelihood, bands = DEFAULT_BANDS }) {
  if (consequence === 0 || consequence === "0") {
    return {
      score: null,
      band: null
    };
  }

  const numericConsequence = Number(consequence);
  const numericLikelihood = Number(likelihood);

  if (!Number.isInteger(numericConsequence) || !Number.isInteger(numericLikelihood)) {
    throw new Error("Consequence and likelihood must be integers");
  }

  if (numericConsequence < 1 || numericConsequence > 5 || numericLikelihood < 1 || numericLikelihood > 5) {
    throw new Error("Consequence and likelihood must be within the configured 1-5 matrix range");
  }

  const score = numericConsequence * numericLikelihood;

  return {
    score,
    band: getBand(score, bands)
  };
}

module.exports = {
  DEFAULT_BANDS,
  calculateRiskRating,
  getBand
};
