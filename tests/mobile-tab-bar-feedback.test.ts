// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MobileTabBar } from "@/components/layout/mobile-tab-bar";

const route = vi.hoisted(() => ({ pathname: "/today" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("next/link", () => ({
  default: ({ children, onNavigate: _onNavigate, prefetch: _prefetch, ...props }: { children: ReactNode; onNavigate?: unknown; prefetch?: boolean }) => {
    void _onNavigate; void _prefetch;
    return createElement("a", props, children);
  },
}));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const openMore = vi.fn();
const render = (pendingHref: string | null, presentationPathname?: string) => root.render(createElement(MobileTabBar, { onOpenMore: openMore, pendingHref, presentationPathname }));
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  route.pathname = "/today";
  openMore.mockClear();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

describe("mobile navigation feedback", () => {
  it("marks only the newest destination busy without moving the current-page semantics", async () => {
    await act(async () => render("/notes"));
    expect(host.querySelector('[aria-busy="true"]')?.getAttribute("href")).toBe("/notes");
    expect(host.querySelector('[aria-current="page"]')?.getAttribute("href")).toBe("/today");
    await act(async () => render("/career"));
    expect(host.querySelectorAll('[aria-busy="true"]')).toHaveLength(1);
    expect(host.querySelector('[data-pending="true"]')?.getAttribute("href")).toBe("/career");
    route.pathname = "/career";
    await act(async () => render(null));
    expect(host.querySelector('[aria-busy="true"]')).toBeNull();
    expect(host.querySelector('[aria-current="page"]')?.getAttribute("href")).toBe("/career");
  });

  it("keeps More responsive while loading a non-tab destination", async () => {
    await act(async () => render("/calendar"));
    const more = host.querySelector("button")!;
    expect(more.getAttribute("aria-busy")).toBe("true");
    await act(async () => more.click());
    expect(openMore).toHaveBeenCalledTimes(1);
  });

  it("uses the fixture presentation route for active-tab semantics", async () => {
    route.pathname = "/mobile-native-e2e";
    await act(async () => render(null, "/career"));
    expect(host.querySelector('[aria-current="page"]')?.getAttribute("href")).toBe("/career");
  });
});
