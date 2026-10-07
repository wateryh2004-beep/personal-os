import schema from "./schema.json";

export type BackupRow = Record<string, unknown>;
export type BackupTable = {
  columns: Record<string, { type: string; nullable: boolean }>;
  primaryKey: string[];
  foreignKeys: { columns: string[]; table: string; targetColumns: string[] }[];
  excludedColumns: string[];
};
export const backupSchema = schema;
export const backupTables: Record<string, BackupTable> = schema.tables;
export const backupLimits = { pageRows: 25, rows: 250_000, bytes: 512 * 1024 * 1024, dataBytes: 128 * 1024 * 1024, lineBytes: 8 * 1024 * 1024 };
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Exact selected-column contract; migration inventory drift is checked by the native recovery job. */
export function validateBackupRow(table: string, row: unknown, owner: string): asserts row is BackupRow {
  const definition = backupTables[table];
  if (!definition || !row || typeof row !== "object" || Array.isArray(row)) throw new Error("backup_invalid_row");
  const value = row as BackupRow;
  if (value.user_id !== owner || !uuidPattern.test(owner)) throw new Error("backup_invalid_owner");
  if (Object.keys(value).length !== Object.keys(definition.columns).length) throw new Error("backup_schema_mismatch");
  for (const [name, field] of Object.entries(definition.columns)) {
    const cell = value[name];
    if (cell === null && field.nullable) continue;
    const valid = field.type === "uuid" ? typeof cell === "string" && uuidPattern.test(cell)
      : field.type === "number" ? typeof cell === "number" && Number.isFinite(cell) && Math.abs(cell) <= Number.MAX_SAFE_INTEGER
      : field.type === "array" ? Array.isArray(cell) && cell.every(item => typeof item === "string")
      : field.type === "json" ? cell !== undefined
      : typeof cell === field.type;
    if (!valid) throw new Error("backup_schema_mismatch");
  }
}

export function rowKey(table: string, row: BackupRow) {
  return backupTables[table].primaryKey.map(key => row[key] as string).join("/");
}
