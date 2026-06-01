import { calculateRisk } from "../features/assessmentWorkspace/riskMatrix";
import { EVALUATIONS } from "./evaluations";

const OWNERS = ["Security Manager", "IT Manager", "Facility Operations", "HSE Lead", "Marine Operations"];
const STATUSES = ["Open", "In Progress", "Done", "Open", "In Progress"];
const AGREED = ["Yes", "Yes", "Yes", "Pending", "Yes", "No"];

const PROGRESS_LOGS = [
  [
    {
      id: "log-m0-1",
      timestamp: "2026-02-14T09:32:00",
      userId: "user-j-doe",
      userName: "Marcus Johnson",
      roleLabel: "IT Security",
      text: "Vendor RFP issued to three approved suppliers. Responses due 2026-03-01.",
      statusChange: { from: "Open", to: "In Progress" }
    },
    {
      id: "log-m0-2",
      timestamp: "2026-03-12T14:08:00",
      userId: "user-j-doe",
      userName: "Marcus Johnson",
      roleLabel: "IT Security",
      text: "Two responses received. Technical evaluation underway. PSC engaged for procurement governance.",
      statusChange: null
    },
    {
      id: "log-m0-3",
      timestamp: "2026-04-22T11:47:00",
      userId: "user-j-doe",
      userName: "Marcus Johnson",
      roleLabel: "IT Security",
      text: "Vendor selected (Axis Communications). PO issued. Installation scheduled for late May.",
      statusChange: null
    }
  ],
  [],
  [
    {
      id: "log-m2-1",
      timestamp: "2026-02-08T10:15:00",
      userId: "user-j-doe",
      userName: "Yusuf Bello",
      roleLabel: "Marine Operations",
      text: "Joint exercise plan drafted with regional naval liaison. Awaiting confirmation of date.",
      statusChange: { from: "Open", to: "In Progress" }
    },
    {
      id: "log-m2-2",
      timestamp: "2026-04-10T13:22:00",
      userId: "user-j-doe",
      userName: "Yusuf Bello",
      roleLabel: "Marine Operations",
      text: "Date confirmed for May 18. Pre-exercise briefing scheduled. All crews notified.",
      statusChange: null
    }
  ],
  [],
  [
    {
      id: "log-m4-1",
      timestamp: "2026-01-22T11:40:00",
      userId: "user-j-doe",
      userName: "Tomás Herrera",
      roleLabel: "IT Security",
      text: "Programme requirements documented. Engaging HR for behavioural baseline framework.",
      statusChange: { from: "Open", to: "In Progress" }
    }
  ],
  [],
  [],
  []
];

export function generateMitigations(evaluations = EVALUATIONS, assessmentId = "ass-1-2026") {
  return evaluations.map((evaluation, i) => {
    const r1 = calculateRisk(evaluation.consequenceR1 ?? evaluation.consequenceScore, evaluation.likelihoodR1 ?? evaluation.likelihoodScore);
    const severity = r1.band || "Medium";
    const offset = [-14, 21, 45, -3, 60, 90][i % 6];
    const target = new Date(2026, 3, 26 + offset);
    const targetStr = target.toISOString().slice(0, 10);
    const status = STATUSES[i % STATUSES.length];
    const overdue = offset < 0 && status !== "Done";
    return {
      id: `m${i}`,
      evaluationId: evaluation.id,
      assessmentId,
      facilityId: "fac-1",
      assetId: evaluation.assetId,
      threatId: evaluation.threatId,
      description: evaluation.proposedMitigation || "—",
      severity,
      agreed: AGREED[i % AGREED.length],
      ownerLabel: OWNERS[i % OWNERS.length],
      ownerUserId: "user-j-doe",
      targetDate: targetStr,
      comment: "",
      status,
      overdue,
      log: PROGRESS_LOGS[i] || []
    };
  });
}

export const MITIGATIONS = Object.freeze(generateMitigations(EVALUATIONS, "ass-1-2026"));

export const MY_MITIGATIONS = Object.freeze([
  {
    id: "mit-001",
    facility: "Eko Petrochemical Hub",
    facilityId: "fac-1",
    assessmentId: "ass-1-2026",
    cycle: "2026 SRA",
    assessmentState: "Approved",
    assetThreat: "Asset 1 × Criminality",
    description:
      "Upgrade CCTV with analytics, replace card readers with biometric, enforce no-tailgating policy.",
    severity: "High",
    agreed: "Yes",
    ownerLabel: "Security Manager",
    ownerUserId: "user-j-doe",
    targetDate: "2026-06-30",
    status: "In Progress",
    assignedBy: "Adaeze Okeke",
    assignedDate: "2026-04-12",
    log: [
      {
        id: "log-001-1",
        timestamp: "2026-02-14T09:32:00",
        userName: "Marcus Johnson",
        roleLabel: "IT Security",
        text: "Vendor RFP issued to three approved suppliers. Responses due 2026-03-01.",
        statusChange: { from: "Open", to: "In Progress" }
      },
      {
        id: "log-001-2",
        timestamp: "2026-03-12T14:08:00",
        userName: "Marcus Johnson",
        roleLabel: "IT Security",
        text: "Two responses received. Technical evaluation underway. PSC engaged for procurement governance.",
        statusChange: null
      },
      {
        id: "log-001-3",
        timestamp: "2026-04-22T11:47:00",
        userName: "Marcus Johnson",
        roleLabel: "IT Security",
        text: "Vendor selected (Axis Communications). PO issued. Installation scheduled for late May.",
        statusChange: null
      }
    ]
  },
  {
    id: "mit-002",
    facility: "Eko Petrochemical Hub",
    facilityId: "fac-1",
    assessmentId: "ass-1-2026",
    cycle: "2026 SRA",
    assessmentState: "Approved",
    assetThreat: "Asset 3 × Cyber",
    description:
      "Vendor laptop quarantine procedure with IT pre-approval; OT network segmentation review.",
    severity: "Very High",
    agreed: "Yes",
    ownerLabel: "IT Manager",
    ownerUserId: "user-j-doe",
    targetDate: "2026-04-15",
    status: "Open",
    assignedBy: "Adaeze Okeke",
    assignedDate: "2026-04-12",
    log: [],
    overdue: true
  },
  {
    id: "mit-003",
    facility: "Delta Crest Terminal",
    facilityId: "fac-2",
    assessmentId: "ass-2-2025",
    cycle: "2025 SRA",
    assessmentState: "Approved",
    assetThreat: "Supply Vessel × Maritime",
    description:
      "Install citadel on supply vessel; conduct quarterly drills with regional naval liaison.",
    severity: "High",
    agreed: "Yes",
    ownerLabel: "Marine Operations",
    ownerUserId: "user-j-doe",
    targetDate: "2026-09-30",
    status: "In Progress",
    assignedBy: "Hassan Al-Mansoori",
    assignedDate: "2025-08-10",
    log: [
      {
        id: "log-003-1",
        timestamp: "2025-09-15T10:00:00",
        userName: "Marcus Johnson",
        roleLabel: "IT Security",
        text: "Citadel design specification approved with marine architect. Procurement initiated.",
        statusChange: { from: "Open", to: "In Progress" }
      },
      {
        id: "log-003-2",
        timestamp: "2025-11-22T16:30:00",
        userName: "Marcus Johnson",
        roleLabel: "IT Security",
        text: "Citadel fabricated and delivered to Bonny shipyard. Fitting scheduled during next vessel drydock.",
        statusChange: null
      },
      {
        id: "log-003-3",
        timestamp: "2026-01-18T09:15:00",
        userName: "Marcus Johnson",
        roleLabel: "IT Security",
        text: "Citadel installation complete. Sea trial conducted; all systems functional.",
        statusChange: null
      },
      {
        id: "log-003-4",
        timestamp: "2026-02-28T14:00:00",
        userName: "Marcus Johnson",
        roleLabel: "IT Security",
        text: "First quarterly drill conducted with regional naval liaison. Lessons captured; minor procedural updates pending.",
        statusChange: null
      },
      {
        id: "log-003-5",
        timestamp: "2026-04-18T11:20:00",
        userName: "Marcus Johnson",
        roleLabel: "IT Security",
        text: "Procedural updates incorporated into vessel ops manual. Second quarterly drill scheduled for May 2026.",
        statusChange: null
      }
    ]
  },
  {
    id: "mit-004",
    facility: "Eko Petrochemical Hub",
    facilityId: "fac-1",
    assessmentId: "ass-1-2025",
    cycle: "2025 SRA",
    assessmentState: "Approved",
    assetThreat: "Asset 4 × Insider",
    description:
      "Implement behavioural risk programme for high-access roles; quarterly access reviews.",
    severity: "Medium",
    agreed: "Yes",
    ownerLabel: "HSE Lead",
    ownerUserId: "user-j-doe",
    targetDate: "2025-12-31",
    status: "Done",
    assignedBy: "Adaeze Okeke",
    assignedDate: "2025-04-15",
    log: [
      {
        id: "log-004-1",
        timestamp: "2025-06-12T10:00:00",
        userName: "Marcus Johnson",
        roleLabel: "IT Security",
        text: "HR partnership established. BRP framework drafted, reviewed by Legal.",
        statusChange: { from: "Open", to: "In Progress" }
      },
      {
        id: "log-004-2",
        timestamp: "2025-08-22T14:15:00",
        userName: "Marcus Johnson",
        roleLabel: "IT Security",
        text: "BRP rolled out to high-access roles (12 staff). First training session delivered.",
        statusChange: null
      },
      {
        id: "log-004-3",
        timestamp: "2025-09-30T16:00:00",
        userName: "Marcus Johnson",
        roleLabel: "IT Security",
        text: "Q3 access review completed. Two anomalies identified and resolved (stale privileges revoked).",
        statusChange: null
      },
      {
        id: "log-004-4",
        timestamp: "2025-11-15T11:30:00",
        userName: "Marcus Johnson",
        roleLabel: "IT Security",
        text: "Q4 access review in progress. Process now embedded in quarterly compliance calendar.",
        statusChange: null
      },
      {
        id: "log-004-5",
        timestamp: "2025-12-15T17:45:00",
        userName: "Marcus Johnson",
        roleLabel: "IT Security",
        text:
          "Programme fully operational and embedded. Marking as Done. Quarterly access reviews continue under standing operational governance.",
        statusChange: { from: "In Progress", to: "Done" }
      }
    ]
  },
  {
    id: "mit-005",
    facility: "Gulf Horizon Terminal",
    facilityId: "fac-3",
    assessmentId: "ass-3-2026",
    cycle: "2026 SRA",
    assessmentState: "Awaiting Approval",
    assetThreat: "Asset 2 × Criminality",
    description:
      "Replace perimeter fencing with anti-cut mesh; install motion sensors at vulnerable points.",
    severity: "High",
    agreed: "Yes",
    ownerLabel: "Facility Operations",
    ownerUserId: "user-j-doe",
    targetDate: "2026-08-15",
    status: "Open",
    assignedBy: "Nadia Haddad",
    assignedDate: "2026-04-10",
    log: []
  }
]);
