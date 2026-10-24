// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { GlobalCommandPalette } from "@/components/search/global-command-palette-impl";

vi.mock("next/navigation", () => ({ usePathname: () => "/notes", useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/features/notes/actions", () => ({ createNote: vi.fn() }));
vi.mock("@/features/search/use-global-search", () => ({ useGlobalSearch: () => ({ results: [], status: "success" }) }));

it("announces empty search results while the real command list still offers an AI action", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  const scroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
  HTMLElement.prototype.scrollIntoView = vi.fn();
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<GlobalCommandPalette open embedded onOpenChange={() => {}} />));
    const input = host.querySelector("input")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "没有匹配");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.querySelector('[role="status"]')?.textContent).toContain("没有找到相关内容");
    expect(host.querySelector('[role="option"]')?.textContent).toContain("询问 Personal OS");
    expect(host.querySelector('[role="status"]')?.closest('[hidden]')).toBeNull();
  } finally {
    await act(async () => root.unmount()); host.remove();
    if (scroll) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scroll);
    else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
    vi.unstubAllGlobals();
  }
});
