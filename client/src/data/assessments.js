import { ASSESSMENT_STATES } from "../features/assessmentWorkspace/assessmentModel";
import { DEFAULT_ASSETS } from "./assets";
import { ASSET_THREAT_LINKS, EVALUATIONS, SEED_MATRIX } from "./evaluations";
import { MITIGATIONS } from "./mitigations";
import { DEFAULT_THREATS } from "./threats";

const SEED_EXEC_SUMMARY =
  "The 2026 SRA for Asset Site 1 confirms cybercrime against the central control room as the highest residual risk after mitigation, followed by organised crime targeting marine product transfer. Mitigation proposals focus on per-vendor authentication, expanded CCTV coverage, radar coverage, and a substation HMI upgrade.";

const SEED_CONCLUSION =
  "Overall residual risk is reduced from High to Medium across the assessed scenarios when proposed mitigations are agreed and tracked. Cybercrime requires Approver attention prior to next cycle.";

export const ACTIVE_ASSESSMENT_ID = "ass-1-2026";

export const ASSESSMENTS = Object.freeze([
  {
    id: ACTIVE_ASSESSMENT_ID,
    name: "Asset Site 1 — 2026 SRA",
    facilityId: "fac-1",
    cycle: "2026",
    state: ASSESSMENT_STATES.DRAFT,
    version: "v0.7",
    leadAuthorUserId: "user-demo-author",
    reviewerUserId: "user-a-reviewer",
    approverUserId: "user-m-approver",
    lastUpdated: "2026-04-30T18:00:00Z",
    submittedAt: null,
    completedSectionIds: [1, 2, 3, 4, 5, 6, 7],
    sectionValidation: {
      1: { errors: 0, comments: 1 },
      2: { errors: 0, comments: 0 },
      3: { errors: 0, comments: 2 },
      4: { errors: 0, comments: 0 },
      5: { errors: 0, comments: 1 },
      6: { errors: 1, comments: 4 },
      7: { errors: 0, comments: 1 },
      8: { errors: 1, comments: 0 },
      9: { errors: 0, comments: 0 }
    },
    executiveSummary: SEED_EXEC_SUMMARY,
    conclusion: SEED_CONCLUSION,
    sendBackBanner: null,
    locks: { reviewerLockedFields: 2 },
    contributors: [
      {
        id: "contrib-1",
        type: "Core",
        name: "C. Adeyemi",
        position: "Facility Manager",
        expertise: "Operations",
        company: "Operator A"
      },
      {
        id: "contrib-2",
        type: "Specialist",
        name: "B. Hartley",
        position: "OT Cyber Lead",
        expertise: "Cyber",
        company: "Operator A"
      },
      {
        id: "contrib-3",
        type: "Part Time",
        name: "T. Adigun",
        position: "Marine Coordinator",
        expertise: "Maritime",
        company: "Coastal Marine Services"
      }
    ],
    references: [
      { id: "ref-1", description: "Site security plan (2024)", type: "PDF" },
      { id: "ref-2", description: "Asset Site 1 perimeter as-built drawings", type: "DWG" },
      { id: "ref-3", description: "Last SRA exported document", type: "DOCX" }
    ]
  },
  {
    id: "ass-2-2026",
    name: "Asset Site 2 — 2026 SRA",
    facilityId: "fac-2",
    cycle: "2026",
    state: ASSESSMENT_STATES.IN_REVIEW,
    reviewerState: "opened",
    version: "v0.4",
    leadAuthorUserId: "user-demo-author",
    reviewerUserId: "user-a-reviewer",
    approverUserId: "user-m-approver",
    lastUpdated: "2026-04-29T14:00:00Z",
    submittedAt: "2026-04-25T09:00:00Z",
    completedSectionIds: [1, 2, 3, 4, 5, 6, 7],
    sectionValidation: {},
    executiveSummary:
      "Marine terminal transfer operations remain the dominant exposure for organised crime and insider collusion.",
    conclusion: "",
    sendBackBanner: null,
    locks: { reviewerLockedFields: 0 },
    contributors: [],
    references: []
  },
  {
    id: "ass-3-2026",
    name: "Asset Site 3 — 2026 SRA",
    facilityId: "fac-3",
    cycle: "2026",
    state: ASSESSMENT_STATES.AWAITING_APPROVAL,
    version: "v0.3",
    leadAuthorUserId: "user-demo-author",
    reviewerUserId: "user-a-reviewer",
    approverUserId: "user-m-approver",
    lastUpdated: "2026-04-30T08:00:00Z",
    submittedAt: "2026-04-25T08:00:00Z",
    completedSectionIds: [1, 2, 3, 4, 5, 6],
    sectionValidation: {},
    executiveSummary: "",
    conclusion: "",
    sendBackBanner: null,
    locks: { reviewerLockedFields: 0 },
    contributors: [],
    references: []
  },
  {
    id: "ass-1-2025",
    name: "Asset Site 1 — 2025 SRA",
    facilityId: "fac-1",
    cycle: "2025",
    state: ASSESSMENT_STATES.APPROVED,
    version: "v1.0",
    leadAuthorUserId: "user-demo-author",
    reviewerUserId: "user-a-reviewer",
    approverUserId: "user-m-approver",
    lastUpdated: "2025-09-12T10:00:00Z",
    approvedAt: "2025-09-12T10:00:00Z",
    completedSectionIds: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    sectionValidation: {},
    executiveSummary: "Prior cycle approved version.",
    conclusion: "Tracker continues into 2026.",
    sendBackBanner: null,
    locks: { reviewerLockedFields: 0 },
    contributors: [],
    references: []
  },
  {
    id: "ass-2-2025",
    name: "Asset Site 2 — 2025 SRA",
    facilityId: "fac-2",
    cycle: "2025",
    state: ASSESSMENT_STATES.APPROVED,
    version: "v1.0",
    leadAuthorUserId: "user-demo-author",
    reviewerUserId: "user-a-reviewer",
    approverUserId: "user-m-approver",
    lastUpdated: "2025-09-04T10:00:00Z",
    approvedAt: "2025-09-04T10:00:00Z",
    completedSectionIds: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    sectionValidation: {},
    executiveSummary: "Prior cycle approved version.",
    conclusion: "Carried forward.",
    sendBackBanner: null,
    locks: { reviewerLockedFields: 0 },
    contributors: [],
    references: []
  }
]);

export function getAssessment(assessmentId) {
  return ASSESSMENTS.find((item) => item.id === assessmentId) || null;
}

export function getAssessmentBundle(assessmentId) {
  const assessment = getAssessment(assessmentId);
  if (!assessment) {
    return null;
  }

  return {
    assessment,
    assets: DEFAULT_ASSETS,
    threats: DEFAULT_THREATS,
    links: ASSET_THREAT_LINKS,
    matrix: SEED_MATRIX,
    evaluations: EVALUATIONS,
    mitigations: MITIGATIONS.filter((mitigation) => mitigation.assessmentId === assessmentId)
  };
}

export const HQ_AGGREGATE = Object.freeze([
  { facilityId: "fac-2", name: "Asset Site 2", open: 14, high: 4, vhigh: 1, overdue: 2, status: "Approved" },
  { facilityId: "fac-3", name: "Asset Site 3", open: 9, high: 2, vhigh: 0, overdue: 0, status: "Approved" },
  { facilityId: "fac-4", name: "Asset Site 4", open: 18, high: 5, vhigh: 2, overdue: 4, status: "In Review" },
  { facilityId: "fac-5", name: "Asset Site 5", open: 11, high: 3, vhigh: 0, overdue: 1, status: "Approved" }
]);
