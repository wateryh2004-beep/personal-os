import type { AssistantSupabase } from "@/features/assistant/tools/types";

type Row = Record<string, unknown>;
export function complianceDb(tables: Record<string, Row[]>) {
  const reads: string[] = [];
  const supabase = { from(table: string) {
    reads.push(table);
    const filters: Array<(row: Row) => boolean> = [];
    let limit = Infinity;
    let single = false;
    const query: Record<string, unknown> = new Proxy({}, { get(_target, method) {
      if (method === "then") {
        const rows = (tables[table] ?? []).filter(row => filters.every(filter => filter(row))).slice(0, limit);
        const promise = Promise.resolve({ data: single ? rows[0] ?? null : rows, count: rows.length, error: null });
        return promise.then.bind(promise);
      }
      return (...args: unknown[]) => {
        const key = String(args[0]);
        if (method === "eq" || method === "is") filters.push(row => (row[key] ?? null) === args[1]);
        if (method === "in" && Array.isArray(args[1])) { const values = args[1]; filters.push(row => values.includes(row[key])); }
        if (method === "not" && args[1] === "is") filters.push(row => (row[key] ?? null) !== args[2]);
        if (method === "limit") limit = Number(args[0]);
        if (method === "maybeSingle" || method === "single") single = true;
        return query;
      };
    }});
    return query;
  }} as unknown as AssistantSupabase;
  return { supabase, reads };
}
