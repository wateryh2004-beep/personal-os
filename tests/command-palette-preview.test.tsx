// @vitest-environment jsdom
import { act, lazy, Suspense, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { GlobalSearchResult } from "@/features/search/types";
const mocks = vi.hoisted(() => ({ push: vi.fn(), previews: [] as string[] }));
vi.mock("next/navigation", () => ({ usePathname: () => "/notes", useRouter: () => ({ push: mocks.push }) }));
vi.mock("next/dynamic", () => ({ default: (loader: () => Promise<ComponentType>) => lazy(async () => ({ default: await loader() })) }));
vi.mock("@/features/notes/actions", () => ({ createNote: vi.fn() }));
vi.mock("@/features/workbench/operation-command-actions", () => ({ previewWorkbenchCommand: vi.fn() }));
const results: GlobalSearchResult[] = [1, 2].map((index) => ({ id: `note:${index}`, entityType: "note", entityId: `10000000-0000-4000-8000-00000000000${index}`, title: `合成笔记 ${index}`, domain: "notes", subtitle: null, snippet: "合成摘录", href: `/notes/10000000-0000-4000-8000-00000000000${index}`, score: 1, sourceUpdatedAt: null, metadata: {} }));
vi.mock("@/features/search/use-global-search", () => ({ useGlobalSearch: ({ query }: { query: string }) => ({ results: query ? results : [], status: query ? "success" : "idle" }) }));
vi.mock("@/components/workbench/workbench-entity-view", () => ({ WorkbenchEntityView: ({ entityRef, onNavigate }: { entityRef: { id: string }; onNavigate: (event: { preventDefault(): void }) => void }) => { mocks.previews.push(entityRef.id); return <div data-preview-id={entityRef.id}><a href={`/notes/${entityRef.id}`} onClick={(event) => { event.preventDefault(); onNavigate(event); }}>在主区打开</a></div>; } }));
import { GlobalCommandPalette } from "@/components/search/global-command-palette-impl";
import { searchResultReference } from "@/components/search/search-result-preview";
let host: HTMLDivElement; let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  mocks.previews.length = 0;
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
const render = (open = true, onOpenChange = vi.fn()) => root.render(<Suspense fallback={null}><GlobalCommandPalette open={open} onOpenChange={onOpenChange} embedded /></Suspense>);
async function inputQuery(value: string) {
  const input = host.querySelector<HTMLInputElement>('[data-slot="command-input"]')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
  return input;
}
async function select(index: number) {
  const picker = host.querySelector<HTMLSelectElement>('select[aria-label="预览内容"]')!;
  await act(async () => { picker.value = `result:${results[index].id}`; picker.dispatchEvent(new Event("change", { bubbles: true })); });
}
it("provides explicit touch preview without navigation or eager reader mounting, preserves input and supports Escape focus", async () => {
  const onOpenChange = vi.fn();
  await act(async () => render(true, onOpenChange));
  const input = await inputQuery("合成");
  expect(mocks.previews).toEqual([]);
  await select(0);
  const button = host.querySelector<HTMLButtonElement>('.command-results-footer button')!;
  await act(async () => button.click());
  expect(host.querySelector('[data-preview-id]')?.getAttribute("data-preview-id")).toBe(results[0].entityId);
  expect(mocks.push).not.toHaveBeenCalled();
  expect(input.value).toBe("合成");
  await select(1);
  expect(host.querySelectorAll('[data-preview-id]')).toHaveLength(1);
  expect(host.querySelector('[data-preview-id]')?.getAttribute("data-preview-id")).toBe(results[1].entityId);
  await act(async () => host.querySelector('aside')!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
  expect(host.querySelector('aside')).toBeNull();
  expect(document.activeElement).toBe(button);
  expect(onOpenChange).not.toHaveBeenCalled();
  await act(async () => button.click());
  window.history.replaceState({ __NA: true, retained: "next-tree", __personalOsMobileLayer: "dialog:synthetic-preview" }, "", "/notes");
  onOpenChange.mockImplementation(() => { expect(window.history.state).toEqual({ __NA: true, retained: "next-tree" }); });
  await act(async () => host.querySelector<HTMLAnchorElement>('aside a')!.click());
  expect(mocks.push).toHaveBeenLastCalledWith(results[1].href);
  expect(onOpenChange).toHaveBeenCalledWith(false);
  await act(async () => render(false, onOpenChange));
  expect(host.querySelector('aside')).toBeNull();
});
it("clears the preview on changed query and owner failure without retaining private reader DOM", async () => {
  const onOpenChange = vi.fn();
  await act(async () => render(true, onOpenChange));
  await inputQuery("合成"); await select(0);
  await act(async () => host.querySelector<HTMLButtonElement>('.command-results-footer button')!.click());
  expect(host.querySelector('aside')).not.toBeNull();
  await inputQuery("合成笔记");
  expect(host.querySelector('aside')).toBeNull();
  await select(1); await act(async () => host.querySelector<HTMLButtonElement>('.command-results-footer button')!.click());
  await act(async () => window.dispatchEvent(new Event("personal-os:workspace-auth-failed")));
  expect(host.querySelector('aside')).toBeNull();
  expect(host.querySelector<HTMLInputElement>('[data-slot="command-input"]')?.value).toBe("");
  expect(onOpenChange).toHaveBeenLastCalledWith(false);
});
it("projects only valid finite references into the authorized reader", () => {
  expect(searchResultReference(results[0])).toEqual({ kind: "note", id: results[0].entityId });
  expect(searchResultReference({ ...results[0], entityId: "invalid-id" })).toBeNull();
  expect(searchResultReference({ ...results[0], entityType: "experience_fact" })).toBeNull();
});
