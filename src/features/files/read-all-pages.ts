/** Stable-key paging avoids API row caps. Fail explicitly rather than omit rows. */
export async function readAllFilePages<T extends { id: string }>(fetchPage: (after: string | null, limit: number) => PromiseLike<{ data: T[] | null; error: unknown }>, maximum = 20_000) {
  const rows: T[] = [];
  let after: string | null = null;
  while (true) {
    const result = await fetchPage(after, 200);
    if (result.error || !result.data) throw new Error("files_page_unavailable");
    if (!result.data.length) return rows;
    for (const row of result.data) {
      if (!row.id || (after !== null && row.id <= after)) throw new Error("files_page_out_of_order");
      rows.push(row);
      after = row.id;
      if (rows.length > maximum) throw new Error("files_listing_limit");
    }
    // Continue even for short pages: deployments may enforce a lower API cap.
  }
}
