// P4 · O7 — the cross-facility consistency rationale prompt (§9.3). The nightly
// job has ALREADY decided what is an outlier (services/consistencyService.js does
// the statistics, deterministically and for free). The model's only job here is
// the prose: explain to an HQ Executive what might justify or question the
// divergence, in the shape §9.3 gives as its worked example:
//
//   "Maritime threat at Bonny Inland Depot rated Low while 16 of 18 peer
//    facilities rated it High; rationale references diminishing pirate activity,
//    but peer rationales reference recent escalation. Worth review."
//
// This is the ONE prompt that legitimately spans facilities — peer scenario text
// is the whole point. It stays inside a single operator's portfolio; the job
// passes its facilities through buildOperatorPromptContext first, which throws on
// cross-OPERATOR data (§17.5: "Cross-operator data leakage is a critical security
// failure"). No SDK import here.
//
// kind:'text' (not 'object'): the output is one prose paragraph stored verbatim
// in consistency_flags.rationale, with no fields to destructure.

function truncate(text, max = 400) {
  const value = String(text || "").trim();
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function peerLine(peer) {
  const scenario = truncate(peer.scenario, 200);
  return `- ${peer.facilityName} rated ${peer.rating}${scenario ? `: ${scenario}` : ""}`;
}

// `flag` is a consistencyService outlier; `subject` is the outlier facility's
// own row; `peers` are the other facilities' rows in the same cluster. Ratings
// are the 1-25 R1 product (consequence x likelihood), which is what the
// statistics ran on — the prompt says so rather than letting the model guess.
function buildConsistencyPrompt({ flag, subject, peers = [] }) {
  return [
    "You explain statistical outliers in Security Risk Assessment ratings to an executive audience.",
    "",
    `A nightly comparison found that ${subject.facilityName} rates this scenario ${flag.direction} its peers`,
    "in the same portfolio. The statistics are already established and are NOT in question — do not recompute",
    "or dispute them. Explain what might justify or question the divergence.",
    "",
    "Scenario cluster:",
    `- threat type: ${flag.threatType || "unspecified"}`,
    `- asset class: ${flag.assetClass || "unspecified"}`,
    "",
    `Outlier — ${subject.facilityName}:`,
    // flag.rating is the facility's cluster MEAN, so it can be fractional —
    // present it as one, not as a single evaluation's product.
    `- risk rating: ${Math.round(flag.rating * 10) / 10} (mean of its evaluations here; consequence x likelihood, 1-25 scale)`,
    `- its stated rationale: ${truncate(subject.scenario) || "(none given)"}`,
    subject.vulnerabilities ? `- stated vulnerabilities: ${truncate(subject.vulnerabilities, 200)}` : "",
    "",
    `Peers (${peers.length} facilities, mean rating ${flag.peerMean.toFixed(1)}):`,
    peers.map(peerLine).join("\n"),
    "",
    `Divergence: ${flag.divergenceSigma} standard deviations ${flag.direction} the peer mean.`,
    "",
    "Write 2 to 3 sentences, plain English, for an HQ Executive:",
    "1. State the divergence concretely (facility, threat, its rating vs how many peers rated it otherwise).",
    "2. Contrast what its rationale references against what peer rationales reference.",
    "3. End with whether this looks worth review.",
    "Base every claim ONLY on the text above. If the rationales give you nothing to contrast, say the",
    "divergence is unexplained by the stated rationale rather than inventing a cause. No bullet points,",
    "no preamble, no recommendations beyond whether to review."
  ]
    .filter((line) => line !== "")
    .join("\n");
}

module.exports = { buildConsistencyPrompt };
