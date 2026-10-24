import type { UIMessage } from "ai";

export type AssistantStreamSource = {
  id?: string;
  entityId?: string | null;
  entityType?: string | null;
  timestamp?: string | null;
  reasons?: string[];
  title: string;
  domain: string;
  href?: string | null;
};

/** Old persisted note sources used citation IDs; recover only a precise UUID. */
export function sourceEntityId(source: Pick<AssistantStreamSource, "id" | "entityId" | "href" | "domain">) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (source.entityId && uuid.test(source.entityId)) return source.entityId;
  if (source.id && uuid.test(source.id)) return source.id;
  const match = source.domain === "notes" ? source.href?.match(/^\/notes\/([^/?#]+)(?:[?#].*)?$/) : null;
  return match && uuid.test(match[1]) ? match[1] : null;
}

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
