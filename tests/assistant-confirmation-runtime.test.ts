import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ hash: "a".repeat(64), finishFails: false }));
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), execute: vi.fn() }));
const id = "10000000-0000-4000-8000-000000000001";
vi.mock("@/lib/workspace-revalidation", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/features/assistant/executor", () => ({ executeFrozenAgentAction: mocks.execute, AgentActionConflict: class extends Error {} }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: async () => {
  const query: Record<string, unknown> = new Proxy({}, { get(_target, name) {
    if (name === "then") { const value = Promise.resolve({ data: { id: "10000000-0000-4000-8000-000000000001", payload_hash: state.hash, status: "proposed", action_type: "notes.create", payload_json: { title: "Synthetic", bodyMarkdown: "synthetic", folderId: null, summaryOfChanges: "synthetic" }, timezone: "Asia/Shanghai" }, count: 0, error: null }); return value.then.bind(value); }
    return () => query;
  }});
  return { userId: "10000000-0000-4000-8000-000000000001", supabase: { from: () => query } };
} }));
import { approveAgentAction } from "@/features/assistant/actions";
beforeEach(() => {
  vi.clearAllMocks(); state.finishFails = false; state.hash = "a".repeat(64);
  mocks.execute.mockResolvedValue({ noteId: id, href: `/notes/${id}` });
  mocks.rpc.mockImplementation(async (_name, args) => args.p_status === "executing" ? { data: { id, run_id: id, action_type: "notes.create", payload_json: { title: "Synthetic", bodyMarkdown: "synthetic" } }, error: null } : { data: {}, error: state.finishFails ? { code: "offline" } : null });
});
it("rejects stale or missing confirmation hashes before claiming or executing", async () => {
  expect(await approveAgentAction(id, "b".repeat(64))).toMatchObject({ status: "error" });
  expect(await approveAgentAction(id)).toMatchObject({ status: "error" });
  expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.execute).not.toHaveBeenCalled();
});
it("returns success only after an audited completion and passes the stable action ID to the executor", async () => {
  expect(await approveAgentAction(id, state.hash)).toMatchObject({ status: "success", href: `/notes/${id}` });
  expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({ actionId: id }));
  expect(mocks.rpc).toHaveBeenLastCalledWith("transition_agent_action", expect.objectContaining({ p_hash: state.hash, p_user_id: id, p_status: "succeeded" }));
});
it("reports an uncertain saved result instead of false success when finalization fails", async () => {
  state.finishFails = true;
  expect(await approveAgentAction(id, state.hash)).toMatchObject({ status: "error", message: expect.stringContaining("操作已执行") });
  expect(mocks.execute).toHaveBeenCalledOnce();
  expect(mocks.rpc.mock.calls.map(call => call[1].p_status)).toEqual(["executing", "succeeded"]);
});
