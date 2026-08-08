import { describe, expect, it } from "vitest";
import { projectSchema } from "@/features/projects/schemas";

describe("projectSchema", () => {
  it("normalizes an optional project description and due date", () => {
    expect(projectSchema.parse({ name: "Personal OS 2.0", description: "", due_date: "" })).toEqual({ name: "Personal OS 2.0", description: null, due_date: null });
  });

  it("rejects empty names and invalid dates", () => {
    expect(projectSchema.safeParse({ name: "", due_date: "2026-99-99" }).success).toBe(false);
  });
});
