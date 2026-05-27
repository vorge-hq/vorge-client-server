const crypto = require("crypto");
const env = require("../config/env");

const ALGO = "aes-256-gcm";
const NONCE_LEN = 12; // GCM standard
const TAG_LEN = 16;

function getKey() {
  return Buffer.from(env.mfaEncryptionKey, "base64");
}

/**
 * Encrypt plaintext using AES-256-GCM. Returns the ciphertext (auth tag
 * appended) and a fresh per-call nonce. Caller stores both in the DB row.
 *
 * Returns { ciphertext: Buffer, nonce: Buffer }.
 */
function encrypt(plaintext) {
  if (plaintext === undefined || plaintext === null) {
    throw new Error("encrypt: plaintext is required");
  }
  const key = getKey();
  const nonce = crypto.randomBytes(NONCE_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, nonce);
  const input = typeof plaintext === "string" ? Buffer.from(plaintext, "utf8") : plaintext;
  const enc = Buffer.concat([cipher.update(input), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: Buffer.concat([enc, tag]), nonce };
}

/**
 * Decrypt ciphertext using the stored nonce. Throws on tampering, wrong key,
 * wrong nonce. Returns the plaintext as a UTF-8 string.
 */
function decrypt(ciphertext, nonce) {
  if (!Buffer.isBuffer(ciphertext) || !Buffer.isBuffer(nonce)) {
    throw new Error("decrypt: ciphertext and nonce must be Buffers");
  }
  if (nonce.length !== NONCE_LEN) {
    throw new Error(`decrypt: nonce must be ${NONCE_LEN} bytes (got ${nonce.length})`);
  }
  if (ciphertext.length < TAG_LEN) {
    throw new Error(`decrypt: ciphertext too short (must include ${TAG_LEN}-byte auth tag)`);
  }
  const key = getKey();
  const enc = ciphertext.subarray(0, ciphertext.length - TAG_LEN);
  const tag = ciphertext.subarray(ciphertext.length - TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key, nonce);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(enc), decipher.final()]);
  return plaintext.toString("utf8");
}

module.exports = {
  encrypt,
  decrypt,
  NONCE_LEN,
  TAG_LEN
};
