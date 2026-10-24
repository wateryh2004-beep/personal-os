// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { NavigationRail } from "@/components/layout/navigation-rail";

it("moves one visual indicator to the latest actual link and removes stale geometry", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const disconnect = vi.fn();
  const observe = vi.fn();
  vi.stubGlobal("ResizeObserver", class { observe = observe; disconnect = disconnect; });
  const rectangles = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return { top: Number(this.dataset.top ?? 100), height: 44 } as DOMRect;
  });
  const height = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(44);
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const render = (selected: string) => root.render(<NavigationRail selection={selected}>
    {["notes", "career"].map((name, index) => <a key={name} href={`/${name}`} data-top={100 + index * 60} data-nav-selected={selected === name} aria-current={name === "notes" ? "page" : undefined}>{name}</a>)}
  </NavigationRail>);
  try {
    await act(async () => render("notes"));
    const indicator = host.querySelector<HTMLElement>(".navigation-indicator")!;
    expect(indicator.style.transform).toBe("translateY(0px)");
    expect(indicator.style.height).toBe("44px");
    await act(async () => { render("career"); });
    expect(indicator.style.transform).toBe("translateY(60px)");
    expect(host.querySelectorAll(".navigation-indicator")).toHaveLength(1);
    // A pending visual destination must not forge a committed aria-current.
    expect(host.querySelector('[aria-current="page"]')?.getAttribute("href")).toBe("/notes");
    await act(async () => render("none"));
    expect(host.querySelector("nav")?.hasAttribute("data-indicator-ready")).toBe(false);
  } finally {
    await act(async () => root.unmount());
    expect(disconnect).toHaveBeenCalled();
    host.remove(); rectangles.mockRestore(); height.mockRestore(); vi.unstubAllGlobals();
  }
});
