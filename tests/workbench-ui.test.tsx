// @vitest-environment jsdom
import { act, createElement, lazy, Suspense, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkbenchContextValue } from "@/components/workbench/workbench-context";
const mocks = vi.hoisted(() => ({ push: vi.fn(), mounts: 0, mobile: false, listeners: new Set<() => void>() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/notes", useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: mocks.push }) }));
vi.mock("next/dynamic", () => ({ default: (loader: () => Promise<React.ComponentType>) => lazy(async () => ({ default: await loader() })) }));
vi.mock("@/components/workbench/workbench-entity-view", () => ({ WorkbenchEntityView: ({ active }: { active: boolean }) => createElement("div", { "data-reader-active": String(active) }, "Reference reader") }));
vi.mock("@/components/workbench/workbench-dialogs", () => ({ WorkbenchDialogs: () => null }));
import { WorkbenchContext } from "@/components/workbench/workbench-context";
import { WorkbenchRecord } from "@/components/workbench/workbench-record";
import { WorkbenchProvider, WorkbenchLayout, useWorkbenchHost } from "@/components/workbench/workbench-provider";
const ref = { kind: "shopping" as const, id: "00000000-0000-4000-8000-000000000001" };
let root: Root; let host: HTMLDivElement;
beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); mocks.mobile = false; mocks.mounts = 0; mocks.listeners.clear();
  vi.stubGlobal("matchMedia", () => ({ get matches() { return mocks.mobile; }, addEventListener: (_event: string, fn: () => void) => mocks.listeners.add(fn), removeEventListener: (_event: string, fn: () => void) => mocks.listeners.delete(fn) }));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const pressSpace = (node: Element, options: KeyboardEventInit = {}) => node.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true, ...options }));
describe("workbench native record interaction", () => {
  it("leaves standalone domain content intact without fake workbench controls", async () => {
    await act(async () => root.render(<WorkbenchRecord entity={ref} title="Item" group="list"><a href="https://example.com/synthetic">Open</a></WorkbenchRecord>));
    expect(host.querySelector("a")?.getAttribute("href")).toBe("https://example.com/synthetic"); expect(host.querySelector("button")).toBeNull();
  });
  it("opens Space only on the record itself, preserving native inputs, links, buttons and IME", async () => {
    const preview = vi.fn(); const register = vi.fn(() => () => {});
    const value: WorkbenchContextValue = { register, openPreview: preview, openReference: vi.fn(), compare: vi.fn(), toggleSelection: vi.fn(), isSelected: () => false, selected: [], clearSelection: vi.fn() };
    await act(async () => root.render(<WorkbenchContext.Provider value={value}><WorkbenchRecord entity={ref} title="Item" group="filtered-order"><div><a href="https://example.com/synthetic">Open</a><input aria-label="editable" /><button aria-label="预览 Item">原件预览</button></div></WorkbenchRecord></WorkbenchContext.Provider>));
    const record = host.querySelector("[data-workbench-record]")!;
    expect(host.querySelectorAll('button[aria-label="预览 Item"]')).toHaveLength(1);
    const quicklook = host.querySelector<HTMLButtonElement>('button[aria-label="速览 Item"]')!;
    expect(quicklook.textContent).toBe("速览");
    await act(async () => quicklook.click());
    expect(preview).toHaveBeenCalledWith(ref, "filtered-order", quicklook);
    preview.mockClear();
    await act(async () => { pressSpace(record); }); expect(preview).toHaveBeenCalledWith(ref, "filtered-order", record);
    preview.mockClear();
    for (const node of [host.querySelector("a")!, host.querySelector("input[aria-label=editable]")!, host.querySelector("button")!]) await act(async () => { pressSpace(node); });
    await act(async () => { pressSpace(record, { isComposing: true }); pressSpace(record, { repeat: true }); }); expect(preview).not.toHaveBeenCalled();
    expect(register).toHaveBeenCalledTimes(1);
    await act(async () => root.render(<WorkbenchContext.Provider value={value}><WorkbenchRecord entity={{ ...ref }} title="Item" group="filtered-order"><a href="https://example.com/synthetic">Changed child</a></WorkbenchRecord></WorkbenchContext.Provider>));
    expect(register).toHaveBeenCalledTimes(1);
  });
});
function PrimaryEditor() { const [draft, setDraft] = useState(""); useEffect(() => { mocks.mounts += 1; }, []); return <input aria-label="primary draft" value={draft} onChange={(event) => setDraft(event.target.value)} />; }
function LayoutHarness() {
  const workbench = useWorkbenchHost();
  return <><button onClick={() => workbench.setReference({ ref })}>Open reference</button><WorkbenchLayout><PrimaryEditor /></WorkbenchLayout></>;
}
it("swaps only visual order and keeps the primary mounted across mobile pane switches", async () => {
  await act(async () => root.render(<Suspense fallback={null}><WorkbenchProvider><LayoutHarness /></WorkbenchProvider></Suspense>));
  const primary = host.querySelector<HTMLInputElement>("input[aria-label='primary draft']")!;
  await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent === "Open reference")!.click());
  expect(mocks.mounts).toBe(1); expect(host.querySelector('[data-reader-active="true"]')).not.toBeNull();
  await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent?.includes("交换位置"))!.click());
  expect(host.querySelector(".workbench-layout")?.getAttribute("data-reference-first")).toBe("true"); expect(host.querySelector("input[aria-label='primary draft']")).toBe(primary);
  await act(async () => { mocks.mobile = true; mocks.listeners.forEach((listener) => listener()); });
  await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent === "参考区")!.click());
  expect(host.querySelector(".workbench-main-pane")?.hasAttribute("hidden")).toBe(true); expect(host.querySelector(".workbench-main-pane")?.hasAttribute("inert")).toBe(true);
  await act(async () => [...host.querySelectorAll("button")].find((button) => button.textContent === "主区")!.click());
  expect(host.querySelector('[data-reader-active="false"]')).not.toBeNull(); expect(host.querySelector("input[aria-label='primary draft']")).toBe(primary); expect(mocks.mounts).toBe(1);
});
