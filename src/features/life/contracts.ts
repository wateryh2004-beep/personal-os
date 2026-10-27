import { z } from "zod";

const identity = { id: z.uuid(), expected_revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1) };
export const quantityValue = z.string().regex(/^\d{1,9}(\.\d{1,3})?$/).refine((value) => Number(value) > 0, "数量须大于零");
export const quantityFields = z.object({ quantity: quantityValue.nullable(), quantity_unit: z.string().trim().min(1).max(24).nullable() }).refine((value) => (value.quantity === null) === (value.quantity_unit === null), "数量和单位一起填写");
const quantityItem = z.object({ ...identity, quantity: quantityValue.nullable(), quantity_unit: z.string().trim().min(1).max(24).nullable() }).strict().refine((value) => (value.quantity === null) === (value.quantity_unit === null));
const stopItem = z.object({ ...identity, day_number: z.number().int().min(1).max(366).nullable(), planned_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:00)?$/).nullable(), duration_minutes: z.number().int().min(1).max(10080).nullable() }).strict();
const progressItem = z.object({ ...identity, progress_unit: z.enum(["page", "episode", "minute"]).nullable(), progress_value: z.number().int().min(0).max(1000000).nullable(), progress_total: z.number().int().min(1).max(1000000).nullable() }).strict().refine((value) => value.progress_unit === null ? value.progress_value === null && value.progress_total === null : value.progress_value !== null && (value.progress_total === null || value.progress_value <= value.progress_total));
const batch = <T extends z.ZodType>(item: T) => z.array(item).min(1).max(20).refine((items) => new Set(items.map((value) => (value as { id: string }).id)).size === items.length, "不能重复选择记录");
export const lifeFieldInputSchema = z.discriminatedUnion("operation", [
  z.object({ requestId: z.uuid(), operation: z.literal("shopping_quantity"), items: batch(quantityItem) }).strict(),
  z.object({ requestId: z.uuid(), operation: z.literal("shopping_purchased"), items: batch(z.object(identity).strict()) }).strict(),
  z.object({ requestId: z.uuid(), operation: z.literal("travel_stop_metadata"), items: batch(stopItem) }).strict(),
  z.object({ requestId: z.uuid(), operation: z.literal("travel_stop_arrival"), items: batch(z.object({ ...identity, arrived: z.boolean() }).strict()) }).strict(),
  z.object({ requestId: z.uuid(), operation: z.literal("travel_stop_order"), items: batch(z.object({ ...identity, sort_order: z.number().int().min(0).max(1000000) }).strict()) }).strict(),
  z.object({ requestId: z.uuid(), operation: z.literal("travel_next_stop"), items: batch(z.object({ ...identity, current_stop_id: z.uuid().nullable(), next_stop_id: z.uuid().nullable() }).strict()) }).strict(),
  z.object({ requestId: z.uuid(), operation: z.literal("travel_document"), items: batch(z.object({ ...identity, document_id: z.uuid(), linked: z.boolean() }).strict()) }).strict(),
  z.object({ requestId: z.uuid(), operation: z.literal("leisure_progress"), items: batch(progressItem) }).strict(),
]);
export type LifeFieldInput = z.infer<typeof lifeFieldInputSchema>;
export const lifeFieldRowSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]));
export const lifeFieldResultSchema = z.object({ rows: z.array(lifeFieldRowSchema).min(1).max(20), receiptId: z.uuid(), duplicate: z.boolean() });
export type LifeFieldRow = z.infer<typeof lifeFieldRowSchema>;
export type LifeFieldResult = { ok: true; rows: LifeFieldRow[]; receiptId: string; replayed?: boolean } | { ok: false; error: "invalid" | "conflict" | "unavailable" | "not_ready"; message: string };

/** Only a matching authoritative receipt can confirm a frozen request. Missing never authorizes retry. */
export const lifeRequestOutcomeSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("saved"), receiptId: z.uuid(), receiptStatus: z.enum(["available", "undone"]), operation: z.enum(["shopping_quantity", "shopping_purchased", "travel_stop_metadata", "travel_stop_arrival", "travel_stop_order", "travel_next_stop", "travel_document", "leisure_progress"]), rows: z.array(lifeFieldRowSchema).min(1).max(20) }).strict(),
  z.object({ status: z.literal("missing") }).strict(),
  z.object({ status: z.literal("needs-check") }).strict(),
  z.object({ status: z.literal("rejected"), code: z.enum(["invalid", "conflict"]) }).strict(),
]);
export type LifeRequestOutcome = z.infer<typeof lifeRequestOutcomeSchema>;
