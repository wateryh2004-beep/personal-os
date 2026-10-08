import { backupTables, type BackupRow } from "@/features/system-backup/contract";
import artworkRegistry from "@/features/system-backup/artwork-registry.json";
import type { ArtworkBackup } from "@/features/system-backup/artwork";
import type { BackupSource } from "@/features/system-backup/source";
export const backupOwner = "00000000-0000-4000-8000-000000000001";
export function backupId(n: number) { return `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`; }
export function backupRow(table: string, n: number, overrides: BackupRow = {}): BackupRow {
  const row = Object.fromEntries(Object.entries(backupTables[table].columns).map(([name, field]) => [name,
    name === "user_id" || name === "created_by" ? backupOwner : name === "id" ? backupId(n) : field.nullable ? null
      : field.type === "uuid" ? backupId(n) : field.type === "number" ? 1 : field.type === "boolean" ? false
      : field.type === "json" ? {} : field.type === "array" ? [] : name.endsWith("_at") ? "2026-10-07T00:00:00Z" : "fixture",
  ]));
  return { ...row, ...overrides };
}
export function backupSource(data: Record<string, BackupRow[]>): BackupSource {
  return async function* (table, signal) { for (const row of data[table] ?? []) { signal.throwIfAborted(); yield row; } };
}
export function backupFixture(): Record<string, BackupRow[]> {
  return {
    profiles: [backupRow("profiles", 9, { storage_budget_gib: 12.5 })],
    areas: [backupRow("areas", 10, { name: "学习" })],
    projects: [backupRow("projects", 20, { area_id: backupId(10), name: "演练项目" })],
    note_folders: [backupRow("note_folders", 30, { name: "研究" }), backupRow("note_folders", 31, { parent_id: backupId(30), name: "分组" })],
    notes: [backupRow("notes", 40, { project_id: backupId(20), folder_id: backupId(31), title: "笔记 α", body_markdown: "# 原始 Markdown\n\n精确保留 **内容** 🌱\n", status: "trashed", deleted_at: "2026-10-06T00:00:00Z" })],
    note_versions: [backupRow("note_versions", 50, { note_id: backupId(40), body_markdown: "第一版\n", version_number: 1 }), backupRow("note_versions", 51, { note_id: backupId(40), body_markdown: "第二版\n", version_number: 2 })],
    tags: [backupRow("tags", 60, { name: "备份" })],
    note_tags: [backupRow("note_tags", 61, { note_id: backupId(40), tag_id: backupId(60) })],
    note_links: [backupRow("note_links", 62, { source_note_id: backupId(40), target_note_id: backupId(40) })],
    entity_links: [backupRow("entity_links", 63, { source_type: "note", source_id: backupId(40), target_type: "project", target_id: backupId(20), metadata: { nested: ["原文", 1, true, null] } })],
    investment_accounts: [backupRow("investment_accounts", 70, { mode: "paper", currency: "CNY", revision: 3 })],
    investment_ledger: [backupRow("investment_ledger", 71, { account_id: backupId(70), kind: "buy", quantity: "1234.00000001", price: "1.00000009", fees: "0", source: "Synthetic test fixture" })],
    investment_cash_ledger: [backupRow("investment_cash_ledger", 74, { account_id: backupId(70), kind: "dividend", sequence: 2, amount: "20.00000001", tax: "0", fees: "0", symbol: "TEST" })],
    investment_quotes: [backupRow("investment_quotes", 75, { account_id: backupId(70), currency: "CNY", sequence: 3, price: "9.12345678", as_of: "2026-10-01T00:00:00Z", symbol: "TEST" })],
    investment_strategy_versions: [backupRow("investment_strategy_versions", 72, { body_markdown: "合成测试版本" })],
    investment_research_runs: [backupRow("investment_research_runs", 73, { strategy_version_id: backupId(72), provenance: { producer: "synthetic fixture", limitations: "not financial data" }, source_urls: ["https://example.com/synthetic"] })],
  };
}

/** Explicit synthetic fixture: all registry imports are known absent. */
export function noArtwork(): ArtworkBackup {
  return { inventory: { status: "complete", entries: artworkRegistry.map(entry => ({ id: entry.id, status: "not_imported", manifest: null, manifestSha256: null, manifestBytes: null })) },
    objects: async function* () {}, stable: async () => true };
}
