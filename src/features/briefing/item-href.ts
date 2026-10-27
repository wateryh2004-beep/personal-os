/** Shared presentation projection; it performs no model, provider, or database read. */
export function getBriefingItemHref(item: { canonical_url?: string | null; url?: string | null }) {
  return item.canonical_url || item.url || undefined;
}
