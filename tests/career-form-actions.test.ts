import { beforeEach, describe, expect, it, vi } from "vitest";
import { CareerInputError } from "@/features/career/form-state";

const mocks = vi.hoisted(() => ({ mutation: vi.fn(), owner: vi.fn(), interview: vi.fn(), redirect: vi.fn(), rethrow: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, unstable_rethrow: mocks.rethrow }));
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: mocks.owner }));
vi.mock("@/features/interview/actions", () => ({ createInterviewContext: mocks.interview }));
vi.mock("@/features/career/actions", () => Object.fromEntries([
  "saveCareerProfile", "createSkill", "updateSkill", "archiveSkill", "createDirection", "updateDirection", "archiveDirection", "createCertification", "updateCertification", "archiveCertification",
  "createFact", "createExperience", "updateFact", "createOutput", "createBullet", "linkFactToBullet", "approveBullet", "uploadEvidence", "archiveExperience", "createOpportunity", "createOpportunityRequirement", "runGapAnalysis", "createCareerApplication", "transitionCareerApplication", "createResumeVersion", "updateResumeVersion", "setResumeVersionBullets", "finalizeResumeVersion", "archiveResumeVersion",
].map((name) => [name, mocks.mutation])));
import { submitCareerForm } from "@/features/career/form-actions";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.mutation.mockResolvedValue(undefined);
  mocks.rethrow.mockImplementation((error) => { if (error && typeof error === "object" && "digest" in error) throw error; });
  mocks.redirect.mockImplementation((href) => { throw Object.assign(new Error("redirect"), { digest: href }); });
});

function ownerWith(opportunity: unknown, context: unknown) {
  const lookups: string[] = [];
  const from = vi.fn((table: string) => {
    lookups.push(table);
    const chain = { select: vi.fn(() => chain), eq: vi.fn(() => chain), is: vi.fn(() => chain), order: vi.fn(() => chain), limit: vi.fn(() => chain), maybeSingle: vi.fn(async () => ({ data: table === "career_opportunities" ? opportunity : context, error: null })) };
    return chain;
  });
  mocks.owner.mockResolvedValue({ supabase: { from }, userId: "owner" });
  return lookups;
}

describe("Career form action boundary", () => {
  it("returns safe field feedback while forwarding form data unchanged to the original mutation", async () => {
    const data = new FormData(); data.set("content", "   ");
    mocks.mutation.mockRejectedValue(new CareerInputError({ content: "请填写完整内容。" }));
    const result = await submitCareerForm("createFact", data);
    expect(mocks.mutation).toHaveBeenCalledWith(data);
    expect(result).toMatchObject({ status: "error", fieldErrors: { content: "请填写完整内容。" } });
  });
  it("does not disclose unexpected database errors or accept prototype operation names", async () => {
    mocks.mutation.mockRejectedValue(new Error("internal database detail"));
    expect((await submitCareerForm("createFact", new FormData())).message).not.toContain("database");
    mocks.mutation.mockClear();
    expect((await submitCareerForm("toString" as "createFact", new FormData())).status).toBe("error");
    expect(mocks.mutation).not.toHaveBeenCalled();
  });
  it("preserves authentication redirects", async () => {
    const redirect = Object.assign(new Error("login"), { digest: "NEXT_REDIRECT" });
    mocks.mutation.mockRejectedValue(redirect);
    await expect(submitCareerForm("createFact", new FormData())).rejects.toBe(redirect);
  });
  it("reuses an existing linked interview context instead of creating a second one", async () => {
    const lookups = ownerWith({ id: "opportunity", organization: "Test org", role_title: "Test role" }, { id: "existing", status: "active" });
    const data = new FormData(); data.set("opportunity_id", "opportunity");
    await expect(submitCareerForm("prepareOpportunityInterview", data)).rejects.toMatchObject({ digest: "/career/interview?context=existing" });
    expect(lookups).toEqual(["career_opportunities", "interview_contexts"]);
    expect(mocks.interview).not.toHaveBeenCalled();
  });
  it("opens a paused context for review without silently reactivating or duplicating it", async () => {
    ownerWith({ id: "opportunity", organization: "Test org", role_title: "Test role" }, { id: "paused", status: "paused" });
    const data = new FormData(); data.set("opportunity_id", "opportunity");
    await expect(submitCareerForm("prepareOpportunityInterview", data)).rejects.toMatchObject({ digest: "/career/interview/targets/paused" });
    expect(mocks.interview).not.toHaveBeenCalled();
  });
  it("builds the linked context from the authenticated opportunity, not browser-supplied snapshots", async () => {
    ownerWith({ id: "opportunity", organization: "Authoritative org", role_title: "Authoritative role" }, null);
    const data = new FormData(); data.set("opportunity_id", "opportunity"); data.set("title", "untrusted title");
    await submitCareerForm("prepareOpportunityInterview", data);
    const saved = mocks.interview.mock.calls[0][0] as FormData;
    expect(saved.get("title")).toBe("Authoritative org · Authoritative role");
    expect(saved.get("context_type")).toBe("opportunity");
    expect(saved.get("opportunity_id")).toBe("opportunity");
    expect(saved.get("return_to_workspace")).toBe("1");
  });
  it("never creates interview content if the opportunity is inaccessible", async () => {
    ownerWith(null, null);
    const result = await submitCareerForm("prepareOpportunityInterview", new FormData());
    expect(result.status).toBe("error");
    expect(mocks.interview).not.toHaveBeenCalled();
  });
});
