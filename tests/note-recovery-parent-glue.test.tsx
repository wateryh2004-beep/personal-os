// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const boundary = vi.hoisted(() => ({ save: vi.fn(), capture: vi.fn(), move: vi.fn(), visibility: vi.fn(), task: vi.fn(), taskRead: vi.fn() }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/navigation", () => ({ usePathname: () => "/notes/11111111-1111-4111-8111-111111111111", unstable_rethrow: () => {} }));
vi.mock("@/features/notes/actions", () => ({ saveNote: boundary.save, moveNote: boundary.move, setNoteAiVisibility: boundary.visibility, renameNote: vi.fn(), recordNotePdfExport: vi.fn(), setNoteContentOrigin: vi.fn() }));
vi.mock("@/features/notes/source-actions", () => ({ captureNoteSource: boundary.capture }));
vi.mock("@/features/notes/workspace-resource", () => ({ notesWorkspaceResource: { mutate: vi.fn(), invalidate: vi.fn() } }));
vi.mock("@/features/tasks/microsoft-todo", () => ({ createMicrosoftTodoTaskAction: boundary.task, readMicrosoftTodoCreationAction: boundary.taskRead }));
vi.mock("@/components/shared/action-feedback", () => ({ useActionFeedback: () => ({ show: vi.fn() }) }));
vi.mock("@/components/notes/notes-motion", () => ({ NoteTitleMotion: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
import { NoteEditor } from "@/components/notes/note-editor";
import { NoteMoveForm, NoteVisibilityForm } from "@/components/notes/note-metadata-forms";
import { NoteSelectionActions } from "@/components/notes/note-selection-actions";
import { WorkspacePanelProvider, useWorkspacePanel } from "@/components/layout/workspace-panel-provider";
import { requestDraftResume, getDraftResumeStatus } from "@/features/workflow-continuity/draft-resume";
import { sourceLocatorHref } from "@/features/links/source-locator";
import { clearWorkspaceResources } from "@/lib/workspace-resource-cache";
const noteId = "11111111-1111-4111-8111-111111111111", folderId = "22222222-2222-4222-8222-222222222222", versionId = "33333333-3333-4333-8333-333333333333";
const note = { id: noteId, title: "Current title", body_markdown: "A newer current body", revision: 5, last_saved_at: null };
let host: HTMLDivElement, root: ReturnType<typeof createRoot>;
const scroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); clearWorkspaceResources(); sessionStorage.clear(); vi.clearAllMocks(); Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() }); vi.stubGlobal("fetch", vi.fn(async () => Response.json({ lists: [{ id: folderId, displayName: "Synthetic list" }], unavailable: false }))); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); clearWorkspaceResources(); vi.unstubAllGlobals(); vi.restoreAllMocks(); if (scroll) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", scroll); else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView; });
function DetailPanel() { const panel = useWorkspacePanel(`note-inspector:${noteId}`); return panel.isOpen ? <section data-actual-inspector={noteId}><button onClick={panel.close}>Close details</button><NoteMoveForm noteId={noteId} revision={5} initialFolderId={null} folders={[{ id: folderId, name: "Synthetic folder", parent_id: null }]}/><NoteVisibilityForm noteId={noteId} visibility="normal"/></section> : null; }
function Parent() { return <WorkspacePanelProvider><NoteEditor note={note} noteAiDefaultModel="deepseek-v4-flash"/><NoteEditor note={note} noteAiDefaultModel="deepseek-v4-flash" insertionRole="reference"/><DetailPanel/></WorkspacePanelProvider>; }
async function mount() { await act(async () => root.render(<Parent/>)); }
async function resume(kind: "note.move" | "note.visibility" | "note.selection-task") { await act(async () => { await requestDraftResume({ kind, id: noteId, ...(kind === "note.selection-task" ? { parentId: noteId } : {}) }); }); await act(async () => new Promise(resolve => setTimeout(resolve, 60))); }
it.each(["note.move", "note.visibility"] as const)("opens the actual metadata panel for %s once, restores its raw field, and does not mount a second reference form", async kind => {
  const focus = vi.spyOn(HTMLElement.prototype, "focus");
  await mount(); expect(host.querySelector("[data-actual-inspector]")).toBeNull();
  await resume(kind); expect(getDraftResumeStatus().status).toBe("accepted");
  const selector = kind === "note.move" ? '[name="folder_id"]' : '[name="ai_visibility"]';
  const value = kind === "note.move" ? folderId : "never";
  expect(host.querySelectorAll(selector)).toHaveLength(1); expect(document.activeElement).toBe(host.querySelector(selector));
  expect(focus.mock.contexts.filter(element => element === host.querySelector(selector))).toHaveLength(1);
  await act(async () => { const select = host.querySelector<HTMLSelectElement>(selector)!; select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === "Close details")!.click());
  expect(host.querySelector(selector)).toBeNull(); await resume(kind);
  expect(host.querySelector<HTMLSelectElement>(selector)!.value).toBe(value); expect(document.activeElement).toBe(host.querySelector(selector));
  expect(boundary.move).not.toHaveBeenCalled(); expect(boundary.visibility).not.toHaveBeenCalled(); expect(boundary.capture).not.toHaveBeenCalled();
});
it("restores the original selected-source task in the actual no-selection editor without capture, resend, or a duplicate reference consumer", async () => {
  const original = "Original selected source";
  const href = sourceLocatorHref({ kind: "note", noteId, versionId, revision: 2, from: 0, to: original.length, hash: "a".repeat(64) });
  const capture = vi.fn(async () => href);
  await act(async () => root.render(<NoteSelectionActions noteId={noteId} selection={{ text: original, rect: { left: 0, top: 0 }, replace: () => false, insertBelow: () => false }} capture={capture}/>));
  await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === "转为任务")!.click());
  const title = host.querySelector<HTMLInputElement>('[name="title"]')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(title, "Edited raw task title"); title.dispatchEvent(new Event("input", { bubbles: true })); });
  const before = capture.mock.calls.length; await act(async () => root.render(null)); await mount(); await act(async () => new Promise(resolve => setTimeout(resolve, 30))); await resume("note.selection-task");
  expect(getDraftResumeStatus().status).toBe("accepted"); expect(host.querySelectorAll('[name="todo_list_id"]')).toHaveLength(1); expect(host.querySelector<HTMLInputElement>('[name="title"]')!.value).toBe("Edited raw task title");
  expect(capture).toHaveBeenCalledTimes(before); expect(boundary.capture).not.toHaveBeenCalled(); expect(boundary.task).not.toHaveBeenCalled(); expect(boundary.taskRead).not.toHaveBeenCalled();
  boundary.task.mockResolvedValue({ status: "success", message: "Synthetic confirmation saved" });
  await act(async () => host.querySelector<HTMLFormElement>(`[data-workflow-draft-key="note.selection-task:${noteId}:${noteId}"]`)!.requestSubmit());
  const submitted = boundary.task.mock.calls[0][1] as FormData;
  expect(submitted.get("body_text")).toContain(original); expect(submitted.get("body_text")).toContain(href); expect(submitted.get("body_text")).not.toContain(note.body_markdown);
  expect(submitted.get("title")).toBe("Edited raw task title"); expect(boundary.task).toHaveBeenCalledTimes(1);
});
