# P6 execution plan — Offline / Field mode (binding playbook for build sessions)

**Authored:** 2026-07-04 (Fable session) · **Status:** APPROVED — build starts after P4.5 closes
**Governs:** P6 (Offline / Field mode) in `docs/roadmap.md`
**Binding specs:** `docs/test-specs.md` §P6 · **Standing deviation:** `docs/decisions/2026-07-04-offline-mode-architecture.md` (whole-assessment checkout + PIN-only auth + metadata deviceEditAt; governs over businesslogic §8's per-section checkout / biometric / edit_at-column prose)

---

## How to use this document (read first, every session)

This plan was deliberately authored by a stronger model so that build sessions can execute
**without architectural judgment calls**. Rules for every build session:

1. **Start** by reading this file + `docs/roadmap.md` (P6) + `docs/test-specs.md` §P6. Do not re-derive design from businesslogic §8 — where §8 and this plan differ, this plan + the offline decision record govern.
2. **Execute the session order below** (O1 → O6). One session block per session where possible; small commits, `make test` green before each commit.
3. **Escalation rule (binding):** if implementing requires deviating from anything specified here (interface, table shape, guard placement, test spec), do NOT improvise. Append the question to the **Open questions** section at the bottom of this file, leave that thread unfinished, and continue with other in-scope work. Deviations are resolved in a short Fable session.
4. **Two review gates are mandatory:** after O3 and after O6, STOP — do not build the next block (or ship) until the Fable review gate (F4/F5) has run on the diff. Tick the roadmap + append SESSION_LOG as usual.
5. Per CLAUDE.md: never edit `docs/api-contract.md` unless the user explicitly instructs it. The API sketch below is the contract source until then.
6. **Do not enable `offline_mode` for any real facility until F5 passes.** O4 ships the local store before encryption lands in O6; the feature is dark until the final gate.

**Model routing (Solo's sessions only):** build sessions (O1–O6) run on **Opus** (`/model opus`). Gates F4/F5 run on **Fable** (`/model fable`) and review ONLY the diff since the previous gate. If Fable is unavailable at a gate, fallback: `/code-review high` plus the adversarial checklist in the gate description — but prefer waiting for Fable. This routing reflects Solo's token budget — the rest of this document binds regardless of which model a block runs on.

**Hard dependency:** the `facility_entitlements` table + `entitlementsRepository` from P4 (p4-execution-plan migration 3, block O2). O2 of THIS plan must not start before that migration is on `main`. O1 has no P4 dependency and may run any time.

---

## Session order

| # | Block | Gate |
|---|---|---|
| O1 | Graceful degradation (free tier): connectivity detection, offline banner, §8.4 read-only fallback, PWA shell | — |
| O2 | Checkout model (server): migrations, checkout/release/force-release endpoints, `contentWriteGuard` checkout block, lock indicators, entitlement gating | — |
| O3 | Sync replay engine (server): op dispatch map, batch endpoint, idempotency, audit metadata, isolation suite | **F4 (Fable) before O4** |
| O4 | Client offline store: IndexedDB, op queue, WorkspaceContext third branch, checkout UI (replaces stubs), snapshot hydration | — |
| O5 | Sync UX end-to-end: queue screen, reconnect auto-sync, revoked/error recovery, export-queue-to-file | — |
| O6 | PIN pre-authorise: cache encryption, attempt counter + wipe + wipe report, signed device token | **F5 (Fable) before enabling for any facility** |

Each block ends with: per-block §P6 tests green → self `/code-review` → commit → roadmap tick.

**Out of v1 (recorded in the decision record; do NOT build):** per-section/domain-scoped checkout, biometric/WebAuthn, photo/attachment queue (no attachments feature exists online), tamper-resistant attempt counter, offline approvals/exports/AI, contributor edits offline.

---

## Architecture (binding)

### Core model — whole-assessment checkout (exclusive lease)

One active checkout per assessment. While a checkout is active, **every** online content write to that assessment — including by the checkout owner from another device or tab — is rejected `409 ASSESSMENT_CHECKED_OUT`. Reads stay open to all roles. `lock_version` is therefore frozen for the checkout's duration, so sync replays through the existing `runContentMutation` guard unmodified, bumping once per op from `base_lock_version`. No conflicts by construction; no merge logic anywhere.

State machine for a checkout: `active` → (`synced` | `released` | `force_released`). Expiry is NOT a status: the device token expiring stops offline editing on the device (client-enforced), but the server-side lease persists until sync, owner release, or Admin force-release — auto-release would guarantee conflicts with un-synced field edits. Late sync (after `expires_at`, checkout still `active`) is allowed.

### Directory layout

```
server/src/modules/assessments/routes.js       ← checkout/sync/release routes added HERE (same file as
                                                  /export and /workflow — keeps middlewareCoverage's
                                                  DATA_MODULES classification automatic)
server/src/modules/assessments/offlineSync.js  ← op dispatch map + applyBatch (the sync engine)
server/src/modules/assessments/schemas.js      ← Zod schemas for checkout/sync bodies added here
server/src/services/offlineCheckoutService.js  ← PURE logic (95% gate): expiry math, status transitions,
                                                  batch-seq validation, op-shape/op-order validation
server/src/repositories/checkoutRepository.js  ← offline_checkouts + offline_sync_batches
client/src/offline/db.js                       ← IndexedDB layer (idb ^8), database `vorge-offline`
client/src/offline/crypto.js                   ← PBKDF2 + AES-GCM helpers (WebCrypto only, no deps)
client/src/offline/opQueue.js                  ← enqueue/read/trim the ordered op queue
client/src/offline/ConnectivityContext.jsx     ← online/offline provider (navigator.onLine + heartbeat)
client/src/features/fieldMode/                 ← REBUILT UI (checkout flow, offline workspace banner,
                                                  sync queue, PIN screens); offlineModel.js kept+extended
```

Stub disposition: `client/src/pages/fieldMode/FieldModePage.jsx` → **replaced** in O4 by the real checkout flow page (same route `/field-mode`, add to `navigation.js` for Authors when entitled); `client/src/features/assessmentWorkspace/modals/FieldModeModal.jsx` → **replaced** in O4 by a real checkout/status modal; `client/src/features/fieldMode/offlineModel.js` → **kept and extended** (banner copy logic).

### `contentWriteGuard` integration (do not bypass)

`runContentMutation` gains one optional param: `syncCheckoutId` (default `null`). New guard step **between the Draft-state check and the lock bump** (guard order comment updated; existing four steps untouched):

```js
// 3.5 Checkout lease: an active offline checkout blocks ALL online writes,
//     including the owner's — offline edits must flow through the sync queue.
const checkout = await checkoutRepository.getActiveCheckout(assessment.id);
if (checkout && checkout.id !== syncCheckoutId) {
  throw new DomainError("Assessment is checked out for field work", 409,
    "ASSESSMENT_CHECKED_OUT", { checkedOutBy: checkout.userId, expiresAt: checkout.expiresAt });
}
```

The same check is added inline to the two write paths with their own guard chains: `POST /:id/workflow` and `PUT /:id/lead-author` (workflow transitions while checked out would make replay hit `INVALID_ASSESSMENT_STATE`; block them identically).

### Migrations (knex, `server/migrations/`)

P4/P4.5 consume the `202607050001+` block. Take the **next free stamps at build time** (suggested `202607200001+` if free). Both tables get the standard `facility_isolation` RLS policy (same GUC predicate as `202607030002`), enabled + policy in the migration, idempotent style.

1. **`offline_checkouts`** — `id uuid pk default gen_random_uuid(), facility_id uuid NOT NULL → facilities,
   assessment_id uuid NOT NULL → assessments, user_id uuid NOT NULL → users, device_id uuid NOT NULL,
   device_label text null, status text NOT NULL CHECK (active|synced|released|force_released) default 'active',
   base_lock_version integer NOT NULL, scope jsonb NOT NULL default '{"type":"assessment"}',
   checkout_secret_hash text NOT NULL, created_at timestamptz default now(), expires_at timestamptz NOT NULL,
   synced_at timestamptz null, released_by uuid null, released_at timestamptz null`.
   **Partial unique index** `ON (assessment_id) WHERE status = 'active'` (the one-lease invariant; the
   row-lock in checkout creation serializes the race, this index is the backstop). Index `(facility_id, status)`.
2. **`offline_sync_batches`** — `id uuid pk, facility_id uuid NOT NULL, checkout_id uuid NOT NULL → offline_checkouts,
   batch_seq integer NOT NULL, request_id uuid NOT NULL UNIQUE, op_count integer NOT NULL,
   response jsonb NOT NULL, created_at timestamptz default now()`. Unique `(checkout_id, batch_seq)`.
   This table is the idempotency ledger: a retried `request_id` returns the stored `response` verbatim.

No changes to `audit_log_entries` (device time rides `metadata`) and no new columns on `assessments`.

### API contract sketch (binding until api-contract.md is updated on explicit instruction)

All routes on the assessments router (inherit `authenticate` + `facilityScope`). Cross-tenant always → `404 ASSESSMENT_NOT_FOUND` / `404 CHECKOUT_NOT_FOUND` (no existence leak), matching the guard's scope-first order.

**`POST /api/assessments/:id/checkout`** — body `{ expiresInDays (int 1–7), deviceLabel? (string ≤80) }`.
Guards in order: scope (404) → entitlement `offline_mode` via `entitlementsRepository` (403 `FEATURE_NOT_ENABLED`, no side effects) → Author (403 `ROLE_NOT_ALLOWED`) → Draft (409 `INVALID_ASSESSMENT_STATE`) → no active checkout (409 `ALREADY_CHECKED_OUT` `{checkedOutBy, expiresAt}`).
In ONE transaction: `SELECT … FOR UPDATE` on the assessments row → insert checkout (`base_lock_version` = current, `checkout_secret_hash` = sha256 of a fresh 32-byte secret, `device_id` = server-generated uuid) → audit `offline-checkout-created` (metadata `{checkoutId, deviceId, expiresAt}`).
Response `{ checkout: {id, deviceId, expiresAt, encSalt (16B base64, random, stored nowhere server-side beyond this response — regenerated per checkout), deviceToken (JWT: {typ:'offline-device', checkoutId, deviceId, sub:userId, exp=expires_at}, signed with env.jwtSecret)}, checkoutSecret (returned ONCE, never again), bundle (exact `GET /:id` bundle shape — reuse that assembly, do not duplicate), lockVersion }`.

**`POST /api/assessments/:id/sync`** — body `{ checkoutId, checkoutSecret, requestId (uuid), batchSeq (int ≥1), releaseCheckout (bool), ops: [{opId (uuid), type, payload, deviceEditAt (ISO string)}] (1–500 ops) }`.
Order of operations in `offlineSync.applyBatch` (binding):
1. Load checkout by id through the scoped repo → not visible → 404 `CHECKOUT_NOT_FOUND` (covers cross-tenant by RLS + facility scope).
2. `checkout.userId !== req.user.id` → 403 `CHECKOUT_NOT_YOURS`. sha256(checkoutSecret) mismatch → 403 `CHECKOUT_NOT_YOURS` (same code — don't reveal which factor failed).
3. Status: `force_released` → 409 `CHECKOUT_REVOKED`; `synced`/`released` → 409 `CHECKOUT_ALREADY_CLOSED`.
4. Idempotency: an `offline_sync_batches` row with this `request_id` → return its stored `response` (200), touch nothing.
5. `batchSeq !== max(batch_seq)+1` (1 for the first) → 409 `SYNC_BATCH_OUT_OF_ORDER`.
6. Apply ops **in array order**, each via `runContentMutation({ …, syncCheckoutId: checkout.id })` with the op-type table below. Any op failure (validation, unknown type, mutator error) → throw → the whole request transaction rolls back → 422 `SYNC_OP_FAILED` `{opId, code}` and NO batch row. All-or-nothing per batch. Sync is NOT entitlement-gated (a facility whose add-on was switched off mid-trip can still land its data; only new checkouts are gated).
7. Insert the batch row (response snapshot included); if `releaseCheckout` → status `synced`, `synced_at=now()`. Audit `offline-sync-applied` once per batch (metadata `{checkoutId, requestId, batchSeq, opCount, released}`) — per-op audit rows are already written by the guard.
8. Response `{ applied (int), lockVersion (post-replay), checkoutStatus }`.

Per-op audit: same `action_type` vocabulary as the online endpoints (`asset-created`, `section-text-updated`, …) with `metadata: { offline: true, checkoutId, opId, deviceEditAt }`. `created_at` stays server time — the hash chain is never backdated; `deviceEditAt` is client-claimed and must always be surfaced as device-reported.

**`DELETE /api/assessments/:id/checkout`** — owner discards without syncing (403 `CHECKOUT_NOT_YOURS` otherwise) → status `released`, audit `offline-checkout-released`.
**`POST /api/assessments/:id/checkout/force-release`** — Admin only (`authorizeRole(ROLES.ADMIN)` + facility scope) → status `force_released`, audit `offline-checkout-force-released` (metadata `{reason?}`). The stranded device's later sync hits 409 `CHECKOUT_REVOKED`; the client keeps its queue and offers export-to-file (O5).
**`POST /api/assessments/:id/checkout/wipe-report`** — body `{checkoutId, wipedAt}`; owner-authenticated, online; writes audit `offline-cache-wiped` (metadata `{checkoutId, wipedAt (device-reported)}`). Does NOT change checkout status (Admin decides). Ships in O6.

**Read surface:** `GET /api/assessments` rows and the `GET /:id` bundle gain an optional `checkout: { userId, userName, expiresAt } | null` field (active checkout only) for "Checked out by" indicators. Additive — existing client adapters ignore unknown fields.

### Op-type table (binding — exact strings)

| `type` | payload | dispatches to (existing mutator) | audit action_type |
|---|---|---|---|
| `asset-create` | client asset payload **+ `id` (client uuid)** | `createAssetInAssessment` | `asset-created` |
| `asset-update` | `{assetId, input}` | `updateAssetInAssessment` | `asset-updated` |
| `asset-delete` | `{assetId}` | `deleteAssetFromAssessment` | `asset-deleted` |
| `threat-create` | client threat payload **+ `id`** | `createThreatInAssessment` | `threat-created` |
| `threat-update` | `{threatId, input}` | `updateThreatInAssessment` | `threat-updated` |
| `threat-delete` | `{threatId}` | `deleteThreatFromAssessment` | `threat-deleted` |
| `link-set` | `{assetId, threatId, enabled, evaluationId? (client uuid)}` | `setAssetThreatLink` | `link-updated` |
| `evaluation-update` | `{evaluationId, input}` | `updateEvaluation` | `evaluation-updated` |
| `section-set` | `{sectionNumber ∈ {1,2,8}, contentText}` | `setSectionText` | `section-text-updated` |

Two required mutator extensions (small, online behavior unchanged):
- **Client-supplied UUIDs on create:** `createAssetInAssessment`/`createThreatInAssessment` accept an optional validated uuid `id`; online routes keep generating server-side. Unique constraints are the collision backstop.
- **`link-set` evaluation id passthrough:** when enabling a pair auto-creates an evaluation (P3 behavior), the sync path passes the client's `evaluationId` so the created row carries the id the client's subsequent `evaluation-update` ops reference. Without this, offline-ticked Section-6 cells break on replay.

### Client architecture (binding)

- **Persistence mode:** `WorkspaceContext` write functions branch three ways — demo (`isDemoEnabled()`, unchanged) / **offline** / live. Offline is selected whenever an active local checkout exists for the assessment — **even while online** — because the server rejects the owner's online writes during a checkout; the queue is the only write path. Each write: existing local-optimistic setState + `opQueue.enqueue({checkoutId, opId: crypto.randomUUID(), type, payload, deviceEditAt: new Date().toISOString()})` → resolve `{ok: true}`. The `{ok}/{error}/{conflict}` contract, `stateRef`, adapters, and blur-persist are reused untouched.
- **IndexedDB** (`idb` ^8), database `vorge-offline`: stores `checkouts` (key `checkoutId`; plaintext routing fields `{checkoutId, assessmentId, facilityId, expiresAt, encSalt, failedAttempts, deviceToken}` + `payload` = bundle snapshot, ciphertext after O6), `opQueue` (autoincrement key; plaintext `{checkoutId, seq}` + `op` ciphertext after O6), `meta` (wipe markers). One checkout at a time per device in v1 (enforced in UI, not schema).
- **Hydration:** opening a checked-out assessment hydrates from the IDB snapshot + replays the local queue over it (same `toClient*` adapters), not from the network.
- **Connectivity:** `ConnectivityContext` — `navigator.onLine` listeners + heartbeat `GET /health` every 30s only while offline-relevant (active checkout, or after a failed request); exposes `{online}`. Free-tier fallback (O1): online, no checkout, connectivity lost → workspace fields render disabled + the §8.4 banner ("You're working offline…" copy from uiux §12); NO queueing in this path, re-enable on reconnect.
- **PWA (O1):** `vite-plugin-pwa`, `registerType: 'autoUpdate'`, precache = built assets only (app shell), `navigateFallback: index.html`, **no `runtimeCaching` for `/api/**`** — assessment content comes exclusively from the deterministic IDB checkout snapshot. Manifest: name "Vorge", theme `#1E3A5F`, 192/512 PNG icons generated from `public/favicon.svg`. Demo deployment gets the same shell (harmless; demo never checks out).
- **PIN (O6):** 6 digits, set in the checkout flow ("pre-authorise"). Key = PBKDF2-SHA256, **600,000 iterations**, salt = the checkout's `encSalt`; AES-GCM-256 encrypts `checkouts.payload`, every `opQueue.op`, and the `checkoutSecret`. A `pinCheck` blob (encryption of the constant `"vorge-pin-check"`) verifies entry without storing any hash of the PIN itself. Unlock holds the key in memory only. `failedAttempts` ≥ 5 → wipe (delete `checkouts` + `opQueue`, write `{checkoutId, wipedAt}` to `meta`) → on next authenticated online session, POST the wipe-report. Sync requires PIN unlock (the secret is inside the ciphertext). The signed `deviceToken` is stored plaintext (ids + exp only) and gates the offline sign-in screen client-side; the server never trusts it — sync re-authenticates fully (normal session + checkoutSecret). Recorded limitation (decision record): 6-digit PIN vs extracted ciphertext is brute-forceable by a determined attacker; the KDF work factor is the mitigation and v1 accepts this, matching §8.3's own PIN model.

---

## Block details

### O1 — Graceful degradation (free tier) + PWA shell

No entitlement, no server changes, no P4 dependency.
- `ConnectivityContext` + heartbeat; mount in `AppShell`.
- §8.4 fallback: offline + no active checkout → workspace section fields disabled + banner (exact copy: "You're working offline. Changes will sync when you reconnect." is the FIELD-mode banner; the free fallback uses "Connection lost — the workspace is read-only until you're back online."). No queueing. Extend `offlineModel.getOfflineModeMessage` for both states.
- `vite-plugin-pwa` + manifest + icons as specced above. Verify demo mode unaffected (fetch-spy: demo fires nothing new).
- Tests: §P6 "Free-tier fallback" (RTL).

### O2 — Checkout model (server)

Prereq: P4's `facility_entitlements` migration + `entitlementsRepository` on `main`.
- Migration 1 (`offline_checkouts`) with RLS. `checkoutRepository` (`getActiveCheckout`, `createCheckout`, `releaseCheckout`, `getCheckoutForUser` — every query facility-scoped via `activeConn()`).
- `POST /checkout`, `DELETE /checkout`, `POST /checkout/force-release` per the contract sketch. Zod schemas.
- `contentWriteGuard` step 3.5 + the same check inline in `/workflow` and `/lead-author`.
- `checkout` field added to list + bundle responses; client adapter passes it through (`toClientAssessment`).
- `offlineCheckoutService` (pure): expiry clamp (1–7 days), status transition legality, secret generation/hash helpers.
- Tests: §P6 "Checkout lifecycle" + "Guard block" + cross-tenant matrix extension. Red-check: comment out guard step 3.5 → the block test fails.

### O3 — Sync replay engine (server)  → GATE F4

- Migration 2 (`offline_sync_batches`) with RLS.
- `offlineSync.js`: op-type dispatch table exactly as specced; `applyBatch` order 1–8 exactly as specced; the two mutator extensions (client UUIDs on create; `link-set` evaluationId passthrough).
- `POST /sync` route + schemas (ops array 1–500, per-type payload validation).
- Mandated verification test: a batch whose 5th op fails leaves ops 1–4 absent from the DB (proves the request-scoped transaction rolls back across savepoints — if `facilityScope`'s commit-before-flush does not roll back on thrown errors, STOP and escalate; do not hand-roll a second transaction layer).
- Tests: §P6 "Sync replay" + "Sync isolation" (the critical suite) + "Idempotency & ordering".
**STOP after O3 — request the F4 Fable review gate** (isolation, all-or-nothing, idempotency, audit fidelity, guard placement).

### O4 — Client offline store + checkout UI

- `client/src/offline/db.js` + `opQueue.js` (plaintext until O6 — feature stays dark, rule 6).
- WorkspaceContext third branch (offline mode selection + enqueue on every write fn + IDB snapshot hydration + queue replay over snapshot).
- Checkout flow UI: replace `FieldModePage` (select assessment → confirm scope=whole assessment → checkout → snapshot stored; nav entry for Authors when `checkout`-capable), replace `FieldModeModal` (live checkout status: expiry countdown, pending op count, release/discard). "Checked out by" indicators on dashboards/workspace from the O2 read surface.
- Tests: §P6 "Client offline branch" (fetch-spy: zero fetches while checked out; ops accumulate in IDB fake; demo untouched).

### O5 — Sync UX end-to-end

- Sync queue screen (pending ops grouped by section, deviceEditAt shown), "Sync now" + auto-prompt on reconnect (`ConnectivityContext`), batch chunking (≤500 ops), `releaseCheckout` on final batch.
- Failure surfaces: `SYNC_OP_FAILED` (names the op, offers retry after review), `CHECKOUT_REVOKED` (banner + **export queue to file** — JSON download of the decrypted queue via the existing `triggerBrowserDownload`), `SYNC_BATCH_OUT_OF_ORDER` (resume from server's last acked seq).
- Tests: §P6 "Sync UX" (RTL happy path, revoked path renders export affordance, retry idempotency uses the same requestId).

### O6 — PIN pre-authorise + encryption  → GATE F5

- `crypto.js` (PBKDF2/AES-GCM as specced), PIN setup step in the checkout flow, offline sign-in screen (identifier display + PIN entry + attempt warnings per uiux §12), failed-attempt wipe + `meta` marker, wipe-report endpoint + client POST on reconnect, `deviceToken` storage + offline-entry gating, encrypt-at-rest for `checkouts.payload`/`opQueue.op`/`checkoutSecret`.
- Tests: §P6 "PIN & wipe" (unit: KDF/encrypt round-trip, wrong PIN increments counter, 5th failure wipes and preserves the marker; integration: wipe-report writes the audit row).
**STOP after O6 — request the F5 Fable review gate. `offline_mode` may not be enabled for any facility before F5 passes.**

---

## Fable gate checklists (for the F4/F5 sessions)

**F4 (after O3):** cross-tenant checkout AND sync → 404 with target rows proven unchanged; forged `checkoutId` from another facility → 404 not 403; secret mismatch and wrong-user both → the SAME 403 code; all-or-nothing proven via mid-batch failure (savepoint/rollback semantics actually verified, not assumed); idempotent retry returns byte-identical stored response and writes nothing; batch ordering enforced; guard step 3.5 placement (after state, before bump — red-check); workflow + lead-author routes also blocked during checkout; per-op audit rows carry `{offline, checkoutId, opId, deviceEditAt}` with server `created_at` (hash chain intact — verify chain over a synced batch); entitlement gates checkout but NOT sync; `ALREADY_CHECKED_OUT` true-race (Promise.all → one 200 one 409 via row lock + partial index); no assessment content or PII in any sync log line.

**F5 (after O6):** PIN never stored (no hash of the PIN itself — only the pinCheck ciphertext); KDF parameters as bound (600k PBKDF2-SHA256, per-checkout salt); checkoutSecret only inside ciphertext; wipe deletes both stores and survives reload; wipe marker → audit row exactly once; deviceToken contains no secrets and server never trusts it; offline sign-in cannot be bypassed to read cached content (payload unreadable without key); queue preserved through window expiry (lockout ≠ data loss); export-to-file requires PIN unlock; decision-record limitations honestly reflected in any user-facing security copy.

---

## Open questions (build sessions append here; resolved in Fable sessions)

_(none yet)_
