// §Guest read-only access · G3 — the mechanical deny-coverage tripwire (G-C1),
// the AI-guard presence check (G-C2), and the rejectGuest unit (G-C3). No DB:
// this walks the LIVE Express router and compares it to GUEST_DENY_MANIFEST, so
// it runs on every `npm test` and gates every commit.
//
// Ground rule (mirrors middlewareCoverage.test.js): a NEW mutating data route
// must be ADDED TO THE MANIFEST (with an integration deny case), never silenced
// here. A new /api/auth mutating route must be classified as either denied
// (manifest) or legitimately guest-usable (AUTH_ALLOWED, with a reason).
const app = require("../src/app");
const { GUEST_DENY_MANIFEST, MANIFEST_AUTH_PATHS } = require("./guestDenyManifest");
const { rejectGuest } = require("../src/middleware/rejectGuest");
const { ROLES } = require("../src/services/constants");

const DATA_MODULES = ["/api/assessments", "/api/mitigations", "/api/admin", "/api/library"];
const AUTH_PREFIX = "/api/auth";

// Auth routes a guest legitimately uses — intentionally NOT in the deny manifest.
// Each carries a one-line justification. Adding a new mutating auth route means
// putting it here OR in the manifest; leaving it in neither fails G-C1-auth.
const AUTH_ALLOWED = {
  "POST /api/auth/login": "self-serve guest sign-in",
  "POST /api/auth/logout": "guest ends its own session",
  "POST /api/auth/refresh": "keep the guest session alive",
  "POST /api/auth/forgot-password": "public pre-auth flow (email-token; inert until P5)",
  "POST /api/auth/reset-password": "public pre-auth flow (email-token)",
  "POST /api/auth/mfa/verify": "inert for a never-enrolled guest",
  "POST /api/auth/mfa/verify-recovery": "inert for a never-enrolled guest",
  "POST /api/auth/mfa/disable": "inert for a never-enrolled guest",
  "POST /api/auth/mfa/regen-recovery-codes": "inert for a never-enrolled guest",
  "POST /api/auth/mfa/admin-reset": "authorizeRole(ADMIN) already 403s a guest"
};

const AI_ROUTE_PATHS = [
  "/api/assessments/:assessmentId/evaluations/:evaluationId/suggest-tags",
  "/api/assessments/:assessmentId/evaluations/:evaluationId/tags/confirm",
  "/api/assessments/:assessmentId/sections/:n/generate-draft",
  "/api/assessments/:assessmentId/anomaly-check",
  "/api/assessments/:assessmentId/anomaly-acknowledgements"
];

// --- router introspection (recurses into nested routers, e.g. /api/auth/mfa) --
function mountPrefixOf(layer, candidates) {
  return candidates.find((c) => layer.regexp && layer.regexp.test(c));
}

function collectDeep(stack, prefix, nestedCandidates) {
  const routes = [];
  for (const layer of stack) {
    if (layer.route) {
      const handlerNames = layer.route.stack.map((s) => s.name);
      for (const m of Object.keys(layer.route.methods)) {
        routes.push({ method: m.toUpperCase(), path: prefix + layer.route.path, handlerNames });
      }
    } else if (layer.name === "router" && layer.handle && Array.isArray(layer.handle.stack)) {
      const sub = nestedCandidates.find((c) => layer.regexp && layer.regexp.test(c));
      routes.push(...collectDeep(layer.handle.stack, prefix + (sub || ""), nestedCandidates));
    }
  }
  return routes;
}

function moduleRoutes(prefix, nestedCandidates = []) {
  const mount = app._router.stack.find(
    (l) => l.name === "router" && l.handle && Array.isArray(l.handle.stack) && mountPrefixOf(l, [prefix]) === prefix
  );
  if (!mount) return null;
  return collectDeep(mount.handle.stack, prefix, nestedCandidates);
}

const key = (r) => `${r.method} ${r.path}`;
const nonGet = (routes) => routes.filter((r) => r.method !== "GET" && r.method !== "HEAD");

describe("§Guest — deny coverage (G-C1)", () => {
  test("every non-GET route under the data modules is in GUEST_DENY_MANIFEST (set-equality)", () => {
    const live = new Set();
    for (const prefix of DATA_MODULES) {
      const routes = moduleRoutes(prefix);
      expect(routes).not.toBeNull(); // module must be mounted
      nonGet(routes).forEach((r) => live.add(key(r)));
    }
    const manifest = new Set(
      GUEST_DENY_MANIFEST.filter((e) => !e.path.startsWith("/api/auth/")).map((e) => `${e.method} ${e.path}`)
    );

    // A route in the router but not the manifest = an UNGUARDED mutating route.
    const missingFromManifest = [...live].filter((k) => !manifest.has(k));
    // A manifest entry with no live route = stale (route renamed/removed).
    const staleInManifest = [...manifest].filter((k) => !live.has(k));

    expect({ missingFromManifest, staleInManifest }).toEqual({ missingFromManifest: [], staleInManifest: [] });
  });

  test("every non-GET /api/auth route is classified: denied (manifest) or allowed (AUTH_ALLOWED)", () => {
    const authRoutes = moduleRoutes(AUTH_PREFIX, ["/mfa"]);
    expect(authRoutes).not.toBeNull();
    const live = nonGet(authRoutes).map(key);

    const classified = new Set([...MANIFEST_AUTH_PATHS, ...Object.keys(AUTH_ALLOWED)]);
    const unclassified = live.filter((k) => !classified.has(k));
    // A new mutating auth route that is neither denied nor explicitly allowed.
    expect(unclassified).toEqual([]);

    // No stale classifications (a listed path that no longer exists).
    const liveSet = new Set(live);
    const staleManifest = MANIFEST_AUTH_PATHS.filter((k) => !liveSet.has(k));
    const staleAllowed = Object.keys(AUTH_ALLOWED).filter((k) => !liveSet.has(k));
    expect({ staleManifest, staleAllowed }).toEqual({ staleManifest: [], staleAllowed: [] });
  });
});

describe("§Guest — AI endpoints carry rejectGuest (G-C2)", () => {
  const assessmentRoutes = moduleRoutes("/api/assessments") || [];
  for (const aiPath of AI_ROUTE_PATHS) {
    test(`${aiPath} has rejectGuest in its middleware stack`, () => {
      const route = assessmentRoutes.find((r) => r.path === aiPath && r.method === "POST");
      expect(route).toBeDefined();
      expect(route.handlerNames).toContain("rejectGuest");
    });
  }
});

describe("§Guest — rejectGuest middleware (G-C3)", () => {
  function run(actingRole) {
    let error = "UNSET";
    rejectGuest({ actingRole }, {}, (err) => {
      error = err;
    });
    return error;
  }

  test("Guest → DomainError 403 ROLE_NOT_ALLOWED", () => {
    const err = run(ROLES.GUEST);
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(403);
    expect(err.code).toBe("ROLE_NOT_ALLOWED");
  });

  test("every non-Guest role calls next() with no error", () => {
    for (const role of [ROLES.AUTHOR, ROLES.REVIEWER, ROLES.APPROVER, ROLES.HQ_EXECUTIVE, ROLES.ADMIN, ROLES.MITIGATION_OWNER]) {
      expect(run(role)).toBeUndefined();
    }
  });
});
