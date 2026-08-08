import "server-only";
import { tool } from "ai";
import { inboxProposalSchema } from "@/features/inbox/schemas";
import type { AssistantToolModule } from "./types";

export const inboxTools: AssistantToolModule = {
  definitions: [{ name: "proposeInboxDestination", group: "inbox_proposal", risk: "proposal", description: "Inbox 去向提案" }],
  build: () => ({
    proposeInboxDestination: tool({
      description: "为一条 Inbox 记录生成明确去向提案，不会直接写入数据。",
      inputSchema: inboxProposalSchema,
      execute: async (proposal) => ({ proposal }),
    }),
  }),
};
