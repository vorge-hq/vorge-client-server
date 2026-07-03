# Decision: Vercel AI Gateway + AI SDK for the AI service module — deviation from businesslogic §9

**Date:** 2026-07-03 · **Status:** APPROVED (user sign-off 2026-07-03). `docs/businesslogic.md` §9 stays unedited; this record governs as the standing deviation. · **Phase:** P4

## Decision

The AI service module (businesslogic §9.0) is implemented as an **app-layer module in the Express server** that calls models through the **Vercel AI Gateway** using the **AI SDK**, instead of wrapping Together AI's API directly with YAML-based provider routing.

Unchanged §9 requirements the module still owns (these are preserved, not deviated from):

- **No direct provider imports in feature code** — feature code calls the module only; `import openai`/`@ai-sdk/anthropic` etc. in a feature is still an architectural violation.
- Audit-log write on every AI call with all §9.7 fields (feature, facility_id, user_id, provider, model, tokens in/out, cost_usd, latency_ms, outcome, error_detail, trace_id).
- Per-facility cost ceilings: soft alert at 80%, hard auto-suspend at 100%, resume on the 1st. Default $50/facility/month, $20/operator/month for HQ features.
- Per-facility prompt scoping by construction (Facility A request can never include Facility B data; cross-facility only for the HQ consistency feature).
- No silent mid-request provider fallback; retries with backoff; per-facility rate limits; advisory-only posture; Mitigation Owner gets 403 on any AI endpoint.

## What deviates from §9 (requires sign-off)

| §9 says | This decision |
|---|---|
| Together AI (Llama 3.3 70B) primary, frontier API fallback, hand-rolled OpenAI-compatible client | AI Gateway is the single egress; models addressed as `"provider/model"` strings |
| Provider routing via `/config/ai-providers.yaml`, edit + restart | Per-feature model choice via module config (env/JS config map); same "no feature-code change" property, different mechanism |
| "No multi-provider gateway with adapters" (v1 scope exclusion) | The gateway IS multi-provider — but it is a managed service, not the bespoke adapter layer §9 was excluding |
| Cost figures assume Together AI pricing | Costs tracked via gateway usage metadata; per-model prices differ; ceilings still enforced in-app |

## Why

- One API key, one egress point, provider failover, unified usage/cost observability — without building or operating the multi-provider plumbing §9 deliberately excluded.
- AI SDK gives structured output (smart tagging), streaming (drafted summaries), and embeddings behind one interface; swapping models per feature is a config-string change, satisfying §9's "no code changes to the feature" intent.
- Keeps future options open (frontier model for the bespoke NL-search engagement, §9.5) with no rearchitecture.

## Consequences

- New dependency + env var (`AI_GATEWAY_API_KEY`) on the Render server; gateway billing through Vercel account.
- The audit log's `provider` field records what the gateway actually routed to (gateway responses expose the provider/model used) — §9.7's "audit must reflect what was actually used" is preserved; if that metadata is unavailable on some path, log the requested model string and flag it.
- Data flows through Vercel AI Gateway (zero-data-retention posture per Vercel docs) in addition to the model provider. §9 v1 already accepts sending real entity names to providers; obfuscation remains a future paid hardening item.
- Embeddings for semantic search (voyage/openai per §9.4) also route through the gateway.

## Sign-off

**Approved by user 2026-07-03.** §9 stays unedited; this record governs. Any future reversal reverts P4 to a direct Together AI integration per §9 with no change to P0–P3.
