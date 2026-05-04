export const LIBRARY_SCENARIOS = Object.freeze([
  { id: "l1", text: "Theft of materials from facility yard by external actors", tags: ["theft", "criminality"] },
  { id: "l2", text: "Unauthorised entry through perimeter fencing into restricted area", tags: ["intrusion"] },
  { id: "l3", text: "Equipment removed from storage during shift handover", tags: ["theft", "insider-adjacent"] },
  { id: "l4", text: "Coordinated armed attack on critical process equipment", tags: ["terrorism", "attack"] },
  { id: "l5", text: "Sabotage of safety-critical instrumentation by insider", tags: ["insider", "sabotage"] },
  { id: "l6", text: "Phishing-led compromise of operator workstation", tags: ["cyber", "phishing"] },
  { id: "l7", text: "Ransomware affecting plant historian and reporting systems", tags: ["cyber", "ransomware"] },
  { id: "l8", text: "Pirate boarding of supply vessel and crew abduction", tags: ["maritime", "kidnap"] },
  { id: "l9", text: "Community blockade preventing site access", tags: ["civil-unrest", "blockade"] },
  { id: "l10", text: "Stowaway concealed on outbound vessel", tags: ["maritime"] }
]);

export const LIBRARY_SEED = Object.freeze({
  scenarios: [
    { id: "ls1", text: "Theft of materials from facility yard by external actors", tags: ["theft", "criminality"], usedIn: 7 },
    { id: "ls2", text: "Unauthorised entry through perimeter fencing into restricted area", tags: ["intrusion"], usedIn: 5 },
    { id: "ls3", text: "Equipment removed from storage during shift handover", tags: ["theft", "insider-adjacent"], usedIn: 3 },
    { id: "ls4", text: "Coordinated armed attack on critical process equipment", tags: ["terrorism", "attack"], usedIn: 4 },
    { id: "ls5", text: "Sabotage of safety-critical instrumentation by insider", tags: ["insider", "sabotage"], usedIn: 2 },
    { id: "ls6", text: "Phishing-led compromise of operator workstation", tags: ["cyber", "phishing"], usedIn: 6 },
    { id: "ls7", text: "Pirate boarding of supply vessel and crew abduction", tags: ["maritime", "kidnap"], usedIn: 5 },
    { id: "ls8", text: "Community blockade preventing site access", tags: ["civil-unrest", "blockade"], usedIn: 8 }
  ],
  mitigations: [
    { id: "lm1", text: "Upgrade CCTV with analytics and centralised monitoring", tags: ["surveillance"], usedIn: 12 },
    { id: "lm2", text: "Deploy biometric access control at restricted-area entry points", tags: ["access-control"], usedIn: 9 },
    { id: "lm3", text: "Implement vendor laptop quarantine and mandatory scan procedure", tags: ["cyber", "vendor"], usedIn: 6 },
    { id: "lm4", text: "Mandatory two-person watch on transit through high-risk waters", tags: ["maritime"], usedIn: 4 },
    { id: "lm5", text: "Behavioural risk programme for high-access roles", tags: ["insider"], usedIn: 7 },
    { id: "lm6", text: "Joint exercise with regional security and naval liaison", tags: ["response"], usedIn: 5 }
  ],
  vulnerabilities: [
    { id: "lv1", text: "CCTV coverage gap in north perimeter", tags: ["perimeter"], usedIn: 8 },
    { id: "lv2", text: "Vegetation overgrowth limits perimeter visibility", tags: ["perimeter"], usedIn: 6 },
    { id: "lv3", text: "Vendor laptops not consistently scanned at site entry", tags: ["cyber"], usedIn: 5 },
    { id: "lv4", text: "Two-person rule not enforced during shift handover", tags: ["insider"], usedIn: 4 }
  ],
  controls: [
    { id: "lc1", text: "Perimeter fencing — 3m chain-link with razor-wire topping", tags: ["physical"], usedIn: 11 },
    { id: "lc2", text: "24/7 manned guard patrol with documented rounds", tags: ["guarding"], usedIn: 12 },
    { id: "lc3", text: "CCTV at all access points with central recording", tags: ["surveillance"], usedIn: 10 },
    { id: "lc4", text: "Vehicle inspection at gates including under-vehicle search", tags: ["access-control"], usedIn: 7 }
  ],
  consequences: [
    { id: "lq1", text: "Replacement cost, operations disruption, secondary forced-entry damage", tags: ["theft"], usedIn: 9 },
    { id: "lq2", text: "Multiple fatalities, major environmental release, prolonged shutdown", tags: ["catastrophic"], usedIn: 5 },
    { id: "lq3", text: "Loss of process control with potential safety system override", tags: ["operational"], usedIn: 6 }
  ]
});

const STOP = new Set([
  "the", "a", "an", "of", "in", "on", "at", "to", "from", "and", "or", "by", "with",
  "for", "is", "are", "was", "were", "this", "that", "it"
]);

function tokens(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t));
}

export function similarity(a, b) {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach((x) => {
    if (B.has(x)) inter += 1;
  });
  return inter / (A.size + B.size - inter);
}
