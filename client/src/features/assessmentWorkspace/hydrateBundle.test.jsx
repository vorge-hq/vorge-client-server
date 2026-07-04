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
  assets: [],
  threats: []
};

function Probe({ assessmentId }) {
  const ws = useWorkspace();
  const [done, setDone] = useState(false);
  useEffect(() => {
    ws.hydrateAssessmentBundle(assessmentId, "Author").then(() => setDone(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const a = ws.assessmentsById[assessmentId];
  return (
    <div>
      <span>done:{String(done)}</span>
      <span>exec:{a?.executiveSummary || ""}</span>
      <span>concl:{a?.conclusion || ""}</span>
      <span>lock:{a?.lockVersion ?? ""}</span>
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
