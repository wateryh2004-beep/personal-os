// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNotesListing } from "@/features/notes/use-notes-listing";
import type { NoteListItem } from "@/features/notes/types";
import { clearWorkspaceResources, createWorkspaceResource, reconcileWorkspaceScope } from "@/lib/workspace-resource-cache";
import { loadWorkspaceSession, saveWorkspaceSession } from "@/lib/workspace-session";

const folderA = "00000000-0000-4000-8000-000000000001";
const folderB = "00000000-0000-4000-8000-000000000002";
const note = (index: number, folder_id: string | null = null): NoteListItem => ({ id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`, title: `笔记 ${index}`, folder_id, updated_at: "2026-10-01T00:00:00Z", pinned_at: null, content_origin: "human", excerpt: null });
const firstHundred = Array.from({ length: 100 }, (_, index) => note(index));
const response = (notes: NoteListItem[], hasMore = false) => ({ ok: true, json: async () => ({ notes, hasMore }) });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
let root: Root;
let host: HTMLDivElement;

function Harness({ folderId, view = "all", source = firstHundred }: { folderId?: string; view?: "all" | "favorites" | "recent"; source?: NoteListItem[] }) {
  const listing = useNotesListing({ notes: source, hasMore: true, folderId, view });
  return createElement("div", {},
    createElement("output", {}, !listing.loaded ? listing.error ? "读取失败" : "读取中" : listing.notes.length ? listing.notes.map((item) => item.title).join(",") : "已确认空列表"),
    createElement("button", { onClick: () => void listing.loadMore(), disabled: listing.loadingMore }, "更多"),
    createElement("button", { onClick: listing.retry }, "重试"),
  );
}

beforeEach(() => { clearWorkspaceResources(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); });

describe("Notes lists query the selected range before confirming emptiness", () => {
  it("finds a folder whose only note is beyond the global first 100, without a false empty state", async () => {
    const pending = deferred<ReturnType<typeof response>>();
    const fetcher = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(createElement(Harness, { folderId: folderA })));
    expect(host.textContent).toContain("读取中");
    expect(host.textContent).not.toContain("已确认空列表");
    expect(fetcher.mock.calls[0][0]).toBe(`/api/notes/list?offset=0&limit=50&folderId=${folderA}`);
    await act(async () => pending.resolve(response([note(150, folderA)])));
    expect(host.querySelector("output")?.textContent).toBe("笔记 150");
  });

  it("ignores an old folder response even when transport does not honor abort", async () => {
    const first = deferred<ReturnType<typeof response>>();
    const second = deferred<ReturnType<typeof response>>();
    const fetcher = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(createElement(Harness, { folderId: folderA })));
    await act(async () => root.render(createElement(Harness, { folderId: folderB })));
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => second.resolve(response([note(160, folderB)])));
    await act(async () => first.resolve(response([note(150, folderA)])));
    expect(host.querySelector("output")?.textContent).toBe("笔记 160");
  });

  it("paginates favorites inside the same range and retains rows after a failed next page", async () => {
    const favorites = Array.from({ length: 50 }, (_, index) => ({ ...note(index + 200), pinned_at: "2026-10-01T00:00:00Z" }));
    const fetcher = vi.fn().mockResolvedValueOnce(response(favorites, true)).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(response([note(250)]));
    vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(createElement(Harness, { view: "favorites" })));
    await act(async () => (host.querySelector("button") as HTMLButtonElement).click());
    expect(host.textContent).toContain("笔记 249");
    await act(async () => (host.querySelector("button") as HTMLButtonElement).click());
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(["/api/notes/list?offset=0&limit=50&view=favorites", "/api/notes/list?offset=50&limit=50&view=favorites", "/api/notes/list?offset=50&limit=50&view=favorites"]);
    expect(host.textContent).toContain("笔记 250");
  });

  it("distinguishes unreadable from empty and retries a failed range", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(response([])));
    await act(async () => root.render(createElement(Harness, { folderId: folderA })));
    expect(host.textContent).toContain("读取失败");
    expect(host.textContent).not.toContain("已确认空列表");
    await act(async () => (host.querySelectorAll("button")[1] as HTMLButtonElement).click());
    expect(host.textContent).toContain("已确认空列表");
  });

  it("evicts private cache and drafts only for a current unauthorized read", async () => {
    reconcileWorkspaceScope("listing-owner", "one");
    const cache = createWorkspaceResource("test:list-auth", async () => "fresh", 1000);
    cache.set("private");
    saveWorkspaceSession("test-listing-draft", "draft");
    const authFailed = vi.fn();
    window.addEventListener("personal-os:workspace-auth-failed", authFailed);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ status: 401, ok: false }));
    await act(async () => root.render(createElement(Harness, { folderId: folderA })));
    expect(cache.get().data).toBeUndefined();
    expect(loadWorkspaceSession("test-listing-draft")).toBeNull();
    expect(authFailed).toHaveBeenCalledOnce();
    window.removeEventListener("personal-os:workspace-auth-failed", authFailed);
  });

  it("does not let a previous owner's rejected read evict a new owner's cache", async () => {
    reconcileWorkspaceScope("old-listing-owner", "one");
    const pending = deferred<{ status: number; ok: boolean }>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending.promise));
    await act(async () => root.render(createElement(Harness, { folderId: folderA })));
    reconcileWorkspaceScope("new-listing-owner", "one");
    const cache = createWorkspaceResource("test:list-new-owner", async () => "new", 1000);
    cache.set("new-owner-data");
    await act(async () => pending.resolve({ status: 401, ok: false }));
    expect(cache.get().data).toBe("new-owner-data");
  });

  it("keeps all displayed scoped rows during a workspace refresh and on refresh failure", async () => {
    const firstPage = Array.from({ length: 50 }, (_, index) => note(index + 200, folderA));
    const nextPage = Array.from({ length: 50 }, (_, index) => note(index + 250, folderA));
    const refresh = deferred<ReturnType<typeof response>>();
    const fetcher = vi.fn().mockResolvedValueOnce(response(firstPage, true)).mockResolvedValueOnce(response(nextPage, true)).mockReturnValueOnce(refresh.promise).mockRejectedValueOnce(new Error("offline"));
    vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(createElement(Harness, { folderId: folderA })));
    await act(async () => (host.querySelector("button") as HTMLButtonElement).click());
    await act(async () => root.render(createElement(Harness, { folderId: folderA, source: [...firstHundred] })));
    expect(host.textContent).toContain("笔记 299");
    expect(fetcher.mock.calls[2][0]).toContain("limit=100");
    await act(async () => refresh.resolve(response([...firstPage, ...nextPage], true)));
    await act(async () => root.render(createElement(Harness, { folderId: folderA, source: [...firstHundred] })));
    expect(host.textContent).toContain("笔记 200");
    expect(host.textContent).toContain("笔记 299");
    expect(host.textContent).not.toContain("已确认空列表");
  });

  it("restores the same range's metadata immediately on return while refreshing", async () => {
    const refresh = deferred<ReturnType<typeof response>>();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response([note(150, folderA)])).mockReturnValueOnce(refresh.promise));
    await act(async () => root.render(createElement(Harness, { folderId: folderA })));
    await act(async () => root.render(createElement(Harness, {})));
    await act(async () => root.render(createElement(Harness, { folderId: folderA })));
    expect(host.querySelector("output")?.textContent).toBe("笔记 150");
    await act(async () => refresh.resolve(response([note(150, folderA)])));
  });

  it("retains loaded global pages during a background source refresh and reconciles their tail", async () => {
    const tail = Array.from({ length: 50 }, (_, index) => note(index + 100));
    const pending = deferred<ReturnType<typeof response>>();
    const fetcher = vi.fn().mockResolvedValueOnce(response(tail, true)).mockReturnValueOnce(pending.promise);
    vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(createElement(Harness, {})));
    await act(async () => (host.querySelector("button") as HTMLButtonElement).click());
    expect(host.textContent).toContain("笔记 149");
    const refreshedSource = firstHundred.map((row, index) => index === 0 ? { ...row, title: "已更新标题" } : row);
    await act(async () => root.render(createElement(Harness, { source: refreshedSource })));
    expect(host.textContent).toContain("笔记 149");
    expect(fetcher.mock.calls[1][0]).toBe("/api/notes/list?offset=100&limit=50");
    await act(async () => pending.resolve(response(tail, true)));
    expect(host.textContent).toContain("已更新标题");
    expect(host.textContent).toContain("笔记 149");
  });

  it("retries a failed global refresh even when the workspace source reference has not changed", async () => {
    const tail = Array.from({ length: 50 }, (_, index) => note(index + 100));
    const fetcher = vi.fn().mockResolvedValueOnce(response(tail, true)).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(response(tail, true));
    vi.stubGlobal("fetch", fetcher);
    await act(async () => root.render(createElement(Harness, {})));
    await act(async () => (host.querySelector("button") as HTMLButtonElement).click());
    const source = firstHundred.map((row, index) => index === 0 ? { ...row, title: "重新核对后的标题" } : row);
    await act(async () => root.render(createElement(Harness, { source })));
    expect(host.textContent).toContain("笔记 149");
    await act(async () => (host.querySelectorAll("button")[1] as HTMLButtonElement).click());
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(host.textContent).toContain("重新核对后的标题");
    expect(host.textContent).toContain("笔记 149");
  });
});
