import "server-only";
import { z } from "zod";
import { normalizePracticeIntent, practiceReceiptSchema } from "@/features/interview/practice-intents";
import type { FixtureState } from "./continuous-fixture-state";
import { fixturePracticeIds } from "./continuous-domain-fixture-data";
export function syntheticPracticeOperation(state: FixtureState, raw: unknown, readOnly: boolean) {
  const input = z.object({ mode: z.enum(["solo", "session"]), intentId: z.uuid(), entries: z.array(z.tuple([z.string().max(100), z.string().max(100000)])).max(80) }).strict().parse(raw);
  const form = new FormData(); for (const [key, value] of input.entries) form.append(key, value);
  const payload = normalizePracticeIntent(input.mode, form), signature = JSON.stringify(payload), key = `practice:${input.intentId}`;
  const prior = z.object({ signature: z.string(), receipt: practiceReceiptSchema }).strict().safeParse(state.domainObjects.get(key));
  if (prior.success) return prior.data.signature === signature ? { status: "saved", receipt: prior.data.receipt } : { status: "conflict", message: "合成意图已对应另一份回答。" };
  if (readOnly) return { status: "missing" };
  if (payload.preparation_id !== fixturePracticeIds.preparation || payload.mode !== "solo" || payload.parent_attempt_id && payload.parent_attempt_id !== fixturePracticeIds.parent) return { status: "rejected", message: "原合成练习不可用。" };
  const receipt = practiceReceiptSchema.parse({ attempt_id: input.intentId, preparation_id: fixturePracticeIds.preparation, session_id: null, sequence_no: null, question_id: fixturePracticeIds.question, created: true, archived: false });
  state.domainObjects.set(key, { signature, receipt }); state.domainObjects.set(`attempt:${input.intentId}`, { id: input.intentId, ...payload, prompt_snapshot: payload.prompt_snapshot ?? "合成问题：如何核对资料？", practiced_at: new Date().toISOString() }); state.writes["practice-save"] = (state.writes["practice-save"] ?? 0) + 1;
  return { status: "saved", receipt };
}
