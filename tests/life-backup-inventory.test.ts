import { expect, it } from "vitest";
import schema from "@/features/system-backup/schema.json";
it("keeps the portable stream's alphabetical table order with nonempty life/scene additions", () => {
  const tables = Object.keys(schema.tables);
  expect(tables).toEqual([...tables].sort());
  expect(schema.tables.trip_documents.columns.document_id.type).toBe("uuid");
  expect(schema.tables.trips.columns.current_stop_id.nullable).toBe(true);
  expect(schema.tables.purchase_items.columns.quantity.nullable).toBe(true);
  expect(schema.tables.leisure_feedback.columns.progress_value.nullable).toBe(true);
  expect(schema.tables.workspace_scenes.columns.snapshot.type).toBe("json");
  expect(schema.excludedTables.workspace_action_receipts).toContain("never restore");
  expect(schema.excludedTables.workspace_original_checks).toContain("never restore");
});
