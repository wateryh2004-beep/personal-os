// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const approve = vi.hoisted(() => vi.fn());
vi.mock("@/features/assistant/actions", () => ({ approveAgentActions: approve }));
import { AgentActionGroup } from "@/components/assistant/agent-action-group";
import type { AgentAction } from "@/features/assistant/types";
let host: HTMLDivElement; let root: ReturnType<typeof createRoot>;
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); approve.mockReset(); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
const actions: AgentAction[] = ["one", "two", "three"].map(id => ({ id, runId: "synthetic", domain: "tasks", actionType: "tasks.create", status: "proposed", preview: { title: `合成任务 ${id}` }, riskLevel: "low" }));
it("confirms only the explicit frozen subset and keeps unselected proposals untouched", async () => {
  let finish!: (value: { status: "success"; message: string }[]) => void;
  approve.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const changed = vi.fn(); await act(async () => root.render(createElement(AgentActionGroup, { actions, onChanged: changed })));
  expect([...host.querySelectorAll("input")].every(input => !input.checked)).toBe(true);
  await act(async () => host.querySelectorAll<HTMLInputElement>("input")[1].click());
  const confirm = [...host.querySelectorAll("button")].find(button => button.textContent?.includes("确认所选"))!;
  await act(async () => { confirm.click(); confirm.click(); });
  expect(approve).toHaveBeenCalledTimes(1); expect(approve).toHaveBeenCalledWith(["two"]);
  expect(host.querySelector("fieldset")?.disabled).toBe(true);
  await act(async () => finish([{ status: "success", message: "已完成" }]));
  expect(changed).toHaveBeenCalledTimes(1); expect(actions[0].status).toBe("proposed"); expect(actions[2].status).toBe("proposed");
  expect(host.textContent).toContain("1 项已完成");
});
it("retains the selected subset after a transport failure and never bulk-confirms note moves", async () => {
  approve.mockRejectedValue(new Error("offline"));
  await act(async () => root.render(createElement(AgentActionGroup, { actions, onChanged: vi.fn() })));
  await act(async () => host.querySelector<HTMLInputElement>("input")!.click());
  await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent?.includes("确认所选"))!.click());
  expect(host.querySelector<HTMLInputElement>("input")!.checked).toBe(true); expect(host.textContent).toContain("选择已保留");
  await act(async () => root.render(createElement(AgentActionGroup, { actions: [{ ...actions[0], domain: "notes", actionType: "notes.move" }, actions[1]], onChanged: vi.fn() })));
  expect(host.querySelector("button")).toBeNull();
});
