// @vitest-environment jsdom
import { act, createElement, useLayoutEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearWorkspaceResources } from "@/lib/workspace-resource-cache";
import { cancelBackgroundOperation, getBackgroundOperations, retryBackgroundOperation, startBackgroundOperation } from "@/features/workflow-continuity/background-operations";
import { expireWorkflowDrafts, getWorkflowDrafts, useWorkflowDraft, type WorkflowDraftOptions } from "@/features/workflow-continuity/drafts";
import { insertIntoAdjacentNote, listNoteInsertionTargets, registerNoteInsertionTarget } from "@/features/workflow-continuity/note-insertion";
import { addSourceTrailEntry, beginSourceNavigation, cancelSourceNavigation, captureSourceNavigation, getSourceTrail } from "@/features/workflow-continuity/source-trail";

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); clearWorkspaceResources(); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); clearWorkspaceResources(); vi.useRealTimers(); });
const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (reason: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

describe("owner-scoped background execution", () => {
  it("outlives its page and only retries the explicitly failed operation", async () => {
    const upload = deferred<void>(); const retry = vi.fn(async () => {});
    const operation = startBackgroundOperation({ kind: "upload", label: "合成上传", href: "/files", run: async ({ report }) => { report({ phase: "上传中", completed: 10, total: 100, unit: "bytes" }); await upload.promise; }, retry });
    expect(getBackgroundOperations()[0]).toMatchObject({ status: "running", completed: 10, total: 100 });
    await act(async () => root.unmount()); root = createRoot(host);
    expect(getBackgroundOperations()[0].status).toBe("running");
    upload.reject(new Error("network")); await operation.completion;
    expect(getBackgroundOperations()[0]).toMatchObject({ status: "failed", canRetry: true });
    expect(retryBackgroundOperation(operation.id)).toBe(true);
    await Promise.resolve(); await Promise.resolve();
    expect(retry).toHaveBeenCalledTimes(1);
    expect(getBackgroundOperations()[0].status).toBe("succeeded");
    expect(retryBackgroundOperation(operation.id)).toBe(false);
  });
  it("keeps a committed result after a late cancel and ignores old-owner completion", async () => {
    const finish = deferred<void>();
    const operation = startBackgroundOperation({ kind: "upload", label: "封存", href: "/files", run: async () => { await finish.promise; return { status: "succeeded", phase: "服务器已封存" }; } });
    cancelBackgroundOperation(operation.id); finish.resolve(); await operation.completion;
    expect(getBackgroundOperations()[0]).toMatchObject({ status: "succeeded", phase: "服务器已封存" });
    const stale = deferred<void>(); const old = startBackgroundOperation({ kind: "ocr", label: "旧任务", href: "/files", run: async () => { await stale.promise; } });
    clearWorkspaceResources(); stale.resolve(); await old.completion;
    expect(getBackgroundOperations()).toEqual([]);
  });
  it("never exposes made-up percentages and unknown aborts need checking", async () => {
    const done = deferred<void>();
    const operation = startBackgroundOperation({ kind: "export", label: "导出", href: "/files", run: async ({ report }) => { report({ phase: "准备", completed: NaN, total: 100 }); await done.promise; throw new Error("abort"); } });
    expect(getBackgroundOperations()[0].completed).toBeUndefined();
    cancelBackgroundOperation(operation.id); done.resolve(); await operation.completion;
    expect(getBackgroundOperations()[0]).toMatchObject({ status: "needs-check", canRetry: false });
  });
});

type Draft = { text: string; revision: number };
let draft: ReturnType<typeof useWorkflowDraft<Draft>>;
const options: WorkflowDraftOptions<Draft> = { kind: "review", id: "synthetic", label: "合成复盘", resumeHref: "/reviews", initialValue: { text: "", revision: 1 }, parse: value => value && typeof value === "object" && "text" in value && typeof value.text === "string" && "revision" in value && typeof value.revision === "number" ? { text: value.text, revision: value.revision } : null };
function DraftForm({ config = options }: { config?: WorkflowDraftOptions<Draft> }) { const current = useWorkflowDraft(config); useLayoutEffect(() => { draft = current; }); return createElement("output", null, current.value.text); }
describe("draft recovery and live editing", () => {
  it("restores a closed form, while TTL expiry cannot roll back its live input", async () => {
    vi.useFakeTimers(); await act(async () => root.render(createElement(DraftForm)));
    await act(async () => draft.setValue({ text: "未完成", revision: 1 }));
    await act(async () => root.render(null)); await act(async () => root.render(createElement(DraftForm)));
    expect(draft.value.text).toBe("未完成"); expect(draft.restored).toBe(true);
    await act(async () => { vi.advanceTimersByTime(15 * 60_000 + 1); expireWorkflowDrafts(); });
    expect(host.textContent).toBe("未完成"); expect(getWorkflowDrafts()).toEqual([]);
    await act(async () => root.render(null)); await act(async () => root.render(createElement(DraftForm)));
    expect(draft.value.text).toBe("");
  });
  it("retains typing beyond recovery limits and clears stale recovery instead of truncating", async () => {
    await act(async () => root.render(createElement(DraftForm)));
    await act(async () => draft.setValue({ text: "small", revision: 1 }));
    const text = "x".repeat(400_001);
    await act(async () => draft.setValue({ text, revision: 1 }));
    expect(draft.value.text).toBe(text); expect(draft.recoveryUnavailable).toBe(true); expect(getWorkflowDrafts()).toEqual([]);
  });
  it("acknowledges the saved revision while preserving typing that happened during save", async () => {
    await act(async () => root.render(createElement(DraftForm)));
    const submitted = { text: "提交内容", revision: 1 };
    await act(async () => draft.setValue(submitted));
    await act(async () => draft.setValue(current => ({ ...current, text: "提交后继续写" })));
    await act(async () => draft.commit(submitted, current => ({ ...current, revision: 2 })));
    expect(draft.value).toEqual({ text: "提交后继续写", revision: 2 }); expect(getWorkflowDrafts()).toHaveLength(1);
    const saved = draft.value;
    await act(async () => draft.commit(saved, current => ({ ...current, revision: 3 })));
    expect(draft.value).toEqual({ text: "提交后继续写", revision: 3 }); expect(getWorkflowDrafts()).toEqual([]);
    await act(async () => draft.setValue(current => ({ ...current })));
    expect(getWorkflowDrafts()).toEqual([]);
  });
  it("key changes cannot expose another form's initial or draft value", async () => {
    await act(async () => root.render(createElement(DraftForm)));
    await act(async () => draft.setValue({ text: "A", revision: 1 }));
    await act(async () => root.render(createElement(DraftForm, { config: { ...options, id: "another", initialValue: { text: "B", revision: 7 } } })));
    expect(draft.value).toEqual({ text: "B", revision: 7 });
    await act(async () => clearWorkspaceResources());
    expect(draft.value.text).toBe("B"); expect(getWorkflowDrafts()).toEqual([]);
  });
  it("rejects the previous record's setters and commits before reading the next record's config", async () => {
    await act(async () => root.render(createElement(DraftForm)));
    const submitted = { text: "A提交中", revision: 1 };
    await act(async () => draft.setValue(submitted));
    const old = draft;
    const nextConfig = { ...options, id: "second", initialValue: { text: "B", revision: 20 } };
    await act(async () => root.render(createElement(DraftForm, { config: nextConfig })));
    const update = vi.fn((current: Draft) => ({ ...current, revision: 2 }));
    await act(async () => { old.setValue({ text: "迟到的A", revision: 1 }); old.commit(submitted, update); old.clear(); });
    expect(draft.value).toEqual({ text: "B", revision: 20 });
    expect(update).not.toHaveBeenCalled();
    expect(getWorkflowDrafts().map(entry => entry.key)).toEqual(["review:synthetic"]);
    await act(async () => draft.setValue({ text: "B继续写", revision: 20 }));
    await act(async () => draft.commit({ text: "B继续写", revision: 20 }, current => ({ ...current, revision: 21 })));
    expect(draft.value).toEqual({ text: "B继续写", revision: 21 });
    expect(getWorkflowDrafts().map(entry => entry.key)).toEqual(["review:synthetic"]);
  });
  it("does not reactivate the first A lease after A → B → A", async () => {
    await act(async () => root.render(createElement(DraftForm)));
    const submitted = { text: "A未完成", revision: 1 };
    await act(async () => draft.setValue(submitted));
    const firstA = draft;
    await act(async () => root.render(createElement(DraftForm, { config: { ...options, id: "second", initialValue: { text: "B", revision: 20 } } })));
    await act(async () => root.render(createElement(DraftForm)));
    expect(draft.value).toEqual(submitted);
    const update = vi.fn((current: Draft) => ({ ...current, revision: 99 }));
    await act(async () => { firstA.setValue({ text: "旧A覆盖", revision: 99 }); firstA.commit(submitted, update); firstA.clear(submitted); });
    expect(draft.value).toEqual(submitted); expect(update).not.toHaveBeenCalled();
    expect(getWorkflowDrafts()).toHaveLength(1);
    await act(async () => draft.commit(submitted, current => ({ ...current, revision: 2 })));
    expect(draft.value).toEqual({ text: "A未完成", revision: 2 }); expect(getWorkflowDrafts()).toEqual([]);
  });
  it("same-owner visibility invalidation retains live input and renews only new callbacks", async () => {
    await act(async () => root.render(createElement(DraftForm)));
    await act(async () => draft.setValue({ text: "普通未完成输入", revision: 1 }));
    const oldCommit = draft.commit; const oldSetter = draft.setValue;
    await act(async () => clearWorkspaceResources());
    expect(draft.value.text).toBe("普通未完成输入");
    await act(async () => draft.setValue(current => ({ ...current, text: "继续编辑" })));
    expect(draft.value.text).toBe("继续编辑");
    await act(async () => { oldSetter({ text: "旧callback", revision: 1 }); oldCommit({ text: "普通未完成输入", revision: 1 }, current => ({ ...current, revision: 99 })); });
    expect(draft.value).toEqual({ text: "继续编辑", revision: 1 });
  });
});

describe("source trails and adjacent note insertion", () => {
  const scene = { version: 1 as const, main: { href: "/projects", position: { scrollTop: 123 } }, reference: null, layout: { referenceFirst: false, referenceWidth: 42, mobilePane: "main" as const } };
  it("a later link or rail intent cancels another component's late capture", async () => {
    const capture = deferred<typeof scene>(); const navigate = vi.fn();
    const first = captureSourceNavigation({ capture: () => capture.promise, destination: "/files", label: "项目", navigate, current: beginSourceNavigation() });
    const second = beginSourceNavigation();
    await captureSourceNavigation({ capture: async () => scene, destination: "/notes", label: "项目", navigate, current: second });
    capture.resolve(scene); await first;
    expect(navigate.mock.calls).toEqual([["/notes"]]);
    const cancelled = deferred<typeof scene>();
    const pending = captureSourceNavigation({ capture: () => cancelled.promise, destination: "/files", label: "项目", navigate, current: beginSourceNavigation() });
    cancelSourceNavigation(); cancelled.resolve(scene); await pending;
    expect(navigate).toHaveBeenCalledTimes(1);
  });
  it("retains exact safe source metadata and rejects external destinations", () => {
    addSourceTrailEntry(scene, "https://example.com", "来源"); expect(getSourceTrail()).toEqual([]);
    addSourceTrailEntry(scene, "/files?file=11111111-1111-4111-8111-111111111111", "项目");
    expect(getSourceTrail()[0].scene.main.position?.scrollTop).toBe(123);
    clearWorkspaceResources(); expect(getSourceTrail()).toEqual([]);
  });
  it("uses a unique explicit live editor and refuses ambiguous or stale targets", async () => {
    const insert = vi.fn(() => ({ status: "applied" as const }));
    const release = registerNoteInsertionTarget({ noteId: "one", label: "合成目标", role: "reference", canEdit: true, insert });
    expect(listNoteInsertionTargets()[0].label).toBe("合成目标");
    expect(await insertIntoAdjacentNote({ markdown: "> 摘录" })).toEqual({ status: "applied", noteId: "one" });
    registerNoteInsertionTarget({ noteId: "two", label: "另一目标", role: "reference", canEdit: true, insert });
    expect((await insertIntoAdjacentNote({ markdown: "quote" })).status).toBe("inactive");
    expect((await insertIntoAdjacentNote({ markdown: "quote", targetNoteId: "one" })).status).toBe("applied");
    release(); clearWorkspaceResources(); expect((await insertIntoAdjacentNote({ markdown: "quote" })).status).toBe("inactive");
  });
});
