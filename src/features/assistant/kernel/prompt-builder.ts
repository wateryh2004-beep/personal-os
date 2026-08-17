import { ROOT_AGENT_CONSTITUTION } from "./constitution";
import { formatOsManifestForModel } from "./os-manifest";
import { formatSkillCatalogForModel, formatSkillInstructions, getSkills } from "../skills/registry";
import { instantToWallTime } from "@/features/calendar/timezone";
import type { AgentSessionState, ContextGateDecision } from "./types";

export function formatCurrentTimeForModel(now: Date, timezone: string) {
  const wall = instantToWallTime(now.toISOString(), timezone);
  const weekday = new Intl.DateTimeFormat("zh-CN", { timeZone: timezone, weekday: "long" }).format(now);
  return `现在（用户时区 ${timezone}）：${wall.slice(0, 10)} ${weekday} ${wall.slice(11)}`;
}
export function buildRootAgentPrompt(input:{ timezone:string; now?: Date; userName?: string | null; sessionState:AgentSessionState; gateDecision:ContextGateDecision; currentSurfaceSummary?:string | null }) {
  const active=getSkills(input.sessionState.activeSkills);
  const sections:string[]=[ROOT_AGENT_CONSTITUTION];
  if(input.userName) sections.push(`USER_IDENTITY\n你是 ${input.userName} 的 Personal OS 助手，只为本用户服务，当前对话方就是本用户本人。用「${input.userName}」或「你」称呼本用户，不要用「用户」这类泛指来指代；称呼要自然，不必每句都喊名字。`);
  if(input.now) sections.push(`CURRENT_TIME\n${formatCurrentTimeForModel(input.now, input.timezone)}`);
  else sections.push(`当前时区：${input.timezone}。`);
  if(input.gateDecision.needsTools) sections.push(`PERSONAL_OS_MANIFEST\n${formatOsManifestForModel()}`);
  if(input.gateDecision.needsTools) sections.push(`AVAILABLE_SKILLS\n${formatSkillCatalogForModel()}`);
  sections.push(`REQUEST_GATE\nmode=${input.gateDecision.mode}; modules=${input.gateDecision.likelyModules.join(",")||"none"}; personal_data=${input.gateDecision.needsPersonalData}`);
  sections.push(`SESSION_STATE\ngoal=${input.sessionState.activeGoal??"none"}; topic=${input.sessionState.activeTopic??"none"}; constraints=${input.sessionState.activeConstraints.join("；")||"none"}`);
  if(input.currentSurfaceSummary) sections.push(`CURRENT_SURFACE\n${input.currentSurfaceSummary}`);
  const skillInstructions=formatSkillInstructions(active);
  if(skillInstructions) sections.push(skillInstructions);
  if(input.gateDecision.reasonCode==="conversation_only") sections.push(`本次是纯寒暄：用一句话自然回应并带上称呼即可，不要罗列功能、不要提问，把主动权交还用户。`);
  return sections.join("\n\n");
}
