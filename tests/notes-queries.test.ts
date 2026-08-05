import { describe, expect, it } from "vitest";
import { isNotesWorkspaceSchemaMissing } from "@/features/notes/queries";

describe("Notes database compatibility", () => {
  it("recognizes missing Notes Workspace relations and columns", () => {
    expect(isNotesWorkspaceSchemaMissing({ code: "PGRST204" })).toBe(true);
    expect(isNotesWorkspaceSchemaMissing({ code: "PGRST205" })).toBe(true);
    expect(isNotesWorkspaceSchemaMissing({ code: "42703" })).toBe(true);
  });

  it("does not disguise an authorization or network failure as a schema fallback", () => {
    expect(isNotesWorkspaceSchemaMissing({ code: "42501" })).toBe(false);
    expect(isNotesWorkspaceSchemaMissing(null)).toBe(false);
  });
});
