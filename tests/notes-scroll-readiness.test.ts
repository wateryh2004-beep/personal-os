// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceScrollRestoration } from "@/components/shared/use-workspace-scroll-restoration";
import { loadWorkspaceSession, saveWorkspaceSession } from "@/lib/workspace-session";

vi.mock("next/navigation", () => ({ usePathname: () => "/notes", useSearchParams: () => new URLSearchParams("folder=older") }));
const key = "scroll:notes:list:/notes?folder=older";
function List({ ready }: { ready: boolean }) {
  const ref = useWorkspaceScrollRestoration("notes:list", ready);
  return createElement("main", { ref, "data-ready": ready }, ready ? "Loaded notes" : "Loading");
}
afterEach(() => { vi.useRealTimers(); sessionStorage.clear(); });

describe("Notes restores scrolling after the range is available", () => {
  it("never clamps or overwrites a saved position on a pending list, and saves real scroll changes", async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.useFakeTimers();
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    saveWorkspaceSession(key, { scrollTop: 800 });
    await act(async () => root.render(createElement(List, { ready: false })));
    const node = host.querySelector("main")!;
    let position = 0;
    const setScroll = vi.fn((next: number) => { position = node.dataset.ready === "true" ? next : 0; });
    Object.defineProperty(node, "scrollTop", { configurable: true, get: () => position, set: setScroll });
    await act(async () => vi.runAllTimers());
    expect(setScroll).not.toHaveBeenCalled();
    expect(loadWorkspaceSession(key)).toEqual({ scrollTop: 800 });
    await act(async () => root.render(createElement(List, { ready: true })));
    await act(async () => vi.runAllTimers());
    expect(position).toBe(800);
    node.scrollTop = 900;
    node.dispatchEvent(new Event("scroll"));
    expect(loadWorkspaceSession(key)).toEqual({ scrollTop: 900 });
    await act(async () => root.render(createElement(List, { ready: false })));
    node.scrollTop = 0;
    node.dispatchEvent(new Event("scroll"));
    expect(loadWorkspaceSession(key)).toEqual({ scrollTop: 900 });
    await act(async () => root.unmount()); host.remove();
  });
});
