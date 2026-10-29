import { expect, it } from "vitest";
import { experienceReviewDue } from "@/features/experience-library/review-due";
const now = Date.parse("2027-01-29T00:00:00Z");
it("asks for a fresh review after 90 days without automatically marking a source outdated", () => {
  expect(experienceReviewDue("2026-10-01T00:00:00Z", null, now)).toBe(true);
  expect(experienceReviewDue("2026-10-01T00:00:00Z", "2027-01-20T00:00:00Z", now)).toBe(false);
  expect(experienceReviewDue("2026-10-01T00:00:00Z", "2026-10-31T00:00:00Z", now)).toBe(true);
});
