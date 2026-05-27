jest.mock("../db/knex", () => ({
  transaction: jest.fn(async (callback) => callback("trx"))
}));

jest.mock("../repositories/sessionRepository", () => ({
  createSession: jest.fn(),
  findActiveSessionById: jest.fn(),
  findSessionById: jest.fn(async () => null),
  revokeSession: jest.fn(),
  setMfaSatisfied: jest.fn(async () => 1),
  setMustReenroll: jest.fn(async () => 1)
}));

const db = require("../db/knex");
const sessionRepository = require("../repositories/sessionRepository");
const sessionService = require("./sessionService");

const user = {
  id: "user-1",
  email: "user@example.com",
  roleAssignments: [{ role: "Author", facilityId: "facility-1", operatorId: "operator-1" }]
};

const req = {
  ip: "10.0.0.1",
  headers: { "user-agent": "jest" }
};

beforeEach(() => {
  jest.clearAllMocks();
  sessionRepository.createSession.mockResolvedValue({ id: "sid-x" });
  sessionRepository.revokeSession.mockResolvedValue(1);
});

describe("sessionService.issueSession", () => {
  test("inserts a session row with derived expiry and request context", async () => {
    const result = await sessionService.issueSession({ user, actingRole: "Author", req });

    expect(result.sid).toEqual(expect.any(String));
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());

    expect(sessionRepository.createSession).toHaveBeenCalledTimes(1);
    const [payload, trx] = sessionRepository.createSession.mock.calls[0];
    expect(payload).toMatchObject({
      id: result.sid,
      userId: "user-1",
      actingRole: "Author",
      facilityId: "facility-1",
      sourceIp: "10.0.0.1",
      userAgent: "jest"
    });
    expect(payload.expiresAt).toBe(result.expiresAt);
    expect(trx).toBeDefined();
  });

  test("tolerates a user without role assignments and a request without headers", async () => {
    const userWithoutRole = { id: "user-2", roleAssignments: [] };
    const reqWithoutHeaders = {};

    await sessionService.issueSession({ user: userWithoutRole, actingRole: "Author", req: reqWithoutHeaders });

    const [payload] = sessionRepository.createSession.mock.calls[0];
    expect(payload.facilityId).toBeNull();
    expect(payload.sourceIp).toBeNull();
    expect(payload.userAgent).toBeNull();
  });
});

describe("sessionService.validateSession", () => {
  test("returns the session row when active", async () => {
    const session = { id: "sid-1", userId: "user-1" };
    sessionRepository.findActiveSessionById.mockResolvedValue(session);

    await expect(sessionService.validateSession("sid-1")).resolves.toBe(session);
  });

  test("throws INVALID_TOKEN when the sid is unknown, revoked, or expired", async () => {
    sessionRepository.findActiveSessionById.mockResolvedValue(null);

    await expect(sessionService.validateSession("missing")).rejects.toMatchObject({
      code: "INVALID_TOKEN"
    });
  });

  test("forwards the explicit `now` to the repository", async () => {
    sessionRepository.findActiveSessionById.mockResolvedValue({ id: "sid-1" });
    const now = new Date("2026-05-23T12:00:00Z");

    await sessionService.validateSession("sid-1", now);

    expect(sessionRepository.findActiveSessionById).toHaveBeenCalledWith("sid-1", now);
  });
});

describe("sessionService.revokeSession", () => {
  test("delegates to the repository with default now/trx", async () => {
    sessionRepository.revokeSession.mockResolvedValue(1);

    await expect(sessionService.revokeSession("sid-1")).resolves.toBe(1);
    expect(sessionRepository.revokeSession).toHaveBeenCalledWith(
      "sid-1",
      expect.any(Date),
      expect.anything()
    );
  });

  test("is idempotent: a second call still resolves and does not throw", async () => {
    sessionRepository.revokeSession.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    await sessionService.revokeSession("sid-1");
    await expect(sessionService.revokeSession("sid-1")).resolves.toBe(0);
  });

  test("forwards an explicit trx and now to the repository", async () => {
    sessionRepository.revokeSession.mockResolvedValue(1);
    const now = new Date();

    await sessionService.revokeSession("sid-1", now, "explicit-trx");

    expect(sessionRepository.revokeSession).toHaveBeenCalledWith("sid-1", now, "explicit-trx");
  });
});

describe("sessionService.rotateSession", () => {
  test("participates in an outer transaction when one is supplied", async () => {
    sessionRepository.revokeSession.mockResolvedValue(1);
    await sessionService.rotateSession({
      user,
      previousSid: "old-sid",
      actingRole: "Reviewer",
      req,
      trx: "outer-trx"
    });
    expect(db.transaction).not.toHaveBeenCalled();
    expect(sessionRepository.revokeSession).toHaveBeenCalledWith("old-sid", expect.any(Date), "outer-trx");
  });

  test("revokes the previous session and issues a new one in a transaction", async () => {
    const result = await sessionService.rotateSession({
      user,
      previousSid: "old-sid",
      actingRole: "Reviewer",
      req
    });

    expect(result.previousSid).toBe("old-sid");
    expect(result.sid).toEqual(expect.any(String));
    expect(result.sid).not.toBe("old-sid");
    expect(result.expiresAt).toBeInstanceOf(Date);

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(sessionRepository.revokeSession).toHaveBeenCalledWith("old-sid", expect.any(Date), "trx");
    expect(sessionRepository.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", actingRole: "Reviewer" }),
      "trx"
    );
  });

  test("rolls back when the new insert fails (transaction callback rejects)", async () => {
    db.transaction.mockImplementationOnce(async (callback) => {
      try {
        return await callback("trx");
      } catch (error) {
        // simulate knex rolling back and re-raising
        throw error;
      }
    });
    sessionRepository.createSession.mockRejectedValueOnce(new Error("insert failed"));

    await expect(
      sessionService.rotateSession({
        user,
        previousSid: "old-sid",
        actingRole: "Reviewer",
        req
      })
    ).rejects.toThrow("insert failed");

    expect(sessionRepository.revokeSession).toHaveBeenCalledWith("old-sid", expect.any(Date), "trx");
  });
});
