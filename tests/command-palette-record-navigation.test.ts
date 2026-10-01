// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ pathname: "/tasks", push: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname, useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/features/notes/actions", () => ({ createNote: vi.fn() }));
vi.mock("@/features/search/use-global-search", () => ({ useGlobalSearch: () => ({ results: [], status: "idle" }) }));
vi.mock("@/components/ui/command", () => {
  const childrenOnly = ({ children }: { children?: ReactNode }) => createElement("div", null, children);
  return {
    Command: childrenOnly, CommandDialog: childrenOnly, CommandEmpty: childrenOnly,
    CommandGroup: childrenOnly, CommandList: childrenOnly, CommandSeparator: () => null, CommandShortcut: childrenOnly,
    CommandInput: () => null,
    CommandItem: ({ onSelect, children }: { onSelect: () => void; children: ReactNode }) => createElement("button", { onClick: onSelect }, children),
  };
});

import { GlobalCommandPalette } from "@/components/search/global-command-palette-impl";
import { RECENT_NAVIGATION_STORAGE_KEY } from "@/lib/navigation-registry";

describe("command palette record navigation", () => {
  it.each(["tasks", "calendar"])("announces same-path %s navigation before router.push", async (workspace) => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    mocks.pathname = `/${workspace}`;
    const href = workspace === "tasks" ? "/tasks?task=b" : "/calendar?event=b";
    window.localStorage.setItem(RECENT_NAVIGATION_STORAGE_KEY, JSON.stringify([{ href, label: "Target B" }]));
    const events: string[] = [];
    const onStart = (event: Event) => events.push((event as CustomEvent<{ href: string }>).detail.href);
    window.addEventListener("personal-os:navigation-start", onStart);
    const historyState = { __NA: true, tree: ["test-tree"], retained: "kept" };
    mocks.push.mockImplementation((value: string) => {
      expect(events).toEqual([value]);
      expect(window.history.state).toEqual(historyState);
    });
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => { root.render(createElement(GlobalCommandPalette, { open: true, onOpenChange: vi.fn() })); });
      await act(async () => { await vi.runOnlyPendingTimersAsync(); });
      const target = [...container.querySelectorAll("button")].find((button) => button.textContent?.includes("Target B"));
      expect(target).toBeDefined();
      window.history.replaceState({ ...historyState, __personalOsMobileLayer: "dialog:test-marker" }, "", mocks.pathname);
      await act(async () => { target!.click(); });
      expect(events).toEqual([href]);
      expect(mocks.push).toHaveBeenLastCalledWith(href);
    } finally {
      await act(async () => { root.unmount(); }); container.remove();
      window.removeEventListener("personal-os:navigation-start", onStart);
      window.localStorage.removeItem(RECENT_NAVIGATION_STORAGE_KEY);
      vi.useRealTimers(); vi.clearAllMocks();
    }
  });
});
