const OTPAuth = require("otpauth");
const totpService = require("./totpService");

beforeEach(() => {
  totpService._resetReplayCache();
  delete process.env.__MFA_TEST_MODE__;
});

afterEach(() => {
  delete process.env.__MFA_TEST_MODE__;
});

describe("totpService.generateSecret", () => {
  test("returns a base32 string of expected length (52 chars for 32 bytes)", () => {
    const a = totpService.generateSecret();
    const b = totpService.generateSecret();
    expect(typeof a).toBe("string");
    expect(a).toMatch(/^[A-Z2-7]+=*$/); // base32 alphabet
    expect(a).not.toBe(b);
  });
});

describe("totpService.buildOtpauthUrl", () => {
  test("emits an otpauth:// URL with issuer + label + algorithm + digits + period", () => {
    const secret = totpService.generateSecret();
    const url = totpService.buildOtpauthUrl({
      secretBase32: secret,
      accountLabel: "adaeze@operator-a.example"
    });
    expect(url).toContain("otpauth://totp/");
    expect(url).toContain("issuer=Vorge");
    expect(url).toContain("algorithm=SHA1");
    expect(url).toContain("digits=6");
    expect(url).toContain("period=30");
  });

  test("rejects missing inputs", () => {
    expect(() => totpService.buildOtpauthUrl({ accountLabel: "x" })).toThrow();
    expect(() => totpService.buildOtpauthUrl({ secretBase32: "X" })).toThrow();
  });
});

describe("totpService.verifyCode (real verification)", () => {
  test("accepts a code generated for the current window", () => {
    const secret = totpService.generateSecret();
    const totp = new OTPAuth.TOTP({
      issuer: "Vorge",
      label: "test",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret)
    });
    const now = Date.now();
    const code = totp.generate({ timestamp: now });
    expect(totpService.verifyCode({ secretBase32: secret, code, now })).toBe(0);
  });

  test("accepts a code from the previous window (window=±1)", () => {
    const secret = totpService.generateSecret();
    const totp = new OTPAuth.TOTP({
      issuer: "Vorge",
      label: "test",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret)
    });
    const now = Date.now();
    const prevCode = totp.generate({ timestamp: now - 30 * 1000 });
    expect(totpService.verifyCode({ secretBase32: secret, code: prevCode, now })).toBe(-1);
  });

  test("rejects a code from two windows ago", () => {
    const secret = totpService.generateSecret();
    const totp = new OTPAuth.TOTP({
      issuer: "Vorge",
      label: "test",
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret)
    });
    const now = Date.now();
    const oldCode = totp.generate({ timestamp: now - 90 * 1000 });
    expect(totpService.verifyCode({ secretBase32: secret, code: oldCode, now })).toBeNull();
  });

  test("rejects malformed inputs (non-string, wrong length, non-digits, empty)", () => {
    const secret = totpService.generateSecret();
    expect(totpService.verifyCode({ secretBase32: secret, code: "12345" })).toBeNull();
    expect(totpService.verifyCode({ secretBase32: secret, code: "1234567" })).toBeNull();
    expect(totpService.verifyCode({ secretBase32: secret, code: "abcdef" })).toBeNull();
    expect(totpService.verifyCode({ secretBase32: secret, code: 123456 })).toBeNull();
    expect(totpService.verifyCode({ secretBase32: secret, code: "" })).toBeNull();
    expect(totpService.verifyCode({ secretBase32: null, code: "000000" })).toBeNull();
  });
});

describe("totpService test-mode bypass", () => {
  test("when __MFA_TEST_MODE__=1, accepts only '000000'", () => {
    process.env.__MFA_TEST_MODE__ = "1";
    expect(totpService.isTestBypassActive()).toBe(true);
    expect(totpService.verifyCode({ secretBase32: "ANYTHING", code: "000000" })).toBe(0);
    expect(totpService.verifyCode({ secretBase32: "ANYTHING", code: "111111" })).toBeNull();
  });

  test("with bypass off, isTestBypassActive returns false", () => {
    expect(totpService.isTestBypassActive()).toBe(false);
  });
});

describe("totpService replay cache", () => {
  test("isReplay returns false for unseen codes, true after recordCodeUse", () => {
    expect(totpService.isReplay("user-1", "000000")).toBe(false);
    totpService.recordCodeUse("user-1", "000000");
    expect(totpService.isReplay("user-1", "000000")).toBe(true);
  });

  test("replay cache entries expire after the replay window", () => {
    const now = Date.now();
    totpService.recordCodeUse("user-1", "111111", now);
    expect(totpService.isReplay("user-1", "111111", now + 60 * 1000)).toBe(true);
    expect(totpService.isReplay("user-1", "111111", now + 200 * 1000)).toBe(false);
  });

  test("replay cache is per-user (user-2 not affected by user-1's used code)", () => {
    totpService.recordCodeUse("user-1", "222222");
    expect(totpService.isReplay("user-2", "222222")).toBe(false);
  });
});
