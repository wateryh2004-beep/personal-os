import type { UIMessage } from "ai";
import type { AgentSessionState, ContextGateDecision } from "./types";

export function emptySessionState(): AgentSessionState { return { referencedEntities:[], activeConstraints:[], activeSkills:[], loadedModules:[], loadedSourceIds:[], discoveredToolNames:[], pendingActionIds:[], updatedAt:new Date().toISOString() }; }
function latestUserText(messages?: UIMessage[]) { return messages?.slice().reverse().find((message) => message.role === "user")?.parts.filter((part) => part.type === "text").map((part) => part.text).join("\n") ?? ""; }
export function deriveSessionState(previous: Partial<AgentSessionState> | null | undefined, messages: UIMessage[] | undefined, decision: ContextGateDecision): AgentSessionState {
  const state = { ...emptySessionState(), ...previous, referencedEntities:previous?.referencedEntities ?? [], activeConstraints:previous?.activeConstraints ?? [], loadedModules:previous?.loadedModules ?? [], loadedSourceIds:previous?.loadedSourceIds ?? [], discoveredToolNames:previous?.discoveredToolNames ?? [], pendingActionIds:previous?.pendingActionIds ?? [] };
  const text = latestUserText(messages).trim();
  if (text) { state.activeGoal = state.activeGoal && /那如果|只考虑|那么|这个/.test(text) ? state.activeGoal : text.slice(0, 300); state.activeTopic = /银行总行/.test(text) ? "银行总行" : (/北京|上海/.test(text) ? "北京与上海的比较" : state.activeTopic); if (/只考虑|如果/.test(text)) state.activeConstraints = [...new Set([...state.activeConstraints, text.slice(0, 180)])].slice(-8); }
  state.activeSkills = [...new Set([...state.activeSkills, ...decision.suggestedSkills])].slice(-6); state.lastContextMode = decision.mode; state.updatedAt = new Date().toISOString(); return state;
}
