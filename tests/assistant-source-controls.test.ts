// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ block: vi.fn(), approve: vi.fn(), reject: vi.fn() }));
vi.mock("@/features/ai/actions", () => ({ blockAiSource: mock.block, submitAiFeedback: vi.fn() }));
vi.mock("@/features/assistant/actions", () => ({ approveAgentAction: mock.approve, rejectAgentAction: mock.reject }));
import { AssistantStreamSources } from "@/components/assistant/assistant-stream-sources";
import { AgentSources } from "@/components/assistant/agent-sources";
import { AgentActionCard } from "@/components/assistant/agent-action-card";
const id = "10000000-0000-4000-8000-000000000001";
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.clearAllMocks(); mock.block.mockResolvedValue(undefined);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
const blockButton = () => [...host.querySelectorAll("button")].find(button => button.textContent === "不再使用")!;
it("blocks a streaming source using its real UUID and reports the completed result", async () => {
  await act(async () => root.render(createElement(AssistantStreamSources, { sources: [{ entityId: id, title: "Synthetic source", domain: "notes", href: `/notes/${id}` }] })));
  await act(async () => blockButton().click());
  expect(mock.block.mock.calls[0][0].get("source_id")).toBe(id);
  expect(mock.block.mock.calls[0][0].get("domain")).toBe("notes");
  expect(host.textContent).toContain("已禁止以后使用");
  expect(host.querySelector("button")?.disabled).toBe(true);
});
it("preserves a recoverable button after failure and succeeds on retry", async () => {
  mock.block.mockRejectedValueOnce(new Error("synthetic network failure"));
  await act(async () => root.render(createElement(AssistantStreamSources, { sources: [{ entityId: id, title: "Synthetic file", domain: "files" }] })));
  await act(async () => blockButton().click());
  expect(host.textContent).toContain("尚未禁止，请重试");
  expect(blockButton().disabled).toBe(false);
  await act(async () => blockButton().click());
  expect(mock.block).toHaveBeenCalledTimes(2);
  expect(host.textContent).toContain("已禁止以后使用");
});
it("uses UUIDs rather than S1 citation labels in persisted and legacy note sources", async () => {
  await act(async () => root.render(createElement(AgentSources, { steps: [{ id: "step", step_type: "context", title: "Synthetic context", summary: "", status: "succeeded", output_json: { sources: [{ id: "S1", title: "Synthetic legacy note", domain: "notes", href: `/notes/${id}` }] } }] })));
  await act(async () => blockButton().click());
  expect(mock.block.mock.calls[0][0].get("source_id")).toBe(id);
});
it("binds confirmation to the exact frozen proposal hash shown in the card", async () => {
  const hash = "a".repeat(64); mock.approve.mockResolvedValue({ status: "success", actionId: id, message: "已完成" });
  await act(async () => root.render(createElement(AgentActionCard, { action: { id, runId: id, payloadHash: hash, domain: "notes", actionType: "notes.create", status: "proposed", preview: { title: "Synthetic proposal" }, riskLevel: "low" }, onChanged: vi.fn() })));
  await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === "确认")!.click());
  expect(mock.approve).toHaveBeenCalledWith(id, hash);
  expect(host.textContent).toContain("已完成");
});
