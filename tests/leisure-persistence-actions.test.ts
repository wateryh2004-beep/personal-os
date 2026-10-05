import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), owner: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: mocks.owner }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { saveLeisureFeedback } from "@/features/leisure/actions";
const input = { experience_id: "c0000000-0000-4000-8000-000000000001", expected_revision: 2, status: null, reaction: "liked", personal_note: "Keep my own view", linked_note_id: null };
const saved = { status: null, reaction: "liked", personal_note: input.personal_note, linked_note_id: null, linked_note_title: null, linked_note_available: false, revision: 3, updated_at: "2026-10-04T10:00:00Z" };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.owner.mockResolvedValue({ supabase: { rpc: mocks.rpc }, userId: "session-owner" });
  mocks.rpc.mockResolvedValue({ data: saved, error: null });
});

describe("explicit leisure feedback server action", () => {
  it("authenticates and uses one atomic RPC without accepting an owner ID", async () => {
    expect(await saveLeisureFeedback(input)).toEqual({ ok: true, feedback: saved });
    expect(mocks.owner).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("save_leisure_feedback", {
      p_experience_id: input.experience_id, p_expected_revision: 2, p_status: null,
      p_reaction: "liked", p_personal_note: input.personal_note, p_linked_note_id: null,
    });
    expect(mocks.revalidate).toHaveBeenCalledWith("/leisure");
    expect(mocks.revalidate).toHaveBeenCalledWith(`/leisure/${input.experience_id}`);
  });

  it("rejects forged identity or invalid input before writing", async () => {
    expect(await saveLeisureFeedback({ ...input, user_id: "forged" })).toEqual({ ok: false, error: "invalid" });
    expect(await saveLeisureFeedback({ ...input, personal_note: "x".repeat(10001) })).toEqual({ ok: false, error: "invalid" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["leisure_conflict", "conflict"], ["leisure_note_unavailable", "note_unavailable"],
    ["leisure_invalid", "invalid"], ["permission denied", "unavailable"],
  ])("preserves %s without invalidating or claiming success", async (message, error) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message } });
    expect(await saveLeisureFeedback(input)).toEqual({ ok: false, error });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("fails safely for unavailable RPCs, dropped responses and malformed responses", async () => {
    mocks.rpc.mockRejectedValueOnce(new Error("offline"));
    expect(await saveLeisureFeedback(input)).toEqual({ ok: false, error: "unavailable" });
    mocks.rpc.mockResolvedValueOnce({ error: null, data: {} });
    expect(await saveLeisureFeedback(input)).toEqual({ ok: false, error: "unavailable" });
  });

  it("keeps a committed success even when revalidation fails", async () => {
    mocks.revalidate.mockImplementation(() => { throw new Error("cache refresh unavailable"); });
    expect(await saveLeisureFeedback(input)).toEqual({ ok: true, feedback: saved });
  });

  it("does not swallow required authentication redirects", async () => {
    mocks.owner.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(saveLeisureFeedback(input)).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
