// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ refresh: vi.fn(), taskInvalidate: vi.fn(), calendarInvalidate: vi.fn(), todayInvalidate: vi.fn(), ranges: vi.fn(), taskRead: vi.fn(), calendarRead: vi.fn(), todayRead: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/features/tasks/workspace-resource", () => ({ tasksWorkspaceResource: { invalidate: mocks.taskInvalidate, revalidate: mocks.taskRead } }));
vi.mock("@/features/calendar/workspace-resource", () => ({ calendarWorkspaceResource: { invalidate: mocks.calendarInvalidate, revalidate: mocks.calendarRead }, invalidateCalendarRangeResources: mocks.ranges }));
vi.mock("@/features/today/workspace-resource", () => ({ todayWorkspaceResource: { invalidate: mocks.todayInvalidate, revalidate: mocks.todayRead } }));
import { MicrosoftDeviceConnect } from "@/components/calendar/microsoft-device-connect";
import { clearWorkspaceResources } from "@/lib/workspace-resource-cache";
let host: HTMLDivElement; let root: ReturnType<typeof createRoot>;
const authorization = { userCode: "SYNTHETIC", verificationUri: "https://microsoft.com/devicelogin", expiresIn: 900 };
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); clearWorkspaceResources(); vi.clearAllMocks();
  mocks.taskRead.mockResolvedValue({}); mocks.calendarRead.mockResolvedValue({}); mocks.todayRead.mockResolvedValue({});
  vi.spyOn(window, "open").mockImplementation(() => null);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); clearWorkspaceResources(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const button = (text: string) => [...host.querySelectorAll("button")].find(node => node.textContent?.includes(text))!;
async function mount() { await act(async () => root.render(createElement("div", null, createElement("input", { "aria-label": "未完成任务", defaultValue: "正在编辑的合成内容" }), createElement(MicrosoftDeviceConnect, { reconnect: true })))); }
describe("in-place Microsoft connection recovery", () => {
  it("refreshes real resources after connected while preserving the live input and focus", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json(authorization)).mockResolvedValueOnce(Response.json({ status: "connected" })));
    await mount();
    const input = host.querySelector("input")!; input.focus(); input.setSelectionRange(2, 5);
    await act(async () => button("重新授权 Outlook").click());
    expect(window.open).toHaveBeenCalledWith(authorization.verificationUri, "_blank", "noopener,noreferrer");
    await act(async () => button("检查连接").click());
    expect(host.querySelector("input")).toBe(input); expect(input.value).toBe("正在编辑的合成内容");
    expect(input.selectionStart).toBe(2); expect(input.selectionEnd).toBe(5); expect(document.activeElement).toBe(input);
    expect(mocks.taskInvalidate).toHaveBeenCalledTimes(1); expect(mocks.calendarInvalidate).toHaveBeenCalledTimes(1); expect(mocks.todayInvalidate).toHaveBeenCalledTimes(1); expect(mocks.ranges).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).toHaveBeenCalledTimes(1); expect(host.textContent).toContain("同步状态为准");
  });
  it("does not treat pending as connected and ignores a completion from the previous scope", async () => {
    let finish!: (response: Response) => void;
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(authorization)).mockResolvedValueOnce(Response.json({ status: "pending" }, { status: 202 })).mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
    vi.stubGlobal("fetch", fetcher); await mount();
    await act(async () => button("重新授权 Outlook").click()); await act(async () => button("检查连接").click());
    expect(host.textContent).toContain("还未确认授权"); expect(mocks.refresh).not.toHaveBeenCalled();
    await act(async () => button("检查连接").click());
    await act(async () => clearWorkspaceResources());
    await act(async () => finish(Response.json({ status: "connected" })));
    expect(mocks.refresh).not.toHaveBeenCalled(); expect(mocks.taskRead).not.toHaveBeenCalled(); expect(host.textContent).not.toContain("SYNTHETIC");
    expect(button("重新授权 Outlook").disabled).toBe(false);
  });
  it("rejects a non-Microsoft authorization URL without opening it or exposing configuration", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ...authorization, verificationUri: "https://example.com/credential" })));
    await mount(); await act(async () => button("重新授权 Outlook").click());
    expect(window.open).not.toHaveBeenCalled(); expect(host.textContent).toContain("暂时无法开始"); expect(host.textContent).not.toContain("SUPABASE");
  });
});
