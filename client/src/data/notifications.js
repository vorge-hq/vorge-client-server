export const NOTIFICATIONS = Object.freeze([
  {
    id: "n1",
    type: "comment",
    severity: "info",
    title: "Mei-Lin Tanaka left a comment",
    body: "Asset 3 × Cyber — \"Vendor laptop quarantine procedure needs more specificity.\"",
    timestamp: "2026-04-26T13:55:00Z",
    targetRoles: ["Author"],
    href: "/assessments/ass-1-2026/sections/6",
    read: false
  },
  {
    id: "n2",
    type: "mitigation-overdue",
    severity: "warn",
    title: "Mitigation overdue",
    body: "Asset 1 × Criminality — Upgrade CCTV with analytics. Owner: Security Manager",
    timestamp: "2026-04-26T12:00:00Z",
    targetRoles: ["Author"],
    href: "/mitigations",
    read: false
  },
  {
    id: "n3",
    type: "ai-flag",
    severity: "info",
    title: "AI inconsistency flag",
    body: "Asset 7 — criticality vs consequences mismatch detected.",
    timestamp: "2026-04-26T10:00:00Z",
    targetRoles: ["Author"],
    href: "/assessments/ass-1-2026/sections/3",
    read: false
  },
  {
    id: "n4",
    type: "approved",
    severity: "info",
    title: "Delta Crest Terminal — 2026 SRA approved",
    body: "Rafael Castellanos signed off. Ready for distribution.",
    timestamp: "2026-04-25T18:00:00Z",
    targetRoles: ["Author"],
    href: "/assessments/ass-2-2026/sections/1",
    read: true
  },
  {
    id: "n5",
    type: "version-created",
    severity: "info",
    title: "New assessment cycle started",
    body: "2026 annual cycle opened for Pernis Refinery Complex.",
    timestamp: "2026-04-23T09:00:00Z",
    targetRoles: ["Author"],
    href: "/assessments",
    read: true
  },
  {
    id: "rn1",
    type: "submitted",
    severity: "info",
    title: "New assessment for review",
    body: "Delta Crest Terminal — 2026 SRA submitted by Hassan Al-Mansoori.",
    timestamp: "2026-04-25T16:25:00Z",
    targetRoles: ["Reviewer"],
    href: "/assessments/ass-2-2026/sections/1",
    read: false
  },
  {
    id: "rn2",
    type: "review-overdue",
    severity: "warn",
    title: "Review overdue",
    body: "Gulf Horizon Terminal — 2026 SRA. Target review date passed.",
    timestamp: "2026-04-22T08:00:00Z",
    targetRoles: ["Reviewer"],
    href: "/assessments/ass-3-2026/sections/1",
    read: false
  },
  {
    id: "rn3",
    type: "send-back",
    severity: "warn",
    title: "Rafael Castellanos sent assessment back",
    body: "Eko Petrochemical Hub — 2025 SRA. \"Needs maritime ratings revisit.\"",
    timestamp: "2026-04-19T15:30:00Z",
    targetRoles: ["Reviewer"],
    href: "/assessments/ass-1-2025/sections/1",
    read: true
  },
  {
    id: "an1",
    type: "ready-for-approval",
    severity: "info",
    title: "Assessment ready for approval",
    body: "Eko Petrochemical Hub — 2026 SRA. Mei-Lin Tanaka marked complete.",
    timestamp: "2026-04-26T14:00:00Z",
    targetRoles: ["Approver"],
    href: "/assessments/ass-1-2026/sections/1",
    read: false
  },
  {
    id: "an2",
    type: "approved",
    severity: "info",
    title: "You approved Delta Crest Terminal — 2025 SRA",
    body: "Final sign-off recorded. Ready for distribution.",
    timestamp: "2026-04-12T10:00:00Z",
    targetRoles: ["Approver"],
    href: "/assessments/ass-2-2025/sections/1",
    read: true
  },
  {
    id: "mn1",
    type: "mitigation-overdue",
    severity: "danger",
    title: "Mitigation overdue",
    body:
      "Asset 3 × Cyber (Eko Petrochemical Hub) — vendor laptop quarantine procedure. Target was 2026-04-15.",
    timestamp: "2026-04-09T12:00:00Z",
    targetRoles: ["Mitigation Owner"],
    href: "/mitigations",
    read: false
  },
  {
    id: "mn2",
    type: "mitigation-assigned",
    severity: "info",
    title: "New mitigation assigned",
    body:
      "Asset 2 × Criminality (Gulf Horizon Terminal) — perimeter fencing replacement. Pending approval.",
    timestamp: "2026-04-05T09:00:00Z",
    targetRoles: ["Mitigation Owner"],
    href: "/mitigations",
    read: false
  },
  {
    id: "mn3",
    type: "approved",
    severity: "info",
    title: "Assessment approved — your mitigations now active",
    body:
      "Eko Petrochemical Hub — 2026 SRA. 2 mitigations assigned to you are now actionable.",
    timestamp: "2026-04-21T10:00:00Z",
    targetRoles: ["Mitigation Owner"],
    href: "/mitigations",
    read: true
  },
  {
    id: "mn4",
    type: "mitigation-done",
    severity: "info",
    title: "Mitigation closed (2025 cycle)",
    body:
      "Asset 4 × Insider — behavioural risk programme marked Done. Carried into 2026 cycle as historical record.",
    timestamp: "2025-12-26T11:00:00Z",
    targetRoles: ["Mitigation Owner"],
    href: "/mitigations",
    read: true
  },
  {
    id: "hn1",
    type: "approved",
    severity: "info",
    title: "New approved assessment",
    body: "Delta Crest Terminal — 2026 SRA. Rafael Castellanos signed off.",
    timestamp: "2026-04-25T18:00:00Z",
    targetRoles: ["HQ Executive"],
    href: "/assessments/ass-2-2026/sections/1",
    read: false
  },
  {
    id: "hn2",
    type: "mitigation-overdue",
    severity: "warn",
    title: "Overdue mitigations",
    body: "7 mitigations across 3 facilities are past their target date.",
    timestamp: "2026-04-24T09:00:00Z",
    targetRoles: ["HQ Executive"],
    href: "/dashboard",
    read: false
  },
  {
    id: "hn3",
    type: "ai-flag",
    severity: "info",
    title: "Cross-facility inconsistency",
    body:
      "Maritime threat ratings vary significantly between Eko Petrochemical Hub and Gulf Horizon Terminal assessments.",
    timestamp: "2026-04-19T11:00:00Z",
    targetRoles: ["HQ Executive"],
    href: "/dashboard",
    read: true
  },
  {
    id: "adn1",
    type: "config-change",
    severity: "info",
    title: "Configuration change pending approval",
    body: "Risk band thresholds updated by Olivia Bennett — review required.",
    timestamp: "2026-04-26T13:00:00Z",
    targetRoles: ["Admin"],
    href: "/admin",
    read: false
  },
  {
    id: "adn2",
    type: "user-added",
    severity: "info",
    title: "New user account created",
    body: "Elena Park (Mitigation Owner — IT Security) — MFA pending setup.",
    timestamp: "2026-04-25T15:00:00Z",
    targetRoles: ["Admin"],
    href: "/admin",
    read: true
  }
]);
