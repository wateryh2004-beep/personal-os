import { describe, expect, it } from "vitest";
import { z } from "zod";
import { memoryCreateToolInputSchema, parseMemoryCreateToolInput } from "./provider-schemas";

describe("memoryCreateToolInputSchema", () => {
  it("serializes as a top-level JSON Schema object for OpenAI-compatible providers", () => {
    const jsonSchema = z.toJSONSchema(memoryCreateToolInputSchema);
    expect(jsonSchema.type).toBe("object");
    expect(jsonSchema.properties).toHaveProperty("type");
  });

  it("keeps strict working-memory invariants behind the transport schema", () => {
    expect(
      parseMemoryCreateToolInput({
        type: "working",
        title: "Current focus",
        content: "Ship Personal AI V2",
        reason: "Temporary active work",
      }).success,
    ).toBe(false);

    expect(
      parseMemoryCreateToolInput({
        type: "working",
        title: "Current focus",
        content: "Ship Personal AI V2",
        reason: "Temporary active work",
        reviewAt: "2026-09-01T00:00:00+08:00",
      }).success,
    ).toBe(true);
  });
});
