export const ADMIN_USERS = Object.freeze([
  { id: "u1", name: "Demo Author", email: "demo.author@vantage.local", roles: ["Author"], facilities: "Asset Site 1", mfa: "Disabled", lastSignIn: "2 hours ago" },
  { id: "u2", name: "A. Reviewer", email: "a.reviewer@vantage.local", roles: ["Reviewer"], facilities: "Asset Site 1, Asset Site 2", mfa: "Enabled", lastSignIn: "Yesterday" },
  { id: "u3", name: "M. Approver", email: "m.approver@vantage.local", roles: ["Approver"], facilities: "Asset Site 1, Asset Site 2", mfa: "Enabled", lastSignIn: "3 days ago" },
  { id: "u4", name: "Demo Executive", email: "demo.exec@vantage.local", roles: ["HQ Executive"], facilities: "All", mfa: "Enabled", lastSignIn: "1 hour ago" },
  { id: "u5", name: "Demo Admin", email: "demo.admin@vantage.local", roles: ["Admin"], facilities: "All", mfa: "Enabled", lastSignIn: "Now" },
  { id: "u6", name: "C. Adeyemi", email: "c.adeyemi@operator-a.com", roles: ["Author", "Approver"], facilities: "Asset Site 1", mfa: "Enabled", lastSignIn: "Yesterday" },
  { id: "u7", name: "J. Onyema", email: "j.onyema@operator-a.com", roles: ["Author"], facilities: "Asset Site 2", mfa: "Disabled", lastSignIn: "2 days ago" },
  { id: "u8", name: "B. Onuoha", email: "b.onuoha@operator-a.com", roles: ["Author", "Reviewer"], facilities: "Asset Site 3", mfa: "Enabled", lastSignIn: "5 days ago" }
]);

export const FACILITY_ASSIGNMENTS = Object.freeze([
  { facility: "Asset Site 1", author: "Demo Author", reviewer: "A. Reviewer", approver: "M. Approver" },
  { facility: "Asset Site 2", author: "J. Onyema", reviewer: "A. Reviewer", approver: "M. Approver" },
  { facility: "Asset Site 3", author: "B. Onuoha", reviewer: "A. Reviewer", approver: "M. Approver" }
]);

export const OWNER_POOL = Object.freeze([
  { id: "op1", label: "Security Manager", mappedTo: "C. Adeyemi", email: "c.adeyemi@operator-a.com" },
  { id: "op2", label: "IT Manager", mappedTo: "J. Onyema", email: "j.onyema@operator-a.com" },
  { id: "op3", label: "Facility Operations", mappedTo: "B. Onuoha", email: "b.onuoha@operator-a.com" },
  { id: "op4", label: "HSE Lead", mappedTo: "A. Reviewer", email: "a.reviewer@vantage.local" },
  { id: "op5", label: "Marine Operations", mappedTo: "C. Adeyemi", email: "c.adeyemi@operator-a.com" },
  { id: "op6", label: "Social Performance Manager", mappedTo: "— unassigned —", email: "" }
]);

export const NOTIFICATION_TRIGGERS = Object.freeze([
  { id: "nt1", event: "Assessment submitted for review", recipients: "Reviewer", escalation: "+24h to Admin", active: true },
  { id: "nt2", event: "Review marked complete", recipients: "Approver", escalation: "+24h to Admin", active: true },
  { id: "nt3", event: "Assessment approved", recipients: "Author, Mitigation Owners, HQ Exec", escalation: "—", active: true },
  { id: "nt4", event: "Mitigation overdue", recipients: "Mitigation Owner, Approver", escalation: "+72h to HQ Exec", active: true },
  { id: "nt5", event: "Comments added during review", recipients: "Author", escalation: "—", active: true },
  { id: "nt6", event: "Field lock applied", recipients: "Author", escalation: "—", active: true },
  { id: "nt7", event: "AI anomaly flag raised", recipients: "Author", escalation: "+48h to Reviewer", active: true },
  { id: "nt8", event: "Version created", recipients: "All assessment team", escalation: "—", active: true }
]);

export const EXPORT_SECTIONS = Object.freeze([
  { id: "es1", section: "Cover page", binding: "Front-matter (Author, Reviewer, Approver, dates, version)" },
  { id: "es2", section: "1. Executive Summary", binding: "Section 1 rich text" },
  { id: "es3", section: "2. Facility / Asset Information", binding: "Section 2 fields" },
  { id: "es4", section: "3. Asset Disaggregation", binding: "Section 3 table (no internal-only fields)" },
  { id: "es5", section: "4. Threat Assessment", binding: "Section 4 table" },
  { id: "es6", section: "5. Asset Attractiveness", binding: "Section 5 cross-reference matrix" },
  { id: "es7", section: "6. Vulnerability Assessment", binding: "Section 6 evaluations + R1/R2 chips" },
  { id: "es8", section: "7. Proposed Mitigation", binding: "Section 7 table" },
  { id: "es9", section: "8. Conclusion", binding: "Section 8 rich text" },
  { id: "es10", section: "9. Appendices", binding: "Section 9 sub-tabs (Team, References, Risk Matrix)" }
]);

export const MFA_POLICY = Object.freeze([
  { role: "Author", required: false },
  { role: "Reviewer", required: true },
  { role: "Approver", required: true },
  { role: "HQ Executive", required: true },
  { role: "Admin", required: true },
  { role: "Mitigation Owner", required: false }
]);
