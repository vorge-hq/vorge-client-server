// P2 · Deliverable 1 — route-guard introspection ("someone added an unguarded
// route" regression guard). It does NOT drive requests (no DB needed) — it
// walks the live Express router (app._router.stack) and asserts that EVERY
// route under a data module is protected by BOTH:
//   - authenticate                       (identity + acting-role resolution), and
//   - requireFacilityAccess middleware   (facilityAccessMiddleware), OR a
//     documented repo-scoped equivalent listed in REPO_SCOPED_ALLOWLIST below.
//
// This lives in the fast unit loop (not tests/integration/) on purpose: it needs
// no Postgres, and the whole value of a "no unguarded route can be merged" guard
// is that it runs on EVERY `npm test`, gating every commit — not only when a
// test DB happens to be configured.
//
// Ground rule (docs/test-specs.md §P2 deliverable 1): a NEW route must never be
// added to the allowlist to make this test pass. Fix the route (add the
// middleware) instead. The allowlist is only for the routes where facility
// scope is genuinely enforced one layer down — see the decision record
// docs/decisions/2026-07-03-repo-scoped-facility-access.md.
const app = require("../src/app");

// Named export detection depends on these function names. Keep in sync:
//   src/middleware/authenticate.js          -> module.exports = authenticate
//   src/middleware/requireFacilityAccess.js -> returns requireFacilityAccessMiddleware
const AUTHENTICATE = "authenticate";
const FACILITY_ACCESS = "requireFacilityAccessMiddleware";

// Mounts we know about. Anything mounted under /api that is NOT in one of these
// two sets makes the test fail — an unclassified module must be deliberately
// categorised as "data" (needs the guards) or "non-data" (documented why not).
const DATA_MODULES = ["/api/assessments", "/api/mitigations", "/api/admin", "/api/library"];
const NON_DATA_MOUNTS = {
  // Auth is intentionally public at the edge: login/refresh/forgot-password
  // MUST be reachable unauthenticated, and the authenticated auth routes apply
  // `authenticate` per-route themselves. It exposes no facility-scoped tenant
  // data, so requireFacilityAccess does not apply.
  "/api/auth": "public auth surface; per-route authenticate; no tenant data"
};

// Routes where facility isolation is enforced at the REPOSITORY layer rather
// than by requireFacilityAccess middleware. Rationale (full record:
// docs/decisions/2026-07-03-repo-scoped-facility-access.md): these routes carry
// only a resource id in the URL, not a facilityId in the request body/params,
// so the middleware (which reads facilityId/operatorId off the request) has
// nothing to check pre-load. Instead every read/list goes through a
// user-scoped getter that returns null/[] for out-of-scope resources → the
// route answers 404 (no existence leak). tenantIsolation.test.js is the
// behavioural proof that each of these is actually isolated.
//
// Each entry MUST name the scoping getter. Do NOT add new routes here to
// silence the test — a new route with a facilityId in its payload belongs
// behind requireFacilityAccess.
const REPO_SCOPED_ALLOWLIST = {
  "GET /api/assessments/": "listAssessmentsForUser — SQL facility/operator scope (facilityScopeFor)",
  "GET /api/assessments/:assessmentId": "getAssessmentBundleForUser — user-scoped getter → null → 404",
  "GET /api/assessments/:assessmentId/export": "getAssessmentForUser — user-scoped getter → null → 404 before render",
  "POST /api/assessments/:assessmentId/workflow": "getAssessmentForUser — user-scoped getter → null → 404",
  // P3 content writes: URL carries only assessment/entity ids (no facilityId in
  // the payload), so they use the repo-scoped pattern — runContentMutation loads
  // via getAssessmentForUser → null → 404 before any write. tenantIsolation.test.js
  // is the behavioural cross-tenant proof.
  "POST /api/assessments/:assessmentId/assets": "runContentMutation → getAssessmentForUser → null → 404",
  "PATCH /api/assessments/:assessmentId/assets/:assetId": "runContentMutation → getAssessmentForUser → null → 404",
  "DELETE /api/assessments/:assessmentId/assets/:assetId": "runContentMutation → getAssessmentForUser → null → 404",
  "POST /api/assessments/:assessmentId/threats": "runContentMutation → getAssessmentForUser → null → 404",
  "PATCH /api/assessments/:assessmentId/threats/:threatId": "runContentMutation → getAssessmentForUser → null → 404",
  "DELETE /api/assessments/:assessmentId/threats/:threatId": "runContentMutation → getAssessmentForUser → null → 404",
  "PUT /api/assessments/:assessmentId/links/:assetId/:threatId": "runContentMutation → getAssessmentForUser → null → 404",
  "PATCH /api/assessments/:assessmentId/evaluations/:evaluationId": "runContentMutation → getAssessmentForUser → null → 404",
  "PUT /api/assessments/:assessmentId/contributors": "runContentMutation → getAssessmentForUser → null → 404",
  "PUT /api/assessments/:assessmentId/sections/:n": "runContentMutation → getAssessmentForUser → null → 404",
  "PUT /api/assessments/:assessmentId/lead-author": "getAssessmentForUser → null → 404 (reassignment guard chain)",
  "PUT /api/assessments/:assessmentId/mitigations/:mitigationId/owner": "runContentMutation → getAssessmentForUser → null → 404",
  "GET /api/mitigations/mine": "listMine — scoped to the acting Mitigation Owner's assignments",
  "POST /api/mitigations/:mitigationId/log": "getMitigationForUser — user-scoped getter → null → 404",
  // Admin config exposes only a static list of surface names (zero facility /
  // operator / assessment data) and is gated by authenticate + authorizeRole(ADMIN).
  "GET /api/admin/configuration": "static configuration surface list; no tenant data; authorizeRole(ADMIN)"
};

// --- router introspection helpers -----------------------------------------

// The set of full method+path keys we actually visited, so we can prove the
// allowlist has no stale entries (a route was removed but its exemption stayed).
const visitedKeys = new Set();

function mountPrefixOf(layer, knownPrefixes) {
  // Express stores the mount as a compiled regexp, not the original string.
  // Recover it by testing each known prefix against the layer's matcher.
  return knownPrefixes.find((prefix) => layer.regexp && layer.regexp.test(prefix));
}

function collectRoutes(mountLayer, prefix) {
  const routerLevelMiddleware = [];
  const routes = [];
  for (const sub of mountLayer.handle.stack) {
    if (sub.route) {
      const methods = Object.keys(sub.route.methods).map((m) => m.toUpperCase());
      const handlerNames = sub.route.stack.map((s) => s.name);
      routes.push({ path: prefix + sub.route.path, methods, handlerNames });
    } else {
      // router.use(mw) — applies to every route in this router.
      routerLevelMiddleware.push(sub.name);
    }
  }
  return { routerLevelMiddleware, routes };
}

// Discover every mounted sub-router (the layers whose handle has its own stack).
const knownPrefixes = [...DATA_MODULES, ...Object.keys(NON_DATA_MOUNTS)];
const mounts = [];
for (const layer of app._router.stack) {
  if (layer.name === "router" && layer.handle && Array.isArray(layer.handle.stack)) {
    mounts.push({ layer, prefix: mountPrefixOf(layer, knownPrefixes) });
  }
}

describe("P2 route-guard introspection — every data route is isolation-guarded", () => {
  test("every mounted /api router is classified as data or non-data", () => {
    const unclassified = mounts.filter((m) => !m.prefix);
    // If this fails: a new router was mounted in app.js. Add its prefix to
    // DATA_MODULES (and guard the routes) or to NON_DATA_MOUNTS (with a reason).
    expect(unclassified).toEqual([]);
  });

  test("at least one data module is mounted (guard is actually exercising something)", () => {
    const mountedDataPrefixes = mounts.map((m) => m.prefix).filter((p) => DATA_MODULES.includes(p));
    expect(mountedDataPrefixes.length).toBeGreaterThan(0);
  });

  for (const prefix of DATA_MODULES) {
    describe(prefix, () => {
      const mount = mounts.find((m) => m.prefix === prefix);

      test(`${prefix} is mounted`, () => {
        expect(mount).toBeDefined();
      });

      if (!mount) return;

      const { routerLevelMiddleware, routes } = collectRoutes(mount.layer, prefix);

      for (const route of routes) {
        for (const method of route.methods) {
          const key = `${method} ${route.path}`;
          visitedKeys.add(key);
          // Guards can be attached at the router level (router.use(authenticate))
          // or per-route; union both so either wiring style is accepted.
          const guards = new Set([...routerLevelMiddleware, ...route.handlerNames]);

          test(`${key} requires authenticate`, () => {
            expect(guards.has(AUTHENTICATE)).toBe(true);
          });

          test(`${key} requires requireFacilityAccess or a documented repo-scoped exemption`, () => {
            const hasMiddleware = guards.has(FACILITY_ACCESS);
            const exemption = REPO_SCOPED_ALLOWLIST[key];
            // A route must be protected by the middleware OR carry a documented
            // repo-scoped-getter exemption. Not both-optional: exactly one path.
            expect(hasMiddleware || Boolean(exemption)).toBe(true);
          });
        }
      }
    });
  }

  test("no stale allowlist entries — every exemption maps to a live route", () => {
    const stale = Object.keys(REPO_SCOPED_ALLOWLIST).filter((key) => !visitedKeys.has(key));
    // If this fails: a route was renamed/removed but its exemption lingered.
    // Delete the dead entry (an exemption must never outlive its route).
    expect(stale).toEqual([]);
  });
});
