import { beforeEach, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/auth/require-owner", () => ({
  requireOwner: async () => ({ userId: "owner", supabase: { rpc: auth.rpc } }),
}));
import { saveCareerMaterialCheck } from "@/features/career/material-checks";

const input = {
  id: "11111111-1111-4111-8111-111111111111",
  opportunityId: "22222222-2222-4222-8222-222222222222",
  revision: 2,
  label: "Synthetic resume check",
  required: true,
  documentId: null,
  resumeId: "33333333-3333-4333-8333-333333333333",
  note: "User checked this exact resume",
  verificationIntent: "verify",
  verificationObjectRevision:
    "manual|resume:33333333-3333-4333-8333-333333333333:2026-10-27T00:00:00.123456+00:00",
  verificationDocumentRevision: null,
  verificationResumeUpdatedAt: "2026-10-27T00:00:00.123456+00:00",
};
beforeEach(() => {
  auth.rpc.mockReset();
  auth.rpc.mockResolvedValue({ data: { revision: 3 }, error: null });
});
it("carries the displayed PostgREST microsecond version to the transaction without Date normalization", async () => {
  await saveCareerMaterialCheck(input);
  expect(auth.rpc).toHaveBeenCalledWith(
    "save_career_material_check",
    expect.objectContaining({
      p_expected_revision: 2,
      p_verification_intent: "verify",
      p_expected_object_revision: input.verificationObjectRevision,
      p_expected_resume_updated_at: input.verificationResumeUpdatedAt,
    }),
  );
});
it("rejects a mismatched captured intent before any material write", async () => {
  await expect(
    saveCareerMaterialCheck({
      ...input,
      verificationResumeUpdatedAt: "2026-10-27T00:00:00.123457+00:00",
    }),
  ).rejects.toThrow("核验意图与所见资料版本不一致");
  expect(auth.rpc).not.toHaveBeenCalled();
});
it("accepts equivalent captured timestamp forms while keeping the exact submitted proof", async () => {
  const equivalent = input.verificationObjectRevision.replace(
    "2026-10-27T00:00:00.123456+00:00",
    "2026-10-27T08:00:00.123456+08:00",
  );
  await saveCareerMaterialCheck({
    ...input,
    verificationObjectRevision: equivalent,
  });
  expect(auth.rpc).toHaveBeenCalledWith(
    "save_career_material_check",
    expect.objectContaining({
      p_expected_object_revision: equivalent,
      p_expected_resume_updated_at: input.verificationResumeUpdatedAt,
    }),
  );
});
it("reports a transactional source conflict without returning invented success", async () => {
  auth.rpc.mockResolvedValue({
    data: null,
    error: { message: "workflow_material_source_conflict" },
  });
  await expect(saveCareerMaterialCheck(input)).rejects.toThrow("源资料已变化");
});
