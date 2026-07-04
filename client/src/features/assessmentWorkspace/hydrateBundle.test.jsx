// P3 · (g) reads — WorkspaceContext.hydrateAssessmentBundle: in PROD it fetches
// GET /:id and maps the assessment fields + section texts (1/8) into
// assessmentsById; in DEMO it is a no-op (no fetch). A tiny probe drives the
// context method and renders the result.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import { WorkspaceProvider, useWorkspace } from "./WorkspaceContext";

const BUNDLE = {
  assessment: { id: "srv-1", name: "Live — 2028 SRA", facilityId: "f1", facilityName: "F1", state: "Draft", lockVersion: 7, leadAuthorUserId: "u", contributors: [] },
  sectionTexts: { "1": "Exec text from server", "8": "Conclusion from server" },
  assets: [
    {
      id: "as-1",
      name: "Server Asset",
      assetType: "Process Unit",
      criticality: "Very High",
      details: { description: "desc from server", dependencies: "dep", consequences: "cons" }
    }
  ],
  threats: [
    { id: "th-1", name: "Server Threat", likelihood: 3, details: { short: "Srv", classification: "Criminality", rating: "High" } }
  ],
  links: [
    { assetId: "as-1", threatId: "th-1", enabled: true },
    { assetId: "as-1", threatId: "th-2", enabled: false }
  ],
  evaluations: [
    {
      id: "ev-1",
      assetId: "as-1",
      threatId: "th-1",
      scenario: "Server scenario",
      controls: "Server controls",
      vulnerabilities: "Server vulns",
      proposedMitigation: "Server mit",
      r1: { consequence: 5, likelihood: 4 },
      r2: { consequence: 2, likelihood: 1 }
    }
  ]
};

function Probe({ assessmentId }) {
  const ws = useWorkspace();
  const [done, setDone] = useState(false);
  useEffect(() => {
    ws.hydrateAssessmentBundle(assessmentId, "Author").then(() => setDone(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const a = ws.assessmentsById[assessmentId];
  const asset = ws.assets[0];
  const threat = ws.threats[0];
  const evaluation = ws.evaluations[0];
  return (
    <div>
      <span>done:{String(done)}</span>
      <span>exec:{a?.executiveSummary || ""}</span>
      <span>concl:{a?.conclusion || ""}</span>
      <span>lock:{a?.lockVersion ?? ""}</span>
      <span>assets:{ws.assets.length}</span>
      <span>asset:{asset ? `${asset.name}|${asset.type}|${asset.description}|${asset.criticality}` : ""}</span>
      <span>threat:{threat ? `${threat.name}|${threat.short}|${threat.rating}` : ""}</span>
      <span>eval:{evaluation ? `${evaluation.existingControls}|${evaluation.consequenceR1}|${evaluation.likelihoodR2}` : ""}</span>
      <span>matrixOn:{String(Boolean(ws.matrix["as-1|th-1"]))}</span>
      <span>matrixOff:{String(Boolean(ws.matrix["as-1|th-2"]))}</span>
      <span>links:{ws.links.length}</span>
    </div>
  );
}

function mockFetch(response) {
  const fn = vi.fn(async () => response);
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("prod mode", () => {
  beforeEach(() => vi.stubEnv("VITE_ENABLE_DEMO", "false"));

  test("hydrates assessment fields + section texts from GET /:id", async () => {
    const fetchFn = mockFetch({ ok: true, status: 200, json: async () => BUNDLE });
    render(
      <WorkspaceProvider>
        <Probe assessmentId="srv-1" />
      </WorkspaceProvider>
    );
    expect(await screen.findByText("done:true")).toBeTruthy();
    expect(screen.getByText("exec:Exec text from server")).toBeTruthy();
    expect(screen.getByText("concl:Conclusion from server")).toBeTruthy();
    expect(screen.getByText("lock:7")).toBeTruthy();
    const [url] = fetchFn.mock.calls[0];
    expect(url).toContain("/api/assessments/srv-1");
  });

  test("hydrates child entities (assets/threats/evaluations/links) from the bundle", async () => {
    mockFetch({ ok: true, status: 200, json: async () => BUNDLE });
    render(
      <WorkspaceProvider>
        <Probe assessmentId="srv-1" />
      </WorkspaceProvider>
    );
    expect(await screen.findByText("done:true")).toBeTruthy();
    // Assets: replaces fixtures with the one server row; details unpacked.
    expect(screen.getByText("assets:1")).toBeTruthy();
    expect(screen.getByText("asset:Server Asset|Process Unit|desc from server|Very High")).toBeTruthy();
    // Threats: name is the column, the rest come out of details.
    expect(screen.getByText("threat:Server Threat|Srv|High")).toBeTruthy();
    // Evaluations: controls→existingControls, r1/r2 unpacked.
    expect(screen.getByText("eval:Server controls|5|1")).toBeTruthy();
    // Links: enabled pair ticks the matrix; disabled pair is omitted from both.
    expect(screen.getByText("matrixOn:true")).toBeTruthy();
    expect(screen.getByText("matrixOff:false")).toBeTruthy();
    expect(screen.getByText("links:1")).toBeTruthy();
  });
});

describe("demo mode", () => {
  beforeEach(() => vi.stubEnv("VITE_ENABLE_DEMO", "true"));

  test("is a no-op and fires no request", async () => {
    const fetchFn = mockFetch({ ok: true, status: 200, json: async () => BUNDLE });
    render(
      <WorkspaceProvider>
        <Probe assessmentId="srv-1" />
      </WorkspaceProvider>
    );
    expect(await screen.findByText("done:true")).toBeTruthy();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
