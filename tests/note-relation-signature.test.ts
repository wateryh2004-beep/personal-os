import { describe, expect, it } from "vitest";
import { noteRelationSignature } from "@/features/notes/links/signature";

describe("note relation signature", () => {
  it("ignores ordinary prose changes but detects link changes", () => {
    expect(noteRelationSignature("plain prose")).toBe(noteRelationSignature("changed prose"));
    expect(noteRelationSignature("[[Project Plan]]")).not.toBe(noteRelationSignature("[[Project Plan|Plan]]"));
  });
});
