// @vitest-environment jsdom
import { act, StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { ReferenceNoteInsertionBoundary, referenceInsertionLifetimeMs, useReferenceNoteInsertion } from "@/components/workbench/reference-note-insertion";
import { registerNoteInsertionTarget, type NoteInsertionResult } from "@/features/workflow-continuity/note-insertion";
import { clearWorkspaceResources } from "@/lib/workspace-resource-cache";
import { sourceLocatorHref } from "@/features/links/source-locator";
import { announceNavigationIntent } from "@/features/workflow-continuity/navigation-intent";
import { handoffMobileBackLayer, useMobileBackLayer } from "@/lib/mobile/use-mobile-back-layer";
const noteId = "e2000000-0000-4000-8000-000000000002", otherId = "e2000000-0000-4000-8000-000000000003";
const sourceHref = sourceLocatorHref({ kind: "pdf", documentId: "e4000000-0000-4000-8000-000000000001", sourceVersion: "71000000-0000-4000-8000-000000000001", page: 3 });
const markdown = `> Selected immutable text.\n\n[第3页](${sourceHref})`;
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
let destination: ReturnType<typeof useReferenceNoteInsertion>;
const insert = vi.fn<(markdown: string) => NoteInsertionResult | Promise<NoteInsertionResult>>(() => ({ status: "applied" }));
function Capture() { const value = useReferenceNoteInsertion(); useEffect(() => { destination = value; }, [value]); return null; }
function LiveTarget({ id, editable = true }: { id: string; editable?: boolean }) {
  useEffect(() => registerNoteInsertionTarget({ noteId: id, role: "reference", label: "合成参考", canEdit: editable, insert }), [id, editable]);
  return <input aria-label="真实目标草稿" defaultValue="保留已有输入" />;
}
function Harness({ id = noteId, editable = true, mobileSource = false, focusTarget, routeKey = "/files" }: { id?: string; editable?: boolean; mobileSource?: boolean; focusTarget?: () => void; routeKey?: string }) {
  const [active, setActive] = useState(false), [sourceOpen, setSourceOpen] = useState(mobileSource);
  useMobileBackLayer(sourceOpen, () => setSourceOpen(false), "dialog");
  return <ReferenceNoteInsertionBoundary routeKey={routeKey} noteId={id} activate={() => setActive(true)} focusTarget={focusTarget}><Capture />{active ? <LiveTarget id={id} editable={editable} /> : null}
    {mobileSource ? <button onClick={() => destination?.stage({ noteId: id, markdown, sourceHref, beforeActivate: () => { handoffMobileBackLayer("dialog", "note-insertion"); setSourceOpen(false); } })}>移交原文</button> : null}
  </ReferenceNoteInsertionBoundary>;
}
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === text)!;
async function stage(text = markdown) { await act(async () => { expect(destination?.stage({ noteId, markdown: text, sourceHref })).toBe(true); }); }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  clearWorkspaceResources(); insert.mockClear(); destination = null;
  window.history.replaceState({}, "", "/files"); host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); clearWorkspaceResources(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it("activates the actual target but inserts only after explicit confirmation, exactly once", async () => {
  await act(async () => root.render(<Harness />)); await stage();
  expect(insert).not.toHaveBeenCalled(); expect(button("确认插入所选内容").disabled).toBe(false);
  const draft = host.querySelector<HTMLInputElement>("input")!; draft.value = "保留后续输入";
  await act(async () => { button("确认插入所选内容").click(); button("确认插入所选内容")?.click(); });
  expect(insert).toHaveBeenCalledExactlyOnceWith(markdown); expect(draft.isConnected).toBe(true); expect(draft.value).toBe("保留后续输入");
});
it.each(["cancel", "target changed", "scope", "navigation", "route changed", "expiry", "unmount"])("never pastes a pending source after %s", async reason => {
  if (reason === "expiry") vi.useFakeTimers();
  await act(async () => root.render(<Harness />)); await stage(); const stale = button("确认插入所选内容");
  await act(async () => {
    if (reason === "cancel") button("取消摘录").click();
    else if (reason === "target changed") root.render(<Harness id={otherId} />);
    else if (reason === "scope") clearWorkspaceResources();
    else if (reason === "route changed") root.render(<Harness routeKey="/projects" />);
    else if (reason === "navigation") { announceNavigationIntent(); window.dispatchEvent(new Event("personal-os:navigation-start")); }
    else if (reason === "expiry") await vi.advanceTimersByTimeAsync(referenceInsertionLifetimeMs);
    else root.render(null);
  });
  await act(async () => stale.click()); expect(insert).not.toHaveBeenCalled();
  if (reason === "expiry") expect(host.textContent).toContain("摘录确认已过期，请回到原文重新选择。");
});
it("replaces a prior quote without replay and refuses non-PDF/over-budget/stale target staging", async () => {
  await act(async () => root.render(<Harness />)); const first = destination!; await stage("first source"); await stage("second source");
  await act(async () => button("确认插入所选内容").click()); expect(insert).toHaveBeenCalledExactlyOnceWith("second source");
  expect(destination?.stage({ noteId, markdown: "x".repeat(20_001), sourceHref })).toBe(false);
  expect(destination?.stage({ noteId, markdown, sourceHref: "/files" })).toBe(false);
  await act(async () => root.render(<Harness id={otherId} />)); expect(first.stage({ noteId, markdown, sourceHref })).toBe(false);
});
it("keeps confirmation disabled until the real target is editable", async () => {
  await act(async () => root.render(<Harness editable={false} />)); await stage();
  expect(button("正在打开参考笔记…").disabled).toBe(true); expect(insert).not.toHaveBeenCalled();
});
it("hands the existing phone Back entry to confirmation; one Back cancels without insertion", async () => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
  await act(async () => root.render(<Harness mobileSource />)); const length = window.history.length;
  expect(window.history.state.__personalOsMobileLayer).toMatch(/^dialog:/);
  await act(async () => button("移交原文").click());
  expect(window.history.length).toBe(length); expect(back).not.toHaveBeenCalled(); expect(window.history.state.__personalOsMobileLayer).toMatch(/^note-insertion:/);
  await act(async () => window.dispatchEvent(new PopStateEvent("popstate", { state: {} })));
  expect(document.querySelector('[aria-label="确认摘录到参考笔记"]')).toBeNull(); expect(insert).not.toHaveBeenCalled(); expect(back).not.toHaveBeenCalled();
});

it("survives StrictMode setup/cleanup/setup and cancels Escape without clearing the actual target draft", async () => {
  await act(async () => root.render(<StrictMode><Harness /></StrictMode>)); await stage();
  const region = document.querySelector<HTMLElement>('[aria-label="确认摘录到参考笔记"]')!;
  expect(document.activeElement).toBe(region);
  const draft = host.querySelector<HTMLInputElement>("input")!; draft.value = "后续原始输入";
  await act(async () => region.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
  expect(document.querySelector('[aria-label="确认摘录到参考笔记"]')).toBeNull(); expect(insert).not.toHaveBeenCalled(); expect(draft.isConnected).toBe(true); expect(draft.value).toBe("后续原始输入");
  await stage(); await act(async () => button("确认插入所选内容").click()); expect(insert).toHaveBeenCalledExactlyOnceWith(markdown);
});

it("does not steal later typing focus when an asynchronous confirmed insertion completes", async () => {
  let finish!: (result: NoteInsertionResult) => void;
  insert.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const focusTarget = vi.fn();
  await act(async () => root.render(<Harness focusTarget={focusTarget} />)); await stage();
  await act(async () => button("确认插入所选内容").click());
  const draft = host.querySelector<HTMLInputElement>("input")!; draft.focus(); draft.value = "新输入";
  await act(async () => finish({ status: "applied" }));
  expect(focusTarget).not.toHaveBeenCalled(); expect(document.activeElement).toBe(draft); expect(draft.value).toBe("新输入");
});
it("never renews a mounted source boundary's owner lease through an old stage callback", async () => {
  await act(async () => root.render(<Harness />)); const old = destination!;
  await act(async () => clearWorkspaceResources());
  expect(old.stage({ noteId, markdown, sourceHref })).toBe(false);
  expect(insert).not.toHaveBeenCalled(); expect(document.querySelector('[aria-label="确认摘录到参考笔记"]')).toBeNull();
});
