const mfaEncryption = require("./mfaEncryption");

describe("mfaEncryption.encrypt / decrypt", () => {
  test("round-trips a UTF-8 string with a fresh nonce per call", () => {
    const { ciphertext, nonce } = mfaEncryption.encrypt("hello world");
    expect(Buffer.isBuffer(ciphertext)).toBe(true);
    expect(Buffer.isBuffer(nonce)).toBe(true);
    expect(nonce.length).toBe(mfaEncryption.NONCE_LEN);
    expect(mfaEncryption.decrypt(ciphertext, nonce)).toBe("hello world");
  });

  test("two encrypts of the same plaintext produce different ciphertexts (fresh nonce)", () => {
    const a = mfaEncryption.encrypt("same input");
    const b = mfaEncryption.encrypt("same input");
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
    expect(a.nonce.equals(b.nonce)).toBe(false);
  });

  test("encrypt rejects null/undefined plaintext", () => {
    expect(() => mfaEncryption.encrypt(null)).toThrow(/plaintext is required/);
    expect(() => mfaEncryption.encrypt(undefined)).toThrow(/plaintext is required/);
  });

  test("decrypt rejects non-Buffer args", () => {
    const { ciphertext, nonce } = mfaEncryption.encrypt("x");
    expect(() => mfaEncryption.decrypt("not-a-buffer", nonce)).toThrow(/must be Buffers/);
    expect(() => mfaEncryption.decrypt(ciphertext, "not-a-buffer")).toThrow(/must be Buffers/);
  });

  test("decrypt rejects wrong-length nonce", () => {
    const { ciphertext } = mfaEncryption.encrypt("x");
    expect(() => mfaEncryption.decrypt(ciphertext, Buffer.alloc(11))).toThrow(/nonce must be/);
  });

  test("decrypt rejects too-short ciphertext (missing tag)", () => {
    const nonce = Buffer.alloc(mfaEncryption.NONCE_LEN);
    expect(() => mfaEncryption.decrypt(Buffer.alloc(8), nonce)).toThrow(/ciphertext too short/);
  });

  test("decrypt fails when nonce is wrong (different bytes)", () => {
    const { ciphertext } = mfaEncryption.encrypt("x");
    const wrongNonce = Buffer.alloc(mfaEncryption.NONCE_LEN, 1);
    expect(() => mfaEncryption.decrypt(ciphertext, wrongNonce)).toThrow();
  });

  test("decrypt fails when ciphertext tampered (tag mismatch)", () => {
    const { ciphertext, nonce } = mfaEncryption.encrypt("x");
    const tampered = Buffer.from(ciphertext);
    tampered[0] = tampered[0] ^ 0xff;
    expect(() => mfaEncryption.decrypt(tampered, nonce)).toThrow();
  });

  test("encrypt accepts a Buffer plaintext as well as a string", () => {
    const buf = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    const { ciphertext, nonce } = mfaEncryption.encrypt(buf);
    expect(mfaEncryption.decrypt(ciphertext, nonce)).toBe(buf.toString("utf8"));
  });
});
