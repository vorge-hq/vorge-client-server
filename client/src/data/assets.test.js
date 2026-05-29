import { describe, expect, test } from "vitest";
import { detectAssetAnomaly } from "./assets";

describe("detectAssetAnomaly", () => {
  test("flags Low criticality with severe-consequence language", () => {
    const msg = detectAssetAnomaly({
      criticality: "Low",
      consequences: "Potential fatality and major fire"
    });
    expect(msg).toBeTruthy();
    expect(msg).toMatch(/Low/);
    expect(msg).toMatch(/fatal/i);
  });

  test("flags Medium criticality with severe-consequence language", () => {
    const msg = detectAssetAnomaly({
      criticality: "Medium",
      consequences: "Total facility shutdown, safety system loss"
    });
    expect(msg).toBeTruthy();
    expect(msg).toMatch(/Medium/);
  });

  test("does NOT flag High criticality even with severe language", () => {
    expect(
      detectAssetAnomaly({ criticality: "High", consequences: "catastrophic environmental release" })
    ).toBeNull();
  });

  test("does NOT flag Very High criticality", () => {
    expect(
      detectAssetAnomaly({ criticality: "Very High", consequences: "massive fatality event" })
    ).toBeNull();
  });

  test("does NOT flag Low criticality with benign consequences", () => {
    expect(
      detectAssetAnomaly({ criticality: "Low", consequences: "Minor disruption, document loss" })
    ).toBeNull();
  });

  test("returns null when fields are missing", () => {
    expect(detectAssetAnomaly(null)).toBeNull();
    expect(detectAssetAnomaly({ criticality: "Low" })).toBeNull();
    expect(detectAssetAnomaly({ consequences: "fatality" })).toBeNull();
  });

  test("message names up to two matched keywords", () => {
    const msg = detectAssetAnomaly({
      criticality: "Low",
      consequences: "death, kill, catastrophic, massive"
    });
    // slice(0, 2) → first two matched keywords only
    expect(msg).toMatch(/"death", "kill"/);
  });
});
