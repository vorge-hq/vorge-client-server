const bcrypt = require("bcryptjs");
const db = require("./knex");
const env = require("../config/env");
const { ASSESSMENT_STATES, MITIGATION_STATUSES, ROLES } = require("../services/constants");
const { defaultVocabularyRows } = require("../services/tagVocabularyService");
const { seedVocabulary } = require("../repositories/tagRepository");

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
  progressApprovedCctv: "00000000-0000-4000-8000-000000000901",

  // Bonny 2025 (Approved) — its own marine asset/threat/link so its evaluation no
  // longer squats on Bonny 2026's asset+threat pair (evaluations are UNIQUE on
  // asset_id+threat_id). Also gives the Approved-export test real §3/§4/§5 tables.
  bonny2025Marine: "00000000-0000-4000-8000-000000000403",
  bonny2025Maritime: "00000000-0000-4000-8000-000000000503",
  bonny2025Link: "00000000-0000-4000-8000-000000000603",

  // Bonny 2026 — extra link/evaluation/mitigation so the matrix, evaluation, and
  // mitigation surfaces all have live content to exercise.
  linkMarineMaritime2026: "00000000-0000-4000-8000-000000000604",
  evalMarineMaritime2026: "00000000-0000-4000-8000-000000000703",

  // Pernis Refinery (coral2026) — a full Draft to author against.
  pernisCdu: "00000000-0000-4000-8000-000000000411",
  pernisTankFarm: "00000000-0000-4000-8000-000000000412",
  pernisJetty: "00000000-0000-4000-8000-000000000413",
  pernisSabotage: "00000000-0000-4000-8000-000000000511",
  pernisTheft: "00000000-0000-4000-8000-000000000512",
  pernisUnrest: "00000000-0000-4000-8000-000000000513",
  pernisLinkCduSabotage: "00000000-0000-4000-8000-000000000611",
  pernisLinkTankTheft: "00000000-0000-4000-8000-000000000612",
  pernisLinkJettyUnrest: "00000000-0000-4000-8000-000000000613",
  pernisEvalCduSabotage: "00000000-0000-4000-8000-000000000711",
  pernisEvalTankTheft: "00000000-0000-4000-8000-000000000712",
  pernisEvalJettyUnrest: "00000000-0000-4000-8000-000000000713",
  pernisMitCdu: "00000000-0000-4000-8000-000000000811",
  pernisMitTank: "00000000-0000-4000-8000-000000000812",

  // Section narrative rows (assessment_sections). 12xx = Bonny 2026, 13xx = Pernis.
  secBonny1: "00000000-0000-4000-8000-000000001201",
  secBonny2: "00000000-0000-4000-8000-000000001202",
  secBonny8: "00000000-0000-4000-8000-000000001208",
  secPernis1: "00000000-0000-4000-8000-000000001301",
  secPernis2: "00000000-0000-4000-8000-000000001302",
  secPernis8: "00000000-0000-4000-8000-000000001308"
});

// §19-default library content (five types per §12). Seeded per facility so the
// semantic-search feature (O3) and the Admin library surface have real content.
// 14xx = Bonny, 15xx = Pernis. Idempotent via upsert-on-id.
function libraryEntry(id, facilityId, type, title, body) {
  return { id, facility_id: facilityId, type, title, body, metadata: JSON.stringify({}) };
}

const LIBRARY_ENTRIES = [
  // Scenarios
  libraryEntry("00000000-0000-4000-8000-000000001401", IDS.bonny, "Scenarios", "Unauthorised vessel approach", "An unidentified vessel approaches the marine loading terminal during product transfer, threatening berth security and crew safety."),
  libraryEntry("00000000-0000-4000-8000-000000001402", IDS.bonny, "Scenarios", "Vendor remote-access compromise", "A trusted maintenance vendor's remote-access credentials are compromised and used to reach control-room workstations."),
  // Mitigations
  libraryEntry("00000000-0000-4000-8000-000000001411", IDS.bonny, "Mitigations", "Per-vendor MFA accounts", "Replace shared vendor logins with per-vendor accounts protected by multi-factor authentication and time-bound access approval."),
  libraryEntry("00000000-0000-4000-8000-000000001412", IDS.bonny, "Mitigations", "Upgrade radar coverage", "Extend marine radar coverage and revise escort scheduling to close surveillance gaps during shift handover."),
  // Vulnerabilities
  libraryEntry("00000000-0000-4000-8000-000000001421", IDS.bonny, "Vulnerabilities", "Shared vendor credentials", "Maintenance vendors share a single privileged credential, removing individual accountability and enabling lateral movement."),
  libraryEntry("00000000-0000-4000-8000-000000001422", IDS.bonny, "Vulnerabilities", "Surveillance gap at handover", "Marine perimeter surveillance has reduced coverage during the 06:00 and 18:00 shift handovers."),
  // Controls
  libraryEntry("00000000-0000-4000-8000-000000001431", IDS.bonny, "Controls", "Segmented OT network", "Operational-technology network segmented from corporate IT with monitored, approval-gated crossings."),
  // Consequences
  libraryEntry("00000000-0000-4000-8000-000000001441", IDS.bonny, "Consequences", "Loss of process control", "Prolonged loss of distributed process control and emergency-shutdown capability across the terminal."),

  // Pernis Refinery
  libraryEntry("00000000-0000-4000-8000-000000001501", IDS.coral, "Scenarios", "CDU control-cabinet intrusion", "A coordinated intrusion targets the crude distillation unit control cabinets, aiming to disrupt refinery-wide operations."),
  libraryEntry("00000000-0000-4000-8000-000000001502", IDS.coral, "Scenarios", "Tank-farm product pilferage", "Unauthorised tanker loading at the tank farm results in pilferage of stored product over an extended period."),
  libraryEntry("00000000-0000-4000-8000-000000001511", IDS.coral, "Mitigations", "North-perimeter intrusion detection", "Install intrusion detection and a secondary barrier on the north perimeter of the crude distillation unit."),
  libraryEntry("00000000-0000-4000-8000-000000001512", IDS.coral, "Mitigations", "Automated seal reconciliation", "Automate seal reconciliation and add thermal cameras to close blind spots between tank-farm bunds."),
  libraryEntry("00000000-0000-4000-8000-000000001521", IDS.coral, "Vulnerabilities", "Single-layer north perimeter", "The north boundary relies on a single-layer perimeter fence with limited intrusion detection."),
  libraryEntry("00000000-0000-4000-8000-000000001531", IDS.coral, "Controls", "Marine exclusion zone", "A declared marine exclusion zone with port-authority liaison governs vessel access to the export jetty."),
  libraryEntry("00000000-0000-4000-8000-000000001541", IDS.coral, "Consequences", "Refinery-wide outage", "Damage to the distillation train causing a refinery-wide production outage and extended restart.")
];

// §2 Facility Information is a structured form persisted as JSON in the section-2
// content_text (2026-07-04 decision). Field set must match the client form.
const BONNY_FACILITY_INFO = {
  name: "Bonny Terminal",
  region: "Rivers State, Nigeria",
  location: "4.42°N, 7.16°E",
  nature: "Crude storage and export",
  type: "Marine Terminal",
  manager: "Daniel Mensah",
  regulated: "Yes",
  regulator: "Department of Petroleum Resources",
  general:
    "Bonny Terminal is Operator A's primary crude storage and export facility on the Bonny River. The site comprises a central control room, tank farm, marine loading terminal, and supporting administration and utility buildings. Operations run 24/7 with shift handovers at 06:00 and 18:00 local time."
};

const PERNIS_FACILITY_INFO = {
  name: "Pernis Refinery Complex",
  region: "Rotterdam, Netherlands",
  location: "51.88°N, 4.39°E",
  nature: "Refining and product blending",
  type: "Refinery",
  manager: "Sofie de Vries",
  regulated: "Yes",
  regulator: "Dutch Safety Board",
  general:
    "Pernis Refinery Complex is one of Europe's largest refineries, integrating crude distillation, product blending, and marine export. The site includes multiple process units, an extensive tank farm, a product jetty on the Nieuwe Maas, and 24/7 operations with on-site emergency response."
};

const BONNY_EXEC_SUMMARY =
  "This Security Risk Assessment evaluates the physical and cyber security posture of Bonny Terminal for the 2026 assessment cycle. It identifies the facility's critical assets, the credible threats acting upon them, and the residual risk remaining after existing controls. The highest residual risks concern remote vendor access to the central control room and coverage gaps in marine perimeter surveillance during shift handover. Prioritised mitigations — per-vendor MFA accounts, DCS backup isolation, and upgraded radar coverage — are expected to reduce these risks to acceptable levels by Q3 2026.";

const BONNY_CONCLUSION =
  "Bonny Terminal maintains a mature security programme, but two residual risks remain above the operator's tolerance and require the mitigations detailed in Section 7. Subject to completion of the agreed actions and the Approver's sign-off, the facility's risk profile is assessed as manageable for the 2026 cycle. This assessment should be reviewed annually or on any material change to the threat environment or facility configuration.";

const PERNIS_EXEC_SUMMARY =
  "This Security Risk Assessment covers the Pernis Refinery Complex for the 2026 cycle. As a large integrated refining and blending site, Pernis presents a broad attack surface spanning process units, bulk storage, and marine product transfer. This draft establishes the asset inventory, threat landscape, and initial risk evaluations ahead of Reviewer input. Early findings highlight sabotage exposure at the crude distillation unit and pilferage risk across the tank farm.";

const PERNIS_CONCLUSION =
  "On completion of the outstanding evaluations and mitigation planning, the Pernis Refinery Complex assessment will provide a full picture of residual security risk for the 2026 cycle. Initial indications are that targeted hardening of the crude distillation unit and improved tank-farm access control will address the most significant exposures. This draft is submitted for Reviewer consideration.";

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
  const passwordHash = await bcrypt.hash("VorgeDemo123!", env.bcryptRounds);

  await db.transaction(async (trx) => {
    await upsert(trx, "operators", [
      { id: IDS.northstar, name: "Operator A" }
    ]);

    await upsert(trx, "facilities", [
      {
        id: IDS.bonny,
        operator_id: IDS.northstar,
        name: "Bonny Terminal",
        configuration: {
          region: "Rivers State, Nigeria",
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
        name: "Pernis Refinery Complex",
        configuration: { region: "Rotterdam, Netherlands" }
      }
    ]);

    await upsert(trx, "users", [
      { id: IDS.omar, email: "adaeze.okeke@operator-a.example", password_hash: passwordHash, name: "Adaeze Okeke", mfa_enabled: false, mfa_enrolled_at: null, mfa_failed_attempts: 0, mfa_last_failure_at: null, mfa_locked_until: null },
      { id: IDS.sarah, email: "meilin.tanaka@operator-a.example", password_hash: passwordHash, name: "Mei-Lin Tanaka", mfa_enabled: false, mfa_enrolled_at: null, mfa_failed_attempts: 0, mfa_last_failure_at: null, mfa_locked_until: null },
      { id: IDS.marcus, email: "rafael.castellanos@operator-a.example", password_hash: passwordHash, name: "Rafael Castellanos", mfa_enabled: false, mfa_enrolled_at: null, mfa_failed_attempts: 0, mfa_last_failure_at: null, mfa_locked_until: null },
      { id: IDS.elena, email: "sarah.chen@operator-a.example", password_hash: passwordHash, name: "Sarah Chen", mfa_enabled: false, mfa_enrolled_at: null, mfa_failed_attempts: 0, mfa_last_failure_at: null, mfa_locked_until: null },
      { id: IDS.priya, email: "olivia.bennett@operator-a.example", password_hash: passwordHash, name: "Olivia Bennett", mfa_enabled: false, mfa_enrolled_at: null, mfa_failed_attempts: 0, mfa_last_failure_at: null, mfa_locked_until: null },
      { id: IDS.james, email: "marcus.johnson@operator-a.example", password_hash: passwordHash, name: "Marcus Johnson", mfa_enabled: false, mfa_enrolled_at: null, mfa_failed_attempts: 0, mfa_last_failure_at: null, mfa_locked_until: null }
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
        name: "Bonny Terminal - 2026 SRA",
        state: ASSESSMENT_STATES.IN_REVIEW,
        lock_version: 4,
        contributors: JSON.stringify([
          { id: "contrib-1", type: "Core", name: "Daniel Mensah", position: "Facility Manager", expertise: "Operations", company: "Operator A" },
          { id: "contrib-2", type: "Contributing", name: "Ifeoma Nwosu", position: "IT Security Lead", expertise: "Cyber Security", company: "Operator A" }
        ])
      },
      {
        id: IDS.coral2026,
        operator_id: IDS.northstar,
        facility_id: IDS.coral,
        lead_author_user_id: IDS.omar,
        name: "Pernis Refinery Complex - 2026 SRA",
        state: ASSESSMENT_STATES.DRAFT,
        lock_version: 1,
        contributors: JSON.stringify([
          { id: "contrib-p1", type: "Core", name: "Sofie de Vries", position: "Refinery Security Manager", expertise: "Physical Security", company: "Operator A" },
          { id: "contrib-p2", type: "Contributing", name: "Johan Bakker", position: "Process Safety Lead", expertise: "Process Safety", company: "Operator A" }
        ])
      },
      {
        id: IDS.bonny2025,
        operator_id: IDS.northstar,
        facility_id: IDS.bonny,
        lead_author_user_id: IDS.omar,
        name: "Bonny Terminal - 2025 SRA",
        state: ASSESSMENT_STATES.APPROVED,
        lock_version: 1,
        contributors: JSON.stringify([])
      }
    ]);

    // Reset content for the seed's OWN assessments before re-inserting, so
    // `npm run seed` is idempotent against any prior state. Without this, moving
    // an evaluation to a different asset/threat pair trips the
    // evaluations(asset_id, threat_id) unique index during the transitional
    // upsert. Scoped strictly to these three demo assessment ids — it never
    // touches another tenant's data (unlike a table-wide TRUNCATE).
    const SEED_ASSESSMENT_IDS = [IDS.bonny2026, IDS.coral2026, IDS.bonny2025];
    await trx("mitigation_progress_logs")
      .whereIn("mitigation_id", trx("mitigations").select("id").whereIn("assessment_id", SEED_ASSESSMENT_IDS))
      .del();
    for (const table of ["mitigations", "evaluations", "asset_threat_links", "assessment_sections", "threats", "assets"]) {
      await trx(table).whereIn("assessment_id", SEED_ASSESSMENT_IDS).del();
    }

    // details bag matches the client adapter (toClientAsset): description,
    // dependencies, consequences — so Section 3 renders every field.
    await upsert(trx, "assets", [
      {
        id: IDS.controlRoom,
        facility_id: IDS.bonny,
        assessment_id: IDS.bonny2026,
        name: "Central Control Room",
        asset_type: "Control Room",
        criticality: "Very High",
        details: {
          description: "Distributed control system (DCS) and emergency shutdown control point for the terminal.",
          dependencies: "Primary/backup power, site network, HVAC, fire detection",
          consequences: "Loss of process control and emergency-shutdown capability across the terminal."
        }
      },
      {
        id: IDS.marineTerminal,
        facility_id: IDS.bonny,
        assessment_id: IDS.bonny2026,
        name: "Marine Loading Terminal",
        asset_type: "Marine Loading Terminal",
        criticality: "High",
        details: {
          description: "Product transfer berth, loading arms and hose-handling pad.",
          dependencies: "Jetty structure, firewater system, mooring, metering",
          consequences: "Halt to product export and potential marine spill."
        }
      },
      {
        id: IDS.pernisCdu,
        facility_id: IDS.coral,
        assessment_id: IDS.coral2026,
        name: "Crude Distillation Unit",
        asset_type: "Process Unit",
        criticality: "Very High",
        details: {
          description: "Primary atmospheric distillation train and associated control cabinets.",
          dependencies: "Crude feedstock supply, utilities, control system, cooling water",
          consequences: "Refinery-wide production outage and extended restart."
        }
      },
      {
        id: IDS.pernisTankFarm,
        facility_id: IDS.coral,
        assessment_id: IDS.coral2026,
        name: "Central Tank Farm",
        asset_type: "Storage Tank Farm",
        criticality: "High",
        details: {
          description: "Bulk crude and finished-product storage across multiple bunded areas.",
          dependencies: "Transfer pipelines, firewater, bunding, level instrumentation",
          consequences: "Product loss, fire and environmental release."
        }
      },
      {
        id: IDS.pernisJetty,
        facility_id: IDS.coral,
        assessment_id: IDS.coral2026,
        name: "Product Export Jetty",
        asset_type: "Marine Loading Terminal",
        criticality: "High",
        details: {
          description: "Marine export berth on the Nieuwe Maas with loading arms.",
          dependencies: "Loading arms, mooring, tug availability, metering",
          consequences: "Export disruption and demurrage costs."
        }
      },
      {
        id: IDS.bonny2025Marine,
        facility_id: IDS.bonny,
        assessment_id: IDS.bonny2025,
        name: "Marine Loading Terminal",
        asset_type: "Marine Loading Terminal",
        criticality: "High",
        details: {
          description: "Product transfer berth and hose-handling pad (2025 cycle).",
          dependencies: "Jetty structure, firewater system, mooring",
          consequences: "Halt to product export operations."
        }
      }
    ]);

    // details bag matches toClientThreat: short, classification, history,
    // facilityHistory, capabilityIntent, rating — so Section 4 renders in full.
    // (the demo UI keys off `rating`, not the likelihood int column.)
    await upsert(trx, "threats", [
      {
        id: IDS.cyberThreat,
        facility_id: IDS.bonny,
        assessment_id: IDS.bonny2026,
        name: "Cybercrime & Data Breaches",
        likelihood: 4,
        details: {
          short: "Cybercrime & Data Breaches",
          classification: "Cyber",
          history: "Rising sector-wide ransomware and OT-intrusion attempts against energy operators.",
          facilityHistory: "One phishing incident in 2024, contained without operational impact.",
          capabilityIntent: "Organised groups with financial and disruptive intent; moderate-to-high capability.",
          rating: "High"
        }
      },
      {
        id: IDS.maritimeThreat,
        facility_id: IDS.bonny,
        assessment_id: IDS.bonny2026,
        name: "Maritime",
        likelihood: 3,
        details: {
          short: "Maritime Security",
          classification: "Physical",
          history: "Gulf of Guinea piracy and armed-robbery-at-sea incidents remain elevated.",
          facilityHistory: "No successful breach; two suspicious vessel approaches logged in 2025.",
          capabilityIntent: "Opportunistic maritime actors seeking cargo/crew; variable capability.",
          rating: "Medium"
        }
      },
      {
        id: IDS.pernisSabotage,
        facility_id: IDS.coral,
        assessment_id: IDS.coral2026,
        name: "Sabotage & Terrorism",
        likelihood: 3,
        details: {
          short: "Sabotage & Terrorism",
          classification: "Physical",
          history: "Elevated activist and terrorism threat to European energy infrastructure.",
          facilityHistory: "No sabotage incidents on record at the complex.",
          capabilityIntent: "Ideologically-motivated actors with moderate capability and clear intent.",
          rating: "High"
        }
      },
      {
        id: IDS.pernisTheft,
        facility_id: IDS.coral,
        assessment_id: IDS.coral2026,
        name: "Theft & Pilferage",
        likelihood: 4,
        details: {
          short: "Theft & Pilferage",
          classification: "Physical",
          history: "Product theft common across regional storage and transfer sites.",
          facilityHistory: "Minor pilferage detected during a 2024 inventory reconciliation.",
          capabilityIntent: "Opportunistic and organised theft crews; low-to-moderate capability.",
          rating: "High"
        }
      },
      {
        id: IDS.pernisUnrest,
        facility_id: IDS.coral,
        assessment_id: IDS.coral2026,
        name: "Civil Unrest & Protest",
        likelihood: 3,
        details: {
          short: "Civil Unrest & Protest",
          classification: "Physical",
          history: "Frequent climate-activist protests targeting Rotterdam port facilities.",
          facilityHistory: "Two peaceful protests near the main gate in 2025, no incursion.",
          capabilityIntent: "Activist groups seeking disruption and publicity; low violence.",
          rating: "Medium"
        }
      },
      {
        id: IDS.bonny2025Maritime,
        facility_id: IDS.bonny,
        assessment_id: IDS.bonny2025,
        name: "Maritime",
        likelihood: 3,
        details: {
          short: "Maritime Security",
          classification: "Physical",
          history: "Gulf of Guinea maritime threat during the 2025 cycle.",
          facilityHistory: "Monitored throughout 2025; no breach.",
          capabilityIntent: "Opportunistic maritime actors; variable capability.",
          rating: "Medium"
        }
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
      },
      {
        id: IDS.linkMarineMaritime2026,
        facility_id: IDS.bonny,
        assessment_id: IDS.bonny2026,
        asset_id: IDS.marineTerminal,
        threat_id: IDS.maritimeThreat,
        enabled: true
      },
      {
        id: IDS.pernisLinkCduSabotage,
        facility_id: IDS.coral,
        assessment_id: IDS.coral2026,
        asset_id: IDS.pernisCdu,
        threat_id: IDS.pernisSabotage,
        enabled: true
      },
      {
        id: IDS.pernisLinkTankTheft,
        facility_id: IDS.coral,
        assessment_id: IDS.coral2026,
        asset_id: IDS.pernisTankFarm,
        threat_id: IDS.pernisTheft,
        enabled: true
      },
      {
        id: IDS.pernisLinkJettyUnrest,
        facility_id: IDS.coral,
        assessment_id: IDS.coral2026,
        asset_id: IDS.pernisJetty,
        threat_id: IDS.pernisUnrest,
        enabled: true
      },
      {
        id: IDS.bonny2025Link,
        facility_id: IDS.bonny,
        assessment_id: IDS.bonny2025,
        asset_id: IDS.bonny2025Marine,
        threat_id: IDS.bonny2025Maritime,
        enabled: true
      }
    ]);

    // r1/r2 carry the 5x5 axis values the client reads (toClientEvaluation):
    // { consequence, likelihood } (1-5) plus r1.consequences (scenario outcome).
    // The risk score/band are DERIVED client-side (consequence x likelihood), so
    // Sections 5 and 6 and the risk matrix all populate. Bonny facility bands:
    // Low 1-4, Medium 5-9, High 10-15, Very High 16-25.
    await upsert(trx, "evaluations", [
      {
        id: IDS.evalControlCyber,
        facility_id: IDS.bonny,
        assessment_id: IDS.bonny2026,
        asset_id: IDS.controlRoom,
        threat_id: IDS.cyberThreat,
        scenario: "Vendor remote access compromise affects control-room workstations.",
        controls: "VPN access with vendor approval workflow; segmented OT network",
        vulnerabilities: "Shared vendor credentials and weak DCS backup isolation",
        proposed_mitigation: "Implement per-vendor accounts with MFA and isolate DCS backups.",
        r1: { consequence: 5, likelihood: 4, consequences: "Prolonged loss of process control and a possible unsafe shutdown." },
        r2: { consequence: 4, likelihood: 2 }
      },
      {
        id: IDS.evalMarineMaritime,
        facility_id: IDS.bonny,
        assessment_id: IDS.bonny2025,
        asset_id: IDS.bonny2025Marine,
        threat_id: IDS.bonny2025Maritime,
        scenario: "Unauthorised vessel approach during product transfer.",
        controls: "Escort scheduling, shore patrols, CCTV",
        vulnerabilities: "Surveillance coverage gaps at shift handover",
        proposed_mitigation: "Upgrade radar coverage and revise escort scheduling.",
        r1: { consequence: 5, likelihood: 3, consequences: "Disruption to export and a potential vessel/berth incident." },
        r2: { consequence: 3, likelihood: 2 }
      },
      {
        id: IDS.evalMarineMaritime2026,
        facility_id: IDS.bonny,
        assessment_id: IDS.bonny2026,
        asset_id: IDS.marineTerminal,
        threat_id: IDS.maritimeThreat,
        scenario: "Unauthorised vessel approach during product transfer at the marine loading terminal.",
        controls: "Escort scheduling, shore patrols, CCTV",
        vulnerabilities: "Radar coverage gaps at shift handover",
        proposed_mitigation: "Upgrade radar coverage and revise escort scheduling for shift handover.",
        r1: { consequence: 5, likelihood: 3, consequences: "Disruption to product transfer and a potential marine incident." },
        r2: { consequence: 3, likelihood: 2 }
      },
      {
        id: IDS.pernisEvalCduSabotage,
        facility_id: IDS.coral,
        assessment_id: IDS.coral2026,
        asset_id: IDS.pernisCdu,
        threat_id: IDS.pernisSabotage,
        scenario: "Coordinated intrusion targeting the crude distillation unit control cabinets.",
        controls: "Perimeter fence, CCTV, access control, guard patrols",
        vulnerabilities: "Single-layer perimeter on the north boundary; limited intrusion detection",
        proposed_mitigation: "Install intrusion detection and a secondary barrier on the north perimeter.",
        r1: { consequence: 5, likelihood: 3, consequences: "Damage to the distillation train and a refinery-wide outage." },
        r2: { consequence: 3, likelihood: 2 }
      },
      {
        id: IDS.pernisEvalTankTheft,
        facility_id: IDS.coral,
        assessment_id: IDS.coral2026,
        asset_id: IDS.pernisTankFarm,
        threat_id: IDS.pernisTheft,
        scenario: "Pilferage of product via unauthorised tanker loading at the tank farm.",
        controls: "Gate access logs, seal management, CCTV",
        vulnerabilities: "Manual seal reconciliation; blind spots between bunds",
        proposed_mitigation: "Automate seal reconciliation and add thermal cameras to bund gaps.",
        r1: { consequence: 4, likelihood: 3, consequences: "Product loss and a possible fire or environmental release." },
        r2: { consequence: 3, likelihood: 2 }
      },
      {
        id: IDS.pernisEvalJettyUnrest,
        facility_id: IDS.coral,
        assessment_id: IDS.coral2026,
        asset_id: IDS.pernisJetty,
        threat_id: IDS.pernisUnrest,
        scenario: "Protest activity blocks marine access and disrupts export operations.",
        controls: "Liaison with port authority, marine exclusion zone",
        vulnerabilities: "Reliance on external port security; no on-water deterrent",
        proposed_mitigation: "Formalise port-authority escalation and add marine patrol support.",
        r1: { consequence: 3, likelihood: 3, consequences: "Temporary loss of marine export and demurrage costs." },
        r2: { consequence: 2, likelihood: 2 }
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
      },
      {
        id: IDS.mitigationRadarUpgrade,
        facility_id: IDS.bonny,
        assessment_id: IDS.bonny2026,
        evaluation_id: IDS.evalMarineMaritime2026,
        owner_user_id: IDS.james,
        owner_role_label: "Security Manager",
        description: "Upgrade radar coverage and revise escort scheduling for shift handover.",
        severity: "High",
        agreed: "Yes",
        target_date: "2026-09-30",
        status: MITIGATION_STATUSES.OPEN
      },
      {
        id: IDS.pernisMitCdu,
        facility_id: IDS.coral,
        assessment_id: IDS.coral2026,
        evaluation_id: IDS.pernisEvalCduSabotage,
        owner_user_id: IDS.james,
        owner_role_label: "Security Manager",
        description: "Install intrusion detection and a secondary barrier on the north perimeter of the CDU.",
        severity: "High",
        agreed: "Yes",
        target_date: "2026-10-31",
        status: MITIGATION_STATUSES.OPEN
      },
      {
        id: IDS.pernisMitTank,
        facility_id: IDS.coral,
        assessment_id: IDS.coral2026,
        evaluation_id: IDS.pernisEvalTankTheft,
        owner_user_id: IDS.james,
        owner_role_label: "Operations Lead",
        description: "Automate seal reconciliation and add thermal cameras to tank-farm bund gaps.",
        severity: "High",
        agreed: "Pending",
        target_date: "2026-11-30",
        status: MITIGATION_STATUSES.OPEN
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

    // Narrative sections (§1 Executive Summary, §2 Facility Information as JSON,
    // §8 Conclusion). One row per (assessment, section_number).
    await upsert(trx, "assessment_sections", [
      { id: IDS.secBonny1, facility_id: IDS.bonny, assessment_id: IDS.bonny2026, section_number: 1, content_text: BONNY_EXEC_SUMMARY },
      { id: IDS.secBonny2, facility_id: IDS.bonny, assessment_id: IDS.bonny2026, section_number: 2, content_text: JSON.stringify(BONNY_FACILITY_INFO) },
      { id: IDS.secBonny8, facility_id: IDS.bonny, assessment_id: IDS.bonny2026, section_number: 8, content_text: BONNY_CONCLUSION },
      { id: IDS.secPernis1, facility_id: IDS.coral, assessment_id: IDS.coral2026, section_number: 1, content_text: PERNIS_EXEC_SUMMARY },
      { id: IDS.secPernis2, facility_id: IDS.coral, assessment_id: IDS.coral2026, section_number: 2, content_text: JSON.stringify(PERNIS_FACILITY_INFO) },
      { id: IDS.secPernis8, facility_id: IDS.coral, assessment_id: IDS.coral2026, section_number: 8, content_text: PERNIS_CONCLUSION }
    ]);

    await upsert(trx, "library_entries", LIBRARY_ENTRIES);

    // Smart-tagging controlled vocabulary (§9.6): seed the §19-default starter
    // set per demo facility so AI tag suggestions have something to validate
    // against. Idempotent — onConflict(facility_id, category, value) ignores.
    for (const facilityId of [IDS.bonny, IDS.coral]) {
      await seedVocabulary({ facilityId, rows: defaultVocabularyRows(), trx });
    }
  });

  console.log("Seeded Vorge demo data.");
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.destroy());
