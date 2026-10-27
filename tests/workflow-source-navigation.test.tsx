// @vitest-environment jsdom
import { act, type AnchorHTMLAttributes, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), capture: vi.fn(), restore: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/notes", useSearchParams: () => new URLSearchParams(window.location.search), useRouter: () => ({ push: mocks.push, replace: mocks.replace }) }));
vi.mock("@/components/workbench/workbench-provider", () => ({ useOptionalWorkbenchHost: () => ({ capture: mocks.capture, restore: mocks.restore }), useWorkbenchHost: () => ({ capture: mocks.capture, restore: mocks.restore }) }));
vi.mock("next/link", () => ({ default: ({ onNavigate, onClick, children, href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; onNavigate?: (event: { preventDefault(): void }) => void }) => <a {...props} href={href} onClick={(event: ReactMouseEvent<HTMLAnchorElement>) => {
  onClick?.(event);
  if (event.defaultPrevented) return;
  const modified = event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0 || (props.target && props.target !== "_self");
  const external = new URL(href, window.location.href).origin !== window.location.origin;
  event.preventDefault(); // jsdom has no native new-tab/download implementation.
  if (modified || props.download !== undefined || external) return;
  let prevented = false;
  onNavigate?.({ preventDefault: () => { prevented = true; } });
  if (!prevented) mocks.push(href);
}}>{children}</a> }));
import Link from "next/link";
import { WorkflowNavigationBoundary, WorkflowSourceTrail } from "@/components/workflow-continuity/provider";
import { SourceLink } from "@/components/workflow-continuity/source-link";
import { clearWorkspaceResources } from "@/lib/workspace-resource-cache";
import { getSourceTrail } from "@/features/workflow-continuity/source-trail";
import { saveWorkspaceSession } from "@/lib/workspace-session";
import { lastNotesListSessionKey } from "@/features/notes/navigation";
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/components/layout/workspace-panel-provider", () => ({ useWorkspacePanel: () => ({ isOpen: false, toggle: vi.fn(), close: vi.fn() }) }));
vi.mock("@/components/shared/inspector", () => ({ Inspector: () => null }));
vi.mock("@/components/notes/notes-motion", () => ({ NotesSurfaceMotion: ({ children }: { children: ReactNode }) => <>{children}</>, NotePaperMotion: () => null }));
vi.mock("@/features/notes/actions", () => ({ createFolder: vi.fn(), createNoteInFolder: vi.fn(), moveFolder: vi.fn(), moveNote: vi.fn(), renameFolder: vi.fn(), openDailyNote: vi.fn() }));
import { NoteDocumentShell } from "@/components/notes/note-document-shell";
import { NotesWorkspaceShell } from "@/components/notes/notes-workspace-shell";

let host: HTMLDivElement; let root: ReturnType<typeof createRoot>;
const scene = { version: 1 as const, main: { href: "/notes?q=fixture&view=favorites", position: { scrollTop: 245 } }, reference: null, layout: { referenceFirst: false, referenceWidth: 42, mobilePane: "main" as const } };
const deferred = () => { let resolve!: (value: typeof scene) => void; const promise = new Promise<typeof scene>(yes => { resolve = yes; }); return { promise, resolve }; };
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); clearWorkspaceResources(); vi.clearAllMocks(); window.history.replaceState({}, "", scene.main.href); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); clearWorkspaceResources(); });
async function mount(children: ReactNode) { await act(async () => root.render(<WorkflowNavigationBoundary><WorkflowSourceTrail />{children}</WorkflowNavigationBoundary>)); }
const link = (label: string) => [...host.querySelectorAll("a")].find(anchor => anchor.textContent === label)!;

describe("real shared navigation boundary and source trail", () => {
  it("a plain Next Link intent supersedes pending source capture before any URL commit", async () => {
    const first = deferred(); mocks.capture.mockReturnValue(first.promise);
    await mount(<><SourceLink href="/files">source A</SourceLink><Link href="/notes?view=favorites">ordinary B</Link></>);
    await act(async () => link("source A").click());
    await act(async () => link("ordinary B").click());
    expect(mocks.push.mock.calls).toEqual([["/notes?view=favorites"]]);
    expect(window.location.pathname + window.location.search).toBe(scene.main.href); // Intent, not a router commit, cancels A.
    await act(async () => first.resolve(scene));
    expect(mocks.push.mock.calls).toEqual([["/notes?view=favorites"]]); expect(getSourceTrail()).toEqual([]);
  });
  it("successive source links cancel the first capture while preserving the second's source", async () => {
    const first = deferred(); const second = deferred(); mocks.capture.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await mount(<><SourceLink href="/files">source A</SourceLink><SourceLink href="/projects">source B</SourceLink></>);
    await act(async () => link("source A").click()); await act(async () => link("source B").click());
    await act(async () => first.resolve(scene)); expect(mocks.push).not.toHaveBeenCalled();
    await act(async () => second.resolve(scene)); expect(mocks.push.mock.calls).toEqual([["/projects"]]);
    expect(getSourceTrail()[0].scene.main).toEqual(scene.main);
  });
  it.each(["onNavigate", "onClick"] as const)("keeps the ordinary %s save guard in control without letting old capture bypass it", async guard => {
    const first = deferred(); mocks.capture.mockReturnValue(first.promise); const blocked = vi.fn((event: { preventDefault(): void }) => event.preventDefault());
    await mount(<><SourceLink href="/files">source A</SourceLink><Link href="/projects" {...(guard === "onNavigate" ? { onNavigate: blocked } : { onClick: blocked })}>guarded B</Link></>);
    await act(async () => link("source A").click()); await act(async () => link("guarded B").click());
    expect(blocked).toHaveBeenCalledTimes(1); expect(mocks.push).not.toHaveBeenCalled();
    await act(async () => first.resolve(scene)); expect(mocks.push).not.toHaveBeenCalled();
  });
  it.each([
    { name: "modifier", props: {}, click: { ctrlKey: true } },
    { name: "new tab", props: { target: "_blank" }, click: {} },
    { name: "download", props: { download: "synthetic.zip" }, click: {} },
    { name: "external", props: { href: "https://example.org/synthetic" }, click: {} },
  ])("keeps $name clicks independent of the current tab's pending source intent", async ({ props, click }) => {
    const first = deferred(); mocks.capture.mockReturnValue(first.promise); const original = vi.fn(); const onNavigate = vi.fn();
    await mount(<><SourceLink href="/files">source A</SourceLink><Link href="/projects" {...props} onClick={original} onNavigate={onNavigate}>other target</Link></>);
    await act(async () => link("source A").click());
    await act(async () => link("other target").dispatchEvent(new MouseEvent("click", { button: 0, bubbles: true, cancelable: true, ...click })));
    expect(original).toHaveBeenCalledTimes(1); expect(onNavigate).not.toHaveBeenCalled();
    await act(async () => first.resolve(scene)); expect(mocks.push.mock.calls).toEqual([["/files"]]);
  });
  it("honors the existing programmatic navigation intent and Back cancellation", async () => {
    const first = deferred(); mocks.capture.mockReturnValue(first.promise);
    await mount(<><SourceLink href="/files">source A</SourceLink><button type="button" onClick={() => { window.dispatchEvent(new CustomEvent("personal-os:navigation-start", { detail: { href: "/projects" }, cancelable: true })); mocks.push("/projects"); }}>programmatic B</button></>);
    await act(async () => link("source A").click()); await act(async () => host.querySelector("button")!.click());
    await act(async () => first.resolve(scene)); expect(mocks.push.mock.calls).toEqual([["/projects"]]);
    mocks.push.mockClear(); const next = deferred(); mocks.capture.mockReturnValue(next.promise);
    await act(async () => link("source A").click());
    await act(async () => { window.history.replaceState({}, "", "/notes?view=all"); window.dispatchEvent(new PopStateEvent("popstate")); });
    await act(async () => next.resolve(scene)); expect(mocks.push).not.toHaveBeenCalled();
  });
  it("also refuses a late capture after an unannounced location replacement or boundary teardown", async () => {
    const first = deferred(); mocks.capture.mockReturnValue(first.promise);
    await mount(<SourceLink href="/files">source A</SourceLink>);
    await act(async () => link("source A").click()); window.history.replaceState({}, "", "/projects");
    await act(async () => first.resolve(scene)); expect(mocks.push).not.toHaveBeenCalled();
    const second = deferred(); mocks.capture.mockReturnValue(second.promise);
    await act(async () => link("source A").click()); await act(async () => root.render(null));
    await act(async () => second.resolve(scene)); expect(mocks.push).not.toHaveBeenCalled();
  });
  it("the real note return button supersedes a pending capture before Next commits the list", async () => {
    const first = deferred(); mocks.capture.mockReturnValue(first.promise);
    saveWorkspaceSession(lastNotesListSessionKey, { href: scene.main.href, scrollTop: 245 });
    await mount(<NoteDocumentShell noteId="10000000-0000-4000-8000-000000000001" editor={<SourceLink href="/files">source A</SourceLink>} inspector={null} />);
    await act(async () => link("source A").click());
    await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="返回笔记列表"]')!.click());
    expect(mocks.replace).toHaveBeenCalledWith(scene.main.href, { scroll: false, transitionTypes: ["note-return"] });
    expect(window.location.pathname + window.location.search).toBe(scene.main.href);
    await act(async () => first.resolve(scene));
    expect(mocks.replace).toHaveBeenCalledTimes(1); expect(mocks.push).not.toHaveBeenCalled(); expect(getSourceTrail()).toEqual([]);
  });
  it("the real document search shortcut supersedes pending capture while keeping its saved list", async () => {
    const first = deferred(); mocks.capture.mockReturnValue(first.promise);
    saveWorkspaceSession(lastNotesListSessionKey, { href: scene.main.href, scrollTop: 245 });
    await mount(<NotesWorkspaceShell folders={[]} notes={[]} documentView><SourceLink href="/files">source A</SourceLink></NotesWorkspaceShell>);
    await act(async () => link("source A").click());
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true })));
    expect(mocks.push.mock.calls).toEqual([[`${scene.main.href}&focusSearch=1`]]);
    expect(window.location.pathname + window.location.search).toBe(scene.main.href);
    await act(async () => first.resolve(scene));
    expect(mocks.push.mock.calls).toEqual([[`${scene.main.href}&focusSearch=1`]]); expect(getSourceTrail()).toEqual([]);
  });
  it("focusing the already mounted Notes search also supersedes an older pending navigation", async () => {
    const first = deferred(); mocks.capture.mockReturnValue(first.promise);
    await mount(<NotesWorkspaceShell folders={[]} notes={[]}><input id="notes-library-search" aria-label="已有搜索" /><SourceLink href="/files">source A</SourceLink></NotesWorkspaceShell>);
    await act(async () => link("source A").click());
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(host.querySelector("#notes-library-search")); expect(mocks.push).not.toHaveBeenCalled();
    await act(async () => first.resolve(scene)); expect(mocks.push).not.toHaveBeenCalled();
  });
  it.each([{ isComposing: true }, { keyCode: 229 }, { metaKey: true }, { repeat: true }])("does not turn an ineligible search shortcut into a navigation intent: %o", async options => {
    const first = deferred(); mocks.capture.mockReturnValue(first.promise);
    await mount(<NotesWorkspaceShell folders={[]} notes={[]} documentView><SourceLink href="/files">source A</SourceLink></NotesWorkspaceShell>);
    await act(async () => link("source A").click());
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "/", bubbles: true, cancelable: true, ...options })));
    expect(mocks.push).not.toHaveBeenCalled();
    await act(async () => first.resolve(scene)); expect(mocks.push.mock.calls).toEqual([["/files"]]);
  });
});

it("keeps a real one-shot/unknown query on its ordinary Link instead of silently dropping it during source capture", async () => {
  await mount(<SourceLink href="/tasks?create=1">create task</SourceLink>);
  await act(async () => link("create task").click());
  expect(mocks.push).toHaveBeenCalledExactlyOnceWith("/tasks?create=1"); expect(mocks.capture).not.toHaveBeenCalled(); expect(getSourceTrail()).toEqual([]);
});
