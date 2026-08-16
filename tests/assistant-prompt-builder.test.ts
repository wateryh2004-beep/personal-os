import { describe, expect, it } from "vitest";
import { buildRootAgentPrompt } from "@/features/assistant/kernel/prompt-builder";
import type {
  AgentSessionState,
  ContextGateDecision,
} from "@/features/assistant/kernel/types";

const sessionState: AgentSessionState = {
  referencedEntities: [],
  activeConstraints: [],
  activeSkills: [],
  loadedModules: [],
  loadedSourceIds: [],
  discoveredToolNames: [],
  pendingActionIds: [],
  updatedAt: "2026-08-16T00:00:00.000Z",
};
const greetingGate: ContextGateDecision = {
  mode: "none",
  complexity: "simple",
  likelyModules: [],
  suggestedSkills: [],
  needsPersonalData: false,
  needsTools: false,
  needsCurrentSurface: false,
  reasonCode: "conversation_only",
};
const selfProfileGate: ContextGateDecision = {
  mode: "cross_module",
  complexity: "deep",
  likelyModules: ["memory", "notes", "reviews"],
  suggestedSkills: ["retrospective-thinking"],
  needsPersonalData: true,
  needsTools: true,
  needsCurrentSurface: false,
  reasonCode: "self_profile",
};

describe("Root agent prompt builder", () => {
  it("注入用户身份，寒暄时不注入 Manifest 与技能清单", () => {
    const prompt = buildRootAgentPrompt({
      timezone: "Asia/Shanghai",
      userName: "余航",
      sessionState,
      gateDecision: greetingGate,
    });
    expect(prompt).toContain("USER_IDENTITY");
    expect(prompt).toContain("余航");
    expect(prompt).not.toContain("PERSONAL_OS_MANIFEST");
    expect(prompt).not.toContain("AVAILABLE_SKILLS");
    expect(prompt).toContain("不要罗列功能");
  });

  it("需要个人数据时注入 Manifest 与技能清单", () => {
    const prompt = buildRootAgentPrompt({
      timezone: "Asia/Shanghai",
      userName: "余航",
      sessionState,
      gateDecision: selfProfileGate,
    });
    expect(prompt).toContain("USER_IDENTITY");
    expect(prompt).toContain("PERSONAL_OS_MANIFEST");
    expect(prompt).toContain("AVAILABLE_SKILLS");
    expect(prompt).toContain("REQUEST_GATE\nmode=cross_module");
  });
});
