// P4 · O7 — the statistics behind cross-facility consistency flagging (§9.3).
//
// PURE — no DB, no AI, no I/O, no clock. The nightly job
// (src/jobs/consistencyFlagging.js) does the loading, the AI rationale and the
// writing; every decision about what counts as an outlier lives here, where the
// 95% services coverage gate applies.
//
// The §9.3 model, in order:
//   1. Cluster scenarios across an operator's portfolio by (threat type, asset
//      class) — "same threat type, similar asset class".
//   2. Reduce each FACILITY to one value per cluster (the mean of its ratings
//      there). §9.3 counts peers as facilities — "16 of 18 peer facilities rated
//      it High" — not as individual rows, so a facility with five evaluations in
//      a cluster must not out-vote one with a single evaluation.
//   3. For each facility, compute the mean/sigma of its PEERS (leave-one-out:
//      the candidate is excluded from its own norm). Including it would let a
//      lone extreme value inflate the sigma it is measured against and hide
//      itself — the smaller the portfolio, the worse that gets.
//   4. Flag |value - peerMean| / peerSigma >= 2.
//
// Under-flagging is the house posture (§9.2's rule, and the same reasoning holds
// here): a portfolio too small to have a norm, or peers who all agree exactly,
// produces NO flags rather than a confident-looking number.

// Peers needed before a cluster has a "norm" worth measuring against. Three
// peers (so four facilities in the cluster) is the floor at which a mean and a
// sigma mean anything; below it a single differing facility is not an outlier,
// it is half the sample.
const MIN_PEERS = 3;

// §9.3: "2+ standard deviations from peer norm".
const SIGMA_THRESHOLD = 2;

// The floor under peer sigma, in rating points, and the single most important
// number in this file.
//
// Ratings are a product of two 1-5 axes, so the instrument's own granularity is
// coarse: the smallest change an Author can make (one step on one axis) moves the
// rating by the value of the other axis — typically 2-4 points. A cluster whose
// peers happen to agree tightly (sigma well under a point) therefore produces
// enormous sigma values from differences smaller than the scale can express:
// peers at 12/12/10/12 make a facility at 14 a "2.9 sigma outlier" off a 2.5
// point gap. That is a statistically true, practically meaningless flag — and
// §9.2's binding posture is that a noisy engine trains its audience to ignore
// every warning.
//
// So sigma is floored at 2 rating points before dividing. Two consequences, both
// intended:
//   - tight clusters stop manufacturing outliers from sub-step differences, and
//   - peers who agree EXACTLY (sigma 0) still work rather than being skipped —
//     that is §9.3's own worked example ("16 of 18 peer facilities rated it
//     High"), the clearest outlier there is, and dividing by a real 0 would have
//     made it invisible.
const SIGMA_FLOOR = 2;

function normalizeKeyPart(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

// The cluster identity: same threat type + similar asset class. Stored on the
// flag row, so it must stay stable — changing this silently orphans every
// existing flag's natural key.
function clusterKeyFor({ threatType, assetClass }) {
  return `${normalizeKeyPart(threatType) || "unspecified"}::${normalizeKeyPart(assetClass) || "unspecified"}`;
}

function mean(values) {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// Population sigma (not sample): these are all the peers there are, not a sample
// drawn from a larger population.
function stddev(values, average = mean(values)) {
  if (values.length === 0) {
    return 0;
  }
  const variance = mean(values.map((v) => (v - average) ** 2));
  return Math.sqrt(variance);
}

// §9.3 gives no severity vocabulary; sigma is the only signal available, so the
// bands are drawn on it. 3+ sigma is the "how did nobody notice" tier.
function severityFor(sigma) {
  if (sigma >= 3) {
    return "high";
  }
  if (sigma >= SIGMA_THRESHOLD) {
    return "medium";
  }
  return "low";
}

// Group rows into clusters, then into facilities within each cluster.
// `rows`: [{ facilityId, assessmentId, evaluationId, threatType, assetClass, rating }].
// Rows without a usable numeric rating are dropped — an unrated evaluation is
// missing data, not a low rating, and averaging it in as 0 would manufacture
// outliers.
function buildClusters(rows = []) {
  const clusters = new Map();

  for (const row of rows) {
    // Number(null) and Number("") are 0, so an unrated evaluation would cluster
    // as a rating of zero and drag its facility below the norm — a manufactured
    // outlier out of missing data. Reject the empty forms before coercing.
    if (row.rating === null || row.rating === undefined || row.rating === "") {
      continue;
    }
    const rating = Number(row.rating);
    if (!Number.isFinite(rating)) {
      continue;
    }
    const key = clusterKeyFor({ threatType: row.threatType, assetClass: row.assetClass });
    if (!clusters.has(key)) {
      clusters.set(key, { clusterKey: key, facilities: new Map() });
    }
    const cluster = clusters.get(key);
    if (!cluster.facilities.has(row.facilityId)) {
      cluster.facilities.set(row.facilityId, { facilityId: row.facilityId, rows: [] });
    }
    cluster.facilities.get(row.facilityId).rows.push({ ...row, rating });
  }

  return clusters;
}

// The facility's value in a cluster (mean of its ratings there) plus the row
// that best represents it: the one furthest from the peer norm, which is the
// evaluation an HQ Executive should drill into and the Author should revisit.
function representativeRow(rows, peerMean) {
  return rows.reduce((furthest, row) =>
    Math.abs(row.rating - peerMean) > Math.abs(furthest.rating - peerMean) ? row : furthest
  );
}

// The §9.3 pass. Returns one flag per outlier FACILITY per cluster:
//   { clusterKey, facilityId, assessmentId, evaluationId, rating, peerMean,
//     peerSigma, peerCount, divergenceSigma, severity, direction }
// `direction` ('above' | 'below') is what the rationale prompt needs to say
// whether the facility is over- or under-rating relative to its peers.
function findOutliers({ rows = [], threshold = SIGMA_THRESHOLD, minPeers = MIN_PEERS } = {}) {
  const flags = [];

  for (const cluster of buildClusters(rows).values()) {
    const facilities = [...cluster.facilities.values()].map((f) => ({
      ...f,
      value: mean(f.rows.map((r) => r.rating))
    }));

    if (facilities.length < minPeers + 1) {
      continue;
    }

    for (const candidate of facilities) {
      const peerValues = facilities.filter((f) => f.facilityId !== candidate.facilityId).map((f) => f.value);
      const peerMean = mean(peerValues);
      // peerSigma is reported raw (it is what the peers actually did); the
      // division uses the floored value — see SIGMA_FLOOR.
      const peerSigma = stddev(peerValues, peerMean);
      const effectiveSigma = Math.max(peerSigma, SIGMA_FLOOR);

      const divergenceSigma = Math.abs(candidate.value - peerMean) / effectiveSigma;
      if (divergenceSigma < threshold) {
        continue;
      }

      const row = representativeRow(candidate.rows, peerMean);
      flags.push({
        clusterKey: cluster.clusterKey,
        facilityId: candidate.facilityId,
        assessmentId: row.assessmentId,
        evaluationId: row.evaluationId,
        threatType: row.threatType,
        assetClass: row.assetClass,
        rating: candidate.value,
        peerMean,
        peerSigma,
        peerCount: peerValues.length,
        divergenceSigma: Math.round(divergenceSigma * 1000) / 1000,
        severity: severityFor(divergenceSigma),
        direction: candidate.value > peerMean ? "above" : "below"
      });
    }
  }

  return flags;
}

module.exports = {
  MIN_PEERS,
  SIGMA_THRESHOLD,
  SIGMA_FLOOR,
  clusterKeyFor,
  buildClusters,
  findOutliers,
  severityFor,
  mean,
  stddev
};
