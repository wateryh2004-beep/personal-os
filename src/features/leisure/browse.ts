import { leisureKinds, type LeisureKind, type LeisureSummary } from "./types";
import { emptyLeisureContext, matchesLeisureContext, type LeisureContext } from "./presentation";

export type LeisureBrowse = { kind: LeisureKind | "all"; context: LeisureContext };
export function readLeisureBrowse(params: Pick<URLSearchParams, "get">): LeisureBrowse {
  const kind = params.get("kind");
  const oneOf = (key: string, values: string[]) => { const value = params.get(key); return value && values.includes(value) ? value : ""; };
  return {
    kind: leisureKinds.includes(kind as LeisureKind) ? kind as LeisureKind : "all",
    context: {
      minutes: oneOf("minutes", ["30", "60", "120", "240"]),
      setting: oneOf("setting", ["home", "out"]),
      company: oneOf("company", ["solo", "together"]),
      budget: oneOf("budget", ["free", "paid"]),
    },
  };
}
export function leisureBrowseQuery({ kind, context }: LeisureBrowse): string {
  const params = new URLSearchParams();
  if (kind !== "all") params.set("kind", kind);
  for (const key of Object.keys(emptyLeisureContext) as (keyof LeisureContext)[]) if (context[key]) params.set(key, context[key]);
  // Re-parse to keep even caller-supplied state within the same bounded vocabulary.
  const safe = readLeisureBrowse(params);
  const result = new URLSearchParams();
  if (safe.kind !== "all") result.set("kind", safe.kind);
  for (const [key, value] of Object.entries(safe.context)) if (value) result.set(key, value);
  return result.toString();
}
export function leisureDetailHref(base: string, id: string, browse: LeisureBrowse): string {
  const query = leisureBrowseQuery(browse);
  return `${base}${encodeURIComponent(id)}${query ? `${base.includes("?") ? "&" : "?"}from=${encodeURIComponent(query)}` : ""}`;
}
/** Next searchParams can contain repeated keys. Bound them before parsing. */
export function normalizeLeisureFrom(value: unknown): string {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" && first.length <= 1024 ? leisureBrowseQuery(readLeisureBrowse(new URLSearchParams(first))) : "";
}
/** Never take a return URL from query input. Only validated filter values survive. */
export function leisureBackHref(from: unknown, base = "/leisure"): string {
  const query = normalizeLeisureFrom(from);
  return `${base}${query ? `${base.includes("?") ? "&" : "?"}${query}` : ""}${query ? "#leisure-collection" : ""}`;
}
export function leisureNeighbors(items: LeisureSummary[], id: string, browse: LeisureBrowse) {
  const choices = items.filter((item) => (browse.kind === "all" || item.kind === browse.kind) && matchesLeisureContext(item, browse.context));
  const index = choices.findIndex((item) => item.id === id);
  if (index < 0 || choices.length < 2) return [];
  const next = choices[(index + 1) % choices.length];
  const previous = choices[(index - 1 + choices.length) % choices.length];
  return previous.id === next.id ? [{ item: next, direction: "next" as const }] : [{ item: previous, direction: "previous" as const }, { item: next, direction: "next" as const }];
}
