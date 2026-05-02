export const MITIGATIONS = Object.freeze([
  {
    id: "mit-cctv-coverage",
    evaluationId: "eval-marine-organised",
    assessmentId: "ass-bonny-2026",
    facilityId: "fac-bonny-refinery",
    description:
      "Deploy automated metering anomaly detection, expand CCTV coverage on hose-handling pad, and rotate surveyors quarterly.",
    severity: "High",
    agreed: "Yes",
    ownerLabel: "Security Manager",
    ownerUserId: "user-james-clark",
    targetDate: "2026-09-30",
    comment: "Approved at SRA workshop with capex earmarked from Q3 budget.",
    status: "In Progress",
    log: [
      {
        id: "log-1",
        timestamp: "2026-04-12T09:14:00Z",
        userId: "user-james-clark",
        userName: "James Clark",
        roleLabel: "Security Manager",
        text: "Vendor selected for CCTV expansion; PO raised.",
        statusChange: { from: "Open", to: "In Progress" }
      },
      {
        id: "log-2",
        timestamp: "2026-04-25T17:02:00Z",
        userId: "user-james-clark",
        userName: "James Clark",
        roleLabel: "Security Manager",
        text: "Survey complete; install scheduled for week 22.",
        statusChange: null
      }
    ]
  },
  {
    id: "mit-vendor-credentials",
    evaluationId: "eval-control-cyber",
    assessmentId: "ass-bonny-2026",
    facilityId: "fac-bonny-refinery",
    description:
      "Implement per-vendor accounts with WebAuthn for remote access. Isolate DCS backups into air-gapped enclave.",
    severity: "Very High",
    agreed: "Yes",
    ownerLabel: "IT Director",
    ownerUserId: "user-james-clark",
    targetDate: "2026-08-15",
    comment: "Critical action item from cyber findings.",
    status: "Open",
    log: []
  },
  {
    id: "mit-radar-upgrade",
    evaluationId: "eval-marine-maritime",
    assessmentId: "ass-bonny-2026",
    facilityId: "fac-bonny-refinery",
    description: "Upgrade radar coverage and revise armed escort scheduling for shift handover.",
    severity: "High",
    agreed: "Pending",
    ownerLabel: "Security Manager",
    ownerUserId: "user-james-clark",
    targetDate: "2026-12-31",
    comment: "Budget owner pending confirmation; depends on operator naval coordination protocol review.",
    status: "Open",
    log: []
  },
  {
    id: "mit-perimeter-lighting",
    evaluationId: "eval-tank-farm-criminality",
    assessmentId: "ass-bonny-2026",
    facilityId: "fac-bonny-refinery",
    description: "Replace north fence lighting with LED + add thermal cameras; revise patrol schedule.",
    severity: "Medium",
    agreed: "Yes",
    ownerLabel: "Operations Lead",
    ownerUserId: "user-james-clark",
    targetDate: "2025-12-15",
    comment: "Operational lead confirmed budget; install scheduled.",
    status: "Done",
    log: [
      {
        id: "log-3",
        timestamp: "2025-11-04T11:22:00Z",
        userId: "user-james-clark",
        userName: "James Clark",
        roleLabel: "Operations Lead",
        text: "Lighting installed; CCTV thermal feed verified.",
        statusChange: { from: "In Progress", to: "Done" }
      }
    ]
  },
  {
    id: "mit-substation-hmi",
    evaluationId: "eval-utility-cyber",
    assessmentId: "ass-bonny-2026",
    facilityId: "fac-bonny-refinery",
    description: "Replace legacy HMI; enforce vendor laptop attestation; quarterly DR drill.",
    severity: "Very High",
    agreed: "Yes",
    ownerLabel: "IT Director",
    ownerUserId: "user-james-clark",
    targetDate: "2026-03-01",
    comment: "DR drill scheduled with substation OEM.",
    status: "In Progress",
    log: [
      {
        id: "log-4",
        timestamp: "2026-02-18T14:00:00Z",
        userId: "user-james-clark",
        userName: "James Clark",
        roleLabel: "IT Director",
        text: "Vendor attestation policy drafted; awaiting legal review.",
        statusChange: { from: "Open", to: "In Progress" }
      }
    ]
  }
]);
