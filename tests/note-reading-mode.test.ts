// @vitest-environment jsdom
import { act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ mounts: 0, unmounts: 0, save: vi.fn(), show: vi.fn(), noop: vi.fn(), loadDraft: vi.fn() }));
vi.mock("next/dynamic", () => ({ default: (loader: () => Promise<unknown>) => loader.toString().includes("visual-markdown-editor")
  ? function Editor({ markdown, onChange }: { markdown: string; onChange: (body: string) => void }) {
    useEffect(() => { fixture.mounts++; return () => { fixture.unmounts++; }; }, []);
    return createElement("div", { "data-testid": "editor-instance" }, markdown, createElement("button", { onClick: () => onChange("# 草稿标题\n\n尚未保存的新内容。") }, "模拟正文输入"));
  } : () => null }));
vi.mock("@/features/notes/actions", () => ({ saveNote: fixture.save, setNoteContentOrigin: fixture.noop, recordNotePdfExport: fixture.noop }));
vi.mock("@/components/shared/action-feedback", () => ({ useActionFeedback: () => ({ show: fixture.show }) }));
vi.mock("@/components/layout/workspace-panel-provider", () => ({ useWorkspacePanel: () => ({ isOpen: false, open: fixture.noop, close: fixture.noop, toggle: fixture.noop }) }));
vi.mock("@/features/notes/workspace-resource", () => ({ notesWorkspaceResource: { mutate: fixture.noop, invalidate: fixture.noop } }));
vi.mock("@/lib/workspace-resource-cache", () => ({ captureWorkspaceScope: () => () => true }));
vi.mock("@/lib/workspace-session", () => ({ loadWorkspaceSession: fixture.loadDraft, saveWorkspaceSession: vi.fn(), removeWorkspaceSession: vi.fn() }));

import { NoteEditor } from "@/components/notes/note-editor";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.useFakeTimers();
  fixture.loadDraft.mockReset().mockReturnValue(null);
  fixture.mounts = 0; fixture.unmounts = 0; fixture.save.mockReset().mockRejectedValue(new Error("Synthetic offline"));
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove(); vi.useRealTimers();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});
function button(label: string) { return [...host.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === label)!; }
const baseNote = { id: "fixture-note", title: "示例笔记", body_markdown: "原有正文。", revision: 1, last_saved_at: null };
async function render(overrides: Partial<typeof baseNote> = {}) {
  await act(async () => root.render(createElement(NoteEditor, { note: { ...baseNote, ...overrides }, noteAiDefaultModel: "deepseek-v4-flash" })));
}

it("switches views without writing, remounting the editor, or losing its DOM state", async () => {
  await render();
  const editor = host.querySelector('[data-testid="editor-instance"]');
  for (let index = 0; index < 3; index++) {
    await act(async () => button("阅读").click());
    expect(host.querySelector('[aria-label="笔记正文"]')?.textContent).toBe("原有正文。");
    expect(host.querySelector<HTMLInputElement>('[aria-label="笔记标题"]')!.readOnly).toBe(true);
    await act(async () => button("编辑").click());
    expect(host.querySelector('[data-testid="editor-instance"]')).toBe(editor);
  }
  expect(fixture.mounts).toBe(1); expect(fixture.unmounts).toBe(0); expect(fixture.save).not.toHaveBeenCalled();
});

it("reads the unsaved draft and retains it through autosave failure and returning to editing", async () => {
  await render();
  await act(async () => button("模拟正文输入").click());
  await act(async () => button("阅读").click());
  expect(host.querySelector('[aria-label="笔记正文"]')?.textContent).toContain("尚未保存的新内容。");
  expect(fixture.save).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(750));
  expect(fixture.save).toHaveBeenCalledWith(expect.objectContaining({ bodyMarkdown: "# 草稿标题\n\n尚未保存的新内容。", expectedRevision: 1 }));
  expect(host.textContent).toContain("保存失败");
  await act(async () => button("编辑").click());
  expect(host.querySelector('[data-testid="editor-instance"]')?.textContent).toContain("尚未保存的新内容。");
  expect(fixture.unmounts).toBe(0);
});

it("renders a stable saved state on the server instead of a server-local clock", () => {
  const html = renderToString(createElement(NoteEditor, { note: { id: "server-fixture", title: "示例", body_markdown: "正文", revision: 1, last_saved_at: "2026-10-02T08:00:00Z" }, noteAiDefaultModel: "deepseek-v4-flash" }));
  expect(html).toContain("已保存");
  expect(html).not.toMatch(/已保存 \d{2}:\d{2}/);
});


it("reconciles a newer server revision only when the editor has no draft", async () => {
  await render();
  await render({ revision: 3, title: "远端标题", body_markdown: "远端正文" });
  await act(async () => vi.advanceTimersByTimeAsync(1));
  await act(async () => button("阅读").click());
  expect(host.querySelector('[aria-label="笔记正文"]')?.textContent).toBe("远端正文");
  expect(fixture.save).not.toHaveBeenCalled();
});

it("preserves the dirty draft and conflict when an older in-flight save fails late", async () => {
  let reject!: (error: Error) => void;
  fixture.save.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  await render();
  await act(async () => button("模拟正文输入").click());
  await act(async () => vi.advanceTimersByTimeAsync(650));
  expect(fixture.save).toHaveBeenCalledOnce();
  await render({ revision: 9, body_markdown: "远端正文" });
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(host.textContent).toContain("版本冲突");
  await act(async () => reject(new Error("Synthetic offline")));
  expect(host.textContent).toContain("版本冲突");
  expect(host.textContent).not.toContain("保存失败，本机");
  await act(async () => vi.advanceTimersByTimeAsync(5000));
  expect(fixture.save).toHaveBeenCalledOnce();
  await act(async () => button("阅读").click());
  expect(host.querySelector('[aria-label="笔记正文"]')?.textContent).toContain("尚未保存的新内容");
});

it("does not confirm an old save over an already observed newer remote revision", async () => {
  let resolve!: (result: unknown) => void;
  fixture.save.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  await render();
  await act(async () => button("模拟正文输入").click());
  await act(async () => vi.advanceTimersByTimeAsync(650));
  await render({ revision: 9, body_markdown: "远端正文" });
  await act(async () => vi.advanceTimersByTimeAsync(1));
  await act(async () => resolve({ status: "saved", revision: 2, lastSavedAt: "2026-10-25T00:00:00Z" }));
  expect(host.textContent).toContain("版本冲突");
  await act(async () => vi.advanceTimersByTimeAsync(5000));
  expect(fixture.save).toHaveBeenCalledOnce();
  await act(async () => button("阅读").click());
  expect(host.querySelector('[aria-label="笔记正文"]')?.textContent).toContain("尚未保存的新内容");
});


it("does not replay an older recovery checkpoint over current typing on background reconciliation", async () => {
  await render();
  fixture.loadDraft.mockReturnValue({ title: "示例笔记", body: "较早的本机检查点", baseRevision: 1 });
  await act(async () => button("模拟正文输入").click());
  await render({ revision: 9, body_markdown: "远端新内容" });
  await act(async () => vi.advanceTimersByTimeAsync(1));
  await act(async () => button("阅读").click());
  expect(host.querySelector('[aria-label="笔记正文"]')?.textContent).toContain("尚未保存的新内容");
  expect(fixture.loadDraft).toHaveBeenCalledOnce();
});
