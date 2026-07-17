// P4 · O7 — the statistics behind cross-facility consistency flagging (§9.3).
// Pure service: no DB, no gateway. docs/test-specs.md §P4 requires "synthetic
// portfolio with a known 2σ outlier → flagged; non-outlier → not"; the portfolio
// here is exact rather than illustrative, so the threshold is pinned by
// arithmetic a reader can verify, not by a fixture that happens to pass.
const {
  clusterKeyFor,
  buildClusters,
  findOutliers,
  severityFor,
  mean,
  stddev
} = require("../src/services/consistencyService");

// A cluster row. Ratings are the R1 product (consequence x likelihood, 1-25).
function row({ facility, rating, evaluation = `eval-${facility}`, threatType = "Maritime", assetClass = "Jetty" }) {
  return {
    facilityId: facility,
    assessmentId: `assessment-${facility}`,
    evaluationId: evaluation,
    threatType,
    assetClass,
    rating
  };
}

// Four peers all rating 12, one facility rating 4. Peers (leave-one-out for the
// outlier) have mean 12 and sigma 0... so the OUTLIER's peers must not be
// identical or sigma is 0 and nothing can be measured. Use a realistic spread:
// peers 12, 12, 15, 9 → mean 12, sigma 2.121; candidate 4 → 3.77σ below.
const PORTFOLIO = [
  row({ facility: "fac-outlier", rating: 4 }),
  row({ facility: "fac-b", rating: 12 }),
  row({ facility: "fac-c", rating: 12 }),
  row({ facility: "fac-d", rating: 15 }),
  row({ facility: "fac-e", rating: 9 })
];

describe("consistencyService — clusterKeyFor", () => {
  test("same threat type + asset class produce the same key regardless of case/whitespace", () => {
    expect(clusterKeyFor({ threatType: "Maritime", assetClass: "Jetty" })).toBe(
      clusterKeyFor({ threatType: "  maritime ", assetClass: "JETTY" })
    );
  });

  test("different threat types produce different keys (clusters must partition)", () => {
    expect(clusterKeyFor({ threatType: "Maritime", assetClass: "Jetty" })).not.toBe(
      clusterKeyFor({ threatType: "Insider", assetClass: "Jetty" })
    );
  });

  test("a missing threat type or asset class degrades to 'unspecified' rather than throwing", () => {
    expect(clusterKeyFor({})).toBe("unspecified::unspecified");
    expect(clusterKeyFor({ threatType: "Maritime" })).toBe("maritime::unspecified");
  });
});

describe("consistencyService — statistics", () => {
  test("mean and population stddev are computed over the given values", () => {
    expect(mean([2, 4, 6])).toBe(4);
    expect(stddev([2, 4, 6])).toBeCloseTo(1.633, 3);
    expect(stddev([5, 5, 5])).toBe(0);
  });

  test("severity bands: 2σ → medium, 3σ+ → high, below threshold → low", () => {
    expect(severityFor(1.9)).toBe("low");
    expect(severityFor(2)).toBe("medium");
    expect(severityFor(2.9)).toBe("medium");
    expect(severityFor(3)).toBe("high");
  });
});

describe("consistencyService — buildClusters", () => {
  test("groups rows by (threat type, asset class) and then by facility", () => {
    const clusters = buildClusters([
      row({ facility: "fac-a", rating: 12 }),
      row({ facility: "fac-a", rating: 8, evaluation: "eval-a2" }),
      row({ facility: "fac-b", rating: 12 }),
      row({ facility: "fac-c", rating: 6, threatType: "Insider" })
    ]);

    expect([...clusters.keys()].sort()).toEqual(["insider::jetty", "maritime::jetty"]);
    const maritime = clusters.get("maritime::jetty");
    expect([...maritime.facilities.keys()]).toEqual(["fac-a", "fac-b"]);
    expect(maritime.facilities.get("fac-a").rows).toHaveLength(2);
  });

  test("rows with no usable rating are dropped (missing data is not a low rating)", () => {
    const clusters = buildClusters([
      row({ facility: "fac-a", rating: null }),
      row({ facility: "fac-b", rating: undefined }),
      row({ facility: "fac-c", rating: 12 })
    ]);

    expect([...clusters.get("maritime::jetty").facilities.keys()]).toEqual(["fac-c"]);
  });
});

describe("consistencyService — findOutliers (§9.3: 2+ sigma from peer norm)", () => {
  test("POSITIVE: a facility 3.8σ below its peers is flagged, with the drill-in row and stats", () => {
    const flags = findOutliers({ rows: PORTFOLIO });

    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({
      clusterKey: "maritime::jetty",
      facilityId: "fac-outlier",
      assessmentId: "assessment-fac-outlier",
      evaluationId: "eval-fac-outlier",
      rating: 4,
      peerCount: 4,
      severity: "high",
      direction: "below"
    });
    expect(flags[0].peerMean).toBeCloseTo(12, 3);
    expect(flags[0].divergenceSigma).toBeCloseTo(3.771, 2);
  });

  test("NEGATIVE: the conforming peers are NOT flagged — only the outlier is", () => {
    const flags = findOutliers({ rows: PORTFOLIO });
    expect(flags.map((f) => f.facilityId)).toEqual(["fac-outlier"]);
  });

  test("NEGATIVE: a facility just inside the threshold is not flagged, just outside is", () => {
    // Peers 10/11/13/14 → mean 12, raw sigma 1.58 → floored to 2. So the flag
    // boundary sits exactly 4 rating points from the mean: 15 is 1.5σ (inside),
    // 16 is 2.0σ (outside). These peers are also mutually unremarkable, so the
    // candidate is the only facility either assertion can be about.
    const peers = [
      row({ facility: "fac-b", rating: 10 }),
      row({ facility: "fac-c", rating: 11 }),
      row({ facility: "fac-d", rating: 13 }),
      row({ facility: "fac-e", rating: 14 })
    ];

    const inside = findOutliers({ rows: [row({ facility: "fac-x", rating: 15 }), ...peers] });
    expect(inside).toEqual([]);

    const outside = findOutliers({ rows: [row({ facility: "fac-x", rating: 16 }), ...peers] });
    expect(outside.map((f) => f.facilityId)).toEqual(["fac-x"]);
  });

  test("a facility rating ABOVE its peers is flagged with direction 'above'", () => {
    const flags = findOutliers({
      rows: [
        row({ facility: "fac-high", rating: 25 }),
        row({ facility: "fac-b", rating: 6 }),
        row({ facility: "fac-c", rating: 6 }),
        row({ facility: "fac-d", rating: 9 }),
        row({ facility: "fac-e", rating: 3 })
      ]
    });

    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ facilityId: "fac-high", direction: "above" });
  });

  test("UNDER-FLAG: a portfolio with too few peers produces nothing (no norm to measure against)", () => {
    const tooSmall = [
      row({ facility: "fac-outlier", rating: 4 }),
      row({ facility: "fac-b", rating: 12 }),
      row({ facility: "fac-c", rating: 15 })
    ];

    expect(findOutliers({ rows: tooSmall })).toEqual([]);
  });

  test("peers who agree EXACTLY (sigma 0) still flag the dissenter — §9.3's own worked example", () => {
    // "16 of 18 peer facilities rated it High" is the clearest outlier there is;
    // dividing by a true sigma of 0 would have made it invisible. The floor makes
    // it 4σ (|4 - 12| / 2).
    const identicalPeers = [
      row({ facility: "fac-outlier", rating: 4 }),
      row({ facility: "fac-b", rating: 12 }),
      row({ facility: "fac-c", rating: 12 }),
      row({ facility: "fac-d", rating: 12 }),
      row({ facility: "fac-e", rating: 12 })
    ];

    const flags = findOutliers({ rows: identicalPeers });
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ facilityId: "fac-outlier", severity: "high", direction: "below" });
    expect(flags[0].peerSigma).toBe(0);
    expect(flags[0].divergenceSigma).toBeCloseTo(4, 3);
  });

  test("UNDER-FLAG: a tight cluster does not manufacture an outlier from a sub-step difference", () => {
    // Peers 12/12/10/12 have a raw sigma of 0.866, which would make a facility at
    // 14 a "2.9σ" outlier off a 2.5-point gap — smaller than one step of the 5x5
    // matrix. The sigma floor makes it 1.25σ: not a flag.
    const tightCluster = [
      row({ facility: "fac-x", rating: 14 }),
      row({ facility: "fac-b", rating: 12 }),
      row({ facility: "fac-c", rating: 12 }),
      row({ facility: "fac-d", rating: 10 }),
      row({ facility: "fac-e", rating: 12 })
    ];

    expect(findOutliers({ rows: tightCluster })).toEqual([]);
  });

  test("clusters are independent: an outlier in one does not flag a conforming facility in another", () => {
    const flags = findOutliers({
      rows: [
        ...PORTFOLIO,
        row({ facility: "fac-outlier", rating: 12, evaluation: "eval-ins-1", threatType: "Insider" }),
        row({ facility: "fac-b", rating: 12, evaluation: "eval-ins-2", threatType: "Insider" }),
        row({ facility: "fac-c", rating: 14, evaluation: "eval-ins-3", threatType: "Insider" }),
        row({ facility: "fac-d", rating: 10, evaluation: "eval-ins-4", threatType: "Insider" }),
        row({ facility: "fac-e", rating: 12, evaluation: "eval-ins-5", threatType: "Insider" })
      ]
    });

    expect(flags.map((f) => [f.clusterKey, f.facilityId])).toEqual([["maritime::jetty", "fac-outlier"]]);
  });

  test("a facility's value is the MEAN of its rows, so one facility cannot out-vote peers by row count", () => {
    // fac-outlier has three rows averaging 4; without per-facility reduction its
    // rows would dominate the cluster and suppress its own divergence.
    const flags = findOutliers({
      rows: [
        row({ facility: "fac-outlier", rating: 3, evaluation: "e1" }),
        row({ facility: "fac-outlier", rating: 4, evaluation: "e2" }),
        row({ facility: "fac-outlier", rating: 5, evaluation: "e3" }),
        row({ facility: "fac-b", rating: 12 }),
        row({ facility: "fac-c", rating: 12 }),
        row({ facility: "fac-d", rating: 15 }),
        row({ facility: "fac-e", rating: 9 })
      ]
    });

    expect(flags).toHaveLength(1);
    expect(flags[0].rating).toBe(4);
    // The drill-in row is the one furthest from the peer norm — what an Author
    // should look at first.
    expect(flags[0].evaluationId).toBe("e1");
  });

  test("called with nothing, returns no flags rather than throwing", () => {
    expect(findOutliers()).toEqual([]);
    expect(findOutliers({ rows: [] })).toEqual([]);
  });
});
