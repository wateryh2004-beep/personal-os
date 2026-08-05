import { describe, expect, it } from "vitest";
import { bulletSchema, canApproveBullet, certificationSchema, experienceSchema, redactCertificationForExport } from "@/features/career/schemas";

describe("Career schemas", () => {
  it("rejects an end date on a current experience", () => expect(experienceSchema.safeParse({ experience_type: "internship", organization: "Org", is_current: true, start_date: "2026-01-01", end_date: "2026-02-01", confidentiality_level: "private", status: "draft" }).success).toBe(false));
  it("rejects certification expiry before issue", () => expect(certificationSchema.safeParse({ name: "Test", status: "issued", issue_date: "2026-02-01", expiry_date: "2026-01-01" }).success).toBe(false));
  it("requires a human, evidence-backed bullet for approval", () => { expect(canApproveBullet({ hasFact: false, source: "human" })).toBe(false); expect(canApproveBullet({ hasFact: true, source: "ai_draft" })).toBe(false); expect(canApproveBullet({ hasFact: true, source: "human" })).toBe(true); });
  it("keeps bullet content separate from its input ownership", () => expect(bulletSchema.safeParse({ experience_id: "00000000-0000-4000-8000-000000000001", content: "真实表达", language: "zh-CN", source: "human" }).success).toBe(true));
  it("removes sensitive credential numbers from ordinary exports", () => expect(redactCertificationForExport({ name: "Certificate", credential_number: "secret" })).toEqual({ name: "Certificate" }));
});
