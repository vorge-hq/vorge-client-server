export const NOTIFICATIONS = Object.freeze([
  {
    id: "notif-1",
    type: "review-complete",
    severity: "info",
    title: "Bonny Refinery 2026 SRA — Review complete",
    body: "Sarah Okonkwo marked the assessment review complete and forwarded to Marcus King for approval.",
    timestamp: "2026-04-26T08:30:00Z",
    targetRoles: ["Approver", "Author"],
    href: "/assessments/ass-bonny-2026/sections/8",
    read: false
  },
  {
    id: "notif-2",
    type: "comment",
    severity: "info",
    title: "New review comment in Section 6",
    body: "Reviewer added a comment on Evaluation: Control Room — Cybercrime.",
    timestamp: "2026-04-25T13:18:00Z",
    targetRoles: ["Author"],
    href: "/assessments/ass-bonny-2026/sections/6",
    read: false
  },
  {
    id: "notif-3",
    type: "send-back",
    severity: "warn",
    title: "Send-back received: Section 8 needs revision",
    body: "Reviewer requested clarification on Conclusion paragraph 2.",
    timestamp: "2026-04-23T10:01:00Z",
    targetRoles: ["Author"],
    href: "/assessments/ass-bonny-2026/sections/8",
    read: true
  },
  {
    id: "notif-4",
    type: "mitigation-overdue",
    severity: "warn",
    title: "Mitigation overdue: Substation HMI replacement",
    body: "Target date passed; status remains In Progress.",
    timestamp: "2026-03-02T07:00:00Z",
    targetRoles: ["Mitigation Owner", "Approver"],
    href: "/mitigations",
    read: false
  },
  {
    id: "notif-5",
    type: "ai-flag",
    severity: "info",
    title: "Anomaly flag: Section 6 evaluation",
    body: "Severity rating may be inconsistent with described consequences.",
    timestamp: "2026-04-20T08:45:00Z",
    targetRoles: ["Author"],
    href: "/assessments/ass-bonny-2026/sections/6",
    read: true
  }
]);
