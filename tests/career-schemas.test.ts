import { describe, expect, it } from "vitest";
import { applicationSchema, bulletSchema, canApproveBullet, certificationSchema, experienceSchema, opportunitySchema, redactCertificationForExport } from "@/features/career/schemas";

describe("Career schemas", () => {
  it("rejects an end date on a current experience", () => expect(experienceSchema.safeParse({ experience_type: "internship", organization: "Org", is_current: true, start_date: "2026-01-01", end_date: "2026-02-01", confidentiality_level: "private", status: "draft" }).success).toBe(false));
  it("rejects certification expiry before issue", () => expect(certificationSchema.safeParse({ name: "Test", status: "issued", issue_date: "2026-02-01", expiry_date: "2026-01-01" }).success).toBe(false));
  it("requires a human, evidence-backed bullet for approval", () => { expect(canApproveBullet({ hasFact: false, source: "human" })).toBe(false); expect(canApproveBullet({ hasFact: true, source: "ai_draft" })).toBe(false); expect(canApproveBullet({ hasFact: true, source: "human" })).toBe(true); });
  it("keeps bullet content separate from its input ownership", () => expect(bulletSchema.safeParse({ experience_id: "00000000-0000-4000-8000-000000000001", content: "真实表达", language: "zh-CN", source: "human" }).success).toBe(true));
  it("removes sensitive credential numbers from ordinary exports", () => expect(redactCertificationForExport({ name: "Certificate", credential_number: "secret" })).toEqual({ name: "Certificate" }));
});


describe("Career four-layer recording rules", () => {
  const vacancy = {
    organization: "Example financial institution", role_title: "Credit Intern",
    opportunity_type: "internship", status: "watching",
    source_url: "https://example.com/jobs/123", recruitment_cycle: "2027 Summer",
  };
  const application = { opportunity_id: "00000000-0000-4000-8000-000000000001", status: "preparing" };

  it("does not let a hypothetical career goal masquerade as a sourced vacancy", () => {
    expect(opportunitySchema.safeParse(vacancy).success).toBe(true);
    expect(opportunitySchema.safeParse({ ...vacancy, source_url: "" }).success).toBe(false);
    expect(opportunitySchema.safeParse({ ...vacancy, recruitment_cycle: "" }).success).toBe(false);
    expect(opportunitySchema.safeParse({ ...vacancy, source_url: "not-a-url" }).success).toBe(false);
    expect(opportunitySchema.safeParse({ ...vacancy, source_url: "javascript:alert(1)" }).success).toBe(false);
  });

  it("treats preparing an application as a draft, never a submitted application", () => {
    expect(applicationSchema.safeParse(application).success).toBe(true);
    expect(applicationSchema.safeParse({ ...application, status: "submitted" }).success).toBe(false);
    expect(applicationSchema.safeParse({ ...application, status: "submitted", applied_at: "2026-10-20T09:00:00+08:00" }).success).toBe(true);
    expect(applicationSchema.safeParse({ ...application, status: "preparing", applied_at: "2026-10-20T09:00:00+08:00" }).success).toBe(false);
  });
});
