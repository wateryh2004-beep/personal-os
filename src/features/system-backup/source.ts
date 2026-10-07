import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { backupLimits, backupTables, rowKey, uuidPattern, validateBackupRow, type BackupRow } from "./contract";

export type BackupSource = (table: string, signal: AbortSignal) => AsyncIterable<BackupRow>;

/** RLS session client only. Never accepts an owner/table from a browser payload. */
export function createSystemBackupSource(supabase: SupabaseClient, owner: string): BackupSource {
  if (!uuidPattern.test(owner)) throw new Error("backup_invalid_owner");
  return async function* rows(table, signal) {
    const definition = backupTables[table];
    if (!definition) throw new Error("backup_unknown_table");
    let cursor: BackupRow | null = null;
    for (;;) {
      signal.throwIfAborted();
      let query = supabase.from(table).select(Object.keys(definition.columns).join(",")).eq("user_id", owner)
        .limit(backupLimits.pageRows).abortSignal(signal);
      for (const key of definition.primaryKey) query = query.order(key, { ascending: true });
      if (cursor) {
        // Primary keys are validated UUIDs before interpolation. Composite keyset
        // paging also handles a server row cap smaller than the requested limit.
        const previous = cursor;
        const clauses = definition.primaryKey.map((key, index) => {
          const filters = [...definition.primaryKey.slice(0, index).map(prior => `${prior}.eq.${previous[prior]}`), `${key}.gt.${previous[key]}`];
          return filters.length === 1 ? filters[0] : `and(${filters.join(",")})`;
        });
        query = query.or(clauses.join(","));
      }
      const { data, error } = await query;
      if (error || !Array.isArray(data)) throw new Error("backup_query_failed");
      if (!data.length) return;
      for (const row of data) {
        validateBackupRow(table, row, owner);
        if (cursor && rowKey(table, row) <= rowKey(table, cursor)) throw new Error("backup_pagination_failed");
        cursor = row;
        yield row;
      }
    }
  };
}
