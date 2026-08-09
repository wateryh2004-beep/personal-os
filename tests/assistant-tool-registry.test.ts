import { describe, expect, it } from "vitest";
import {
  assistantToolRegistry,
  definitionsForGroups,
} from "@/features/assistant/tools/registry";

describe("Assistant tool registry", () => {
  it("keeps every model-visible tool read-only or proposal-only", () => {
    expect(assistantToolRegistry.length).toBeGreaterThan(20);
    expect(assistantToolRegistry.every((tool) => tool.risk !== "execute")).toBe(true);
    expect(new Set(assistantToolRegistry.map((tool) => tool.name)).size).toBe(
      assistantToolRegistry.length,
    );
  });

  it("selects tools only from explicitly allowed groups", () => {
    const tools = definitionsForGroups(["notes_read", "notes_proposal"]);
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "listRecentNotes",
      "proposeNoteCreate",
      "proposeNoteUpdate",
      "readNote",
      "readNotesBatch",
      "searchNotes",
    ]);
  });
});
