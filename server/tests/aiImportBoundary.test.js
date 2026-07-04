// P4 · O2 — the architectural invariant test. Mechanically enforces
// businesslogic §9's rule (and the AI-gateway decision record): the AI SDK and
// every provider SDK are importable ONLY from server/src/ai. A weaker model
// cannot accidentally slip `require('ai')` into a feature or repository — this
// runs on every `npm test` and fails the build if it does.
//
// No DB, no network: a plain fs walk over server/src.
const fs = require("fs");
const path = require("path");

const SRC_ROOT = path.join(__dirname, "..", "src");
const AI_MODULE_DIR = path.join(SRC_ROOT, "ai");

// Module specifiers no file OUTSIDE src/ai may import.
function isBanned(spec) {
  return (
    spec === "ai" ||
    spec.startsWith("ai/") ||
    spec.startsWith("@ai-sdk/") ||
    spec === "openai" ||
    spec.startsWith("openai/") ||
    spec.startsWith("@anthropic-ai/") ||
    spec === "together-ai" ||
    spec.startsWith("together-ai/") ||
    spec === "voyageai" ||
    spec.startsWith("voyageai/")
  );
}

function collectJsFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectJsFiles(full, acc);
    } else if (entry.isFile() && full.endsWith(".js")) {
      acc.push(full);
    }
  }
  return acc;
}

// Extract every module specifier from require(...) and ES import ... from "...".
function specifiersIn(source) {
  const specs = [];
  const patterns = [
    /require\(\s*['"]([^'"]+)['"]\s*\)/g,
    /(?:import|export)[^'"]*from\s*['"]([^'"]+)['"]/g,
    /import\(\s*['"]([^'"]+)['"]\s*\)/g
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      specs.push(match[1]);
    }
  }
  return specs;
}

describe("AI import boundary", () => {
  const files = collectJsFiles(SRC_ROOT).filter((file) => !file.startsWith(AI_MODULE_DIR + path.sep));

  test("the walk actually covers src outside the AI module (guard against a no-op scan)", () => {
    // If the walk silently found nothing, the whole invariant would pass
    // vacuously. Assert it swept real breadth: repositories, services, modules.
    expect(files.length).toBeGreaterThan(30);
    expect(files.some((f) => f.includes(`${path.sep}repositories${path.sep}`))).toBe(true);
    expect(files.some((f) => f.includes(`${path.sep}services${path.sep}`))).toBe(true);
    expect(files.some((f) => f.includes(`${path.sep}modules${path.sep}`))).toBe(true);
  });

  test("no file outside server/src/ai imports the AI SDK or any provider SDK", () => {
    const offenders = [];
    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      for (const spec of specifiersIn(source)) {
        if (isBanned(spec)) {
          offenders.push(`${path.relative(SRC_ROOT, file)} imports "${spec}"`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test("the AI module itself DOES import the gateway SDK (the boundary is not vacuous)", () => {
    const gatewaySource = fs.readFileSync(path.join(AI_MODULE_DIR, "gateway.js"), "utf8");
    const specs = specifiersIn(gatewaySource);
    expect(specs.some((spec) => isBanned(spec))).toBe(true);
  });
});
