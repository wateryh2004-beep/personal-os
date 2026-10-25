import { describe, expect, it } from "vitest";
import { lifeFieldInputSchema } from "@/features/life/contracts";
const requestId = "10000000-0000-4000-8000-000000000001";
const id = "20000000-0000-4000-8000-000000000001";
const quantity = { id, expected_revision: 2, quantity: "2.125", quantity_unit: "千克" };
describe("life field operations", () => {
  it("accepts explicit precision and preserves legacy unknown without invented quantity", () => {
    expect(lifeFieldInputSchema.safeParse({ requestId, operation: "shopping_quantity", items: [quantity] }).success).toBe(true);
    expect(lifeFieldInputSchema.safeParse({ requestId, operation: "shopping_quantity", items: [{ ...quantity, quantity: null, quantity_unit: null }] }).success).toBe(true);
    for (const bad of ["0", "-1", "1.2345", "1e3", "NaN"]) expect(lifeFieldInputSchema.safeParse({ requestId, operation: "shopping_quantity", items: [{ ...quantity, quantity: bad }] }).success).toBe(false);
  });
  it("rejects forged identity, inverse snapshots, duplicate targets and oversized batches", () => {
    for (const payload of [
      { requestId, operation: "shopping_quantity", items: [{ ...quantity, user_id: id }] },
      { requestId, operation: "shopping_quantity", items: [quantity], before: {} },
      { requestId, operation: "shopping_quantity", items: [quantity, quantity] },
      { requestId, operation: "shopping_quantity", items: Array.from({ length: 21 }, () => quantity) },
    ]) expect(lifeFieldInputSchema.safeParse(payload).success).toBe(false);
  });
  it("validates actual wall times and complete progress units with totals", () => {
    const time = { id, expected_revision: 1, day_number: 2, planned_time: "23:59", duration_minutes: 45 };
    expect(lifeFieldInputSchema.safeParse({ requestId, operation: "travel_stop_metadata", items: [time] }).success).toBe(true);
    expect(lifeFieldInputSchema.safeParse({ requestId, operation: "travel_stop_metadata", items: [{ ...time, planned_time: "24:00" }] }).success).toBe(false);
    const progress = { id, expected_revision: 1, progress_unit: "episode", progress_value: 5, progress_total: 12 };
    expect(lifeFieldInputSchema.safeParse({ requestId, operation: "leisure_progress", items: [progress] }).success).toBe(true);
    for (const patch of [{ progress_total: 3 }, { progress_value: null }, { progress_unit: null }, { progress_unit: "percent" }]) expect(lifeFieldInputSchema.safeParse({ requestId, operation: "leisure_progress", items: [{ ...progress, ...patch }] }).success).toBe(false);
  });
});
