import { ROOT_AGENT_CONSTITUTION } from "./constitution";
import { formatSkillInstructions, getSkills } from "../skills/registry";
import { instantToWallTime } from "@/features/calendar/timezone";
import type { AgentSessionState, ContextGateDecision } from "./types";

export function formatCurrentTimeForModel(now: Date, timezone: string) {
  const wall = instantToWallTime(now.toISOString(), timezone);
  const weekday = new Intl.DateTimeFormat("zh-CN", { timeZone: timezone, weekday: "long" }).format(now);
  return `现在（用户时区 ${timezone}）：${wall.slice(0, 10)} ${weekday} ${wall.slice(11)}`;
}

export function buildRootAgentPrompt(input: {
  timezone: string;
  now?: Date;
  userName?: string | null;
  sessionState: AgentSessionState;
  gateDecision: ContextGateDecision;
  currentSurfaceSummary?: string | null;
  currentPath?: string | null;
  availableToolNames?: string[];
}) {
  const activeSkills = getSkills(input.sessionState.activeSkills);
  const sections: string[] = [ROOT_AGENT_CONSTITUTION];

  if (input.userName) {
    sections.push(`IDENTITY\n你是 ${input.userName} 的私人 Personal OS 助手。自然地使用「你」称呼，不需要反复叫名字。`);
  }
  sections.push(
    input.now
      ? `CURRENT_TIME\n${formatCurrentTimeForModel(input.now, input.timezone)}`
      : `CURRENT_TIME\n用户时区：${input.timezone}`,
  );

  sections.push(
    `REQUEST_CONTEXT\nworkspace=${input.currentPath || "unknown"}; mode=${input.gateDecision.mode}; modules=${input.gateDecision.likelyModules.join(",") || "none"}; personal_data=${input.gateDecision.needsPersonalData}; tools=${input.availableToolNames?.join(",") || "none"}`,
  );

  if (
    input.sessionState.activeGoal ||
    input.sessionState.activeTopic ||
    input.sessionState.activeConstraints.length
  ) {
    sections.push(
      `SESSION_CONTEXT\ngoal=${input.sessionState.activeGoal ?? "none"}; topic=${input.sessionState.activeTopic ?? "none"}; constraints=${input.sessionState.activeConstraints.join("；") || "none"}`,
    );
  }

  if (input.currentSurfaceSummary) sections.push(`CURRENT_SURFACE\n${input.currentSurfaceSummary}`);

  const skillInstructions = formatSkillInstructions(activeSkills);
  if (skillInstructions) sections.push(skillInstructions);

  if (input.gateDecision.reasonCode === "conversation_only") {
    sections.push("本次只是简短寒暄：自然回应即可，不介绍系统能力，不主动列功能。 ");
  }

  return sections.join("\n\n");
}
