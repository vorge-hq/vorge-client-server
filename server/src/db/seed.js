const bcrypt = require("bcryptjs");
const db = require("./knex");
const env = require("../config/env");
const { ASSESSMENT_STATES, MITIGATION_STATUSES, ROLES } = require("../services/constants");

const IDS = Object.freeze({
  northstar: "00000000-0000-4000-8000-000000000001",
  bonny: "00000000-0000-4000-8000-000000000101",
  coral: "00000000-0000-4000-8000-000000000102",
  omar: "00000000-0000-4000-8000-000000000201",
  sarah: "00000000-0000-4000-8000-000000000202",
  marcus: "00000000-0000-4000-8000-000000000203",
  elena: "00000000-0000-4000-8000-000000000204",
  priya: "00000000-0000-4000-8000-000000000205",
  james: "00000000-0000-4000-8000-000000000206",
  bonny2026: "00000000-0000-4000-8000-000000000301",
  coral2026: "00000000-0000-4000-8000-000000000302",
  bonny2025: "00000000-0000-4000-8000-000000000303",
  controlRoom: "00000000-0000-4000-8000-000000000401",
  marineTerminal: "00000000-0000-4000-8000-000000000402",
  cyberThreat: "00000000-0000-4000-8000-000000000501",
  maritimeThreat: "00000000-0000-4000-8000-000000000502",
  linkControlCyber: "00000000-0000-4000-8000-000000000601",
  evalControlCyber: "00000000-0000-4000-8000-000000000701",
  evalMarineMaritime: "00000000-0000-4000-8000-000000000702",
  mitigationVendorCredentials: "00000000-0000-4000-8000-000000000801",
  mitigationRadarUpgrade: "00000000-0000-4000-8000-000000000802",
  mitigationApprovedCctv: "00000000-0000-4000-8000-000000000803",
  progressApprovedCctv: "00000000-0000-4000-8000-000000000901"
});

function roleAssignment(id, userId, role, facilityId, crossFacility = false) {
  return {
    id,
    user_id: userId,
    operator_id: IDS.northstar,
    facility_id: facilityId,
    role,
    cross_facility: crossFacility
  };
}

async function upsert(trx, table, rows) {
  if (rows.length === 0) {
    return;
  }

  await trx(table).insert(rows).onConflict("id").merge();
}

async function seed() {
  const passwordHash = await bcrypt.hash("VantageDemo123!", env.bcryptRounds);

  await db.transaction(async (trx) => {
    await upsert(trx, "operators", [
      { id: IDS.northstar, name: "Northstar Energy" }
    ]);

    await upsert(trx, "facilities", [
      {
        id: IDS.bonny,
        operator_id: IDS.northstar,
        name: "Bonny Refinery",
        configuration: {
          region: "Niger Delta, Nigeria",
          riskBands: [
            { min: 1, max: 4, label: "Low" },
            { min: 5, max: 9, label: "Medium" },
            { min: 10, max: 15, label: "High" },
            { min: 16, max: 25, label: "Very High" }
          ]
        }
      },
      {
        id: IDS.coral,
        operator_id: IDS.northstar,
        name: "Coral FPSO",
        configuration: { region: "Offshore Mozambique" }
      }
    ]);

    await upsert(trx, "users", [
      { id: IDS.omar, email: "omar.haddad@northstar.example", password_hash: passwordHash, name: "Omar Haddad", mfa_enabled: true },
      { id: IDS.sarah, email: "sarah.okonkwo@northstar.example", password_hash: passwordHash, name: "Sarah Okonkwo", mfa_enabled: true },
      { id: IDS.marcus, email: "marcus.king@northstar.example", password_hash: passwordHash, name: "Marcus King", mfa_enabled: true },
      { id: IDS.elena, email: "elena.park@northstar.example", password_hash: passwordHash, name: "Elena Park", mfa_enabled: true },
      { id: IDS.priya, email: "priya.rao@alora.example", password_hash: passwordHash, name: "Priya Rao", mfa_enabled: true },
      { id: IDS.james, email: "james.clark@vendor.example", password_hash: passwordHash, name: "James Clark", mfa_enabled: false }
    ]);

    await upsert(trx, "role_assignments", [
      roleAssignment("00000000-0000-4000-8000-000000001001", IDS.omar, ROLES.AUTHOR, IDS.bonny),
      roleAssignment("00000000-0000-4000-8000-000000001002", IDS.omar, ROLES.AUTHOR, IDS.coral),
      roleAssignment("00000000-0000-4000-8000-000000001003", IDS.sarah, ROLES.REVIEWER, IDS.bonny),
      roleAssignment("00000000-0000-4000-8000-000000001004", IDS.sarah, ROLES.REVIEWER, IDS.coral),
      roleAssignment("00000000-0000-4000-8000-000000001005", IDS.marcus, ROLES.APPROVER, IDS.bonny),
      roleAssignment("00000000-0000-4000-8000-000000001006", IDS.elena, ROLES.HQ_EXECUTIVE, IDS.bonny),
      roleAssignment("00000000-0000-4000-8000-000000001007", IDS.elena, ROLES.HQ_EXECUTIVE, IDS.coral),
      roleAssignment("00000000-0000-4000-8000-000000001008", IDS.priya, ROLES.ADMIN, IDS.bonny, true),
      roleAssignment("00000000-0000-4000-8000-000000001009", IDS.priya, ROLES.ADMIN, IDS.coral, true),
      roleAssignment("00000000-0000-4000-8000-000000001010", IDS.james, ROLES.MITIGATION_OWNER, IDS.bonny),
      roleAssignment("00000000-0000-4000-8000-000000001011", IDS.james, ROLES.MITIGATION_OWNER, IDS.coral)
    ]);

    await upsert(trx, "assessments", [
      {
        id: IDS.bonny2026,
        operator_id: IDS.northstar,
        facility_id: IDS.bonny,
        lead_author_user_id: IDS.omar,
        name: "Bonny Refinery - 2026 SRA",
        state: ASSESSMENT_STATES.IN_REVIEW,
        lock_version: 4,
        contributors: [
          { id: "contrib-1", type: "Core", name: "Adaeze Okeke", position: "Facility Manager", expertise: "Operations", company: "Northstar Energy" }
        ]
      },
      {
        id: IDS.coral2026,
        operator_id: IDS.northstar,
        facility_id: IDS.coral,
        lead_author_user_id: IDS.omar,
        name: "Coral FPSO - 2026 SRA",
        state: ASSESSMENT_STATES.DRAFT,
        lock_version: 1,
        contributors: []
      },
      {
        id: IDS.bonny2025,
        operator_id: IDS.northstar,
        facility_id: IDS.bonny,
        lead_author_user_id: IDS.omar,
        name: "Bonny Refinery - 2025 SRA",
        state: ASSESSMENT_STATES.APPROVED,
        lock_version: 1,
        contributors: []
      }
    ]);

    await upsert(trx, "assets", [
      {
        id: IDS.controlRoom,
        facility_id: IDS.bonny,
        assessment_id: IDS.bonny2026,
        name: "Central Control Room",
        asset_type: "Control Room",
        criticality: "Very High",
        details: { description: "DCS and emergency control point" }
      },
      {
        id: IDS.marineTerminal,
        facility_id: IDS.bonny,
        assessment_id: IDS.bonny2026,
        name: "Marine Loading Terminal",
        asset_type: "Marine",
        criticality: "High",
        details: { description: "Product transfer berth and hose-handling pad" }
      }
    ]);

    await upsert(trx, "threats", [
      {
        id: IDS.cyberThreat,
        facility_id: IDS.bonny,
        assessment_id: IDS.bonny2026,
        name: "Cybercrime & Data Breaches",
        likelihood: 4,
        details: { rating: "High" }
      },
      {
        id: IDS.maritimeThreat,
        facility_id: IDS.bonny,
        assessment_id: IDS.bonny2026,
        name: "Maritime",
        likelihood: 3,
        details: { rating: "Medium" }
      }
    ]);

    await upsert(trx, "asset_threat_links", [
      {
        id: IDS.linkControlCyber,
        facility_id: IDS.bonny,
        assessment_id: IDS.bonny2026,
        asset_id: IDS.controlRoom,
        threat_id: IDS.cyberThreat,
        enabled: true
      }
    ]);

    await upsert(trx, "evaluations", [
      {
        id: IDS.evalControlCyber,
        facility_id: IDS.bonny,
        assessment_id: IDS.bonny2026,
        asset_id: IDS.controlRoom,
        threat_id: IDS.cyberThreat,
        scenario: "Vendor remote access compromise affects control-room workstations.",
        controls: "VPN access, vendor approval workflow",
        vulnerabilities: "Shared vendor credentials and weak backup isolation",
        proposed_mitigation: "Implement per-vendor accounts with MFA and isolate DCS backups.",
        r1: { score: 20, band: "Very High" },
        r2: { score: 8, band: "Medium" }
      },
      {
        id: IDS.evalMarineMaritime,
        facility_id: IDS.bonny,
        assessment_id: IDS.bonny2025,
        asset_id: IDS.marineTerminal,
        threat_id: IDS.maritimeThreat,
        scenario: "Unauthorised vessel approach during product transfer.",
        controls: "Escort scheduling, patrols, CCTV",
        vulnerabilities: "Coverage gaps at shift handover",
        proposed_mitigation: "Upgrade radar coverage and revise escort scheduling.",
        r1: { score: 15, band: "High" },
        r2: { score: 6, band: "Medium" }
      }
    ]);

    await upsert(trx, "mitigations", [
      {
        id: IDS.mitigationVendorCredentials,
        facility_id: IDS.bonny,
        assessment_id: IDS.bonny2026,
        evaluation_id: IDS.evalControlCyber,
        owner_user_id: IDS.james,
        owner_role_label: "IT Director",
        description: "Implement per-vendor accounts with MFA and isolate DCS backups.",
        severity: "Very High",
        agreed: "Yes",
        target_date: "2026-08-15",
        status: MITIGATION_STATUSES.OPEN
      },
      {
        id: IDS.mitigationApprovedCctv,
        facility_id: IDS.bonny,
        assessment_id: IDS.bonny2025,
        evaluation_id: IDS.evalMarineMaritime,
        owner_user_id: IDS.james,
        owner_role_label: "Security Manager",
        description: "Upgrade radar coverage and revise escort scheduling for shift handover.",
        severity: "High",
        agreed: "Yes",
        target_date: "2026-12-31",
        status: MITIGATION_STATUSES.IN_PROGRESS
      }
    ]);

    await trx("mitigation_progress_logs")
      .insert([
        {
          id: IDS.progressApprovedCctv,
          facility_id: IDS.bonny,
          mitigation_id: IDS.mitigationApprovedCctv,
          user_id: IDS.james,
          from_status: MITIGATION_STATUSES.OPEN,
          to_status: MITIGATION_STATUSES.IN_PROGRESS,
          note: "Radar vendor selected; installation planning started.",
          created_at: "2026-04-25T17:02:00.000Z"
        }
      ])
      .onConflict("id")
      .ignore();
  });

  console.log("Seeded Vantage demo data.");
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.destroy());
