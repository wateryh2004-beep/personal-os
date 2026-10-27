// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ submit: vi.fn(), reconcile: vi.fn() }));
vi.mock("@/features/assistant/ai-capture", () => ({ submitCapture: api.submit, reconcileCapture: api.reconcile }));
import { QuickCapture } from "@/components/today/quick-capture";
import { clearWorkspaceResources } from "@/lib/workspace-resource-cache";
import { getWorkflowDrafts } from "@/features/workflow-continuity/drafts";
let root: Root, host: HTMLDivElement;
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); clearWorkspaceResources(); api.submit.mockReset(); api.reconcile.mockReset(); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); clearWorkspaceResources(); });
async function type(value: string) { await act(async () => { const input = host.querySelector("input")!; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(input,value); input.dispatchEvent(new Event("input",{bubbles:true})); }); }
async function submit() { await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true})); }); }
it("one real QuickCapture submission calls the typed adapter once with frozen raw input and keeps newer typing", async () => {
  let finish!: (result: unknown) => void; api.submit.mockImplementation(() => new Promise(resolve => { finish=resolve; }));
  await act(async () => root.render(<QuickCapture />)); await type("  A  "); await submit(); await submit(); await type("B");
  expect(api.submit).toHaveBeenCalledTimes(1); const intent=api.submit.mock.calls[0][0]; expect(intent.content).toBe("  A  ");
  await act(async () => finish({status:"saved",intentId:intent.intentId,inboxId:intent.intentId,classification:"ready"}));
  expect(host.querySelector("input")!.value).toBe("B"); expect(getWorkflowDrafts()).toHaveLength(1); expect(api.reconcile).not.toHaveBeenCalled();
});
it("unknown capture restores the same UUID, only reads on return and on repeated submit", async () => {
  api.submit.mockImplementation(async intent => ({status:"needs-check",intentId:intent.intentId,message:"待核对"}));
  api.reconcile.mockImplementation(async intent => ({status:"needs-check",intentId:intent.intentId,message:"仍待核对"}));
  await act(async () => root.render(<QuickCapture />)); await type("Unknown original"); await submit(); const intent=api.submit.mock.calls[0][0];
  await act(async () => root.render(null)); await act(async () => root.render(<QuickCapture />));
  expect(host.querySelector("input")!.value).toBe("Unknown original"); expect(api.submit).toHaveBeenCalledTimes(1); expect(api.reconcile.mock.calls[0][0]).toEqual(intent);
  await type("Later input"); await submit(); expect(api.reconcile.mock.calls[1][0]).toEqual(intent); expect(api.submit).toHaveBeenCalledTimes(1);
});
it("classification failure still confirms saved Inbox content and clears only the submitted draft", async () => {
  api.submit.mockImplementation(async intent => ({status:"saved",intentId:intent.intentId,inboxId:intent.intentId,classification:"failed"}));
  await act(async () => root.render(<QuickCapture />)); await type("Saved original"); await submit(); expect(host.querySelector("input")!.value).toBe(""); expect(host.textContent).toContain("已加入收集箱，识别暂未完成"); expect(getWorkflowDrafts()).toHaveLength(0);
});
it("owner cleanup prevents a late capture result from installing or clearing new scope input", async () => {
  let finish!: (result: unknown) => void; api.submit.mockImplementation(() => new Promise(resolve => { finish=resolve; }));
  await act(async () => root.render(<QuickCapture />)); await type("Old input"); await submit(); const intent=api.submit.mock.calls[0][0]; await act(async () => clearWorkspaceResources());
  await act(async () => root.render(null)); await act(async () => root.render(<QuickCapture />)); await type("New scope input");
  await act(async () => finish({status:"saved",intentId:intent.intentId,inboxId:intent.intentId,classification:"ready"}));
  expect(host.querySelector("input")!.value).toBe("New scope input"); expect(host.textContent).not.toContain("已加入收集箱。"); expect(getWorkflowDrafts()).toHaveLength(1);
});
