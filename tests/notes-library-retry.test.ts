// @vitest-environment jsdom
import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotesWorkspace } from "@/components/notes/notes-workspace";
import { moveNote } from "@/features/notes/actions";

const mocks = vi.hoisted(() => ({
  show: vi.fn(),
  revalidate: vi.fn().mockResolvedValue(undefined),
  invalidate: vi.fn(),
}));
vi.mock("next/link", () => ({ default: (props: Record<string, unknown>) => createElement("a", props) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  unstable_rethrow: () => {},
}));
vi.mock("@/components/shared/action-feedback", () => ({ useActionFeedback: () => ({ show: mocks.show }) }));
vi.mock("@/components/shared/use-workspace-scroll-restoration", () => ({ useWorkspaceScrollRestoration: () => null }));
vi.mock("@/features/notes/workspace-resource", () => ({ notesWorkspaceResource: { revalidate: mocks.revalidate, invalidate: mocks.invalidate } }));
vi.mock("@/features/notes/actions", () => ({
  createNoteInFolder: vi.fn(), moveNote: vi.fn(), renameNote: vi.fn(), toggleNotePinned: vi.fn(), trashNote: vi.fn(),
}));
// Keep menu actions accessible without testing Radix's separately-owned portal.
vi.mock("@/components/ui/dropdown-menu", () => {
  const passThrough = ({ children }: { children: ReactNode }) => children;
  return {
    DropdownMenu: passThrough, DropdownMenuContent: passThrough, DropdownMenuTrigger: passThrough,
    DropdownMenuSeparator: () => null,
    DropdownMenuItem: ({ children, onSelect }: { children: ReactNode; onSelect: () => void }) => createElement("button", { type: "button", onClick: onSelect }, children),
  };
});

const note = { id: "00000000-0000-4000-8000-000000000001", title: "已有笔记", excerpt: null, updated_at: "2026-10-01T08:00:00Z", pinned_at: null, folder_id: null, content_origin: "human" };
let root: Root;
let container: HTMLDivElement;
const button = (label: string) => [...container.querySelectorAll("button")].find((item) => item.textContent === label)!;
const renderWorkspace = () => root.render(createElement(NotesWorkspace, { notes: [note], folders: [{ id: "folder", name: "研究", parent_id: null }], timezone: "UTC", state: "ready", selectedFolder: null, initialView: "all", dailyError: false, initialHasMore: true }));

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  vi.clearAllMocks();
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("Notes library retry flows", () => {
  it("retains current notes after pagination failure and retries the same offset", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ ok: true, json: async () => ({ notes: [{ ...note, id: "00000000-0000-4000-8000-000000000002", title: "另一篇笔记" }], hasMore: false }) });
    vi.stubGlobal("fetch", fetcher);
    await act(async () => renderWorkspace());
    await act(async () => button("加载更多").click());
    expect(container.textContent).toContain("加载失败，已显示的笔记仍保留");
    expect(container.textContent).toContain("已有笔记");
    await act(async () => button("重试加载更多").click());
    expect(fetcher.mock.calls.map(([href]) => href)).toEqual(["/api/notes/list?offset=1&limit=50", "/api/notes/list?offset=1&limit=50"]);
    expect(container.textContent).toContain("另一篇笔记");
    expect(container.textContent).not.toContain("加载失败");
  });

  it("keeps the selected folder open on failed move and only closes after acknowledged save", async () => {
    vi.mocked(moveNote).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    await act(async () => renderWorkspace());
    await act(async () => button("移动到…").click());
    const select = document.body.querySelector("select")!;
    await act(async () => { select.value = "folder"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    await act(async () => select.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(document.body.textContent).toContain("操作未能确认");
    expect(document.body.querySelector("select")?.value).toBe("folder");
    expect(mocks.show).not.toHaveBeenCalled();
    await act(async () => select.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(vi.mocked(moveNote).mock.calls[1][0].get("folder_id")).toBe("folder");
    expect(document.body.querySelector("select")).toBeNull();
    expect(mocks.show).toHaveBeenCalledWith({ message: "笔记位置已更新", tone: "success" });
  });
});
