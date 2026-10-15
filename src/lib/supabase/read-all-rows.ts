import type { PostgrestError } from "@supabase/supabase-js";

/** Internal complete collections only. Callers must order by a stable unique
 * key; user-facing feeds should use a bounded, explicit pagination contract. */
export async function readAllRows<Row>(query: {
  range: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: PostgrestError | null }>;
}) {
  const rows: Row[] = [];
  for (let offset = 0; ; offset += 500) {
    const result = await query.range(offset, offset + 499);
    // A failed page is unavailable, never a silently incomplete collection.
    if (result.error) return { data: null, error: result.error };
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < 500) return { data: rows, error: null };
  }
}
