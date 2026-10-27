import "server-only";
import { fixtureBriefingEntryId } from "./continuous-domain-fixture-data";
import { z } from "zod";
import { briefingJudgmentIntentSchema } from "@/features/briefing/judgment-intents";
import type { FixtureState } from "./continuous-fixture-state";
const receiptSchema = z.object({ signature: z.string(), outcome: z.object({ status: z.literal("saved"), entryId: z.uuid(), decisionId: z.uuid(), updatedAt: z.string(), superseded: z.boolean() }).strict() }).strict();
export function syntheticJudgment(state: FixtureState, raw: unknown, readOnly: boolean) {
  const parsed = briefingJudgmentIntentSchema.safeParse(raw); if (!parsed.success) return { status: "rejected", code: "invalid", message: "请核对判断输入。" };
  if (parsed.data.entryId !== fixtureBriefingEntryId) return { status: "rejected", code: "invalid", message: "合成条目不可用。" };
  const input = parsed.data, key = `judgment:${input.intentId}`, signature = JSON.stringify(input), previous = receiptSchema.safeParse(state.domainObjects.get(key));
  if (previous.success) return previous.data.signature === signature ? previous.data.outcome : { status: "rejected", code: "conflict", message: "原判断意图已对应其他内容。" };
  if (readOnly) return { status: "needs-check", message: "尚未核对到原判断，不会重复保存。" };
  const current = z.object({ decisionId: z.uuid(), updatedAt: z.string() }).strict().nullable().parse(state.domainObjects.get(`decision:${input.entryId}`) ?? null);
  if (input.expectedDecisionId !== (current?.decisionId ?? null) || input.expectedUpdatedAt !== (current?.updatedAt ?? null)) return { status: "rejected", code: "conflict", message: "原判断已有新版本。" };
  const outcome = { status: "saved" as const, entryId: input.entryId, decisionId: current?.decisionId ?? crypto.randomUUID(), updatedAt: new Date().toISOString(), superseded: false };
  state.domainObjects.set(key, { signature, outcome }); state.domainObjects.set(`decision:${input.entryId}`, { decisionId: outcome.decisionId, updatedAt: outcome.updatedAt }); state.writes["judgment-save"] = (state.writes["judgment-save"] ?? 0) + 1;
  return outcome;
}
