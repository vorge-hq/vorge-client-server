import { ASSESSMENT_STATES } from "../features/assessmentWorkspace/assessmentModel";
import { DEFAULT_ASSETS } from "./assets";
import { ASSET_THREAT_LINKS, EVALUATIONS } from "./evaluations";
import { MITIGATIONS } from "./mitigations";
import { DEFAULT_THREATS } from "./threats";

export const ASSESSMENTS = Object.freeze([
  {
    id: "ass-bonny-2026",
    name: "Bonny Refinery — 2026 SRA",
    facilityId: "fac-bonny-refinery",
    cycle: "2026",
    state: ASSESSMENT_STATES.IN_REVIEW,
    version: 4,
    leadAuthorUserId: "user-omar-haddad",
    reviewerUserId: "user-sarah-okonkwo",
    approverUserId: "user-marcus-king",
    lastUpdated: "2026-04-26T08:30:00Z",
    submittedAt: "2026-04-22T14:11:00Z",
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
    executiveSummary:
      "The 2026 SRA for Bonny Refinery confirms cybercrime against the central control room as the highest residual risk after mitigation, followed by organised crime targeting marine product transfer. Mitigation proposals focus on per-vendor authentication, expanded CCTV coverage, radar coverage, and a substation HMI upgrade.",
    conclusion:
      "Overall residual risk is reduced from High to Medium across the assessed scenarios when proposed mitigations are agreed and tracked. Cybercrime requires Approver attention prior to next cycle.",
    sendBackBanner: null,
    locks: {
      reviewerLockedFields: 2
    },
    contributors: [
      {
        id: "contrib-1",
        type: "Core",
        name: "Adaeze Okeke",
        position: "Facility Manager",
        expertise: "Operations",
        company: "Northstar Energy"
      },
      {
        id: "contrib-2",
        type: "Specialist",
        name: "Ben Hartley",
        position: "OT Cyber Lead",
        expertise: "Cyber",
        company: "Northstar Energy"
      },
      {
        id: "contrib-3",
        type: "Part Time",
        name: "Tunde Adigun",
        position: "Marine Coordinator",
        expertise: "Maritime",
        company: "Coastal Marine Services"
      }
    ],
    references: [
      { id: "ref-1", description: "Site security plan (2024)", type: "PDF" },
      { id: "ref-2", description: "Bonny perimeter as-built drawings", type: "DWG" },
      { id: "ref-3", description: "Last SRA exported document", type: "DOCX" }
    ]
  },
  {
    id: "ass-coral-2026",
    name: "Coral FPSO — 2026 SRA",
    facilityId: "fac-coral-fpso",
    cycle: "2026",
    state: ASSESSMENT_STATES.DRAFT,
    version: 1,
    leadAuthorUserId: "user-omar-haddad",
    reviewerUserId: "user-sarah-okonkwo",
    approverUserId: null,
    lastUpdated: "2026-04-29T16:50:00Z",
    submittedAt: null,
    completedSectionIds: [1, 2, 3],
    sectionValidation: {},
    executiveSummary: "",
    conclusion: "",
    sendBackBanner: null,
    locks: { reviewerLockedFields: 0 },
    contributors: [],
    references: []
  },
  {
    id: "ass-port-azura-2025",
    name: "Port Azura — 2025 SRA",
    facilityId: "fac-port-azura",
    cycle: "2025",
    state: ASSESSMENT_STATES.APPROVED,
    version: 1,
    leadAuthorUserId: "user-omar-haddad",
    reviewerUserId: "user-sarah-okonkwo",
    approverUserId: "user-marcus-king",
    lastUpdated: "2025-12-18T09:00:00Z",
    submittedAt: "2025-11-30T10:00:00Z",
    approvedAt: "2025-12-18T09:00:00Z",
    completedSectionIds: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    sectionValidation: {},
    executiveSummary:
      "Port Azura's 2025 SRA was approved with all proposed mitigations agreed. Cyber and maritime threats are tracked into 2026.",
    conclusion: "Continued investment in cyber resilience and CCTV upgrade tied to mitigation tracker.",
    sendBackBanner: null,
    locks: { reviewerLockedFields: 0 },
    contributors: [],
    references: []
  },
  {
    id: "ass-bonny-2025",
    name: "Bonny Refinery — 2025 SRA",
    facilityId: "fac-bonny-refinery",
    cycle: "2025",
    state: ASSESSMENT_STATES.APPROVED,
    version: 1,
    leadAuthorUserId: "user-omar-haddad",
    reviewerUserId: "user-sarah-okonkwo",
    approverUserId: "user-marcus-king",
    lastUpdated: "2025-12-22T15:30:00Z",
    approvedAt: "2025-12-22T15:30:00Z",
    completedSectionIds: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    sectionValidation: {},
    executiveSummary: "Prior cycle approved version.",
    conclusion: "Tracker continues into 2026.",
    sendBackBanner: null,
    locks: { reviewerLockedFields: 0 },
    contributors: [],
    references: []
  }
]);

export function getAssessmentBundle(assessmentId) {
  const assessment = ASSESSMENTS.find((item) => item.id === assessmentId);

  if (!assessment) {
    return null;
  }

  return {
    assessment,
    assets: DEFAULT_ASSETS,
    threats: DEFAULT_THREATS,
    links: ASSET_THREAT_LINKS,
    evaluations: EVALUATIONS,
    mitigations: MITIGATIONS.filter((mitigation) => mitigation.assessmentId === assessmentId)
  };
}
