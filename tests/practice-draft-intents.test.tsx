// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const calls = vi.hoisted(() => ({ save: vi.fn(), reconcile: vi.fn(), push: vi.fn() }));
vi.mock("@/features/interview/actions", () => ({ savePracticeIntent: calls.save, reconcilePracticeIntent: calls.reconcile }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: calls.push }), unstable_rethrow: () => {} }));
import { PracticeIntentForm } from "@/components/career/interview/practice-intent-form";
import { getWorkflowDrafts } from "@/features/workflow-continuity/drafts";
import { clearWorkspaceResources } from "@/lib/workspace-resource-cache";
import { normalizePracticeIntent } from "@/features/interview/practice-intents";
const prep = "11111111-1111-4111-8111-111111111111", attempt = "22222222-2222-4222-8222-222222222222", parent = "33333333-3333-4333-8333-333333333333";
let host: HTMLDivElement, root: Root;
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); clearWorkspaceResources(); Object.values(calls).forEach(call => call.mockReset()); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); clearWorkspaceResources(); });
function Form({ prompt = "Original prompt", parentId }: { prompt?: string; parentId?: string }) { return <PracticeIntentForm mode="solo" preparationId={prep} parentAttemptId={parentId} historyHref={`/career/interview/practice/${prep}`}><input type="hidden" name="input_mode" value="text" /><input type="hidden" name="language" value="zh" /><input type="hidden" name="prompt_snapshot" value={prompt} /><input type="hidden" name="parent_attempt_id" value={parentId ?? ""} /><textarea name="response_transcript_markdown" defaultValue="" /><input name="duration_seconds" defaultValue="" /><label><input type="checkbox" name="issue_tags" value="structure" />结构</label><label><input type="checkbox" name="issue_tags" value="clarity" />清晰</label><button>保存</button></PracticeIntentForm>; }
async function type(value: string) { await act(async () => { const node = host.querySelector("textarea")!; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(node, value); node.dispatchEvent(new Event("input", { bubbles: true })); }); }
async function submit() { await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); }
async function click(label: string) { await act(async () => [...host.querySelectorAll("button")].find(node => node.textContent === label)!.click()); }
function receipt(attemptId = attempt) { return { status: "saved" as const, receipt: { attempt_id: attemptId, preparation_id: prep, session_id: null, sequence_no: null, archived: false } }; }
it("unknown save restores raw answer, original prompt/parent and the same intent; only reconciliation runs", async () => {
  calls.save.mockResolvedValue({ status: "needs-check", message: "未核对" }); calls.reconcile.mockResolvedValue({ status: "missing" });
  await act(async () => root.render(<Form parentId={parent} />)); await type("  Frozen answer A  "); await submit();
  const intentId = calls.save.mock.calls[0][1]; expect(calls.save.mock.calls[0][2].get("parent_attempt_id")).toBe(parent);
  await act(async () => root.render(null)); await act(async () => root.render(<Form prompt="Changed remote question" parentId={parent} />));
  expect(host.querySelector("textarea")!.value).toBe("  Frozen answer A  "); expect(host.querySelector<HTMLInputElement>('[name="prompt_snapshot"]')!.value).toBe("Original prompt");
  await submit(); expect(calls.save).toHaveBeenCalledTimes(1);
  await click("核对原保存"); expect(calls.reconcile.mock.calls[0][1]).toBe(intentId); expect(calls.reconcile.mock.calls[0][2].get("response_transcript_markdown")).toBe("  Frozen answer A  ");
  expect(calls.save).toHaveBeenCalledTimes(1); expect(host.textContent).toContain("同一意图重试");
  await click("重试同一次保存"); expect(calls.save.mock.calls[1][1]).toBe(intentId);
});
it("saved A preserves newer input B as a new unfinished attempt and does not redirect away", async () => {
  let resolve!: (value: ReturnType<typeof receipt>) => void; calls.save.mockImplementation(() => new Promise(yes => { resolve = yes; }));
  await act(async () => root.render(<Form />)); await type("A"); await submit(); await type("B");
  await act(async () => resolve(receipt(calls.save.mock.calls[0][1])));
  expect(host.querySelector("textarea")!.value).toBe("B"); expect(host.textContent).toContain("当前修改尚未保存"); expect(calls.push).not.toHaveBeenCalled(); expect(getWorkflowDrafts()).toHaveLength(1);
  const firstId = calls.save.mock.calls[0][1]; calls.save.mockResolvedValue({ status: "rejected", message: "validation" }); await submit(); expect(calls.save.mock.calls[1][1]).not.toBe(firstId);
});
it("confirmed success clears only that draft and navigates using the real receipt ID", async () => {
  calls.save.mockImplementation(async (_mode: string, id: string) => receipt(id));
  await act(async () => root.render(<Form />)); await type("Answer"); await submit(); expect(getWorkflowDrafts()).toHaveLength(0);
  expect(calls.push).toHaveBeenCalledWith(`/career/interview/practice/${prep}?saved=${calls.save.mock.calls[0][1]}`);
});
it("owner cleanup blocks old confirmation and leaves no input directory", async () => {
  let resolve!: (value: ReturnType<typeof receipt>) => void; calls.save.mockImplementation(() => new Promise(yes => { resolve = yes; }));
  await act(async () => root.render(<Form />)); await type("Old owner answer"); await submit(); await act(async () => clearWorkspaceResources()); await act(async () => resolve(receipt()));
  expect(calls.push).not.toHaveBeenCalled(); expect(getWorkflowDrafts()).toHaveLength(0);
});
it("normalizes exactly seventeen original domain fields including repeated tags and nullable blanks", () => {
  const form = new FormData(); form.set("preparation_id", prep); form.set("input_mode", "text"); form.set("language", "zh"); form.set("response_transcript_markdown", "  Raw transcript  "); form.set("prompt_snapshot", "  Question  "); form.append("issue_tags", "structure"); form.append("issue_tags", "clarity");
  const payload = normalizePracticeIntent("solo", form); expect(Object.keys(payload)).toHaveLength(17); expect(payload.issue_tags).toEqual(["structure", "clarity"]); expect(payload.prompt_snapshot).toBe("Question"); expect(payload.response_transcript_markdown).toBe("  Raw transcript  "); expect(payload.duration_seconds).toBeNull(); expect(payload.session_id).toBeNull();
});
