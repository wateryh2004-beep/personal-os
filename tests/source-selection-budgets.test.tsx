// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PDFDocumentProxy } from "unpdf/pdfjs";
const mocks = vi.hoisted(() => ({ create: vi.fn(), read:vi.fn(), pdfText: "" }));
vi.mock("@/features/tasks/microsoft-todo", () => ({ createMicrosoftTodoTaskAction: mocks.create,readMicrosoftTodoCreationAction:mocks.read }));
vi.mock("unpdf/pdfjs", () => ({ TextLayer: class {
  container: HTMLDivElement;
  constructor({ container }: { container: HTMLDivElement }) { this.container = container; }
  async render() { const span = document.createElement("span"); span.textContent = mocks.pdfText; this.container.append(span); }
  cancel() {}
} }));
import { NoteSelectionActions } from "@/components/notes/note-selection-actions";
import { PdfCanvasPage } from "@/components/files/file-pdf-preview";
import { clearWorkspaceResources } from "@/lib/workspace-resource-cache";
import { insertIntoAdjacentNote, registerNoteInsertionTarget } from "@/features/workflow-continuity/note-insertion";
import { noteSelectionContent, taskSelectionContent, type SelectionSource } from "@/features/notes/selection-content";
import { sourceLocatorHref } from "@/features/links/source-locator";
const noteId = "11111111-1111-4111-8111-111111111111", versionId = "22222222-2222-4222-8222-222222222222", targetId = "33333333-3333-4333-8333-333333333333";
const pdfId = "44444444-4444-4444-8444-444444444444", listId = "55555555-5555-4555-8555-555555555555";
const noteHref = (length: number) => sourceLocatorHref({ kind: "note", noteId, versionId, revision: 1, from: 0, to: length, hash: "a".repeat(64) });
const pdfSource = { kind: "pdf" as const, href: sourceLocatorHref({ kind: "pdf", documentId: pdfId, sourceVersion: versionId, page: 7 }), page: 7 };
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); clearWorkspaceResources();
  mocks.create.mockReset().mockResolvedValue({ status: "success", message: "Synthetic confirmed task" });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ lists: [{ id: listId, displayName: "Synthetic list" }], unavailable: false })));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); clearWorkspaceResources(); window.getSelection()?.removeAllRanges(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const button = (text: string) => [...host.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === text)!;
const click = async (text: string) => { await act(async () => button(text).click()); };
async function showNote(text: string, capture = vi.fn(async () => noteHref(text.length))) {
 const selection = { text, rect: { left: 0, top: 0 }, replace: vi.fn(), insertBelow: vi.fn(), isCurrent: () => true };
 await act(async () => root.render(<NoteSelectionActions noteId={noteId} selection={selection} capture={capture} />));
 return { selection, capture };
}
function target(insert = vi.fn(() => ({ status: "applied" as const }))) {
 registerNoteInsertionTarget({ noteId: targetId, label: "Open synthetic target", role: "reference", canEdit: true, insert }); return insert;
}
function exactQuote(source: SelectionSource, lines: number) {
 const base = "x\n".repeat(lines - 1) + "x";
 const label = source.kind === "pdf" ? `原文件 · 第 ${source.page} 页` : "引用原文";
 const suffix = `\n\n[${label}](${source.href})`;
 const extra = 20_000 - base.length - lines * 2 - suffix.length;
 const text = base + "x".repeat(extra);
 expect(extra).toBeGreaterThanOrEqual(0); expect(text.length).toBeLessThanOrEqual(10_000);
 return text;
}
describe("composed source budgets without truncation", () => {
 it.each(["note", "pdf"] as const)("counts %s multiline prefixes and citation, exactly at and one above 20,000", kind => {
  const source: SelectionSource = kind === "note" ? { kind: "note", href: noteHref(9999) } : pdfSource;
  const text = exactQuote(source, kind === "note" ? 4920 : 4950);
  const at = noteSelectionContent(text, source), over = noteSelectionContent(text + "x", source);
  expect(at.status).toBe("ready"); if (at.status === "ready") { expect(at.content).toHaveLength(20_000); expect(at.content).toContain(text.split("\n").at(-1)); }
  expect(over).toEqual({ status: "over-budget", actual: 20_001, limit: 20_000 });
  expect(noteSelectionContent(text + "x", source, true)).toMatchObject({ status: "ready", referenceOnly: true });
 });
 it("counts task source suffix before accepting exactly 10,000 or refusing one extra", () => {
  const source = { kind: "note" as const, href: noteHref(9999) }, suffix = `\n\n原文：${source.href}`;
  const text = "x".repeat(10_000 - suffix.length);
  expect(taskSelectionContent(text, source)).toMatchObject({ status: "ready", content: text + suffix, actual: 10_000 });
  expect(taskSelectionContent(text + "x", source)).toEqual({ status: "over-budget", actual: 10_001, limit: 10_000 });
 });
 it("counts UTF-16 characters without splitting or dropping a supplementary character", () => {
  const source = { kind: "note" as const, href: noteHref(9999) }, suffix = `\n\n原文：${source.href}`;
  const available = 10_000 - suffix.length;
  const text = "🌱".repeat(Math.floor(available / 2)) + (available % 2 ? "x" : "");
  const result = taskSelectionContent(text, source);
  expect(result).toMatchObject({ status: "ready", content: text + suffix, actual: 10_000 });
  expect(taskSelectionContent(text + "x", source)).toMatchObject({ status: "over-budget", actual: 10_001 });
 });
 it("actual bridge distinguishes oversized content even when an editable target exists", async () => {
  const insert = target();
  expect((await insertIntoAdjacentNote({ targetNoteId: targetId, markdown: "x".repeat(20_000) })).status).toBe("applied");
  expect(insert).toHaveBeenCalledOnce();
  expect(await insertIntoAdjacentNote({ targetNoteId: targetId, markdown: "x".repeat(20_001) })).toEqual({ status: "too-large", actual: 20_001, limit: 20_000 });
  expect(insert).toHaveBeenCalledOnce();
 });
});
describe("actual Note selection UI and real adjacent-note bridge", () => {
 it("keeps a legal 10,000 selection/source and offers an explicit source-only task before any confirmation", async () => {
  const text = "x".repeat(10_000), { selection, capture } = await showNote(text);
  await click("转为任务");
  expect(host.querySelector("form")).toBeNull(); expect(fetch).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  expect(host.textContent).toContain("超过任务正文的 10,000"); expect(host.textContent).toContain("原选文和来源已保留");
  await click("仅用来源创建任务");
  expect(capture).toHaveBeenCalledOnce(); expect(host.querySelector("form")).not.toBeNull();
  expect(host.textContent).toContain("仅包含保留的来源链接"); expect(mocks.create).not.toHaveBeenCalled();
  await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  const sent = mocks.create.mock.calls[0][1] as FormData;
  expect(sent.get("body_text")).toBe(`原文：${noteHref(text.length)}`);
  expect(selection.text).toBe(text); expect(selection.replace).not.toHaveBeenCalled(); expect(selection.insertBelow).not.toHaveBeenCalled();
 });
 it("shows a valid full-body task preview at exactly 10,000 and only dispatches on confirmation", async () => {
  const href = noteHref(9999), suffix = `\n\n原文：${href}`, text = "x".repeat(10_000 - suffix.length);
  await showNote(text, vi.fn(async () => href)); await click("转为任务");
  expect(host.querySelector("form")).not.toBeNull(); expect(mocks.create).not.toHaveBeenCalled();
  await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect((mocks.create.mock.calls[0][1] as FormData).get("body_text")).toBe(text + suffix);
 });
 it("does not present an unresolvable task form for one character above the final budget", async () => {
  const href = noteHref(9999), suffix = `\n\n原文：${href}`, text = "x".repeat(10_001 - suffix.length);
  await showNote(text, vi.fn(async () => href)); await click("转为任务");
  expect(host.textContent).toContain("10,001 个字符"); expect(host.querySelector("form")).toBeNull(); expect(mocks.create).not.toHaveBeenCalled();
 });
 it("reports multiline quote expansion with an active target and inserts only the retained reference by choice", async () => {
  const text = "x\n".repeat(4999) + "x", insert = target(), { selection, capture } = await showNote(text);
  await click("引用到旁边笔记");
  expect(insert).not.toHaveBeenCalled(); expect(host.textContent).toContain("单次笔记插入的 20,000");
  expect(host.textContent).not.toContain("请在参照区打开"); expect(selection.text).toHaveLength(9999);
  await click("仅关联来源到旁边笔记");
  expect(insert).toHaveBeenCalledWith(`[关联原文](${noteHref(text.length)})`); expect(capture).toHaveBeenCalledOnce();
  expect(host.textContent).toContain("已插入旁边笔记");
 });
 it("does not reuse a retained source after an owner scope change", async () => {
  await showNote("x\n".repeat(4999) + "x"); await click("引用到旁边笔记");
  clearWorkspaceResources(); const newOwnerInsert = target();
  await click("仅关联来源到旁边笔记"); expect(newOwnerInsert).not.toHaveBeenCalled();
 });
});
async function showPdf(text: string) {
 mocks.pdfText = text;
 vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as CanvasRenderingContext2D);
 const page = { getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }), render: () => ({ promise: Promise.resolve(), cancel: vi.fn() }), cleanup: vi.fn(), getTextContent: async () => ({ items: [{ str: text }], styles: {} }) };
 const pdf = { getPage: async () => page } as unknown as PDFDocumentProxy;
 const props = { pdf, pageNumber: 7, title: "Synthetic PDF", documentId: pdfId, sourceVersion: versionId, width: 600, onFailure: vi.fn(), onRendered: vi.fn() };
 await act(async () => root.render(createElement(PdfCanvasPage, props)));
 await act(async () => { await vi.waitFor(() => expect(host.querySelector(".file-pdf-text-layer span")).not.toBeNull()); });
 await act(async () => {
  const range = document.createRange(); range.selectNodeContents(host.querySelector(".file-pdf-text-layer span")!);
  window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range); document.dispatchEvent(new Event("selectionchange"));
 });
 await act(async () => { const select = host.querySelector<HTMLSelectElement>('[aria-label="摘录目标笔记"]')!; select.value = targetId; select.dispatchEvent(new Event("change", { bubbles: true })); });
 return props;
}
describe("actual PDF selection controls and real bridge", () => {
 it.each(["摘录到笔记", "仅关联本页来源"])("rejects the prior PDF scope before %s can reach a same-ID new target", async label => {
  target(); await showPdf("Synthetic prior-owner source");
  // Dispatch the already-rendered control before React flushes scope cleanup,
  // reproducing the review's queued stale callback rather than relying on unmount.
  clearWorkspaceResources(); const nextOwnerInsert = target();
  await click(label);
  expect(nextOwnerInsert).not.toHaveBeenCalled();
  expect(host.querySelector("select")).toBeNull();
  expect(host.textContent).toContain("工作区已变化，请重新打开 PDF");
  expect(host.textContent).not.toContain("已插入，等待笔记自动保存");
  await act(async () => document.dispatchEvent(new Event("selectionchange")));
  expect(host.querySelector("select")).toBeNull();
  expect(nextOwnerInsert).not.toHaveBeenCalled();
 });
 it.each(["documentId", "sourceVersion", "pageNumber"] as const)("invalidates selected source when %s changes on the mounted page", async field => {
  const insert = target(), props = await showPdf("Synthetic previous page source");
  const changed = { ...props, [field]: field === "pageNumber" ? 8 : "66666666-6666-4666-8666-666666666666" };
  await act(async () => root.render(createElement(PdfCanvasPage, changed)));
  expect(host.querySelector("select")).toBeNull(); expect(insert).not.toHaveBeenCalled();
  await act(async () => {
    const range = document.createRange(); range.selectNodeContents(host.querySelector(".file-pdf-text-layer span")!);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range); document.dispatchEvent(new Event("selectionchange"));
  });
  await act(async () => { const select = host.querySelector<HTMLSelectElement>("select")!; select.value = targetId; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await click("仅关联本页来源");
  const href = sourceLocatorHref({ kind: "pdf", documentId: changed.documentId, sourceVersion: changed.sourceVersion, page: changed.pageNumber });
  expect(insert).toHaveBeenCalledWith(`[原文件 · 第 ${changed.pageNumber} 页](${href})`);
 });

 it("keeps an over-budget multiline selection and page citation, with a source-only alternative", async () => {
  const insert = target(); await showPdf("x\n".repeat(4999) + "x");
  expect(button("摘录到笔记").disabled).toBe(true); expect(host.textContent).toContain("单次笔记插入的 20,000");
  expect(host.textContent).not.toContain("目标笔记不可编辑"); expect(insert).not.toHaveBeenCalled();
  await click("仅关联本页来源"); expect(insert).toHaveBeenCalledWith(`[原文件 · 第 7 页](${pdfSource.href})`);
  expect(host.textContent).toContain("已插入，等待笔记自动保存");
 });
 it("refuses a PDF quote exactly one character over while preserving the selected page text", async () => {
  const text = exactQuote(pdfSource, 4950) + "x", insert = target(); await showPdf(text);
  expect(button("摘录到笔记").disabled).toBe(true); expect(host.textContent).toContain("20,001 个字符");
  expect(host.querySelector(".file-pdf-text-layer span")?.textContent).toBe(text); expect(insert).not.toHaveBeenCalled();
  await click("仅关联本页来源"); expect(insert).toHaveBeenCalledWith(`[原文件 · 第 7 页](${pdfSource.href})`);
 });
 it("inserts the complete exact-budget PDF quote without trimming it", async () => {
  const text = exactQuote(pdfSource, 4950), insert = target(); await showPdf(text);
  expect(button("摘录到笔记").disabled).toBe(false); await click("摘录到笔记");
  const expected = `${text.split("\n").map(line => `> ${line}`).join("\n")}\n\n[原文件 · 第 7 页](${pdfSource.href})`;
  expect(expected).toHaveLength(20_000); expect(insert).toHaveBeenCalledWith(expected);
 });
});


describe("retained Note task input on actual nullable selection controller",()=>{
 it("restores title and immutable source without recapturing the editor selection",async()=>{
  const {capture}=await showNote("Original selected text");await click("转为任务");
  await act(async()=>{const node=host.querySelector<HTMLInputElement>('input[name="title"]')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(node,"Draft task title");node.dispatchEvent(new Event("input",{bubbles:true}));});
  await act(async()=>root.render(null));const wrongCapture=vi.fn(async()=>noteHref(9));
  await act(async()=>root.render(<NoteSelectionActions noteId={noteId} selection={null} capture={wrongCapture}/>));
  expect(host.querySelector<HTMLInputElement>('input[name="title"]')!.value).toBe("Draft task title");expect(wrongCapture).not.toHaveBeenCalled();expect(capture).toHaveBeenCalledOnce();expect(mocks.create).not.toHaveBeenCalled();
  await act(async()=>host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  expect((mocks.create.mock.calls[0][1] as FormData).get("body_text")).toBe(`Original selected text\n\n原文：${noteHref(22)}`);
 });
 it("unknown creation reads the same request/payload after route return and keeps later typing",async()=>{
  mocks.create.mockResolvedValue({status:"error",message:"Unknown"});mocks.read.mockResolvedValue({status:"error",message:"Still unknown"});
  await showNote("Original");await click("转为任务");await act(async()=>host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));const original=mocks.create.mock.calls[0][1] as FormData;
  await act(async()=>root.render(null));await act(async()=>root.render(<NoteSelectionActions noteId={noteId} selection={null} capture={vi.fn()}/>));
  await act(async()=>{const node=host.querySelector<HTMLInputElement>('input[name="title"]')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(node,"Later B");node.dispatchEvent(new Event("input",{bubbles:true}));});
  await act(async()=>host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})));
  expect(mocks.create).toHaveBeenCalledOnce();expect(mocks.read).toHaveBeenCalledOnce();expect([...mocks.read.mock.calls[0][0].entries()]).toEqual([...original.entries()]);expect(host.querySelector<HTMLInputElement>('input[name="title"]')!.value).toBe("Later B");
 });
});
