import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), revalidate: vi.fn(), owner: vi.fn() }));
vi.mock("@/lib/workspace-revalidation", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: mocks.owner }));
import { saveTodayFocusAction } from "@/features/today/focus-actions";
const input = { date: "2026-10-01", taskIds: ["c0000000-0000-4000-8000-000000000001"], previousIds: [] };
beforeEach(() => { vi.resetAllMocks(); mocks.owner.mockResolvedValue({ supabase: { rpc: mocks.rpc }, userId: "server-owner" }); });
it("ignores browser identity and persists through the owner-scoped atomic RPC", async () => {
  mocks.rpc.mockResolvedValue({ error: null });
  expect(await saveTodayFocusAction({ ...input, user_id: "forged" })).toMatchObject({ ok: true });
  expect(mocks.rpc).toHaveBeenCalledWith("set_today_task_priorities", { p_date: input.date, p_task_ids: input.taskIds, p_previous_ids: [] });
  expect(mocks.revalidate).toHaveBeenCalledWith("/today");
});
it("validates before writing and preserves a useful conflict result", async () => {
  expect(await saveTodayFocusAction({ ...input, taskIds: [...input.taskIds, ...input.taskIds] })).toMatchObject({ ok: false });
  expect(mocks.rpc).not.toHaveBeenCalled();
  mocks.rpc.mockResolvedValue({ error: { message: "focus_conflict" } });
  expect(await saveTodayFocusAction(input)).toMatchObject({ ok: false, message: expect.stringContaining("其他窗口") });
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it("does not turn transport failure into success", async () => {
  mocks.rpc.mockRejectedValue(new Error("offline"));
  expect(await saveTodayFocusAction(input)).toMatchObject({ ok: false, message: expect.stringContaining("未能确认") });
});
