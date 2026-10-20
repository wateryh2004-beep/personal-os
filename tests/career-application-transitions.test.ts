import { beforeEach, describe, expect, it, vi } from "vitest";
import { CareerInputError } from "@/features/career/form-state";

const mocks = vi.hoisted(() => ({ owner: vi.fn(), rpc: vi.fn(), revalidate: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: mocks.owner }));
import { transitionCareerApplication } from "@/features/career/actions";

const id = "00000000-0000-4000-8000-000000000001";
function setup(applied_at: string | null) {
  const read = {
    select: () => read,
    eq: () => read,
    is: () => read,
    maybeSingle: async () => ({ data: { id, applied_at }, error: null }),
  };
  const from = vi.fn((table: string) => {
    if (table === "career_applications") return read;
    if (table === "audit_logs") return { insert: async () => ({ error: null }) };
    throw new Error("unexpected table " + table);
  });
  mocks.owner.mockResolvedValue({ userId: "synthetic-user", supabase: { from, rpc: mocks.rpc } });
  const form = (status: string) => {
    const value = new FormData();
    value.set("application_id", id);
    value.set("status", status);
    return value;
  };
  return { form };
}

beforeEach(() => { vi.clearAllMocks(); mocks.rpc.mockResolvedValue({ error: null }); });

describe("Career application submission integrity", () => {
  it.each(["interviewing", "offer"])("rejects %s without a recorded submission", async status => {
    const { form } = setup(null);
    await expect(transitionCareerApplication(form(status))).rejects.toBeInstanceOf(CareerInputError);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("allows explicitly marking an actual application submitted through the existing timestamping RPC", async () => {
    const { form } = setup(null);
    await transitionCareerApplication(form("submitted"));
    expect(mocks.rpc).toHaveBeenCalledWith("transition_career_application", {
      p_application_id: id, p_to_status: "submitted", p_note: null,
    });
    expect(mocks.revalidate).toHaveBeenCalledWith("/career/applications");
  });

  it("permits later stages only when a submission timestamp exists", async () => {
    const { form } = setup("2026-10-20T10:00:00Z");
    await transitionCareerApplication(form("interviewing"));
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });
});
