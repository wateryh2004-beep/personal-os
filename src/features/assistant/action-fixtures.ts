import type { approveAgentAction, rejectAgentAction, approveAgentActions, readAgentActionsState } from "./actions";
/** Only synthetic HTTP/ServerAction boundaries; ordinary builds reject this prop. */
export type AgentActionFixtureTransport = { approve: typeof approveAgentAction; reject: typeof rejectAgentAction; approveMany: typeof approveAgentActions; readMany: typeof readAgentActionsState };
