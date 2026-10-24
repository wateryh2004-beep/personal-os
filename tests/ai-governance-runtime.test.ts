import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ queryError: false, reserveAllowed: true, updateError: false, updates: [] as Record<string, unknown>[], inserted: [] as Record<string, unknown>[] }));
const reserve = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({
  rpc: reserve,
  from: (table: string) => {
    let op = "read";
    let single = false;
    const query: Record<string, unknown> = new Proxy({}, { get(_target, method) {
      if (method === "then") {
        const result = table === "ai_governance_settings" ? { data: null, error: null } : { data: single ? { id: "10000000-0000-4000-8000-000000000001" } : [], count: 0, error: (op === "update" ? state.updateError : state.queryError) ? { code: "synthetic_failure" } : null };
        return Promise.resolve(result).then.bind(Promise.resolve(result));
      }
      return (value: unknown) => {
        if (method === "update") { op = "update"; state.updates.push(value as Record<string, unknown>); }
        if (method === "insert") { op = "insert"; state.inserted.push(value as Record<string, unknown>); }
        if (method === "single" || method === "maybeSingle") single = true;
        return query;
      };
    }});
    return query;
  },
}) }));
vi.mock("ai", () => ({ generateText: vi.fn() }));
vi.mock("@/lib/ai/deepseek", () => ({ getDeepSeekModel: async () => ({ model: "synthetic", modelId: "deepseek-v4-flash" }) }));
import { assertAiBudget, defaultAiGovernance, withGovernedAiCall, completeAiRequestWithUsage } from "@/features/ai/governance";
import { synthesizeTodayBrief } from "@/features/today/ai-synthesis";
import { generateText } from "ai";
const uid = "00000000-0000-4000-8000-000000000001";
const input = { userId: uid, surface: "synthetic", purpose: "test", model: "synthetic", prompt: "synthetic", system: "data only" };
beforeEach(() => {
  vi.clearAllMocks(); state.queryError = false; state.updateError = false; state.reserveAllowed = true; state.updates = []; state.inserted = [];
  reserve.mockImplementation(async () => ({ data: { id: "10000000-0000-4000-8000-000000000001", allowed: state.reserveAllowed, code: state.reserveAllowed ? null : "daily_call_limit" }, error: null }));
});
describe("governed provider execution", () => {
  it("fails closed when usage statistics cannot be read", async () => {
    state.queryError = true;
    expect(await assertAiBudget(uid, defaultAiGovernance)).toEqual({ allowed: false, code: "ai_budget_unavailable" });
  });
  it("reserves atomically before every call and completes a metadata-only audit", async () => {
    const call = vi.fn(async () => ({ usage: { inputTokens: 50, outputTokens: 10 }, text: "synthetic" }));
    await withGovernedAiCall(input, call); await withGovernedAiCall(input, call);
    expect(reserve).toHaveBeenCalledTimes(2);
    expect(call).toHaveBeenCalledWith({ maxOutputTokens: 1200 });
    expect(state.updates).toEqual([expect.objectContaining({ status: "completed", input_tokens: 50, output_tokens: 10, reserved_cost_usd: 0 }), expect.objectContaining({ status: "completed" })]);
    expect(JSON.stringify(reserve.mock.calls)).not.toContain('"prompt"');
    expect(reserve.mock.invocationCallOrder[0]).toBeLessThan(call.mock.invocationCallOrder[0]);
  });
  it("never invokes the provider after quota denial or reservation failure", async () => {
    const call = vi.fn(); state.reserveAllowed = false;
    await expect(withGovernedAiCall(input, call)).rejects.toThrow("daily_call_limit");
    reserve.mockResolvedValueOnce({ data: null, error: { code: "offline" } });
    await expect(withGovernedAiCall(input, call)).rejects.toThrow("ai_budget_unavailable");
    expect(call).not.toHaveBeenCalled();
  });
  it("rejects oversized context before provider execution and records the block", async () => {
    const call = vi.fn();
    await expect(withGovernedAiCall({ ...input, prompt: "x".repeat(13000) }, call)).rejects.toThrow("ai_context_limit");
    expect(state.inserted).toEqual([expect.objectContaining({ status: "blocked_budget", error_code: "ai_context_limit" })]);
    expect(call).not.toHaveBeenCalled(); expect(reserve).not.toHaveBeenCalled();
  });
  it("retains the cost reservation when a provider error reports no usage", async () => {
    await expect(withGovernedAiCall(input, async () => { throw new Error("synthetic provider payload"); })).rejects.toThrow("synthetic provider payload");
    expect(state.updates[0]).toMatchObject({ status: "failed", error_code: "ai_provider_request_failed" });
    expect(state.updates[0]).not.toHaveProperty("reserved_cost_usd");
    expect(JSON.stringify(state.updates)).not.toContain("synthetic provider payload");
  });
  it("does not report audit completion when its database write fails", async () => {
    state.updateError = true;
    await expect(completeAiRequestWithUsage("id", "completed", { inputTokens: 1, outputTokens: 1 })).rejects.toThrow("ai_audit_completion_failed");
  });
  it("routes the actual Today synthesis through reservation and output limits", async () => {
    vi.mocked(generateText).mockResolvedValue({ text: "Synthetic summary", usage: { inputTokens: 20, outputTokens: 10 } } as Awaited<ReturnType<typeof generateText>>);
    await synthesizeTodayBrief({ userId: uid, timezone: "Asia/Shanghai", items: [] });
    expect(reserve).toHaveBeenCalledWith("reserve_ai_request", expect.objectContaining({ p_user_id: uid, p_metadata: expect.objectContaining({ surface: "today", output_token_limit: 220 }) }));
    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({ maxOutputTokens: 220 }));
  });
});
