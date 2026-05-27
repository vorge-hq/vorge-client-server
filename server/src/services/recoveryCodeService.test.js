const bcrypt = require("bcryptjs");
const recoveryCodeService = require("./recoveryCodeService");

describe("recoveryCodeService.generateOneCode", () => {
  test("produces XXXXX-XXXXX format from the restricted alphabet", () => {
    const code = recoveryCodeService.generateOneCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
    expect(code).not.toMatch(/[IO01]/); // confusing chars I/O/0/1 excluded
  });

  test("generates different codes on successive calls", () => {
    const a = recoveryCodeService.generateOneCode();
    const b = recoveryCodeService.generateOneCode();
    expect(a).not.toBe(b);
  });
});

describe("recoveryCodeService.generateCodes", () => {
  test("returns 10 plaintexts + 10 matching bcrypt hashes by default", async () => {
    const { plaintexts, hashes } = await recoveryCodeService.generateCodes();
    expect(plaintexts).toHaveLength(10);
    expect(hashes).toHaveLength(10);
    expect(hashes[0]).toMatch(/^\$2[aby]\$/);
    // Verify hashes match their plaintexts
    for (let i = 0; i < 10; i++) {
      expect(await bcrypt.compare(plaintexts[i], hashes[i])).toBe(true);
    }
  }, 20000);

  test("accepts a custom count parameter", async () => {
    const { plaintexts, hashes } = await recoveryCodeService.generateCodes(3);
    expect(plaintexts).toHaveLength(3);
    expect(hashes).toHaveLength(3);
  });
});

describe("recoveryCodeService.findMatch", () => {
  test("returns the matching index for a known code", async () => {
    const { plaintexts, hashes } = await recoveryCodeService.generateCodes(3);
    expect(await recoveryCodeService.findMatch(plaintexts[1], hashes)).toBe(1);
  });

  test("returns -1 when no hash matches", async () => {
    const { hashes } = await recoveryCodeService.generateCodes(3);
    expect(await recoveryCodeService.findMatch("AAAAA-BBBBB", hashes)).toBe(-1);
  });

  test("normalizes input: trim, uppercase, strip spaces", async () => {
    const { plaintexts, hashes } = await recoveryCodeService.generateCodes(2);
    const lowercased = plaintexts[0].toLowerCase();
    const spaced = ` ${lowercased.replace("-", "- ")} `;
    expect(await recoveryCodeService.findMatch(spaced, hashes)).toBe(0);
  });

  test("returns -1 on empty/invalid input", async () => {
    const { hashes } = await recoveryCodeService.generateCodes(1);
    expect(await recoveryCodeService.findMatch("", hashes)).toBe(-1);
    expect(await recoveryCodeService.findMatch(null, hashes)).toBe(-1);
    expect(await recoveryCodeService.findMatch("anything", null)).toBe(-1);
  });
});
