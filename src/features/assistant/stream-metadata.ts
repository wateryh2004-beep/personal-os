import type { UIMessage } from "ai";

export type AssistantStreamSource = {
  title: string;
  domain: string;
  href?: string | null;
};

export type AssistantMessageMetadata = {
  createdAt?: number;
  model?: string;
  auditId?: string;
  retrievalMode?: string;
  contextChars?: number;
  sources?: AssistantStreamSource[];
  ttftMs?: number | null;
  setupMs?: number;
  durationMs?: number;
  duplicateReadCalls?: number;
  totalTokens?: number;
  finishReason?: string;
};

export type AssistantUIMessage = UIMessage<AssistantMessageMetadata>;
