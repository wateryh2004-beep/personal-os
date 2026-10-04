// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNotesSearch } from "@/features/notes/use-notes-search";
import type { NoteListItem } from "@/features/notes/types";
import { clearWorkspaceResources, createWorkspaceResource, reconcileWorkspaceScope } from "@/lib/workspace-resource-cache";
import { loadWorkspaceSession, saveWorkspaceSession } from "@/lib/workspace-session";

const folderA = "00000000-0000-4000-8000-000000000001";
const folderB = "00000000-0000-4000-8000-000000000002";
const note = (title: string): NoteListItem => ({ id: title, title, excerpt: `正文 ${title}`, folder_id: null, updated_at: "2026-10-01T00:00:00Z", pinned_at: null, content_origin: "human" });
const response = (results: NoteListItem[]) => ({ ok: true, status: 200, json: async () => ({ results }) });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
type SearchResult = ReturnType<typeof useNotesSearch>;
let root: Root;
let host: HTMLDivElement;
let renders: SearchResult[];

function Harness({ query = "目标", folderId }: { query?: string; folderId?: string }) {
  const search = useNotesSearch(query, folderId);
  renders.push(search);
  return createElement("div", {},
    createElement("output", { "data-state": search.state }, search.results === null ? "尚无结果" : search.results.map((item) => item.title).join(",") || "已确认空结果"),
    createElement("button", { onClick: search.retry }, "重试"),
  );
}
const renderSearch = async (props: { query?: string; folderId?: string } = {}) => { await act(async () => root.render(createElement(Harness, props))); };
const runSearch = async () => { await act(async () => vi.advanceTimersByTimeAsync(160)); };
const output = () => host.querySelector("output")!;

beforeEach(() => {
  vi.useFakeTimers();
  clearWorkspaceResources();
  sessionStorage.clear();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  renders = [];
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Notes remote search retains owner-scoped results", () => {
  it("debounces a trimmed query and does not search a blank query", async () => {
    const fetcher = vi.fn().mockResolvedValue(response([note("找到的笔记")]));
    vi.stubGlobal("fetch", fetcher);
    await renderSearch({ query: "   " });
    await runSearch();
    expect(fetcher).not.toHaveBeenCalled();
    expect(output().dataset.state).toBe("idle");
    await renderSearch({ query: "  目标  ", folderId: folderA });
    await act(async () => vi.advanceTimersByTimeAsync(159));
    expect(fetcher).not.toHaveBeenCalled();
    expect(output().dataset.state).toBe("loading");
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(fetcher.mock.calls[0][0]).toBe(`/api/notes/search?q=${encodeURIComponent("目标")}&limit=30&folderId=${folderA}`);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ cache: "no-store", credentials: "same-origin" });
    expect(output().textContent).toBe("找到的笔记");
  });

  it("restores cached rows on the first render after document navigation while refreshing", async () => {
    const refresh = deferred<ReturnType<typeof response>>();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response([note("保留的正文匹配")])).mockReturnValueOnce(refresh.promise));
    await renderSearch();
    await runSearch();
    await act(async () => root.render(createElement("p", {}, "文档")));
    renders = [];
    await renderSearch();
    expect(renders[0].results?.map((item) => item.title)).toEqual(["保留的正文匹配"]);
    expect(renders[0].state).toBe("idle");
    await runSearch();
    expect(output().textContent).toBe("保留的正文匹配");
    expect(output().dataset.state).toBe("idle");
    await act(async () => refresh.resolve(response([note("已更新匹配")])));
    expect(output().textContent).toBe("已更新匹配");
  });

  it("retains useful rows on refresh failure and through retry", async () => {
    const retried = deferred<ReturnType<typeof response>>();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response([note("可用结果")])).mockRejectedValueOnce(new Error("offline")).mockReturnValueOnce(retried.promise));
    await renderSearch();
    await runSearch();
    await act(async () => root.render(null));
    await renderSearch();
    await runSearch();
    expect(output().textContent).toBe("可用结果");
    expect(output().dataset.state).toBe("error");
    await act(async () => host.querySelector("button")!.click());
    await runSearch();
    expect(output().textContent).toBe("可用结果");
    expect(output().dataset.state).toBe("idle");
    await act(async () => retried.resolve(response([note("重试成功")])));
    expect(output().textContent).toBe("重试成功");
  });

  it("keeps failed first reads distinct from verified empty results and supports retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(response([])));
    await renderSearch();
    await runSearch();
    expect(output().textContent).toBe("尚无结果");
    expect(output().dataset.state).toBe("error");
    await act(async () => host.querySelector("button")!.click());
    expect(output().dataset.state).toBe("loading");
    await runSearch();
    expect(output().textContent).toBe("已确认空结果");
    expect(output().dataset.state).toBe("idle");
    await act(async () => root.render(null));
    renders = [];
    await renderSearch();
    expect(renders[0]).toMatchObject({ results: [], state: "idle" });
  });

  it("isolates folder and query keys and ignores superseded responses without transport abort", async () => {
    const old = deferred<ReturnType<typeof response>>();
    const newer = deferred<ReturnType<typeof response>>();
    const fetcher = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(newer.promise).mockResolvedValueOnce(response([note("新关键词匹配")]));
    vi.stubGlobal("fetch", fetcher);
    await renderSearch({ folderId: folderA });
    await runSearch();
    await renderSearch({ folderId: folderB });
    await runSearch();
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => newer.resolve(response([note("文件夹 B")])));
    await act(async () => old.resolve(response([note("文件夹 A")])));
    expect(output().textContent).toBe("文件夹 B");
    await renderSearch({ query: "新关键词", folderId: folderB });
    expect(output().textContent).toBe("尚无结果");
    await runSearch();
    expect(output().textContent).toBe("新关键词匹配");
    await renderSearch({ folderId: folderA });
    expect(output().textContent).toBe("尚无结果");
  });

  it("cancels cleared and unmounted searches before a late response can populate the cache", async () => {
    const pending = deferred<ReturnType<typeof response>>();
    const fetcher = vi.fn().mockReturnValue(pending.promise);
    vi.stubGlobal("fetch", fetcher);
    await renderSearch();
    await runSearch();
    await renderSearch({ query: "" });
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => pending.resolve(response([note("已取消结果")])));
    expect(output().dataset.state).toBe("idle");
    expect(output().textContent).toBe("尚无结果");
    await act(async () => root.render(null));
    await renderSearch();
    expect(output().textContent).toBe("尚无结果");
    await act(async () => root.render(null));
    await runSearch();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("bounds the same-tab snapshot cache to eight searches", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async (url: string) => response([note(new URL(url, "http://localhost").searchParams.get("q")!)])));
    for (let index = 0; index < 9; index += 1) {
      await renderSearch({ query: `query-${index}` });
      await runSearch();
    }
    await act(async () => root.render(null));
    await renderSearch({ query: "query-0" });
    expect(output().textContent).toBe("尚无结果");
    await renderSearch({ query: "query-1" });
    expect(output().textContent).toBe("query-1");
    expect(output().dataset.state).toBe("idle");
  });

  it("does not issue a debounced request after its owner's lease has been revoked", async () => {
    reconcileWorkspaceScope("debounce-old-owner", "one");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await renderSearch();
    reconcileWorkspaceScope("debounce-new-owner", "one");
    await runSearch();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("ignores an unmounted request's late authorization failure in the same owner scope", async () => {
    reconcileWorkspaceScope("search-cancel-owner", "one");
    const pending = deferred<{ ok: boolean; status: number }>();
    const fetcher = vi.fn().mockReturnValueOnce(pending.promise);
    vi.stubGlobal("fetch", fetcher);
    const resource = createWorkspaceResource("test:search-cancel-auth", async () => "fresh", 1000);
    resource.set("still-authorized");
    const authFailed = vi.fn();
    window.addEventListener("personal-os:workspace-auth-failed", authFailed);
    await renderSearch();
    await runSearch();
    await act(async () => root.render(null));
    expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => pending.resolve({ ok: false, status: 401 }));
    expect(resource.get().data).toBe("still-authorized");
    expect(authFailed).not.toHaveBeenCalled();
    window.removeEventListener("personal-os:workspace-auth-failed", authFailed);
  });

  it("hides old-owner mounted and cached rows synchronously before effects can run", async () => {
    reconcileWorkspaceScope("search-owner-a", "one");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response([note("A 的私有结果")])));
    await renderSearch();
    await runSearch();
    reconcileWorkspaceScope("search-owner-b", "one");
    renders = [];
    await renderSearch();
    expect(renders[0]).toMatchObject({ results: null, state: "loading" });
    await act(async () => root.render(null));
    renders = [];
    await renderSearch();
    expect(renders[0]).toMatchObject({ results: null, state: "loading" });
  });

  it.each([401, 403])("clears private results, resources, and drafts for a current HTTP %s", async (status) => {
    reconcileWorkspaceScope("search-auth-owner", "one");
    const resource = createWorkspaceResource(`test:search-auth-${status}`, async () => "fresh", 1000);
    resource.set("private");
    saveWorkspaceSession("search-draft", "private draft");
    const authFailed = vi.fn();
    window.addEventListener("personal-os:workspace-auth-failed", authFailed);
    const json = vi.fn();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(response([note("缓存结果")])).mockResolvedValueOnce({ status, ok: false, json }));
    await renderSearch();
    await runSearch();
    await act(async () => root.render(null));
    await renderSearch();
    await runSearch();
    expect(resource.get().data).toBeUndefined();
    expect(loadWorkspaceSession("search-draft")).toBeNull();
    expect(authFailed).toHaveBeenCalledOnce();
    expect(json).not.toHaveBeenCalled();
    expect(output().textContent).not.toContain("缓存结果");
    await act(async () => root.render(null));
    await renderSearch();
    expect(output().textContent).toBe("尚无结果");
    window.removeEventListener("personal-os:workspace-auth-failed", authFailed);
  });

  it.each([200, 401])("rejects an old owner's late HTTP %s without evicting the new owner's data", async (status) => {
    reconcileWorkspaceScope("search-old-owner", "one");
    const pending = deferred<ReturnType<typeof response> | { ok: boolean; status: number }>();
    const fetcher = vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce(response([note("新用户结果")]));
    vi.stubGlobal("fetch", fetcher);
    await renderSearch();
    await runSearch();
    reconcileWorkspaceScope("search-new-owner", "one");
    const resource = createWorkspaceResource(`test:search-new-owner-${status}`, async () => "fresh", 1000);
    resource.set("new-owner-data");
    saveWorkspaceSession("new-search-draft", "new draft");
    const authFailed = vi.fn();
    window.addEventListener("personal-os:workspace-auth-failed", authFailed);
    await act(async () => pending.resolve(status === 200 ? response([note("过期私有结果")]) : { ok: false, status }));
    expect(resource.get().data).toBe("new-owner-data");
    expect(loadWorkspaceSession("new-search-draft")).toBe("new draft");
    expect(authFailed).not.toHaveBeenCalled();
    await act(async () => root.render(null));
    await renderSearch();
    expect(output().textContent).toBe("尚无结果");
    await runSearch();
    expect(output().textContent).toBe("新用户结果");
    window.removeEventListener("personal-os:workspace-auth-failed", authFailed);
  });
});
