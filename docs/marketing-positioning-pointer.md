# Marketing & Positioning — Pointer

The detailed marketing positioning, competitive analysis, and
customer-facing language decisions for Vantage are NOT in this code
repo. They live in the project documentation folder at:

`Backup/Business/Security Risk/`

Specifically:
- **Competitive_Analysis_vs_Sphera.docx** — the 12 differentiators
  and strategic emphasis ranking
- **Alora_SRA_Proposal.docx** — customer-facing claims, pricing
  structure, deliverables language
- **Platform_Overview.docx** — high-level platform pitch
- **Comparison_Sheet_OnePage.docx** — one-page customer comparison
- **Vantage_Product_Roadmap.docx** — feature roadmap, revenue stream
  philosophy

---

## When this matters for engineers

If you are about to change any of the following in the codebase, **stop
and check the positioning docs first**:

- Customer-facing copy on `/login`, `/dashboard`, marketing pages, or
  emails
- Claims about implementation duration ("16-week implementation")
- Feature names or feature framing (especially AI capabilities)
- Pricing or tier names
- Anything that contradicts the proposal language

The positioning docs are the source of truth for customer-facing
language. The code should match, not lead.

---

## When positioning decisions ARE captured in the code repo

Specific decisions that affect *both* product behavior and positioning
get a dual record:

- The positioning rationale lives in
  `Backup/Business/Security Risk/Competitive_Analysis_vs_Sphera.docx`
  (or equivalent)
- The product/engineering decision lives in
  `docs/decisions/product-decision-log.md` with a note like "see
  Competitive Analysis doc for positioning rationale"

This keeps the engineering-side log readable without duplicating the
strategic context.
