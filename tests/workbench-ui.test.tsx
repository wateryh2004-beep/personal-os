// @vitest-environment jsdom
import { act, createElement, lazy, Suspense, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkbenchContextValue } from "@/components/workbench/workbench-context";
const mocks = vi.hoisted(() => {
  // jsdom omits AnimationEvent; expose standard-event support before React DOM loads.
  Object.defineProperty(window, "AnimationEvent", { configurable: true, value: Event });
  return { push: vi.fn(), mounts: 0, referenceMounts: 0, mobile: false, reduced: false, listeners: new Set<() => void>() };
});
vi.mock("next/navigation", () => ({ usePathname: () => "/notes", useSearchParams: () => new URLSearchParams(), useRouter: () => ({ push: mocks.push }) }));
vi.mock("next/dynamic", () => ({ default: (loader: () => Promise<React.ComponentType>) => lazy(async () => ({ default: await loader() })) }));
vi.mock("@/components/workbench/workbench-entity-view", () => {
  function ReferenceEditor() { useEffect(() => { mocks.referenceMounts += 1; }, []); return createElement("input", { "aria-label": "reference draft", defaultValue: "" }); }
  return { WorkbenchEntityView: ({ active, editing }: { active: boolean; editing: boolean }) => createElement("div", { "data-reader-active": String(active) }, editing ? createElement(ReferenceEditor) : "Reference reader") };
});
vi.mock("@/components/workbench/workbench-dialogs", () => ({ WorkbenchDialogs: () => null }));
import { useWorkbench } from "@/components/workbench/workbench-context";
import { WorkbenchContext } from "@/components/workbench/workbench-context";
import { WorkbenchRecord } from "@/components/workbench/workbench-record";
import { WorkbenchProvider, WorkbenchLayout, useWorkbenchHost } from "@/components/workbench/workbench-provider";
const ref = { kind: "shopping" as const, id: "00000000-0000-4000-8000-000000000001" };
let root: Root; let host: HTMLDivElement;
beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); mocks.mobile = false; mocks.reduced = false; mocks.mounts = 0; mocks.referenceMounts = 0; mocks.listeners.clear();
  vi.stubGlobal("matchMedia", (query: string) => ({ get matches() { return query.includes("reduced-motion") ? mocks.reduced : mocks.mobile; }, addEventListener: (_event: string, fn: () => void) => mocks.listeners.add(fn), removeEventListener: (_event: string, fn: () => void) => mocks.listeners.delete(fn) }));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
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

function ReferenceLifecycleHarness() {
  const workbench = useWorkbench()!;
  const internal = useWorkbenchHost();
  return <><button onClick={() => internal.setReference(current => current ? { ...current, editing: true, position: { scrollTop: 42 } } : current)}>Edit lifecycle reference</button><WorkbenchRecord entity={ref} title="Lifecycle item" group="lifecycle"><button onClick={() => workbench.openReference(ref)}>Open lifecycle reference</button></WorkbenchRecord><WorkbenchLayout><PrimaryEditor /></WorkbenchLayout></>;
}
async function clickLifecycle(label: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === label)!;
  expect(button).toBeDefined();
  await act(async () => button.click());
}
async function finishReferenceExit(pane: HTMLElement) {
  const event = new Event("animationend", { bubbles: true });
  Object.defineProperty(event, "animationName", { value: "workbench-mobile-reference-exit" });
  await act(async () => pane.dispatchEvent(event));
}
it("keeps an inert mobile exit layer, resumes the same primary immediately and consumes native exit completion", async () => {
  mocks.mobile = true;
  await act(async () => root.render(<Suspense fallback={null}><WorkbenchProvider><ReferenceLifecycleHarness /></WorkbenchProvider></Suspense>));
  const primary = host.querySelector<HTMLInputElement>("input[aria-label='primary draft']")!;
  await clickLifecycle("Open lifecycle reference");
  const pane = host.querySelector<HTMLElement>(".workbench-reference-pane")!;
  const reader = pane.querySelector("[data-reader-active]");
  expect(host.querySelector(".workbench-main-pane")?.hasAttribute("hidden")).toBe(true);
  await act(async () => pane.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
  expect(pane.hidden).toBe(false); expect(pane.getAttribute("data-state")).toBe("closed");
  expect(pane.style.position).toBe("fixed"); expect(pane.hasAttribute("inert")).toBe(true); expect(pane.getAttribute("aria-hidden")).toBe("true");
  expect(pane.querySelector("[data-reader-active='false']")).toBe(reader);
  expect(host.querySelector(".workbench-main-pane")?.hasAttribute("hidden")).toBe(false);
  expect(host.querySelector("input[aria-label='primary draft']")).toBe(primary); expect(mocks.mounts).toBe(1);
  await finishReferenceExit(pane);
  expect(pane.hidden).toBe(true); expect(pane.querySelector("[data-reader-active]")).toBeNull();
});
it("reverses the same mobile pane without late exit events, timers or focus stealing from its reopened state", async () => {
  vi.useFakeTimers(); mocks.mobile = true;
  await act(async () => root.render(<Suspense fallback={null}><WorkbenchProvider><ReferenceLifecycleHarness /></WorkbenchProvider></Suspense>));
  await clickLifecycle("Open lifecycle reference");
  await clickLifecycle("Edit lifecycle reference");
  const pane = host.querySelector<HTMLElement>(".workbench-reference-pane")!;
  const reader = pane.querySelector("[data-reader-active]");
  const draft = pane.querySelector<HTMLInputElement>("input[aria-label='reference draft']")!;
  draft.value = "unsaved reference draft";
  let reopening = false;
  vi.spyOn(pane, "getBoundingClientRect").mockImplementation(() => {
    // Closing removed the controls; re-entry adds them back above the same pane.
    const top = pane.dataset.state === "closed" || !reopening ? 120 : 180 + (Number.parseFloat(pane.style.getPropertyValue("--reference-enter-y")) || 0);
    return new DOMRect(0, top, 390, 650);
  });
  await clickLifecycle("关闭参考区");
  expect(pane.style.top).toBe("120px"); expect(pane.style.width).toBe("390px");
  reopening = true;
  await clickLifecycle("Open lifecycle reference");
  expect(pane.style.getPropertyValue("--reference-enter-y")).toBe("-60px");
  expect(pane.getBoundingClientRect().top).toBe(120);
  pane.tabIndex = -1;
  pane.focus();
  await finishReferenceExit(pane);
  await act(async () => vi.advanceTimersByTime(221));
  expect(host.querySelector(".workbench-reference-pane")).toBe(pane); expect(pane.hidden).toBe(false); expect(pane.dataset.state).toBe("open");
  expect(pane.style.position).toBe(""); expect(pane.querySelector("[data-reader-active='true']")).toBe(reader);
  expect(pane.querySelector("input[aria-label='reference draft']")).toBe(draft); expect(draft.value).toBe("unsaved reference draft"); expect(mocks.referenceMounts).toBe(1);
  expect(host.querySelector(".workbench-main-pane")?.hasAttribute("hidden")).toBe(true);
  expect(document.activeElement).toBe(pane); expect(mocks.mounts).toBe(1);
  await clickLifecycle("关闭参考区"); await finishReferenceExit(pane); expect(pane.hidden).toBe(true);
});
it("skips the mobile exit layer for reduced motion and retires an active exit if the preference changes", async () => {
  mocks.mobile = true;
  await act(async () => root.render(<Suspense fallback={null}><WorkbenchProvider><ReferenceLifecycleHarness /></WorkbenchProvider></Suspense>));
  await clickLifecycle("Open lifecycle reference"); await clickLifecycle("关闭参考区");
  const pane = host.querySelector<HTMLElement>(".workbench-reference-pane")!; expect(pane.hidden).toBe(false);
  await act(async () => { mocks.reduced = true; mocks.listeners.forEach(listener => listener()); });
  expect(pane.hidden).toBe(true);
  await clickLifecycle("Open lifecycle reference"); await clickLifecycle("关闭参考区");
  expect(pane.hidden).toBe(true); expect(pane.querySelector("[data-reader-active]")).toBeNull();
});

it("cancels an exiting pane and its deferred focus when the owner scope clears", async () => {
  vi.useFakeTimers(); mocks.mobile = true;
  await act(async () => root.render(<Suspense fallback={null}><WorkbenchProvider><ReferenceLifecycleHarness /></WorkbenchProvider></Suspense>));
  await clickLifecycle("Open lifecycle reference"); await clickLifecycle("关闭参考区");
  await act(async () => window.dispatchEvent(new Event("personal-os:workspace-auth-failed")));
  const primary = host.querySelector<HTMLInputElement>("input[aria-label='primary draft']")!;
  primary.focus();
  await act(async () => vi.advanceTimersByTime(221));
  expect(host.querySelector<HTMLElement>(".workbench-reference-pane")?.hidden).toBe(true);
  expect(document.activeElement).toBe(primary);
});
