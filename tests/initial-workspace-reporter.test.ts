// @vitest-environment jsdom
import { act, createElement, Fragment, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ClientPerformanceReporter } from "@/components/performance/client-performance-reporter";
import { perfMeasureWorkspaceReady } from "@/lib/perf";

vi.mock("next/navigation", () => ({ usePathname: () => "/today" }));
vi.mock("next/web-vitals", () => ({ useReportWebVitals: () => {} }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("captures initial data readiness even when the reporting sibling mounts after the content", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const sendBeacon = vi.fn(() => true);
  vi.stubGlobal("navigator", { sendBeacon });
  vi.stubGlobal("performance", {
    getEntriesByName: (_name: string, type?: string) => type === "mark" ? [] : [{ duration: 375 }],
    measure: vi.fn(),
  });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  function DataReady() {
    useEffect(() => { perfMeasureWorkspaceReady({ workspace: "today" }); }, []);
    return createElement("output", null, "ready");
  }
  try {
    await act(async () => root.render(createElement(Fragment, null,
      createElement(DataReady), createElement(ClientPerformanceReporter))));
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon).toHaveBeenCalledWith("/api/perf", expect.any(Blob));
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
