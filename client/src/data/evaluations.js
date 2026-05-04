export const ASSET_THREAT_LINKS = Object.freeze([
  { assetId: "a1", threatId: "t2" },
  { assetId: "a1", threatId: "t5" },
  { assetId: "a1", threatId: "t6" },
  { assetId: "a1", threatId: "t7" },
  { assetId: "a2", threatId: "t2" },
  { assetId: "a2", threatId: "t3" },
  { assetId: "a2", threatId: "t5" },
  { assetId: "a2", threatId: "t7" },
  { assetId: "a3", threatId: "t5" },
  { assetId: "a3", threatId: "t6" },
  { assetId: "a3", threatId: "t7" },
  { assetId: "a4", threatId: "t2" },
  { assetId: "a4", threatId: "t5" },
  { assetId: "a4", threatId: "t8" },
  { assetId: "a4", threatId: "t7" },
  { assetId: "a5", threatId: "t2" },
  { assetId: "a5", threatId: "t3" },
  { assetId: "a5", threatId: "t7" },
  { assetId: "a6", threatId: "t2" },
  { assetId: "a6", threatId: "t3" },
  { assetId: "a6", threatId: "t5" },
  { assetId: "a6", threatId: "t6" },
  { assetId: "a6", threatId: "t7" }
]);

export function buildMatrix(links = ASSET_THREAT_LINKS) {
  const m = {};
  links.forEach(({ assetId, threatId }) => {
    m[`${assetId}|${threatId}`] = true;
  });
  return m;
}

export const SEED_MATRIX = buildMatrix();

export const EVALUATIONS = Object.freeze([
  {
    id: "e1",
    assetId: "a1",
    threatId: "t2",
    scenario: "Theft of materials from process area by external actor.",
    consequences:
      "Replacement cost, operations disruption, secondary damage from forced entry.",
    existingControls:
      "Perimeter fencing, 24/7 security guards, CCTV at access points, vehicle inspection at gates.",
    vulnerabilities:
      "CCTV coverage gaps in north perimeter, access control card sharing observed in audit.",
    proposedMitigation:
      "Upgrade CCTV with analytics, replace card readers with biometric, enforce no-tailgating policy.",
    consequenceR1: 3,
    likelihoodR1: 4,
    consequenceR2: 2,
    likelihoodR2: 2,
    consequenceScore: 3,
    likelihoodScore: 4,
    postConsequenceScore: 2,
    postLikelihoodScore: 2
  },
  {
    id: "e2",
    assetId: "a2",
    threatId: "t5",
    scenario: "Coordinated attack on tank farm causing catastrophic release.",
    consequences:
      "Multiple fatalities, major environmental damage, prolonged production loss, severe reputational impact.",
    existingControls: "Armed response, restricted access, blast barriers at perimeter.",
    vulnerabilities:
      "Vegetation overgrowth limits visibility, response drill frequency below standard.",
    proposedMitigation:
      "Clear vegetation buffer, increase drill frequency, deploy additional perimeter sensors, joint exercise with regional security.",
    consequenceR1: 5,
    likelihoodR1: 2,
    consequenceR2: 4,
    likelihoodR2: 1,
    consequenceScore: 5,
    likelihoodScore: 2,
    postConsequenceScore: 4,
    postLikelihoodScore: 1
  },
  {
    id: "e3",
    assetId: "a4",
    threatId: "t8",
    scenario: "Pirates board supply vessel in transit and abduct crew.",
    consequences: "Crew fatality risk, vessel damage, ransom exposure, route disruption.",
    existingControls: "Vessel hardening, threat monitoring, scheduled escorts in high-risk waters.",
    vulnerabilities:
      "Inadequate watchkeeping during night transit, low freeboard on certain vessels.",
    proposedMitigation:
      "Mandatory two-person watch, intel link with naval authority, citadel installation on key vessels.",
    consequenceR1: 5,
    likelihoodR1: 3,
    consequenceR2: 4,
    likelihoodR2: 2,
    consequenceScore: 5,
    likelihoodScore: 3,
    postConsequenceScore: 4,
    postLikelihoodScore: 2
  },
  {
    id: "e4",
    assetId: "a3",
    threatId: "t6",
    scenario: "Cyber intrusion into SCADA via compromised vendor laptop.",
    consequences:
      "Loss of process control, potential safety system override, regulatory exposure.",
    existingControls: "Network segmentation, endpoint AV, vendor access policy.",
    vulnerabilities:
      "Vendor laptops not consistently scanned at entry, segmentation gaps in OT/IT bridge.",
    proposedMitigation:
      "Mandatory laptop quarantine and scan, deploy unidirectional gateway, vendor access logging.",
    consequenceR1: 4,
    likelihoodR1: 3,
    consequenceR2: 3,
    likelihoodR2: 2,
    consequenceScore: 4,
    likelihoodScore: 3,
    postConsequenceScore: 3,
    postLikelihoodScore: 2,
    library: "Scenarios"
  },
  {
    id: "e5",
    assetId: "a6",
    threatId: "t7",
    scenario: "Disgruntled insider sabotages substation control wiring.",
    consequences:
      "Total facility shutdown, secondary safety incidents, recovery time 48–72 hours.",
    existingControls: "Background checks, two-person access rule for substation.",
    vulnerabilities:
      "Two-person rule not enforced during shift handover, no tamper alarms on key cabinets.",
    proposedMitigation:
      "Tamper alarms on critical cabinets, enforce two-person rule with electronic logging, behavioural risk programme.",
    consequenceR1: 4,
    likelihoodR1: 2,
    consequenceR2: 3,
    likelihoodR2: 1,
    consequenceScore: 4,
    likelihoodScore: 2,
    postConsequenceScore: 3,
    postLikelihoodScore: 1
  },
  {
    id: "e6",
    assetId: "a1",
    threatId: "t7",
    scenario: "Insider tampers with process safety instrumentation.",
    consequences: "Loss of life, major environmental release, prolonged shutdown.",
    existingControls: "Two-person rule for safety system changes, change management approval.",
    vulnerabilities:
      "Documented change management not consistently followed for emergency repairs.",
    proposedMitigation:
      "Audit change management compliance, mandatory video review of safety system maintenance.",
    consequenceR1: 5,
    likelihoodR1: 2,
    consequenceR2: 4,
    likelihoodR2: 1,
    consequenceScore: 5,
    likelihoodScore: 2,
    postConsequenceScore: 4,
    postLikelihoodScore: 1
  }
]);
