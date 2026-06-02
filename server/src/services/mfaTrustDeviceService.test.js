jest.mock("../repositories/mfaTrustedDeviceRepository", () => ({
  createDevice: jest.fn(),
  findActiveByHash: jest.fn(),
  touchLastSeen: jest.fn(),
  revokeAllForUser: jest.fn()
}));

const repo = require("../repositories/mfaTrustedDeviceRepository");
const trustDevice = require("./mfaTrustDeviceService");

beforeEach(() => {
  jest.clearAllMocks();
  repo.createDevice.mockResolvedValue({ id: "td-1" });
  repo.findActiveByHash.mockResolvedValue(null);
  repo.touchLastSeen.mockResolvedValue(1);
  repo.revokeAllForUser.mockResolvedValue(2);
});

function fakeRes() {
  return { cookie: jest.fn(), clearCookie: jest.fn() };
}

describe("mfaTrustDeviceService.issueCookie", () => {
  test("sets a cookie with locked attributes and persists the hash", async () => {
    const res = fakeRes();
    const { plaintext, tokenHash, expiresAt } = await trustDevice.issueCookie(res, "user-1", "trx");

    expect(plaintext).toMatch(/^[0-9a-f]{64}$/);
    expect(tokenHash).toBe(trustDevice.hashToken(plaintext));
    expect(expiresAt).toBeInstanceOf(Date);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000);

    expect(repo.createDevice).toHaveBeenCalledWith(
      { userId: "user-1", cookieTokenHash: tokenHash, expiresAt },
      "trx"
    );
    expect(res.cookie).toHaveBeenCalledWith(
      "vorge_mfa_trust",
      plaintext,
      expect.objectContaining({
        httpOnly: true,
        sameSite: "strict",
        path: "/api/auth"
      })
    );
  });

  test("rejects missing args", async () => {
    await expect(trustDevice.issueCookie(null, "user-1")).rejects.toThrow();
    await expect(trustDevice.issueCookie(fakeRes(), null)).rejects.toThrow();
  });
});

describe("mfaTrustDeviceService.validateCookie", () => {
  test("returns false when no cookie present", async () => {
    const req = { cookies: {} };
    expect(await trustDevice.validateCookie(req, "user-1")).toBe(false);
    expect(repo.findActiveByHash).not.toHaveBeenCalled();
  });

  test("returns false when DB row not found", async () => {
    const req = { cookies: { vorge_mfa_trust: "abc" } };
    expect(await trustDevice.validateCookie(req, "user-1")).toBe(false);
  });

  test("returns false when row belongs to a different user", async () => {
    repo.findActiveByHash.mockResolvedValue({ id: "td-1", userId: "user-other" });
    const req = { cookies: { vorge_mfa_trust: "abc" } };
    expect(await trustDevice.validateCookie(req, "user-1")).toBe(false);
  });

  test("returns true and touches last_seen when row matches", async () => {
    repo.findActiveByHash.mockResolvedValue({ id: "td-1", userId: "user-1" });
    const req = { cookies: { vorge_mfa_trust: "abc" } };
    expect(await trustDevice.validateCookie(req, "user-1")).toBe(true);
    expect(repo.touchLastSeen).toHaveBeenCalledWith("td-1", expect.any(Date), undefined);
  });

  test("returns false when req or userId missing", async () => {
    expect(await trustDevice.validateCookie(null, "user-1")).toBe(false);
    expect(await trustDevice.validateCookie({ cookies: {} }, null)).toBe(false);
  });
});

describe("mfaTrustDeviceService.clearCookie / revokeAllForUser", () => {
  test("clearCookie delegates to res.clearCookie with locked attributes", () => {
    const res = fakeRes();
    trustDevice.clearCookie(res);
    expect(res.clearCookie).toHaveBeenCalledWith(
      "vorge_mfa_trust",
      expect.objectContaining({ httpOnly: true, sameSite: "strict", path: "/api/auth" })
    );
  });

  test("revokeAllForUser delegates to the repo", async () => {
    expect(await trustDevice.revokeAllForUser("user-1", "trx")).toBe(2);
    expect(repo.revokeAllForUser).toHaveBeenCalledWith("user-1", "trx");
  });
});

describe("mfaTrustDeviceService helpers", () => {
  test("hashToken is deterministic sha256 hex", () => {
    expect(trustDevice.hashToken("x")).toMatch(/^[0-9a-f]{64}$/);
    expect(trustDevice.hashToken("x")).toBe(trustDevice.hashToken("x"));
  });

  test("generatePlaintextToken returns 64 hex chars non-deterministic", () => {
    const a = trustDevice.generatePlaintextToken();
    const b = trustDevice.generatePlaintextToken();
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});
