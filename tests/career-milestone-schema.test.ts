import { describe, expect, it } from "vitest";
import { careerMilestoneSchema } from "@/features/career/schemas";

const base = {
  track_id: "00000000-0000-4000-8000-000000000001",
  career_direction_id: null,
  title: "准备暑期实习",
  description: "",
  target_date: "2027-06-30",
  status: "planned",
  importance: "normal",
};

describe("career milestone time modes", () => {
  it("keeps an empty start date as a point", () => {
    const result = careerMilestoneSchema.parse({ ...base, starts_on: "" });
    expect(result.starts_on).toBeNull();
  });

  it("preserves a start date as a duration", () => {
    const result = careerMilestoneSchema.parse({ ...base, starts_on: "2026-09-01" });
    expect(result.starts_on).toBe("2026-09-01");
    expect(result.target_date).toBe("2027-06-30");
  });

  it("rejects a duration whose end precedes its start", () => {
    expect(careerMilestoneSchema.safeParse({ ...base, starts_on: "2027-07-01" }).success).toBe(false);
  });
});
