// @vitest-environment jsdom
import { act, createElement, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { EditorView } from "@codemirror/view";
import type { EditorPosition, NoteContinuity } from "@/features/notes/editor/continuity";
const f = vi.hoisted(() => ({ position: undefined as NoteContinuity | undefined, current: undefined as EditorPosition | undefined, epoch: 0, completions: [] as { done: () => void; current: () => boolean; target: EditorPosition }[] }));
vi.mock("@/features/notes/document-resource", () => ({ noteDocumentCache: {
  position: () => f.position,
  remember: vi.fn((_id, position) => { f.position = { ...position }; }),
} }));
vi.mock("@/lib/workspace-resource-cache", () => ({ captureWorkspaceScope: () => { const epoch = f.epoch; return () => epoch === f.epoch; } }));
vi.mock("@/features/notes/editor/continuity", () => ({
  captureEditorPosition: () => f.current,
  captureReadingAnchor: () => ({ line: 1, offset: 0 }), restoreReadingAnchor: vi.fn(),
  restoreEditorPosition: (_view: unknown, target: EditorPosition, done: () => void, current: () => boolean) => { f.completions.push({ done, current, target }); },
}));
import { useNoteContinuity } from "@/components/notes/use-note-continuity";
let root: Root, host: HTMLDivElement, api: ReturnType<typeof useNoteContinuity>;
const intended: EditorPosition = { anchor: 40000, head: 40000, viewport: { line: 719, offset: 71 }, scrollLeft: 0 };
function Harness() { const value = useNoteContinuity("one"); useLayoutEffect(() => { api = value; }); return null; }
async function mount() { host = document.createElement("div"); document.body.append(host); root = createRoot(host); await act(async () => root.render(createElement(Harness))); }
function view() { Object.defineProperty(host, "clientHeight", { configurable: true, value: 400 }); return { dom: host, scrollDOM: host } as unknown as EditorView; }
beforeEach(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; f.position = { reading: false, editor: intended }; f.current = { ...intended, viewport: { line: 524, offset: 0 } }; f.completions = []; f.epoch = 0; });
afterEach(async () => { await act(async () => root?.unmount()); host?.remove(); delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT; });

it("does not replace an intended position with intermediate geometry when rapidly unmounted", async () => {
  await mount(); await act(async () => api.onEditorReady(view()));
  await act(async () => api.rememberPosition(f.current!));
  expect(f.position?.editor?.viewport.line).toBe(719);
  const first = f.completions[0];
  await act(async () => root.unmount()); host.remove();
  expect(first.current()).toBe(false);
  await mount(); await act(async () => api.onEditorReady(view()));
  expect(f.completions[1].target.viewport.line).toBe(719);
  await act(async () => first.done());
  expect(f.position?.editor?.viewport.line).toBe(719);
  f.current = intended; await act(async () => f.completions[1].done());
  expect(f.position?.editor).toEqual(intended);
});

it("cancels an old restoration when reading interrupts it and resumes the intended paragraph", async () => {
  await mount(); const editor = view(); await act(async () => api.onEditorReady(editor));
  const old = f.completions[0];
  await act(async () => api.switchReading(true));
  expect(old.current()).toBe(false);
  await act(async () => api.switchReading(false));
  expect(f.completions.at(-1)?.target.viewport.line).toBe(719);
  await act(async () => old.done());
  expect(f.position?.editor?.viewport.line).toBe(719);
});

it("rejects a restored position after its owner scope has been cleared", async () => {
  await mount(); await act(async () => api.onEditorReady(view()));
  const pending = f.completions[0]; f.epoch += 1; f.position = undefined;
  expect(pending.current()).toBe(false);
  await act(async () => pending.done());
  expect(f.position).toBeUndefined();
});
