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
  it("注入用户身份，寒暄时不注入全量能力目录", () => {
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

  it("提供 now 时注入 CURRENT_TIME 真实时间，否则回退到时区行", () => {
    const withNow = buildRootAgentPrompt({
      timezone: "Asia/Shanghai",
      now: new Date("2026-08-16T04:00:00.000Z"),
      userName: "余航",
      sessionState,
      gateDecision: greetingGate,
    });
    expect(withNow).toContain("CURRENT_TIME\n现在（用户时区 Asia/Shanghai）：2026-08-16 星期日 12:00");
    expect(withNow).not.toContain("当前时区：Asia/Shanghai。");
    const withoutNow = buildRootAgentPrompt({
      timezone: "Asia/Shanghai",
      userName: "余航",
      sessionState,
      gateDecision: greetingGate,
    });
    expect(withoutNow).toContain("当前时区：Asia/Shanghai。");
    expect(withoutNow).not.toContain("现在（用户时区 Asia/Shanghai）");
  });

  it("个人分析只注入本次请求范围，而不是完整 Manifest 与技能目录", () => {
    const prompt = buildRootAgentPrompt({
      timezone: "Asia/Shanghai",
      userName: "余航",
      sessionState,
      gateDecision: selfProfileGate,
      currentPath: "/today",
      availableToolNames: ["searchMemory", "searchNotes", "searchPersonalOs"],
    });
    expect(prompt).toContain("USER_IDENTITY");
    expect(prompt).toContain("REQUEST_CONTEXT");
    expect(prompt).toContain("workspace=/today");
    expect(prompt).toContain("mode=cross_module");
    expect(prompt).toContain("modules=memory,notes,reviews");
    expect(prompt).toContain("tools=searchMemory,searchNotes,searchPersonalOs");
    expect(prompt).not.toContain("PERSONAL_OS_MANIFEST");
    expect(prompt).not.toContain("AVAILABLE_SKILLS");
  });
});
