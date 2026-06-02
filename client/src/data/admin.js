export const ADMIN_USERS = Object.freeze([
  { id: "u1", name: "Adaeze Okeke", email: "adaeze.okeke@vorge.local", roles: ["Author"], facilities: "Eko Petrochemical Hub", mfa: "Disabled", lastSignIn: "2 hours ago" },
  { id: "u2", name: "Mei-Lin Tanaka", email: "meilin.tanaka@vorge.local", roles: ["Reviewer"], facilities: "Eko Petrochemical Hub, Delta Crest Terminal", mfa: "Enabled", lastSignIn: "Yesterday" },
  { id: "u3", name: "Rafael Castellanos", email: "rafael.castellanos@vorge.local", roles: ["Approver"], facilities: "Eko Petrochemical Hub, Delta Crest Terminal", mfa: "Enabled", lastSignIn: "3 days ago" },
  { id: "u4", name: "Sarah Chen", email: "sarah.chen@vorge.local", roles: ["HQ Executive"], facilities: "All", mfa: "Enabled", lastSignIn: "1 hour ago" },
  { id: "u5", name: "Olivia Bennett", email: "olivia.bennett@vorge.local", roles: ["Admin"], facilities: "All", mfa: "Enabled", lastSignIn: "Now" },
  { id: "u6", name: "Daniel Mensah", email: "daniel.mensah@operator-a.com", roles: ["Author", "Approver"], facilities: "Eko Petrochemical Hub", mfa: "Enabled", lastSignIn: "Yesterday" },
  { id: "u7", name: "Hassan Al-Mansoori", email: "hassan.al-mansoori@operator-a.com", roles: ["Author"], facilities: "Delta Crest Terminal", mfa: "Disabled", lastSignIn: "2 days ago" },
  { id: "u8", name: "Nadia Haddad", email: "nadia.haddad@operator-a.com", roles: ["Author", "Reviewer"], facilities: "Gulf Horizon Terminal", mfa: "Enabled", lastSignIn: "5 days ago" }
]);

export const FACILITY_ASSIGNMENTS = Object.freeze([
  { facility: "Eko Petrochemical Hub", author: "Adaeze Okeke", reviewer: "Mei-Lin Tanaka", approver: "Rafael Castellanos" },
  { facility: "Delta Crest Terminal", author: "Hassan Al-Mansoori", reviewer: "Mei-Lin Tanaka", approver: "Rafael Castellanos" },
  { facility: "Gulf Horizon Terminal", author: "Nadia Haddad", reviewer: "Mei-Lin Tanaka", approver: "Rafael Castellanos" }
]);

export const OWNER_POOL = Object.freeze([
  { id: "op1", label: "Security Manager", mappedTo: "Daniel Mensah", email: "daniel.mensah@operator-a.com" },
  { id: "op2", label: "IT Manager", mappedTo: "Marcus Johnson", email: "marcus.johnson@operator-a.com" },
  { id: "op3", label: "Facility Operations", mappedTo: "Nadia Haddad", email: "nadia.haddad@operator-a.com" },
  { id: "op4", label: "HSE Lead", mappedTo: "Tomás Herrera", email: "tomas.herrera@operator-a.com" },
  { id: "op5", label: "Marine Operations", mappedTo: "Yusuf Bello", email: "yusuf.bello@operator-a.com" },
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
  { id: "es3", section: "2. Facility Information", binding: "Section 2 fields" },
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
  { role: "Reviewer", required: false },
  { role: "Approver", required: true },
  { role: "HQ Executive", required: true },
  { role: "Admin", required: true },
  { role: "Mitigation Owner", required: false }
]);
