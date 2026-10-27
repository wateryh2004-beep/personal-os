import { parseSourceLocator } from "@/features/links/source-locator";
import { z } from "zod";
import type { NoteDocumentData } from "@/features/notes/queries";

export const workbenchKinds = ["note", "document", "task", "event", "project", "opportunity", "shopping", "trip", "leisure", "investment"] as const;
export const workbenchRefSchema = z.object({
  kind: z.enum(workbenchKinds), id: z.string().uuid(),
  investmentType: z.enum(["account", "ledger", "strategy", "research"]).optional(),
}).strict().superRefine((value, context) => {
  if (value.kind !== "investment" && value.investmentType) context.addIssue({ code: "custom", message: "投资类型只适用于投资记录。" });
});
export type WorkbenchRef = z.infer<typeof workbenchRefSchema>;
export const workbenchRefKey = (value: WorkbenchRef) => `${value.kind}:${value.investmentType ?? "account"}:${value.id}`;
export const comparableKinds = ["shopping", "opportunity", "trip", "investment"] as const;
export function workbenchComparable(ref: WorkbenchRef) { return (comparableKinds as readonly string[]).includes(ref.kind); }

const workbenchPathPattern = new RegExp("^/(today|notes(/(trash|ask|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))?|files|tasks|calendar|projects|career(/(profile|skills|resumes|applications|certifications|experiences(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?|search|interview(/(questions(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?|practice(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?|targets(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?|stories(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?|sessions(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?|insights|consistency))?|capital|directions|materials|opportunities(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/materials)?|roadmap))?|shopping(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?|travel(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?|leisure(/(artwork-storage|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))?|investments|investing|inbox|reviews(/(daily|weekly|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))?|briefing(/(events|interests|sources|history(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?))?|settings|photos|memory)$", "i");
/** Strict application destinations, never authentication/API/provider or arbitrary URLs. */
export function safeWorkbenchHref(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048 || !value.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u001f]/.test(value)) return null;
  try {
    const url = new URL(value, "https://personal-os.local");
    if (/%(?:2f|5c|00|0a|0d)/i.test(url.pathname)) return null;
    if (url.origin !== "https://personal-os.local" || !workbenchPathPattern.test(url.pathname)) return null;
    const sourceLocator = parseSourceLocator(value);
    if (sourceLocator) return `${url.pathname}${url.search}`;
    // A scene may restore view state, but never re-trigger creation or an action.
    const ids = new Set(["entry", "parent", "stop","folder", "file", "task", "event", "item", "resume", "context", "question", "answer", "direction"]);
    const enums: Record<string, readonly string[]> = {
      scope: ["context", "all"],
      view: url.pathname === "/files" ? ["list", "grid"] : url.pathname.startsWith("/notes") ? ["all", "favorites", "recent"] : url.pathname === "/tasks" ? ["today", "upcoming", "all", "completed"] : ["dayGridMonth", "timeGridWeek", "timeGridDay", "listWeek", "month", "week", "day", "agenda"],
      sort: ["uploaded-desc", "uploaded-asc", "name", "size-desc", "size-asc", "updated", "recent", "title"],
      type: ["all", "photo", "document", "spreadsheet", "presentation", "audio", "video", "archive", "other"],
      tab: ["holdings", "strategies", "research"], mode: ["shopping", "travel", "leisure"].includes(url.pathname.split("/")[1]) ? ["field"] : ["real", "paper"],
      kind: ["film", "series", "game", "book", "music", "outing", "other"], setting: ["home", "out", "either"], company: ["solo", "together", "either"], budget: ["free", "paid", "unknown"],
      draft: ["task", "calendar", "note", "daily", "project", "link"],
      status: ["all", "active", "completed", "watching", "researching", "preparing", "closed", "inbox", "cooling", "ready", "purchased", "abandoned", "planning", "booked", "dream", "shortlist", "paused", "other"],
    };
    const applicable: Record<string, readonly string[]> = {
      inbox: ["entry", "draft"], projects: ["status"],
      notes: ["q", "scope", "folder", "view"], files: ["q", "folder", "view", "sort", "type", "page", "file"],
      tasks: ["q", "task", "status", "view"], calendar: ["event", "view", "date"],
      investments: ["tab", "mode", "item"], career: ["q", "resume", "context", "question", "answer", "direction", "status", "parent"],
      shopping: ["q", "status", "mode"], travel: ["q", "status", "mode", "day", "stop"], leisure: ["q", "type", "mode", "kind", "minutes", "setting", "company", "budget"],
    };
    const keys = applicable[url.pathname.split("/")[1]] ?? [];
    for (const [key, entry] of [...url.searchParams]) {
      const valid = keys.includes(key) && (ids.has(key) ? (key === "context" && entry === "general") || z.uuid().safeParse(entry).success
        : key === "q" ? entry.length <= 200 && !/[\u0000-\u001f]/.test(entry)
        : key === "page" ? /^[1-9]\d{0,2}$/.test(entry) && Number(entry) <= 200
        : key === "day" ? ["all", "unknown"].includes(entry) || /^[1-9]\d{0,2}$/.test(entry) && Number(entry) <= 366
        : key === "minutes" ? /^[1-9]\d{0,3}$/.test(entry) && Number(entry) <= 1440
        : key === "date" ? /^\d{4}-\d{2}-\d{2}$/.test(entry) && new Date(`${entry}T00:00:00Z`).toISOString().slice(0, 10) === entry
        : Boolean(enums[key]?.includes(entry)));
      if (!valid) url.searchParams.delete(key);
    }
    if (url.hash && !/^#(?:opportunity|project|investment|entry)-[0-9a-f-]{36}$/i.test(url.hash)) url.hash = "";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return null; }
}
export const workbenchHrefSchema = z.string().refine((value) => safeWorkbenchHref(value) === value, "工作区地址无效。");
export const workbenchPositionSchema = z.object({
  scrollOwner: z.enum(["document", "pane"]).optional(),
  scrollTop: z.number().finite().min(0).max(10_000_000).optional(),
  sourceLine: z.number().int().min(1).max(1_000_000).optional(),
  sourceOffset: z.number().finite().min(-100_000).max(100_000).optional(),
  anchor: z.number().int().min(0).max(200_000).optional(), head: z.number().int().min(0).max(200_000).optional(),
  pdfSourceVersion: z.uuid().optional(), pdfDocumentId: z.uuid().optional(), noteReaderView: z.enum(["markdown", "pdf"]).optional(),
  pdfPage: z.number().int().min(1).max(500).optional(), reading: z.boolean().optional(),
}).strict();
export type WorkbenchPosition = z.infer<typeof workbenchPositionSchema>;
const workbenchDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => { const date = new Date(`${value}T00:00:00Z`); return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value; });
export const workbenchViewStateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tasks"), view: z.enum(["today", "upcoming", "all", "completed"]), listId: z.uuid().nullable() }).strict(),
  z.object({ kind: z.literal("calendar"), view: z.enum(["day", "week", "month"]), cursor: workbenchDateSchema, selectedCategories: z.array(z.string().min(1).max(120).refine((value) => !/[\u0000-\u001f]/.test(value))).max(20).refine((value) => new Set(value).size === value.length), hideInternship: z.boolean() }).strict(),
]);
export type WorkbenchViewState = z.infer<typeof workbenchViewStateSchema>;
export const workspaceSceneSnapshotSchema = z.object({
  version: z.literal(1),
  main: z.object({ href: workbenchHrefSchema, position: workbenchPositionSchema.optional(), viewState: workbenchViewStateSchema.optional() }).strict(),
  reference: z.object({ ref: workbenchRefSchema, position: workbenchPositionSchema.optional(), editing: z.boolean().optional() }).strict().nullable(),
  layout: z.object({ referenceFirst: z.boolean(), referenceWidth: z.number().int().min(30).max(65), mobilePane: z.enum(["main", "reference"]) }).strict(),
}).strict().refine((value) => new TextEncoder().encode(JSON.stringify(value)).byteLength <= 32 * 1024, "现场超过容量上限。").refine((value) => !value.main.viewState || value.main.href.split(/[?#]/)[0] === (value.main.viewState.kind === "tasks" ? "/tasks" : "/calendar"), "筛选状态与工作区不匹配。");
export type WorkspaceSceneSnapshot = z.infer<typeof workspaceSceneSnapshotSchema>;
export const workspaceSceneSchema = z.object({ id: z.uuid(), name: z.string().trim().min(1).max(80), revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER - 1), snapshot: workspaceSceneSnapshotSchema, created_at: z.iso.datetime({ offset: true }), updated_at: z.iso.datetime({ offset: true }), archived_at: z.iso.datetime({ offset: true }).nullable() }).strict();
export type WorkspaceScene = z.infer<typeof workspaceSceneSchema>;
export type WorkbenchField = { key: string; label: string; value: string | null };
/** Ephemeral authorized read projection. Never serialize into a scene or browser storage. */
export type WorkbenchEntity = {
  ref: WorkbenchRef; title: string; href: string; subtitle: string | null;
  fields: WorkbenchField[]; bodyMarkdown?: string; sourceUrls: string[]; asOf: string | null;
  currency?: string; mode?: "real" | "paper"; note?: NoteDocumentData["note"];
  attachments?: NoteDocumentData["attachments"]; pdf?: { documentId: string; title: string };
};
export type WorkbenchReadResult = { status: "ready"; entity: WorkbenchEntity } | { status: "missing" | "unavailable"; ref: WorkbenchRef };
export const workbenchReadInputSchema = z.object({ refs: z.array(workbenchRefSchema).min(1).max(4) }).strict();
export const workbenchDragMime = "application/x-personal-os-ref";
