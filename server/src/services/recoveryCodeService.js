const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const env = require("../config/env");

const CODE_COUNT = 10;
const CODE_GROUPS = 2; // 2 hyphen-separated groups
const CODE_GROUP_LEN = 5; // 5 chars per group → 10 total
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 to avoid confusion

function generateOneCode() {
  const groups = [];
  for (let g = 0; g < CODE_GROUPS; g++) {
    const buf = crypto.randomBytes(CODE_GROUP_LEN);
    let group = "";
    for (let i = 0; i < CODE_GROUP_LEN; i++) {
      group += CODE_ALPHABET[buf[i] % CODE_ALPHABET.length];
    }
    groups.push(group);
  }
  return groups.join("-");
}

/**
 * Generate N (default 10) one-time recovery codes. Returns plaintext + hashes
 * in matched arrays. Plaintext is shown to the user ONCE; hashes are stored.
 */
async function generateCodes(count = CODE_COUNT) {
  const plaintexts = [];
  for (let i = 0; i < count; i++) plaintexts.push(generateOneCode());
  const hashes = await Promise.all(plaintexts.map((p) => bcrypt.hash(p, env.bcryptRounds)));
  return { plaintexts, hashes };
}

/**
 * Compare a presented code against an array of stored bcrypt hashes. Returns
 * the index of the matching hash, or -1 if no match. Uses bcrypt.compare so
 * timing is consistent per-comparison.
 */
async function findMatch(presentedCode, hashes) {
  if (!presentedCode || !Array.isArray(hashes)) return -1;
  // Normalize input: uppercase, strip spaces. Hyphen is significant.
  const normalized = String(presentedCode).trim().toUpperCase().replace(/\s+/g, "");
  for (let i = 0; i < hashes.length; i++) {
    // eslint-disable-next-line no-await-in-loop
    if (await bcrypt.compare(normalized, hashes[i])) return i;
  }
  return -1;
}

module.exports = {
  generateCodes,
  findMatch,
  generateOneCode,
  CODE_COUNT,
  CODE_ALPHABET
};
