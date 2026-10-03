// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TodayWorkspaceLoader } from "@/components/today/today-workspace-loader";
import { NotesWorkspaceLoader } from "@/components/notes/notes-workspace-loader";

const state = vi.hoisted(() => ({ snapshot: {} as { data?: unknown; error?: Error }, revalidate: vi.fn() }));
vi.mock("@/lib/workspace-resource-cache", () => ({ useWorkspaceResource: () => state.snapshot }));
vi.mock("@/features/today/workspace-resource", () => ({ todayWorkspaceResource: { revalidate: state.revalidate } }));
vi.mock("@/features/notes/workspace-resource", () => ({ notesWorkspaceResource: { revalidate: state.revalidate } }));
vi.mock("next/navigation", () => ({ usePathname: () => "/notes", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/today/now-workspace", () => ({ NowWorkspaceView: () => createElement("input", { "aria-label": "今日输入", defaultValue: "原内容" }) }));
vi.mock("@/components/notes/notes-workspace", () => ({ NotesWorkspace: () => createElement("input", { "aria-label": "笔记输入", defaultValue: "原内容" }) }));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  state.snapshot = { data: { folders: [], notes: [] } };
  state.revalidate.mockReset();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

describe("cached workspace synchronization", () => {
  it.each(["today", "notes"])("retains %s content through a failed refresh, retry and recovery", async (workspace) => {
    const view = workspace === "today" ? createElement(TodayWorkspaceLoader) : createElement(NotesWorkspaceLoader, { initialView: "all", dailyError: false });
    await act(async () => root.render(view));
    const input = host.querySelector("input")!;
    input.value = "尚未保存的输入";
    state.snapshot = { ...state.snapshot, error: new Error("offline") };
    await act(async () => root.render(workspace === "today" ? createElement(TodayWorkspaceLoader) : createElement(NotesWorkspaceLoader, { initialView: "all", dailyError: false })));
    expect(host.textContent).toContain("当前显示上次读取的内容");
    expect(host.querySelector("input")).toBe(input);
    expect(input.value).toBe("尚未保存的输入");
    let finish!: () => void;
    state.revalidate.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    const retry = host.querySelector<HTMLButtonElement>("button")!;
    await act(async () => { retry.click(); retry.click(); });
    expect(state.revalidate).toHaveBeenCalledTimes(1);
    expect(state.revalidate).toHaveBeenCalledWith({ force: true });
    expect(retry.disabled).toBe(true);
    await act(async () => finish());
    expect(host.textContent).toContain("当前显示上次读取的内容");
    state.snapshot = { data: state.snapshot.data };
    await act(async () => root.render(workspace === "today" ? createElement(TodayWorkspaceLoader) : createElement(NotesWorkspaceLoader, { initialView: "all", dailyError: false })));
    expect(host.textContent).not.toContain("暂未同步");
    expect(host.querySelector("input")).toBe(input);
    expect(input.value).toBe("尚未保存的输入");
  });

  it("shows a recoverable read error when there is no cached content", async () => {
    state.snapshot = { error: new Error("offline") };
    await act(async () => root.render(createElement(TodayWorkspaceLoader)));
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("工作区暂时无法读取");
    expect(host.querySelector("input")).toBeNull();
    let fail!: (error: Error) => void;
    state.revalidate.mockImplementation(() => new Promise<void>((_, reject) => { fail = reject; }));
    const retry = host.querySelector<HTMLButtonElement>("button")!;
    await act(async () => { retry.click(); retry.click(); });
    expect(state.revalidate).toHaveBeenCalledTimes(1);
    expect(retry.disabled).toBe(true);
    await act(async () => fail(new Error("still offline")));
    expect(retry.disabled).toBe(false);
    expect(retry.textContent).toBe("重新读取");
  });
});
