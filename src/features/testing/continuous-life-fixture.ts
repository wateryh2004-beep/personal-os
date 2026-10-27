import "server-only";
import { lifeFieldInputSchema, type LifeFieldRow, type LifeFieldResult } from "@/features/life/contracts";
import type { OperationHistoryVerificationTransport } from "@/components/workbench/operation-history";
import { fixtureShopping, fixtureTrip, fixtureLeisure } from "./continuous-domain-fixture-data";
import type { FixtureState } from "./continuous-fixture-state";
import { fixtureTimestamp } from "./continuous-fixture-data";
export type SyntheticLifeReceipt = { id: string; requestId: string; payload: string; operation: string; before: LifeFieldRow[]; after: LifeFieldRow[]; status: "available" | "undone" };
export function initialSyntheticLifeRows(): Map<string, LifeFieldRow> {
  return new Map([...fixtureShopping.map(row => [row.id, { ...row }] as const), ...fixtureTrip.stops.map(row => [row.id, { ...row, trip_id: fixtureTrip.trip.id }] as const), [fixtureTrip.trip.id, { id: fixtureTrip.trip.id, mutation_revision: 1, status: fixtureTrip.trip.status, current_stop_id: fixtureTrip.trip.current_stop_id, next_stop_id: fixtureTrip.trip.next_stop_id }], ...fixtureLeisure.map(row => [row.id, { id: row.id, mutation_revision: row.feedback!.revision, progress_unit: row.feedback!.progress_unit, progress_value: row.feedback!.progress_value, progress_total: row.feedback!.progress_total }] as const)] as [string, LifeFieldRow][]);
}
const failed = (error: "invalid" | "conflict" | "not_ready"): LifeFieldResult => ({ ok: false, error, message: error === "conflict" ? "合成记录已有后续修改，请重新核对。" : "合成输入尚不能保存。" });
/** Synthetic external transaction only; the real Life controller still previews and confirms. */
export function applySyntheticLife(state: FixtureState, raw: unknown): LifeFieldResult {
  const parsed = lifeFieldInputSchema.safeParse(raw); if (!parsed.success) return failed("invalid");
  const input = parsed.data, payload = JSON.stringify(input), prior = [...state.lifeReceipts.values()].find(row => row.requestId === input.requestId);
  if (prior) return prior.payload === payload ? { ok: true, rows: structuredClone(prior.after), receiptId: prior.id, replayed: true } : failed("conflict");
  if (state.lifeReceipts.size >= 100) return failed("invalid");
  const before = input.items.map(item => state.lifeRows.get(item.id));
  if (before.some((row, i) => !row || row.mutation_revision !== input.items[i].expected_revision)) return failed("conflict");
  if (input.operation === "shopping_purchased" && before.some(row => row!.status !== "ready")) return failed("not_ready");
  const after = before.map((original, index) => {
    const row = { ...original! }, item = input.items[index];
    for (const [key, value] of Object.entries(item)) if (!["id", "expected_revision"].includes(key)) row[key] = value;
    if (input.operation === "shopping_purchased") { row.status = "purchased"; row.purchased_at = fixtureTimestamp; }
    if (input.operation === "travel_stop_arrival") { row.arrived_at = "arrived" in item && item.arrived ? fixtureTimestamp : null; delete row.arrived; }
    row.mutation_revision = Number(row.mutation_revision) + 1;
    return row;
  });
  const receipt: SyntheticLifeReceipt = { id: crypto.randomUUID(), requestId: input.requestId, payload, operation: input.operation, before: structuredClone(before as LifeFieldRow[]), after, status: "available" };
  for (const row of after) state.lifeRows.set(String(row.id), row);
  state.lifeReceipts.set(receipt.id, receipt); state.writes[input.operation] = (state.writes[input.operation] ?? 0) + 1;
  return { ok: true, rows: structuredClone(after), receiptId: receipt.id };
}
export function readSyntheticLife(state: FixtureState, id: string) {
  const receipt = state.lifeReceipts.get(id); return receipt ? { operation: receipt.operation, rows: receipt.after.map(row => ({ ...state.lifeRows.get(String(row.id))! })) } : null;
}
export function listSyntheticOperations(state: FixtureState): Awaited<ReturnType<OperationHistoryVerificationTransport["list"]>> {
  return [...state.lifeReceipts.values()].reverse().map(row => ({ id: row.id, operation: row.operation, status: row.status, target_id: String(row.after[0].id), created_at: fixtureTimestamp, expires_at: "2099-01-01T00:00:00Z", title: "合成领域记录", count: row.after.length }));
}
export function previewSyntheticUndo(state: FixtureState, id: string): Awaited<ReturnType<OperationHistoryVerificationTransport["preview"]>> {
  const row = state.lifeReceipts.get(id); if (!row) throw new Error("synthetic_receipt_missing");
  const conflict = row.after.some(after => state.lifeRows.get(String(after.id))?.mutation_revision !== after.mutation_revision);
  return { receiptId: row.id, title: "合成领域记录", count: row.after.length, operation: row.operation, status: row.status === "undone" ? "undone" : conflict ? "conflict" : "available", expiresAt: "2099-01-01T00:00:00Z", timezone: "UTC", provider: false, changes: row.before.flatMap((before, index) => Object.entries(before).filter(([key, value]) => !["id", "mutation_revision"].includes(key) && value !== row.after[index][key]).map(([key, value]) => ({ label: key, before: String(row.after[index][key] ?? "未设置"), after: String(value ?? "未设置") }))) };
}
export function undoSyntheticLife(state: FixtureState, id: string): Awaited<ReturnType<OperationHistoryVerificationTransport["undo"]>> {
  const row = state.lifeReceipts.get(id); if (!row) return { status: "error", message: "找不到合成回执。" };
  if (row.status === "undone") return { status: "success", message: "已撤销。", receiptId: id };
  if (previewSyntheticUndo(state, id).status !== "available") return { status: "conflict", message: "合成记录已有后续修改。" };
  for (const before of row.before) state.lifeRows.set(String(before.id), { ...before, mutation_revision: Number(state.lifeRows.get(String(before.id))!.mutation_revision) + 1 });
  row.status = "undone"; state.writes["life-undo"] = (state.writes["life-undo"] ?? 0) + 1;
  return { status: "success", message: "已撤销。", receiptId: id };
}
