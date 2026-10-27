// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TodayWorkspaceLoader } from "@/components/today/today-workspace-loader";
import { NotesWorkspaceLoader } from "@/components/notes/notes-workspace-loader";
import { clearWorkspaceResources } from "@/lib/workspace-resource-cache";
import { planningDaySchema, type PlanningDay } from "@/features/planning/contracts";

const state = vi.hoisted(() => ({ snapshot: {} as { data?: unknown; error?: Error }, revalidate: vi.fn() }));
// Keep real owner epochs/cleanup and HTTP parsing: Today mounts DayCapacity,
// whose lifecycle must not be replaced by the workspace snapshot test double.
vi.mock("@/lib/workspace-resource-cache", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/workspace-resource-cache")>(),
  useWorkspaceResource: () => state.snapshot,
}));
vi.mock("@/features/planning/actions", () => ({ readAvailability: vi.fn(), readTaskPlanning: vi.fn(), saveAvailability: vi.fn(), saveTaskPlanning: vi.fn() }));
vi.mock("@/features/today/workspace-resource", () => ({ todayWorkspaceResource: { revalidate: state.revalidate } }));
vi.mock("@/features/notes/workspace-resource", () => ({ notesWorkspaceResource: { revalidate: state.revalidate } }));
vi.mock("next/navigation", () => ({ usePathname: () => "/notes", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/today/now-workspace", () => ({ NowWorkspaceView: () => createElement("input", { "aria-label": "今日输入", defaultValue: "原内容" }) }));
vi.mock("@/components/notes/notes-workspace", () => ({ NotesWorkspace: () => createElement("input", { "aria-label": "笔记输入", defaultValue: "原内容" }) }));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const planningDay = (date: string): PlanningDay => planningDaySchema.parse({
  date, timezone: "Asia/Shanghai", availability: { revision: 1, timezone: "Asia/Shanghai", periods: [{ start: "09:00", end: "10:00" }] },
  plans: [], tasks: [], events: [], calendarComplete: true, truncated: false, lastSyncAt: null,
});
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  clearWorkspaceResources();
  state.snapshot = { data: { folders: [], notes: [], timezone: "Asia/Shanghai" } };
  state.revalidate.mockReset();
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    const url = new URL(input, "https://synthetic.invalid");
    expect(url.pathname).toBe("/api/planning/day");
    return new Response(JSON.stringify(planningDay(url.searchParams.get("date")!)), { status: 200 });
  }));
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); clearWorkspaceResources(); vi.unstubAllGlobals(); });

describe("cached workspace synchronization", () => {
  it.each(["today", "notes"])("retains %s content through a failed refresh, retry and recovery", async (workspace) => {
    const view = workspace === "today" ? createElement(TodayWorkspaceLoader) : createElement(NotesWorkspaceLoader, { initialView: "all", dailyError: false });
    await act(async () => root.render(view));
    const input = host.querySelector("input")!;
    input.value = "尚未保存的输入";
    input.focus();
    if (workspace === "today") {
      expect(host.querySelector('[aria-label="时间容量"]')?.textContent).toContain("60 分钟");
      expect(fetch).toHaveBeenCalledTimes(1);
    }
    state.snapshot = { ...state.snapshot, error: new Error("offline") };
    await act(async () => root.render(workspace === "today" ? createElement(TodayWorkspaceLoader) : createElement(NotesWorkspaceLoader, { initialView: "all", dailyError: false })));
    expect(host.textContent).toContain("当前显示上次读取的内容");
    expect(host.querySelector("input")).toBe(input);
    expect(input.value).toBe("尚未保存的输入");
    expect(document.activeElement).toBe(input);
    let finish!: () => void;
    state.revalidate.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    const retry = [...host.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "重新同步")!;
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
    expect(document.activeElement).toBe(input);
    if (workspace === "today") expect(fetch).toHaveBeenCalledTimes(1);
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
