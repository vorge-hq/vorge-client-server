# Decision: Offline / Field mode v1 architecture (whole-assessment checkout, PIN-only, P6)

**Date:** 2026-07-04 · **Status:** ADOPTED (user-approved in the Fable spec session) · **Phase:** P6 (specced; build after P4.5)

## Problem

`docs/businesslogic.md` §8 specifies a full field mode — per-section checkout with record-level locks, offline auth via PIN **and** biometric with tamper-resistant attempt counters, photo queueing, PWA — "in the main build". `docs/roadmap.md` marked the same work "defer until customers ask — NEEDS DECISION", and `docs/strategic-roadmap.md` parked it at v1.1+. Meanwhile the engineering reality moved: P3 shipped a single per-assessment `lock_version` optimistic-concurrency model with all content writes flowing through `contentWriteGuard` (scope → Author → Draft → bump → mutate → audit, atomic), and P4 reserved an `offline_mode` per-facility entitlement key. This record resolves the contradiction and fixes the v1 architecture. Binding detail lives in `docs/plans/p6-offline-execution-plan.md`; businesslogic.md is deliberately not rewritten — this record is the bridge.

## Decision — what supersedes §8

### 1. Whole-assessment checkout, not per-section (supersedes §8.2's granularity)

v1 checkout is an **exclusive lease on the whole assessment**: one active checkout per assessment; while active, ALL online content writes (including the owner's own online session) are rejected 409 `ASSESSMENT_CHECKED_OUT`; reads stay open. This freezes `lock_version` for the checkout window, so sync replays through the existing `contentWriteGuard` unmodified — zero conflicts by construction, no record-lock system, no merge logic.

Rationale beyond implementation cost (resolved with user): per-section checkout **does not actually serve §8.6's "specialists in parallel by domain"** — the sections are workflow stages of one analysis (§3 assets → §5 links → §6 evaluations), not specialist territories. A domain specialist needs a slice *across* §4/§5/§6 (the old demo stub's own scope options were "section-6-cyber"/"section-6-maritime" — domain slices, not sections). If customers ever need parallel field work, the right upgrade is **domain-scoped (row-level) checkout**, designed against real demand. The schema is future-proofed: `offline_checkouts.scope` jsonb (v1 always `{"type":"assessment"}`) and op payloads carrying entity type + id mean a scope-coverage check bolts on without schema break (~2–3 sessions, additive).

§8.2's other requirements survive intact: sync replays through the same server guards, "checked out by" indicators ship in v1, declared-scope-before-going-offline is the flow (scope = the assessment).

### 2. Offline auth v1 = PIN only (narrows §8.3)

6-digit PIN set at checkout ("pre-authorise"); its real job is deriving the AES-GCM key (PBKDF2-SHA256, 600k iterations, per-checkout server salt) that encrypts the IndexedDB cache and the sync credential at rest. 5 failed attempts → cache wipe + audited wipe-report on reconnect (§8.3 behavior kept). Deferred to v2: biometric/WebAuthn (offline platform-authenticator flows are the flakiest browser surface), tamper-resistant attempt counters, admin-configurable window/threshold/PIN-length (§19.10 defaults are hardcoded in v1: 7-day max window, 6-digit PIN, threshold 5). Kept from §8.3: never cache the password; server-signed device token bound to a checkout+device id; server-enforced window at sync; queue preserved through lockout.

**Recorded limitation:** a 6-digit PIN protecting extractable ciphertext is brute-forceable by a determined offline attacker; the KDF work factor is the mitigation. This matches §8.3's own PIN model — v1 accepts it, and the true security boundary remains the server at sync (full session auth + checkout secret + RLS/facility scope).

### 3. Device edit time lives in audit `metadata`, not a new column (supersedes §8.2's "explicit edit_at field")

Per-op audit rows on sync reuse the online action vocabulary with `metadata: {offline: true, checkoutId, opId, deviceEditAt}`. `created_at` stays server time — the per-facility hash chain is never backdated. `deviceEditAt` is client-claimed and must always be surfaced as device-reported. This satisfies "capture when the edit happened on device" without touching the append-only table's schema or chain semantics.

### 4. Photos/attachments are out of v1 (drops §8.2's photo queueing)

No attachments feature exists online at all (no table, no endpoints); an offline queue for a nonexistent feature is unbuildable. Photo queueing returns when/if attachments ship online.

### 5. §8.4 graceful fallback confirmed as written — and it is the free tier

Connectivity loss without a checkout → read-only fields + banner, NO queueing. This plus PWA installability is **base product**; checkout/offline editing/sync/PIN are gated by the `offline_mode` entitlement (server-enforced at checkout creation). One deliberate softening: entitlement checks gate **new checkouts only** — sync of an existing checkout always succeeds, so disabling the add-on mid-trip never strands field data.

### 6. Scheduling (resolves the roadmap/businesslogic conflict)

Field mode is neither "main build, full scope" (§8.1) nor "defer until customers ask" (roadmap row): it ships as **P6**, specced 2026-07-04, build after P4.5 (hard dependency: P4's `facility_entitlements` migration + repository). O1 (free-tier fallback + PWA shell) has no P4 dependency and may run any time.

## Consequences / notes

- `contentWriteGuard.runContentMutation` gains one optional `syncCheckoutId` param and guard step 3.5 (checkout lease check between Draft-state check and lock bump); `POST /workflow` and `PUT /lead-author` get the same check inline. Guard order otherwise untouched.
- New tables `offline_checkouts` + `offline_sync_batches` (both RLS'd); no changes to `audit_log_entries` or `assessments`.
- Create mutators accept optional client-supplied UUIDs (sync path only exercises this); `setAssetThreatLink` accepts an `evaluationId` passthrough so offline-ticked Section-6 cells replay onto the client's ids.
- Client stubs: `FieldModePage.jsx` + `FieldModeModal.jsx` replaced in O4; `offlineModel.js` kept/extended. First real client persistence dependency: `idb`; first PWA dependency: `vite-plugin-pwa`.
- Workflow transitions are blocked while checked out — an assessment cannot be submitted for review until the field checkout syncs or is released. Expiry does NOT auto-release the server lease (that would guarantee conflicts); Admin force-release is the escape hatch, and the stranded device gets queue-export-to-file, never silent loss.
- DoD: `docs/test-specs.md` §P6. Binding build order: `docs/plans/p6-offline-execution-plan.md` (O1–O6, Fable gates F4 after O3 and F5 after O6; `offline_mode` must not be enabled for any facility before F5 passes).
