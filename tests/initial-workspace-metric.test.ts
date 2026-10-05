// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { perfMeasureWorkspaceReady } from "@/lib/perf";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it.each([false, true])("separates initial readiness from a route click (click=%s)", (hasClick) => {
  const measure = vi.fn();
  vi.stubGlobal("performance", {
    getEntriesByName: vi.fn((_name: string, type?: string) => type === "mark" ? (hasClick ? [{}] : []) : [{ duration: 375 }]),
    measure,
  });
  const dispatch = vi.spyOn(window, "dispatchEvent");
  perfMeasureWorkspaceReady({ workspace: "today" });
  const name = hasClick ? "workspace-data-ready" : "initial-workspace-ready";
  expect(measure).toHaveBeenCalledWith(`personal-os:${name}`, { start: hasClick ? "personal-os:navigation-click" : 0 });
  expect(dispatch).toHaveBeenCalledTimes(1);
  const event = dispatch.mock.calls[0][0] as CustomEvent;
  expect(event.detail).toEqual({ name, durationMs: 375, workspace: "today" });
});

it("does not break rendering if browser timing APIs are unavailable", () => {
  vi.stubGlobal("performance", {});
  expect(() => perfMeasureWorkspaceReady({ workspace: "today" })).not.toThrow();
});
