import { describe, expect, it } from "vitest";
import { buildRootAgentPrompt } from "./prompt-builder";
import type { AgentSessionState, ContextGateDecision } from "./types";

const sessionState: AgentSessionState = {
  referencedEntities: [],
  activeConstraints: [],
  activeSkills: [],
  loadedModules: [],
  loadedSourceIds: [],
  discoveredToolNames: [],
  pendingActionIds: [],
  updatedAt: "2026-08-23T00:00:00.000Z",
};

const gate: ContextGateDecision = {
  mode: "targeted",
  complexity: "simple",
  likelyModules: ["calendar"],
  suggestedSkills: [],
  needsPersonalData: true,
  needsTools: true,
  needsCurrentSurface: false,
  reasonCode: "time_context",
};

describe("buildRootAgentPrompt", () => {
  it("describes the current request without dumping the full OS capability catalog", () => {
    const prompt = buildRootAgentPrompt({
      timezone: "Asia/Shanghai",
      now: new Date("2026-08-23T06:00:00.000Z"),
      userName: "Hang Yu",
      sessionState,
      gateDecision: gate,
      currentPath: "/calendar",
      availableToolNames: ["searchCalendar", "findFreeTime"],
    });

    expect(prompt).toContain("workspace=/calendar");
    expect(prompt).toContain("modules=calendar");
    expect(prompt).toContain("tools=searchCalendar,findFreeTime");
    expect(prompt).not.toContain("PERSONAL_OS_MANIFEST");
    expect(prompt).not.toContain("AVAILABLE_SKILLS");
  });
});
