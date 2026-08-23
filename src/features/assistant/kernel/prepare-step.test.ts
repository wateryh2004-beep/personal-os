import { describe, expect, it } from "vitest";
import { initialToolNames } from "./prepare-step";
import type { ContextGateDecision } from "./types";

function decision(overrides: Partial<ContextGateDecision>): ContextGateDecision {
  return {
    mode: "targeted",
    complexity: "simple",
    likelyModules: [],
    suggestedSkills: [],
    needsPersonalData: true,
    needsTools: true,
    needsCurrentSurface: false,
    reasonCode: "personal_fact",
    ...overrides,
  };
}

describe("initialToolNames", () => {
  it("exposes only memory readers for a memory lookup", () => {
    const names = initialToolNames(decision({ likelyModules: ["memory"] }));
    expect(names).toContain("searchMemory");
    expect(names).toContain("getRelevantMemories");
    expect(names).not.toContain("proposeMemory");
    expect(names).not.toContain("proposeCalendarEvent");
  });

  it("adds proposal tools only for an explicit action", () => {
    const names = initialToolNames(
      decision({ mode: "action", likelyModules: ["calendar"], reasonCode: "mutation" }),
    );
    expect(names).toContain("searchCalendar");
    expect(names).toContain("proposeCalendarEvent");
    expect(names).not.toContain("proposeMemory");
  });

  it("adds compact cross-module search for multi-module analysis", () => {
    const names = initialToolNames(
      decision({ mode: "cross_module", complexity: "deep", likelyModules: ["memory", "notes"] }),
    );
    expect(names).toContain("searchPersonalOs");
    expect(names).not.toContain("proposeMemory");
    expect(names).not.toContain("proposeNoteUpdate");
  });

  it("returns no tools when the request does not need Personal OS", () => {
    expect(
      initialToolNames(
        decision({
          mode: "none",
          likelyModules: [],
          needsPersonalData: false,
          needsTools: false,
          reasonCode: "general_knowledge",
        }),
      ),
    ).toEqual([]);
  });
});
