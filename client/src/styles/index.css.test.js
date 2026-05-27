import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/**
 * Drift assertion for ramp CSS variables.
 *
 * Tailwind's opacity-modifier syntax (color/N) requires colors in a
 * decomposable format. We store ramp values as both hex and parallel
 * channel-triple variables (e.g. --primary-500 + --primary-500-rgb).
 * This test catches accidental drift between the two representations —
 * if a designer updates one variable but forgets the companion, the
 * mismatch fails CI here rather than silently shipping wrong colors.
 *
 * See docs/decisions/product-decision-log.md, entry dated 2026-05-27,
 * "Fixed silently-dropped dark: opacity-modifier Tailwind utilities".
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(__dirname, "./index.css");
const css = readFileSync(cssPath, "utf8");

const RAMPS = ["primary", "secondary", "tertiary", "gray"];

function hexToChannels(hex) {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) throw new Error(`Invalid hex: ${hex}`);
  return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)];
}

function parseHexDecls(source, ramp) {
  // Match e.g. "--primary-500: #1F3A5F;" — digit-suffixed slot, hex value.
  // Won't match "--primary-500-rgb:" (no hex literal after the colon) or
  // "--primary-foreground:" (no digit slot).
  const re = new RegExp(`--${ramp}-(\\d+)\\s*:\\s*(#[0-9a-fA-F]{6})\\s*;`, "g");
  const out = new Map();
  for (const m of source.matchAll(re)) {
    out.set(Number(m[1]), m[2]);
  }
  return out;
}

function parseRgbDecls(source, ramp) {
  // Match e.g. "--primary-500-rgb: 31 58 95;" — explicit -rgb suffix, three
  // space-separated integers.
  const re = new RegExp(`--${ramp}-(\\d+)-rgb\\s*:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)\\s*;`, "g");
  const out = new Map();
  for (const m of source.matchAll(re)) {
    out.set(Number(m[1]), [Number(m[2]), Number(m[3]), Number(m[4])]);
  }
  return out;
}

describe("ramp variable hex ↔ rgb drift assertion", () => {
  for (const ramp of RAMPS) {
    test(`${ramp} ramp: every hex stop has a matching -rgb companion`, () => {
      const hexes = parseHexDecls(css, ramp);
      const rgbs = parseRgbDecls(css, ramp);

      expect(hexes.size).toBeGreaterThan(0);
      expect(rgbs.size, `${ramp}: hex count (${hexes.size}) vs -rgb count (${rgbs.size})`).toBe(
        hexes.size
      );

      for (const [stop, hex] of hexes) {
        const expected = hexToChannels(hex);
        const actual = rgbs.get(stop);
        expect(actual, `${ramp}-${stop}: missing -rgb companion`).toBeDefined();
        expect(
          actual,
          `Drift detected: --${ramp}-${stop} hex ${hex} (${expected.join(" ")}) does not match --${ramp}-${stop}-rgb (${actual?.join(" ")})`
        ).toEqual(expected);
      }
    });
  }
});
