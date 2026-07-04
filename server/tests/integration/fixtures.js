const { ROLES, ASSESSMENT_STATES, MITIGATION_STATUSES } = require("../../src/services/constants");

// Deterministic UUIDs: 00000000-0000-4000-8000-<12 hex>. Grouped by kind so
// ids are readable in failure output.
function id(n) {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

// Two operators, two facilities each. Per facility: an Author and a Reviewer.
// Per operator: HQ Executive, Approver, Mitigation Owner, and a cross-facility
// Admin. One assessment per facility with a full child chain. This is the
// canonical cross-tenant fixture for every P2 isolation test.
const OPERATORS = {
  A: { id: id(1), name: "Operator A" },
  B: { id: id(2), name: "Operator B" }
};

const FACILITIES = {
  A1: { id: id(101), operator: "A", name: "Facility A1" },
  A2: { id: id(102), operator: "A", name: "Facility A2" },
  B1: { id: id(111), operator: "B", name: "Facility B1" },
  B2: { id: id(112), operator: "B", name: "Facility B2" }
};

// key -> { id, email, operator, assignments: [{ role, facility|null, crossFacility }] }
const USERS = {
  authorA1: { id: id(201), email: "author.a1@a.example", assignments: [{ role: ROLES.AUTHOR, facility: "A1" }] },
  reviewerA1: { id: id(202), email: "reviewer.a1@a.example", assignments: [{ role: ROLES.REVIEWER, facility: "A1" }] },
  authorA2: { id: id(203), email: "author.a2@a.example", assignments: [{ role: ROLES.AUTHOR, facility: "A2" }] },
  reviewerA2: { id: id(204), email: "reviewer.a2@a.example", assignments: [{ role: ROLES.REVIEWER, facility: "A2" }] },
  hqA: { id: id(205), email: "hq.a@a.example", operator: "A", assignments: [{ role: ROLES.HQ_EXECUTIVE, facility: "A1" }, { role: ROLES.HQ_EXECUTIVE, facility: "A2" }] },
  approverA: { id: id(206), email: "approver.a@a.example", assignments: [{ role: ROLES.APPROVER, facility: "A1" }] },
  mitA: { id: id(207), email: "mit.a@a.example", assignments: [{ role: ROLES.MITIGATION_OWNER, facility: "A1" }] },
  adminA: { id: id(208), email: "admin.a@a.example", operator: "A", assignments: [{ role: ROLES.ADMIN, facility: "A1", crossFacility: true }, { role: ROLES.ADMIN, facility: "A2", crossFacility: true }] },
  // Operator-only HQ Executive: access granted at the operator level with NO
  // direct per-facility role row (facility_id null). Exercises canAccessFacility's
  // operator-wide branch — the path library reads must not wrongly 403.
  hqOpOnlyA: { id: id(209), email: "hq.oponly.a@a.example", operator: "A", assignments: [{ role: ROLES.HQ_EXECUTIVE }] },

  authorB1: { id: id(211), email: "author.b1@b.example", assignments: [{ role: ROLES.AUTHOR, facility: "B1" }] },
  reviewerB1: { id: id(212), email: "reviewer.b1@b.example", assignments: [{ role: ROLES.REVIEWER, facility: "B1" }] },
  authorB2: { id: id(213), email: "author.b2@b.example", assignments: [{ role: ROLES.AUTHOR, facility: "B2" }] },
  reviewerB2: { id: id(214), email: "reviewer.b2@b.example", assignments: [{ role: ROLES.REVIEWER, facility: "B2" }] },
  hqB: { id: id(215), email: "hq.b@b.example", operator: "B", assignments: [{ role: ROLES.HQ_EXECUTIVE, facility: "B1" }, { role: ROLES.HQ_EXECUTIVE, facility: "B2" }] },
  approverB: { id: id(216), email: "approver.b@b.example", assignments: [{ role: ROLES.APPROVER, facility: "B1" }] },
  mitB: { id: id(217), email: "mit.b@b.example", assignments: [{ role: ROLES.MITIGATION_OWNER, facility: "B1" }] },
  adminB: { id: id(218), email: "admin.b@b.example", operator: "B", assignments: [{ role: ROLES.ADMIN, facility: "B1", crossFacility: true }, { role: ROLES.ADMIN, facility: "B2", crossFacility: true }] }
};

// One assessment per facility, keyed by facility key.
const ASSESSMENTS = {
  A1: { id: id(301), facility: "A1", author: "authorA1", name: "Facility A1 — 2026 SRA", state: ASSESSMENT_STATES.IN_REVIEW },
  A2: { id: id(302), facility: "A2", author: "authorA2", name: "Facility A2 — 2026 SRA", state: ASSESSMENT_STATES.DRAFT },
  B1: { id: id(311), facility: "B1", author: "authorB1", name: "Facility B1 — 2026 SRA", state: ASSESSMENT_STATES.IN_REVIEW },
  B2: { id: id(312), facility: "B2", author: "authorB2", name: "Facility B2 — 2026 SRA", state: ASSESSMENT_STATES.DRAFT }
};

// Child rows per assessment, keyed by facility key.
const CHILD = {
  A1: { asset: id(401), threat: id(411), link: id(421), evaluation: id(431), mitigation: id(441), owner: "mitA" },
  A2: { asset: id(402), threat: id(412), link: id(422), evaluation: id(432), mitigation: id(442), owner: "mitA" },
  B1: { asset: id(411 + 100), threat: id(511), link: id(521), evaluation: id(531), mitigation: id(541), owner: "mitB" },
  B2: { asset: id(512), threat: id(512 + 100), link: id(522), evaluation: id(532), mitigation: id(542), owner: "mitB" }
};

const TABLES_IN_TRUNCATE_ORDER = [
  "audit_log_entries",
  "versions",
  "library_entries",
  "mitigation_progress_logs",
  "mitigations",
  "evaluations",
  "asset_threat_links",
  "threats",
  "assets",
  "assessments",
  "role_assignments",
  "users",
  "facilities",
  "operators"
];

async function truncateAll(knex) {
  await knex.raw(
    `TRUNCATE ${TABLES_IN_TRUNCATE_ORDER.join(", ")} RESTART IDENTITY CASCADE`
  );
}

async function seedFixtures(knex) {
  const PW = "$2a$04$0000000000000000000000000000000000000000000000000000"; // not used for login in these tests
  await knex.transaction(async (trx) => {
    await trx("operators").insert(Object.values(OPERATORS).map((o) => ({ id: o.id, name: o.name })));

    await trx("facilities").insert(
      Object.values(FACILITIES).map((f) => ({
        id: f.id,
        operator_id: OPERATORS[f.operator].id,
        name: f.name,
        configuration: JSON.stringify({})
      }))
    );

    await trx("users").insert(
      Object.values(USERS).map((u) => ({
        id: u.id,
        email: u.email,
        password_hash: PW,
        name: u.email
      }))
    );

    let raSeq = 1000;
    const roleRows = [];
    for (const u of Object.values(USERS)) {
      for (const a of u.assignments) {
        const facility = a.facility ? FACILITIES[a.facility] : null;
        const operatorId = facility
          ? OPERATORS[facility.operator].id
          : OPERATORS[u.operator].id;
        roleRows.push({
          id: id(raSeq++),
          user_id: u.id,
          facility_id: facility ? facility.id : null,
          operator_id: operatorId,
          role: a.role,
          cross_facility: a.crossFacility === true
        });
      }
    }
    await trx("role_assignments").insert(roleRows);

    for (const key of Object.keys(ASSESSMENTS)) {
      const a = ASSESSMENTS[key];
      const f = FACILITIES[a.facility];
      await trx("assessments").insert({
        id: a.id,
        operator_id: OPERATORS[f.operator].id,
        facility_id: f.id,
        lead_author_user_id: USERS[a.author].id,
        name: a.name,
        state: a.state,
        lock_version: 1,
        contributors: JSON.stringify([])
      });

      const c = CHILD[key];
      await trx("assets").insert({ id: c.asset, facility_id: f.id, assessment_id: a.id, name: `${f.name} asset`, asset_type: "Control Room", criticality: "High", details: JSON.stringify({}) });
      await trx("threats").insert({ id: c.threat, facility_id: f.id, assessment_id: a.id, name: "Cyber", likelihood: 3, details: JSON.stringify({}) });
      await trx("asset_threat_links").insert({ id: c.link, facility_id: f.id, assessment_id: a.id, asset_id: c.asset, threat_id: c.threat, enabled: true });
      await trx("evaluations").insert({ id: c.evaluation, facility_id: f.id, assessment_id: a.id, asset_id: c.asset, threat_id: c.threat, scenario: "s", controls: "c", vulnerabilities: "v", proposed_mitigation: "m", r1: JSON.stringify({ score: 12, band: "High" }), r2: JSON.stringify({ score: 6, band: "Medium" }) });
      await trx("mitigations").insert({ id: c.mitigation, facility_id: f.id, assessment_id: a.id, evaluation_id: c.evaluation, owner_user_id: USERS[c.owner].id, owner_role_label: "Owner", description: "do the thing", severity: "High", agreed: "Yes", target_date: "2026-12-31", status: MITIGATION_STATUSES.OPEN });
    }
  });
}

module.exports = {
  id,
  OPERATORS,
  FACILITIES,
  USERS,
  ASSESSMENTS,
  CHILD,
  truncateAll,
  seedFixtures
};
