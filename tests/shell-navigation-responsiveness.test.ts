// @vitest-environment jsdom
import { act, Component, createElement, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useShellNavigation } from "@/components/layout/use-shell-navigation";

vi.mock("@/lib/perf", () => ({ perfMark: vi.fn(), perfMeasure: vi.fn() }));

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const pending = new Map<string, ReturnType<typeof deferred>>();
let route: (pathname: string) => void;
let navigate: (href: string) => void;
const router = { push: vi.fn((href: string) => pending.get(href)?.promise) };

function Harness() {
  const [pathname, setPathname] = useState("/today");
  const navigation = useShellNavigation(pathname, router);
  useEffect(() => {
    route = setPathname;
    navigate = navigation.navigate;
  }, [navigation.navigate]);
  return createElement("output", { "data-pending": navigation.pendingHref ?? "" }, pathname);
}

class NavigationBoundary extends Component<{ children?: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? createElement("p", { "data-navigation-error": true }, "Unable to open") : this.props.children; }
}

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  window.history.replaceState({}, "", "/today");
  pending.clear();
  router.push.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(NavigationBoundary, null, createElement(Harness))));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
const visiblePending = () => host.querySelector("output")?.getAttribute("data-pending");

describe("shell navigation uses the real transition lifecycle", () => {
  it("acknowledges immediately and clears when a redirect commits", async () => {
    const request = deferred();
    pending.set("/career", request);
    await act(async () => navigate("/career"));
    expect(visiblePending()).toBe("/career");
    await act(async () => { route("/career/resumes"); request.resolve(); });
    expect(visiblePending()).toBe("");
  });

  it("keeps only the newest destination during overlapping navigation", async () => {
    const first = deferred();
    const second = deferred();
    pending.set("/tasks", first);
    pending.set("/notes", second);
    await act(async () => navigate("/tasks"));
    await act(async () => navigate("/notes"));
    expect(visiblePending()).toBe("/notes");
    await act(async () => { route("/tasks"); first.resolve(); });
    expect(visiblePending()).toBe("/notes");
    await act(async () => { route("/notes"); second.resolve(); });
    expect(visiblePending()).toBe("");
  });

  it("clears as soon as B commits when the older A settles afterward", async () => {
    const first = deferred();
    const second = deferred();
    pending.set("/tasks", first);
    pending.set("/notes", second);
    await act(async () => navigate("/tasks"));
    await act(async () => navigate("/notes"));
    await act(async () => { route("/notes"); second.resolve(); });
    expect(visiblePending()).toBe("");
    await act(async () => first.resolve());
    expect(visiblePending()).toBe("");
    expect(host.querySelector("output")?.textContent).toBe("/notes");
  });

  it("clears cancelled navigation even when the pathname never changes", async () => {
    const request = deferred();
    pending.set("/tasks", request);
    await act(async () => navigate("/tasks"));
    await act(async () => request.resolve());
    expect(visiblePending()).toBe("");
  });

  it("does not leave an indicator behind after browser Back/Forward", async () => {
    const request = deferred();
    pending.set("/tasks", request);
    await act(async () => navigate("/tasks"));
    await act(async () => window.dispatchEvent(new PopStateEvent("popstate")));
    expect(visiblePending()).toBe("");
    await act(async () => request.resolve());
    expect(visiblePending()).toBe("");
  });

  it("hands failures to the error boundary without retaining a busy indicator", async () => {
    const request = deferred();
    pending.set("/tasks", request);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await act(async () => navigate("/tasks"));
      expect(visiblePending()).toBe("/tasks");
      await act(async () => request.reject(new Error("Navigation failed")));
      expect(host.querySelector("[data-navigation-error]")).not.toBeNull();
      expect(host.querySelector("[data-pending]")).toBeNull();
    } finally { consoleError.mockRestore(); }
  });

  it("keeps same-path query changes pending until the transition completes", async () => {
    const request = deferred();
    pending.set("/today?filter=work", request);
    await act(async () => navigate("/today?filter=work"));
    expect(visiblePending()).toBe("/today?filter=work");
    expect(host.querySelector("output")?.textContent).toBe("/today");
    await act(async () => request.resolve());
    expect(visiblePending()).toBe("");
  });

  it("allows choosing the current route to supersede a pending route", async () => {
    const first = deferred();
    pending.set("/tasks", first);
    await act(async () => navigate("/tasks"));
    await act(async () => navigate("/today"));
    expect(router.push).toHaveBeenLastCalledWith("/today");
    expect(visiblePending()).toBe("");
    await act(async () => first.resolve());
    expect(visiblePending()).toBe("");
  });
});
