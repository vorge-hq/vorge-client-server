// P3 · (e) — Narrative section text (Sections 1 Executive Summary, 2 Facility
// Information, 8 Conclusion) in the assessment_sections table (migration
// 202607030003). PUT upserts one (assessment_id, section_number) row. Runs
// inside the write-guard savepoint; changed-fields-only diff on content_text.
const crypto = require("crypto");

// The narrative sections that carry free text. Section numbers follow the
// businesslogic §-numbering; the endpoint validates against this set.
const NARRATIVE_SECTIONS = Object.freeze([1, 2, 8]);

async function setSectionText({ assessment, sectionNumber, contentText, trx }) {
  const existing = await trx("assessment_sections")
    .where({ assessment_id: assessment.id, section_number: sectionNumber })
    .first();

  if (existing) {
    const before = existing.content_text;
    if (before !== contentText) {
      await trx("assessment_sections")
        .where({ id: existing.id })
        .update({ content_text: contentText, updated_at: trx.fn.now() });
    }
    return {
      entityId: existing.id,
      diff: { contentText: [before, contentText] },
      result: { sectionNumber, contentText }
    };
  }

  const id = crypto.randomUUID();
  await trx("assessment_sections").insert({
    id,
    facility_id: assessment.facilityId,
    assessment_id: assessment.id,
    section_number: sectionNumber,
    content_text: contentText
  });
  return {
    entityId: id,
    diff: { contentText: [null, contentText] },
    result: { sectionNumber, contentText }
  };
}

module.exports = { setSectionText, NARRATIVE_SECTIONS };
