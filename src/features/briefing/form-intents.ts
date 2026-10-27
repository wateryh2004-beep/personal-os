import { z } from "zod";

const raw = z.string().max(4000);
const base = { intentId: z.string().uuid() };
const version = { expectedUpdatedAt: z.string().datetime({ offset: true }).nullable() };
const governance = { category: raw, personal_priority: z.enum(["core", "important", "normal", "explore"]), source_quality: z.enum(["primary", "high", "standard", "opinion"]), reason_for_subscription: raw };
const interest = { name: raw, weight: raw, keywords: raw, excluded_keywords: raw };
export const briefingFormIntentSchema = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("feed-create"), title: raw, feed_url: raw, category: raw }).strict(),
  z.object({ ...base, ...version, ...governance, kind: z.literal("feed-edit"), feed_id: z.string().uuid() }).strict(),
  z.object({ ...base, ...version, ...governance, kind: z.literal("feed-verify"), feed_id: z.string().uuid() }).strict(),
  z.object({ ...base, ...interest, kind: z.literal("interest-create") }).strict(),
  z.object({ ...base, ...version, ...interest, kind: z.literal("interest-edit"), interest_id: z.string().uuid() }).strict(),
  z.object({ ...base, kind: z.literal("exclusion-create"), phrase: raw }).strict(),
  z.object({ ...base, ...version, kind: z.literal("settings"), generation_mode: z.enum(["scheduled", "on_open", "manual"]), ai_enabled: z.boolean(), daily_input_token_budget: raw, max_ai_candidates: raw, max_selected_items: raw, budget_exhaustion_behavior: z.enum(["fallback", "pause"]) }).strict(),
]);
export type BriefingFormIntent = z.infer<typeof briefingFormIntentSchema>;
export type BriefingFormOutcome = { status: "saved"; id: string; updatedAt: string; message: string } | { status: "needs-check"; message: string } | { status: "rejected"; code: "invalid" | "conflict" | "unavailable"; message: string };
