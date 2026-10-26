// @vitest-environment jsdom
import { act, createElement, lazy, Suspense, useSyncExternalStore, type AnchorHTMLAttributes, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WorkspaceScene, WorkspaceSceneSnapshot } from "@/features/workbench/contracts";
const transport = vi.hoisted(() => ({ save: vi.fn(), rows: [] as WorkspaceScene[], push: vi.fn(), mobile: false }));
vi.mock("@/features/workbench/scenes", () => ({ saveWorkspaceScene: transport.save }));
vi.mock("next/dynamic", () => ({ default: (load: () => Promise<ComponentType>) => lazy(async () => ({ default: await load() })) }));
vi.mock("@/components/workbench/workbench-entity-view", () => ({ WorkbenchEntityView: ({ onNavigate }: { onNavigate?: () => void }) => <div className="workbench-document"><p>Read projection · synthetic only</p><button onClick={onNavigate}>Open primary</button></div> }));
vi.mock("next/navigation", () => {
  const subscribe = (fn: () => void) => { window.addEventListener("fixture:navigation", fn); return () => window.removeEventListener("fixture:navigation", fn); };
  const useHref = () => useSyncExternalStore(subscribe, () => window.location.href, () => "http://localhost:3000/notes");
  return { usePathname: () => new URL(useHref()).pathname, useSearchParams: () => new URL(useHref()).searchParams, useRouter: () => ({ push: transport.push }) };
});
vi.mock("next/link", () => ({ default: ({ href, children, onNavigate, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { onNavigate?: () => void }) => createElement("a", { ...props, href, onClick: (event: React.MouseEvent) => { event.preventDefault(); onNavigate?.(); if (href) transport.push(href); } }, children) }));
import { WorkbenchProvider, WorkbenchLayout, WorkbenchToolbar, useWorkbenchHost } from "@/components/workbench/workbench-provider";
import { clearWorkspaceResources } from "@/lib/workspace-resource-cache";
import { workbenchEntityResource, workspaceScenesResource } from "@/features/workbench/resource";
import { useWorkbench } from "@/components/workbench/workbench-context";
import { captureWorkbenchPosition, restoreWorkbenchPosition } from "@/components/workbench/workbench-position";
let root: Root; let host: HTMLDivElement;
function Harness() {
  const workbench = useWorkbenchHost();
  const actions = useWorkbench()!;
  return <><button onClick={() => actions.openPreview({ kind: "shopping", id: "10000000-0000-4000-8000-000000000001" })}>Open preview</button><button onClick={() => actions.compare([{ kind: "shopping", id: "10000000-0000-4000-8000-000000000001" }, { kind: "shopping", id: "10000000-0000-4000-8000-000000000002" }])}>Open comparison</button><WorkbenchToolbar /><button onClick={() => workbench.setReference({ ref: { kind: "shopping", id: "10000000-0000-4000-8000-000000000001" } })}>Choose reference</button><output data-testid="layout">{JSON.stringify(workbench.layout)}</output><WorkbenchLayout><textarea aria-label="Private draft" defaultValue="PRIVATE DRAFT MUST NOT ENTER SCENE" /></WorkbenchLayout></>;
}
const buttons = (label: string, within: ParentNode = document) => [...within.querySelectorAll<HTMLButtonElement>("button")].filter((button) => button.textContent === label || button.getAttribute("aria-label") === label);
async function click(label: string, within: ParentNode = document) { const button = buttons(label, within)[0]; expect(button).toBeDefined(); await act(async () => button.click()); if (label === "工作台") { for (let attempt = 0; attempt < 30 && !document.querySelector("#workbench-scene-name"); attempt++) await act(async () => new Promise((resolve) => setTimeout(resolve, 10))); } }
async function inputName(value: string) { const input = document.querySelector<HTMLInputElement>("#workbench-scene-name")!; expect(input).not.toBeNull(); await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); }); }
async function submit() { await act(async () => document.querySelector(".workbench-scenes-body form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
async function closeDialog() { const button = document.querySelector<HTMLButtonElement>('[role="dialog"] [data-slot="dialog-close"]')!; expect(button).not.toBeNull(); await act(async () => button.click()); }
function changedLocation(path: string) { window.history.pushState(null, "", path); window.dispatchEvent(new Event("fixture:navigation")); }
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); clearWorkspaceResources();
  window.history.replaceState(null, "", "/notes");
  transport.mobile = false;
  vi.stubGlobal("matchMedia", (query: string) => ({ get matches() { return transport.mobile && query === "(max-width: 767px)"; }, addEventListener() {}, removeEventListener() {} }));
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  transport.rows = []; transport.save.mockReset(); transport.push.mockReset().mockImplementation((href: string) => changedLocation(href));
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ scenes: transport.rows })));
  workspaceScenesResource.set({ scenes: [] });
  for (const suffix of [1, 2]) workbenchEntityResource({ kind: "shopping", id: `10000000-0000-4000-8000-00000000000${suffix}` }).set({ status: "ready", entity: { ref: { kind: "shopping", id: `10000000-0000-4000-8000-00000000000${suffix}` }, title: `Candidate ${suffix}`, href: `/shopping/10000000-0000-4000-8000-00000000000${suffix}`, fields: [], sourceUrls: [], asOf: null, subtitle: null } });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<Suspense fallback={null}><WorkbenchProvider><Harness /></WorkbenchProvider></Suspense>));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); clearWorkspaceResources(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = ""; });
function confirmSaves() {
  transport.save.mockImplementation(async (input: { id: string; name: string; snapshot: WorkspaceSceneSnapshot; expectedRevision: number }) => {
    const scene: WorkspaceScene = { id: input.id, name: input.name, snapshot: input.snapshot, revision: input.expectedRevision + 1, created_at: "2026-10-26T00:00:00Z", updated_at: "2026-10-26T00:00:00Z", archived_at: null };
    transport.rows = [scene]; return { status: "saved", scene };
  });
}
it("saves through the real Scenes UI, restores the layout once, and keeps private draft text out", async () => {
  confirmSaves(); await click("Choose reference"); await click("工作台"); await inputName("阅读现场"); await submit();
  expect(transport.save).toHaveBeenCalledTimes(1);
  const input = transport.save.mock.calls[0][0]; expect(input.name).toBe("阅读现场"); expect(input.snapshot.main.href).toBe("/notes");
  expect(JSON.stringify(input.snapshot)).not.toContain("PRIVATE DRAFT");
  await closeDialog(); await click("交换位置"); expect(host.querySelector(".workbench-layout")?.getAttribute("data-reference-first")).toBe("true");
  await click("工作台"); await click("恢复");
  expect(host.querySelector(".workbench-layout")?.getAttribute("data-reference-first")).toBe("false");
  expect(host.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("PRIVATE DRAFT MUST NOT ENTER SCENE");
  expect(transport.push).toHaveBeenLastCalledWith("/notes", { scroll: false });
  const calls = vi.mocked(window.scrollTo).mock.calls.length;
  await act(async () => changedLocation("/shopping")); await act(async () => changedLocation("/notes"));
  expect(window.scrollTo).toHaveBeenCalledTimes(calls); // Back does not replay a consumed scene position.
});
it("keeps an unconfirmed save retry on the same request and payload, and cancel performs no write", async () => {
  await click("工作台"); await inputName("可取消的现场"); await closeDialog(); expect(transport.save).not.toHaveBeenCalled();
  transport.save.mockResolvedValue({ status: "unavailable" });
  await click("工作台"); await inputName("待确认的现场"); await submit();
  expect(document.querySelector<HTMLInputElement>("#workbench-scene-name")?.value).toBe("待确认的现场");
  const first = transport.save.mock.calls[0][0]; await submit();
  expect(transport.save.mock.calls[1][0]).toBe(first); expect(first.requestId).toMatch(/^[0-9a-f-]{36}$/);
});
it("vetoes a busy dialog dismissal and allows closing after the request settles", async () => {
  let resolve!: (value: { status: "unavailable" }) => void;
  transport.save.mockReturnValue(new Promise((done) => { resolve = done; }));
  await click("工作台"); await inputName("保存进行中"); await submit(); await closeDialog();
  expect(document.querySelector('[role="dialog"]')).not.toBeNull(); expect(document.querySelector<HTMLInputElement>("#workbench-scene-name")?.disabled).toBe(true);
  await act(async () => resolve({ status: "unavailable" })); await closeDialog(); expect(document.querySelector('[role="dialog"]')).toBeNull();
});
it("captures and restores the document scroll owner separately from a reference pane", async () => {
  const main = document.createElement("section"); main.textContent = "Ordinary page"; document.body.append(main);
  Object.defineProperty(document, "scrollingElement", { configurable: true, value: document.documentElement }); document.documentElement.scrollTop = 530;
  const position = await captureWorkbenchPosition(main, "main"); expect(position).toMatchObject({ scrollOwner: "document", scrollTop: 530 });
  const settled = vi.fn(); restoreWorkbenchPosition(main, position, { scope: "main", onSettled: settled });
  expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 530, behavior: "instant" }); expect(settled).toHaveBeenCalledExactlyOnceWith(true);
  const reference = document.createElement("aside"); reference.innerHTML = '<div class="workbench-document" style="overflow-y:auto">Reference</div>'; document.body.append(reference);
  const scroller = reference.firstElementChild as HTMLElement; Object.defineProperty(scroller, "clientHeight", { value: 100 }); Object.defineProperty(scroller, "scrollHeight", { value: 1000 }); scroller.scrollTop = 270;
  expect(await captureWorkbenchPosition(reference, "reference")).toMatchObject({ scrollOwner: "pane", scrollTop: 270 });
  const calls = vi.mocked(window.scrollTo).mock.calls.length; restoreWorkbenchPosition(reference, { scrollOwner: "pane", scrollTop: 180 }, { scope: "reference" });
  expect(scroller.scrollTop).toBe(180); expect(window.scrollTo).toHaveBeenCalledTimes(calls); main.remove(); reference.remove();
});

it("dismisses read-only overlays before primary navigation and after a route change", async () => {
  await click("Open preview");
  for (let attempt = 0; attempt < 30 && !document.querySelector(".workbench-preview-dialog"); attempt++) await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
  await click("Open primary", document.querySelector(".workbench-preview-dialog")!);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await click("Open preview"); await act(async () => changedLocation("/shopping"));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => changedLocation("/notes"));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await click("Open comparison");
  for (let attempt = 0; attempt < 30 && !document.querySelector(".workbench-comparison-table a"); attempt++) await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
  await act(async () => document.querySelector<HTMLAnchorElement>(".workbench-comparison-table a")!.click());
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it("releases mobile overlay history before slow primary navigation or scene restoration", async () => {
  transport.mobile = true;
  const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
  transport.push.mockImplementation(() => {}); // Destination intentionally has not committed yet.
  await click("Open preview");
  for (let attempt = 0; attempt < 30 && !document.querySelector(".workbench-preview-dialog"); attempt++) await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
  expect(window.history.state.__personalOsMobileLayer).toMatch(/^dialog:/);
  await click("Open primary", document.querySelector(".workbench-preview-dialog")!);
  expect(window.history.state.__personalOsMobileLayer).toBeUndefined(); expect(back).not.toHaveBeenCalled();
  await click("Open comparison");
  for (let attempt = 0; attempt < 30 && !document.querySelector(".workbench-comparison-table a"); attempt++) await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
  await act(async () => document.querySelector<HTMLAnchorElement>(".workbench-comparison-table a")!.click());
  expect(window.history.state.__personalOsMobileLayer).toBeUndefined(); expect(back).not.toHaveBeenCalled();
  confirmSaves(); await click("工作台"); await inputName("Mobile scene"); await submit();
  await click("恢复");
  expect(window.history.state.__personalOsMobileLayer).toBeUndefined(); expect(back).not.toHaveBeenCalled();
});
