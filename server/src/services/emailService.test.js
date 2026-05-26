const emailService = require("./emailService");

describe("emailService.sendPasswordResetEmail (stub)", () => {
  let spy;

  beforeEach(() => {
    spy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    spy.mockRestore();
  });

  test("logs a hashed email tag and the reset URL (no raw PII)", () => {
    emailService.sendPasswordResetEmail("adaeze@operator-a.example", "http://localhost:5173/reset-password?token=abc123");

    expect(spy).toHaveBeenCalledTimes(1);
    const message = spy.mock.calls[0][0];
    expect(message).not.toContain("adaeze@operator-a.example");
    expect(message).toMatch(/^\[email stub\] password reset for [0-9a-f]{12}: http:\/\/localhost:5173\/reset-password\?token=abc123$/);
  });

  test("handles a nullish email without throwing", () => {
    expect(() => emailService.sendPasswordResetEmail(null, "http://x/reset")).not.toThrow();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
