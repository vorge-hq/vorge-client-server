export const ASSET_THREAT_LINKS = Object.freeze([
  { assetId: "asset-marine-loading", threatId: "threat-organised-crime" },
  { assetId: "asset-marine-loading", threatId: "threat-maritime" },
  { assetId: "asset-marine-loading", threatId: "threat-terrorism" },
  { assetId: "asset-tank-farm", threatId: "threat-organised-crime" },
  { assetId: "asset-tank-farm", threatId: "threat-criminality" },
  { assetId: "asset-tank-farm", threatId: "threat-terrorism" },
  { assetId: "asset-control-room", threatId: "threat-cybercrime" },
  { assetId: "asset-control-room", threatId: "threat-insider" },
  { assetId: "asset-utility-substation", threatId: "threat-criminality" },
  { assetId: "asset-utility-substation", threatId: "threat-cybercrime" },
  { assetId: "asset-fuel-skid", threatId: "threat-criminality" },
  { assetId: "asset-fuel-skid", threatId: "threat-organised-crime" },
  { assetId: "asset-admin-building", threatId: "threat-cybercrime" },
  { assetId: "asset-admin-building", threatId: "threat-insider" }
]);

export const EVALUATIONS = Object.freeze([
  {
    id: "eval-marine-organised",
    assetId: "asset-marine-loading",
    threatId: "threat-organised-crime",
    scenario:
      "Coordinated theft of finished product during night loading by collusion between vessel crew, surveyor, and shore-side staff.",
    consequences: "Product loss; environmental risk during covert transfer; loss of customer confidence.",
    existingControls:
      "Manned access control, two-person rule on metering, CCTV, surveyor independence policy.",
    vulnerabilities:
      "CCTV blind spots near hose-handling pad; weak rotation policy on surveyors; no metering anomaly detection.",
    consequenceScore: 4,
    likelihoodScore: 3,
    mitigation:
      "Deploy automated metering anomaly detection; expand CCTV coverage; quarterly surveyor rotation.",
    postConsequenceScore: 4,
    postLikelihoodScore: 1,
    library: "Scenarios"
  },
  {
    id: "eval-marine-maritime",
    assetId: "asset-marine-loading",
    threatId: "threat-maritime",
    scenario:
      "Hostile vessel approach during product transfer aiming to interrupt operations or board.",
    consequences: "Operational shutdown, potential loss-of-life, regulatory escalation.",
    existingControls: "Maritime exclusion zone, naval coordination, AIS monitoring.",
    vulnerabilities:
      "Limited radar coverage on landward approach; reaction time of armed escort during shift change.",
    consequenceScore: 5,
    likelihoodScore: 2,
    mitigation: "Upgrade radar coverage; revise armed escort scheduling; quarterly drill with naval partners.",
    postConsequenceScore: 5,
    postLikelihoodScore: 1
  },
  {
    id: "eval-control-cyber",
    assetId: "asset-control-room",
    threatId: "threat-cybercrime",
    scenario:
      "Targeted ransomware on engineering workstations leveraging stolen vendor credentials disrupts DCS.",
    consequences: "Loss of operational control; potential safety-system trip; multi-day shutdown.",
    existingControls: "Network segmentation, MFA on engineering workstations, monthly patch cycle.",
    vulnerabilities:
      "Vendor remote access uses single shared account; backups stored on same network segment as DCS historian.",
    consequenceScore: 5,
    likelihoodScore: 4,
    mitigation:
      "Implement per-vendor accounts with WebAuthn; isolate backups in air-gapped enclave; SOC playbook for OT incidents.",
    postConsequenceScore: 5,
    postLikelihoodScore: 2
  },
  {
    id: "eval-tank-farm-criminality",
    assetId: "asset-tank-farm",
    threatId: "threat-criminality",
    scenario: "Perimeter intrusion targeting copper cabling and fittings on tank farm boundary.",
    consequences: "Equipment damage, ignition risk in worst case, response cost.",
    existingControls: "Fence, lighting, foot patrols.",
    vulnerabilities: "Lighting outages on north fence; patrol gaps between 03:00-05:00.",
    consequenceScore: 3,
    likelihoodScore: 3,
    mitigation: "Replace lighting and add thermal cameras; revise patrol schedule.",
    postConsequenceScore: 3,
    postLikelihoodScore: 2
  },
  {
    id: "eval-utility-cyber",
    assetId: "asset-utility-substation",
    threatId: "threat-cybercrime",
    scenario: "Compromise of substation HMI via remote vendor access leading to load shedding.",
    consequences: "Plant-wide power loss; safety systems on limited UPS.",
    existingControls: "VPN, MFA, vendor contract clauses.",
    vulnerabilities: "Legacy HMI without secure boot; vendor maintenance laptop policy unverified.",
    consequenceScore: 4,
    likelihoodScore: 3,
    mitigation: "Replace HMI; enforce vendor laptop attestation; quarterly DR drill.",
    postConsequenceScore: 4,
    postLikelihoodScore: 1
  }
]);
