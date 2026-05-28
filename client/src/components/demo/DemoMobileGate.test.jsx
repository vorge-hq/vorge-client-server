import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DemoMobileGate } from "./DemoMobileGate";
import {
  DISMISSED_STORAGE_KEY,
  MOBILE_BREAKPOINT,
  computeInitialDismissed
} from "./computeInitialDismissed";

const APP_TEXT = "App content";

function renderGate() {
  return render(
    <DemoMobileGate>
      <div>{APP_TEXT}</div>
    </DemoMobileGate>
  );
}

function setViewport(width) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width
  });
}

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe("DemoMobileGate render gating", () => {
  test("demo enabled + viewport 600 + storage empty → gate renders, children hidden", () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "true");
    setViewport(600);
    renderGate();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.queryByText(APP_TEXT)).toBeNull();
  });

  test("demo disabled + viewport 600 → children render, gate hidden", () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "false");
    setViewport(600);
    renderGate();
    expect(screen.getByText(APP_TEXT)).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  test("demo unset (env empty string) + viewport 600 → children render", () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "");
    setViewport(600);
    renderGate();
    expect(screen.getByText(APP_TEXT)).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  test("demo enabled + viewport at breakpoint (1024) → children render (strict <)", () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "true");
    setViewport(MOBILE_BREAKPOINT);
    renderGate();
    expect(screen.getByText(APP_TEXT)).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  test("demo enabled + viewport one below breakpoint (1023) → gate renders", () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "true");
    setViewport(MOBILE_BREAKPOINT - 1);
    renderGate();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });

  test("demo + viewport 600 + sessionStorage pre-set → children render", () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "true");
    setViewport(600);
    window.sessionStorage.setItem(DISMISSED_STORAGE_KEY, "1");
    renderGate();
    expect(screen.getByText(APP_TEXT)).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("DemoMobileGate dismissal", () => {
  test("Continue click → key written, gate unmounts, children render", async () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "true");
    setViewport(600);
    const user = userEvent.setup();
    renderGate();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /continue anyway/i }));
    expect(window.sessionStorage.getItem(DISMISSED_STORAGE_KEY)).toBe("1");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByText(APP_TEXT)).toBeTruthy();
  });

  test("Esc key → same effect as Continue", () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "true");
    setViewport(600);
    renderGate();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(window.sessionStorage.getItem(DISMISSED_STORAGE_KEY)).toBe("1");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByText(APP_TEXT)).toBeTruthy();
  });

  test("resize event after mount → gate state unchanged (no resize listener attached)", () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "true");
    setViewport(600);
    renderGate();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    setViewport(1400);
    fireEvent(window, new Event("resize"));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.queryByText(APP_TEXT)).toBeNull();
  });
});

describe("DemoMobileGate a11y", () => {
  test("dialog has alertdialog role, aria-modal, aria-labelledby referencing heading", () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "true");
    setViewport(600);
    renderGate();
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const labelId = dialog.getAttribute("aria-labelledby");
    expect(labelId).toBeTruthy();
    const heading = document.getElementById(labelId);
    expect(heading?.textContent).toMatch(/tablet and desktop/i);
  });

  test("Continue button has focus on mount", () => {
    vi.stubEnv("VITE_ENABLE_DEMO", "true");
    setViewport(600);
    renderGate();
    expect(screen.getByRole("button", { name: /continue anyway/i })).toBe(
      document.activeElement
    );
  });
});

describe("computeInitialDismissed (pure helper)", () => {
  test("SSR / no window (viewportWidth=undefined) → dismissed=true", () => {
    expect(
      computeInitialDismissed({
        demoEnabled: true,
        storage: null,
        viewportWidth: undefined
      })
    ).toBe(true);
  });

  test("demo off → dismissed=true regardless of width", () => {
    expect(
      computeInitialDismissed({
        demoEnabled: false,
        storage: null,
        viewportWidth: 320
      })
    ).toBe(true);
  });

  test("demo on + small viewport + empty storage → dismissed=false (gate shows)", () => {
    const storage = { getItem: () => null };
    expect(
      computeInitialDismissed({
        demoEnabled: true,
        storage,
        viewportWidth: 600
      })
    ).toBe(false);
  });

  test("storage getItem throws → treated as empty, gate still shows when conditions met", () => {
    const storage = {
      getItem: () => {
        throw new Error("blocked");
      }
    };
    expect(
      computeInitialDismissed({
        demoEnabled: true,
        storage,
        viewportWidth: 600
      })
    ).toBe(false);
  });

  test("boundary: width === MOBILE_BREAKPOINT → dismissed=true", () => {
    const storage = { getItem: () => null };
    expect(
      computeInitialDismissed({
        demoEnabled: true,
        storage,
        viewportWidth: MOBILE_BREAKPOINT
      })
    ).toBe(true);
  });
});
