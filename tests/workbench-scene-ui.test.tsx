// @vitest-environment jsdom
import { act, createElement, lazy, Suspense, useSyncExternalStore, type AnchorHTMLAttributes, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WorkspaceScene, WorkspaceSceneSnapshot } from "@/features/workbench/contracts";
const transport = vi.hoisted(() => ({ save: vi.fn(), rows: [] as unknown[], push: vi.fn(), mobile: false }));
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
import { clearWorkspaceResources, reconcileWorkspaceScope } from "@/lib/workspace-resource-cache";
import { workbenchEntityResource, workspaceScenesResource } from "@/features/workbench/resource";
import { parseWorkspaceSceneListResponse } from "@/features/workbench/scene-read-contracts";
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
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); clearWorkspaceResources(); reconcileWorkspaceScope("synthetic-scene-owner", "scene-revision-1");
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

const savedScene = (id = "90000000-0000-4000-8000-000000000001"): WorkspaceScene => ({ id, name: "可恢复合成现场", revision: 1, created_at: "2026-10-27T00:00:00Z", updated_at: "2026-10-27T00:00:00Z", archived_at: null, snapshot: { version: 1, main: { href: "/notes" }, reference: null, layout: { referenceFirst: true, referenceWidth: 50, mobilePane: "main" } } });
const futureScene = () => ({ ...savedScene("90000000-0000-4000-8000-000000000002"), name: "未知格式合成现场", snapshot: { version: 20, body: "PRIVATE FUTURE BODY", signedUrl: "https://secret.test?token=SECRET" } });
it("shows supported and unsupported rows together without exposing or executing the unsupported payload", async () => {
  transport.rows = [savedScene(), futureScene(), { ...savedScene("90000000-0000-4000-8000-000000000003"), name: "" }];
  workspaceScenesResource.invalidate(); await click("工作台");
  const rows = [...document.querySelectorAll(".workbench-scene-list li")]; expect(rows).toHaveLength(2);
  const supported = rows.find(row => row.textContent?.includes("可恢复合成现场"))!;
  const unsupported = rows.find(row => row.textContent?.includes("未知格式合成现场"))!;
  expect(unsupported.textContent).toContain("现场格式暂不支持"); expect(document.body.textContent).toContain("有 1 份现场的基本信息无法读取");
  expect(document.querySelector(".workbench-scenes-body")?.textContent).not.toMatch(/PRIVATE FUTURE BODY|SECRET|还没有保存现场/);
  expect(unsupported.querySelectorAll("button")).toHaveLength(1); expect(unsupported.querySelector("button")?.disabled).toBe(true);
  await act(async () => unsupported.querySelector<HTMLButtonElement>("button")!.click());
  expect(transport.push).not.toHaveBeenCalled(); expect(transport.save).not.toHaveBeenCalled();
  await click("恢复", supported); expect(transport.push).toHaveBeenCalledExactlyOnceWith("/notes", { scroll: false });
  expect(host.querySelector(".workbench-layout")?.getAttribute("data-reference-first")).toBe("true"); expect(transport.save).not.toHaveBeenCalled();
});
it.each([1, 2])("revokes an update selection when the same row becomes unsupported at revision %s", async revision => {
  const old = savedScene(); transport.rows = [old]; workspaceScenesResource.invalidate(); await click("工作台"); await click("选择更新");
  expect(buttons("用当前布局更新")).toHaveLength(1); await closeDialog();
  transport.rows = [{ ...old, revision, snapshot: futureScene().snapshot }]; workspaceScenesResource.invalidate(); await click("工作台");
  expect(buttons("用当前布局更新")).toHaveLength(0); expect(buttons("保存当前现场")).toHaveLength(1);
  expect(document.body.textContent).toContain("原选现场已变化或当前格式不受支持"); expect(document.querySelector<HTMLInputElement>("#workbench-scene-name")?.value).toBe(old.name);
  expect(buttons("恢复")).toHaveLength(0); expect(buttons("选择更新")).toHaveLength(0); expect(buttons("归档")).toHaveLength(0);
  expect(transport.save).not.toHaveBeenCalled(); expect(transport.push).not.toHaveBeenCalled();
});
it("reports wholly unreadable metadata without claiming empty records or a newer format", async () => {
  transport.rows = [{ ...futureScene(), name: "" }]; workspaceScenesResource.invalidate(); await click("工作台");
  const body = document.querySelector(".workbench-scenes-body")!;
  expect(body.textContent).toContain("有 1 份现场的基本信息无法读取");
  expect(body.textContent).not.toMatch(/还没有保存现场|格式暂不支持|新版本|PRIVATE FUTURE BODY/);
  expect(buttons("恢复", body)).toHaveLength(0); expect(buttons("归档", body)).toHaveLength(0);
  expect(transport.save).not.toHaveBeenCalled(); expect(transport.push).not.toHaveBeenCalled();
});
it("clears a previous owner's metadata, selection and pending save on a scope replacement", async () => {
  transport.rows = [savedScene(), futureScene()]; workspaceScenesResource.invalidate(); await click("工作台"); await click("选择更新");
  let resolve!: (value: { status: "saved"; scene: WorkspaceScene }) => void;
  transport.save.mockReturnValue(new Promise(done => { resolve = done; })); await submit();
  await act(async () => clearWorkspaceResources());
  expect(document.body.textContent).not.toContain("未知格式合成现场"); expect(document.body.textContent).not.toContain("可恢复合成现场");
  expect(document.querySelector<HTMLInputElement>("#workbench-scene-name")?.value).toBe("");
  transport.rows = []; await click("读取最新现场");
  expect(document.body.textContent).toContain("还没有保存现场");
  await act(async () => resolve({ status: "saved", scene: savedScene() }));
  expect(document.body.textContent).not.toContain("可恢复合成现场"); expect([...document.querySelectorAll('[role="status"]')].some(node => node.textContent === "现场已保存")).toBe(false);
  expect(buttons("用当前布局更新")).toHaveLength(0); expect(transport.push).not.toHaveBeenCalled();
});

it.each([
  { refresh: "direct", revision: 1 }, { refresh: "direct", revision: 2 },
  { refresh: "owner-revision", revision: 1 }, { refresh: "owner-revision", revision: 2 },
])("reacts to a mounted $refresh refresh when a row becomes unsupported at revision $revision", async ({ refresh, revision }) => {
  const old = savedScene();
  const remaining = { ...savedScene("90000000-0000-4000-8000-000000000004"), name: "仍然可用的现场" };
  transport.rows = [old, remaining]; workspaceScenesResource.invalidate(); await click("工作台");
  const original = [...document.querySelectorAll(".workbench-scene-list li")].find(row => row.textContent?.includes(old.name))!;
  await click("选择更新", original); await inputName("保留当前命名输入");
  const dialog = document.querySelector('[role="dialog"]');
  transport.rows = [{ ...old, revision, snapshot: futureScene().snapshot }, remaining];
  await act(async () => {
    if (refresh === "owner-revision") {
      const previousReads = vi.mocked(fetch).mock.calls.length;
      reconcileWorkspaceScope("synthetic-scene-owner", "scene-revision-2");
      expect(vi.mocked(fetch).mock.calls.length).toBe(previousReads + 1);
      const automaticRead = workspaceScenesResource.get().promise;
      expect(automaticRead).toBeDefined(); await automaticRead;
    } else await workspaceScenesResource.revalidate({ force: true });
  });
  expect(document.querySelector('[role="dialog"]')).toBe(dialog);
  expect(workspaceScenesResource.get().data?.scenes.map(scene => scene.id)).toEqual([remaining.id]);
  expect(buttons("恢复")).toHaveLength(1); expect(buttons("选择更新")).toHaveLength(1); expect(buttons("归档")).toHaveLength(1);
  expect(buttons("用当前布局更新")).toHaveLength(0); expect(document.querySelector<HTMLInputElement>("#workbench-scene-name")?.value).toBe("保留当前命名输入");
  const unsupported = [...document.querySelectorAll(".workbench-scene-list li")].find(row => row.textContent?.includes("现场格式暂不支持"))!;
  expect(unsupported.querySelectorAll("button")).toHaveLength(1); expect(unsupported.querySelector("button")?.disabled).toBe(true);
  await act(async () => unsupported.querySelector<HTMLButtonElement>("button")!.click());
  expect(transport.push).not.toHaveBeenCalled(); expect(transport.save).not.toHaveBeenCalled();
  const available = [...document.querySelectorAll(".workbench-scene-list li")].find(row => row.textContent?.includes(remaining.name))!;
  await click("恢复", available); expect(transport.push).toHaveBeenCalledExactlyOnceWith("/notes", { scroll: false });
});

it("uses the newly published supported revision while revoking its old update selection", async () => {
  const old = savedScene(); transport.rows = [old]; workspaceScenesResource.invalidate(); await click("工作台"); await click("选择更新");
  await inputName("尚未保存的名称");
  const latest = { ...old, revision: 2, name: "服务端新名称", snapshot: { ...old.snapshot, main: { href: "/projects" } } };
  transport.rows = [latest];
  await act(async () => {
    reconcileWorkspaceScope("synthetic-scene-owner", "scene-revision-2");
    const automaticRead = workspaceScenesResource.get().promise;
    expect(automaticRead).toBeDefined(); await automaticRead;
  });
  expect(buttons("用当前布局更新")).toHaveLength(0); expect(document.querySelector<HTMLInputElement>("#workbench-scene-name")?.value).toBe("尚未保存的名称");
  expect(document.querySelector(".workbench-scene-list")?.textContent).toContain(latest.name);
  await click("恢复"); expect(transport.push).toHaveBeenCalledExactlyOnceWith("/projects", { scroll: false }); expect(transport.save).not.toHaveBeenCalled();
});

it("retains entered names and readable rows during a failed automatic refresh, then recovers in place", async () => {
  const old = savedScene(); transport.rows = [old]; workspaceScenesResource.invalidate(); await click("工作台"); await click("选择更新");
  await inputName("失败前继续输入"); vi.mocked(fetch).mockRejectedValueOnce(new Error("synthetic read failure"));
  await act(async () => { await workspaceScenesResource.revalidate({ force: true }).catch(() => {}); });
  expect(document.querySelector('[role="alert"]')?.textContent).toContain("现场暂时无法读取"); expect(buttons("恢复")).toHaveLength(1);
  expect(document.querySelector<HTMLInputElement>("#workbench-scene-name")?.value).toBe("失败前继续输入");
  transport.rows = [{ ...old, snapshot: futureScene().snapshot }];
  await act(async () => { await workspaceScenesResource.revalidate({ force: true }); });
  expect(document.querySelector('[role="alert"]')).toBeNull(); expect(buttons("恢复")).toHaveLength(0); expect(buttons("用当前布局更新")).toHaveLength(0);
  expect(document.querySelector<HTMLInputElement>("#workbench-scene-name")?.value).toBe("失败前继续输入"); expect(transport.save).not.toHaveBeenCalled();
});

it("does not let a late save response resurrect a row made unsupported by a mounted refresh", async () => {
  const old = savedScene(); transport.rows = [old]; workspaceScenesResource.invalidate(); await click("工作台"); await click("选择更新");
  await inputName("当前请求名称");
  let resolve!: (value: { status: "saved"; scene: WorkspaceScene }) => void;
  transport.save.mockReturnValue(new Promise(done => { resolve = done; })); await submit();
  const request = transport.save.mock.calls[0][0];
  transport.rows = [{ ...old, snapshot: futureScene().snapshot }];
  await act(async () => { await workspaceScenesResource.revalidate({ force: true }); });
  expect(buttons("恢复")).toHaveLength(0); expect(document.querySelector<HTMLInputElement>("#workbench-scene-name")?.value).toBe("当前请求名称");
  await act(async () => resolve({ status: "saved", scene: { ...old, name: "迟到的已保存名称", revision: request.expectedRevision + 1 } }));
  expect(buttons("用当前布局更新")).toHaveLength(0); expect(buttons("恢复")).toHaveLength(0);
  expect(document.querySelector<HTMLInputElement>("#workbench-scene-name")?.value).toBe("当前请求名称");
  expect(transport.save).toHaveBeenCalledTimes(1); expect(transport.push).not.toHaveBeenCalled();
});

it("keeps subsequent input while a confirmed save's automatic list refresh is pending", async () => {
  const old = savedScene(); transport.rows = [old]; workspaceScenesResource.invalidate(); await click("工作台"); await click("选择更新"); await inputName("本次提交名称");
  let finishSave!: (value: { status: "saved"; scene: WorkspaceScene }) => void;
  let finishRead!: (value: Response) => void;
  transport.save.mockReturnValue(new Promise(done => { finishSave = done; })); await submit();
  vi.mocked(fetch).mockReturnValueOnce(new Promise<Response>(done => { finishRead = done; }));
  const confirmed = { ...old, name: "本次提交名称", revision: 2 };
  await act(async () => finishSave({ status: "saved", scene: confirmed }));
  expect(document.querySelector<HTMLInputElement>("#workbench-scene-name")?.disabled).toBe(false);
  await inputName("确认保存后继续输入");
  await act(async () => { finishRead(Response.json({ scenes: [confirmed] })); await workspaceScenesResource.revalidate({ force: true }); });
  expect(document.querySelector<HTMLInputElement>("#workbench-scene-name")?.value).toBe("确认保存后继续输入");
  expect(buttons("用当前布局更新")).toHaveLength(1); expect(transport.save).toHaveBeenCalledTimes(1); expect(transport.push).not.toHaveBeenCalled();
});

it("revokes stale row handlers in the publication-to-commit window as well as updating their rendered controls", async () => {
  const old = savedScene(); transport.rows = [old]; workspaceScenesResource.invalidate(); await click("工作台");
  const restore = buttons("恢复")[0], update = buttons("选择更新")[0], archive = buttons("归档")[0];
  await act(async () => {
    workspaceScenesResource.set(parseWorkspaceSceneListResponse({ scenes: [{ ...old, snapshot: futureScene().snapshot }] }));
    restore.click(); update.click(); archive.click();
  });
  expect(transport.push).not.toHaveBeenCalled(); expect(transport.save).not.toHaveBeenCalled();
  expect(buttons("恢复")).toHaveLength(0); expect(buttons("选择更新")).toHaveLength(0); expect(buttons("归档")).toHaveLength(0);
});
