import { beforeEach, describe, expect, it, vi } from "vitest";
import { readStorageBudget, saveStorageBudget } from "@/features/files/storage-inspection/budget-actions";
import { storageBudgetInput } from "@/features/files/storage-inspection/budget-schema";

const state = vi.hoisted(() => ({
  owner: vi.fn(), from: vi.fn(), update: vi.fn(), insert: vi.fn(), upsert: vi.fn(),
  eq: vi.fn(), is: vi.fn(), select: vi.fn(), single: vi.fn(), maybeSingle: vi.fn(),
}));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: state.owner }));

beforeEach(() => {
  vi.resetAllMocks();
  state.owner.mockResolvedValue({ userId: "verified-owner", supabase: { from: state.from } });
  for (const name of ["from", "update", "insert", "upsert", "eq", "is", "select"] as const) state[name].mockReturnValue(state);
  state.single.mockResolvedValue({ data: { storage_budget_gib: 12.5 }, error: null });
  state.maybeSingle.mockResolvedValue({ data: { storage_budget_gib: 12.5 }, error: null });
});

describe("persisted storage budget", () => {
  it("loads the saved owner preference and never reads provider billing", async () => {
    expect(await readStorageBudget()).toEqual({ value: "12.5", available: true });
    expect(state.from).toHaveBeenCalledExactlyOnceWith("profiles");
    expect(state.eq).toHaveBeenCalledExactlyOnceWith("user_id", "verified-owner");
    expect(state.is).toHaveBeenCalledExactlyOnceWith("archived_at", null);
  });

  it("treats a missing profile as unset without creating or updating one", async () => {
    state.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await readStorageBudget()).toEqual({ value: "", available: true });
    expect(state.update).not.toHaveBeenCalled();
    expect(state.insert).not.toHaveBeenCalled();
    expect(state.upsert).not.toHaveBeenCalled();
  });

  it("treats an existing null budget as unset", async () => {
    state.maybeSingle.mockResolvedValue({ data: { storage_budget_gib: null }, error: null });
    expect(await readStorageBudget()).toEqual({ value: "", available: true });
  });

  it("keeps read failures and invalid saved values unavailable", async () => {
    state.maybeSingle.mockResolvedValueOnce({ data: null, error: { code: "42501" } })
      .mockResolvedValueOnce({ data: { storage_budget_gib: -1 }, error: null });
    expect(await readStorageBudget()).toEqual({ value: "", available: false });
    expect(await readStorageBudget()).toEqual({ value: "", available: false });
    expect(state.insert).not.toHaveBeenCalled();
    expect(state.update).not.toHaveBeenCalled();
  });

  it("validates units and bounds before any database request", async () => {
    for (const value of ["0", "-1", "Infinity", "NaN", "1e5", "1000001", ".1", "0.000001"]) {
      expect(storageBudgetInput.safeParse(value).success).toBe(false);
      expect((await saveStorageBudget(value)).ok).toBe(false);
    }
    expect(state.from).not.toHaveBeenCalled();
    expect(state.update).not.toHaveBeenCalled();
    expect(state.insert).not.toHaveBeenCalled();
  });

  it("updates only the budget, preserving existing profile fields and identity", async () => {
    const profile = { id: "existing-id", user_id: "verified-owner", display_name: "Existing name", timezone: "Europe/London", locale: "en-GB", archived_at: null, storage_budget_gib: 5 };
    state.update.mockImplementation((patch: Partial<typeof profile>) => {
      Object.assign(profile, patch);
      return state;
    });
    expect(await saveStorageBudget("12.5")).toEqual({ ok: true, value: "12.5" });
    expect(state.update).toHaveBeenCalledExactlyOnceWith({ storage_budget_gib: 12.5 });
    expect(state.eq).toHaveBeenCalledExactlyOnceWith("user_id", "verified-owner");
    expect(state.is).toHaveBeenCalledExactlyOnceWith("archived_at", null);
    expect(profile).toEqual({ id: "existing-id", user_id: "verified-owner", display_name: "Existing name", timezone: "Europe/London", locale: "en-GB", archived_at: null, storage_budget_gib: 12.5 });
    expect(state.insert).not.toHaveBeenCalled();
    expect(state.upsert).not.toHaveBeenCalled();
  });

  it("clears an existing budget explicitly without replacing the profile", async () => {
    state.maybeSingle.mockResolvedValue({ data: { storage_budget_gib: null }, error: null });
    expect(await saveStorageBudget("")).toEqual({ ok: true, value: "" });
    expect(state.update).toHaveBeenCalledExactlyOnceWith({ storage_budget_gib: null });
    expect(state.insert).not.toHaveBeenCalled();
  });

  it("creates a missing profile only on explicit save with no invented demographics", async () => {
    state.maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await saveStorageBudget(" 12.5 ")).toEqual({ ok: true, value: "12.5" });
    expect(state.owner).toHaveBeenCalledTimes(1);
    expect(state.update).toHaveBeenCalledExactlyOnceWith({ storage_budget_gib: 12.5 });
    expect(state.insert).toHaveBeenCalledExactlyOnceWith({ user_id: "verified-owner", storage_budget_gib: 12.5 });
    expect(state.upsert).not.toHaveBeenCalled();
    expect(state.select.mock.calls).toEqual([["storage_budget_gib"], ["storage_budget_gib"]]);
  });

  it("can explicitly save an unset budget on a missing profile", async () => {
    state.maybeSingle.mockResolvedValue({ data: null, error: null });
    state.single.mockResolvedValue({ data: { storage_budget_gib: null }, error: null });
    expect(await saveStorageBudget("")).toEqual({ ok: true, value: "" });
    expect(state.insert).toHaveBeenCalledExactlyOnceWith({ user_id: "verified-owner", storage_budget_gib: null });
  });

  it.each(["42501", "PGRST116", "connection-failed"])("does not fall back to insert after an update error (%s)", async (code) => {
    state.maybeSingle.mockResolvedValue({ data: null, error: { code } });
    expect(await saveStorageBudget("5")).toEqual({ ok: false, error: "预算未保存，请稍后重试。" });
    expect(state.insert).not.toHaveBeenCalled();
  });

  it.each([
    { data: null, error: { code: "42501" } },
    { data: null, error: null },
  ])("does not claim success when profile insertion fails or returns no row", async (result) => {
    state.maybeSingle.mockResolvedValue({ data: null, error: null });
    state.single.mockResolvedValue(result);
    expect(await saveStorageBudget("5")).toEqual({ ok: false, error: "预算未保存，请稍后重试。" });
    expect(state.insert).toHaveBeenCalledTimes(1);
    expect(state.update).toHaveBeenCalledTimes(1);
  });

  it("does not overwrite a profile or budget created by a concurrent save", async () => {
    state.maybeSingle.mockResolvedValue({ data: null, error: null });
    state.single.mockResolvedValue({ data: null, error: { code: "23505" } });
    expect(await saveStorageBudget("5")).toEqual({ ok: false, error: "预算未保存；请刷新页面，核对账户资料和预算后再试。" });
    expect(state.update).toHaveBeenCalledTimes(1);
    expect(state.insert).toHaveBeenCalledTimes(1);
    expect(state.upsert).not.toHaveBeenCalled();
    expect(state.from).toHaveBeenCalledTimes(2);
  });

  it("never unarchives an existing profile when the user_id uniqueness constraint blocks creation", async () => {
    state.maybeSingle.mockResolvedValue({ data: null, error: null });
    state.single.mockResolvedValue({ data: null, error: { code: "23505" } });
    expect((await saveStorageBudget("5")).ok).toBe(false);
    expect(state.is).toHaveBeenCalledExactlyOnceWith("archived_at", null);
    expect(state.update).toHaveBeenCalledExactlyOnceWith({ storage_budget_gib: 5 });
    expect(state.insert).toHaveBeenCalledExactlyOnceWith({ user_id: "verified-owner", storage_budget_gib: 5 });
    expect(state.upsert).not.toHaveBeenCalled();
  });

  it.each(["unauthenticated", "not-authorized"])("requires the verified owner before any read or write (%s)", async (reason) => {
    const failure = new Error(reason);
    state.owner.mockRejectedValue(failure);
    await expect(readStorageBudget()).rejects.toBe(failure);
    await expect(saveStorageBudget("5")).rejects.toBe(failure);
    expect(state.from).not.toHaveBeenCalled();
    expect(state.update).not.toHaveBeenCalled();
    expect(state.insert).not.toHaveBeenCalled();
  });
});
