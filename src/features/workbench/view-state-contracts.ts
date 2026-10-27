import { z } from "zod";

const uuid = z.uuid();
const scroll = z.number().finite().min(0).max(10_000_000);
const ids = (maximum: number) => z.array(uuid).max(maximum).refine(values => new Set(values).size === values.length);
const text = (maximum: number) => z.string().max(maximum).refine(value => !/[\u0000-\u001f\u007f]/.test(value));
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const instant = new Date(`${value}T00:00:00Z`);
  return Number(value.slice(0, 4)) >= 1 && Number.isFinite(instant.getTime()) && instant.toISOString().slice(0, 10) === value;
});
const paneScroll = z.object({ list: scroll.optional(), detail: scroll.optional() }).strict();
const careerPath = z.string().regex(/^\/career(?:\/[a-z-]+)*(?:\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?(?:\/materials)?$/i).meta({ "x-pattern-case-insensitive": true }).max(200);
export const evidenceGroups = ["calendar", "tasksCompleted", "tasksOpen", "notes", "inbox", "career", "projects", "decisions"] as const;
export const evidenceTypes = ["calendar_event", "todo_task", "note", "inbox_item", "career_milestone", "career_opportunity", "career_application", "project", "decision"] as const;
export const evidenceViewRefSchema = z.object({ group: z.enum(evidenceGroups), type: z.enum(evidenceTypes), id: uuid }).strict();
export type EvidenceViewRef = z.infer<typeof evidenceViewRefSchema>;

/** Only bounded view metadata. Bodies and business values belong to their domains. */
export const workbenchViewStateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tasks"), view: z.enum(["today", "upcoming", "all", "completed"]), listId: uuid.nullable(), scroll: paneScroll.optional() }).strict(),
  z.object({ kind: z.literal("calendar"), view: z.enum(["day", "week", "month"]), cursor: date, selectedCategories: z.array(text(120).min(1)).max(20).refine(values => new Set(values).size === values.length), hideInternship: z.boolean(), selectedEventId: uuid.nullable().optional(), inspectorOpen: z.boolean().optional() }).strict(),
  z.object({ kind: z.literal("today"), section: z.enum(["focus", "schedule", "tasks", "continue", "review"]).nullable(), disclosures: z.array(z.enum(["future", "past", "background"])).max(3).refine(values => new Set(values).size === values.length).optional() }).strict(),
  z.object({ kind: z.literal("notes"), pathname: z.string().regex(/^\/notes(?:\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$/i).meta({ "x-pattern-case-insensitive": true }), previewId: uuid.nullable(), scroll: paneScroll }).strict(),
  z.object({ kind: z.literal("files"), previewDocumentId: uuid.nullable(), previewOpen: z.boolean(), listScrollTop: scroll, previewScrollTop: scroll }).strict(),
  z.object({ kind: z.literal("projects"), expandedProjectIds: ids(20) }).strict(),
  z.object({ kind: z.literal("career"), pathname: careerPath, contextId: uuid.nullable().optional(), expandedIds: ids(20), insightTags: z.array(text(120).min(1)).max(20).refine(values => new Set(values).size === values.length).optional(), selectedId: uuid.nullable(), scroll: paneScroll }).strict(),
  z.object({ kind: z.literal("reviews"), pathname: z.string().regex(/^\/reviews\/(?:daily|weekly|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i).meta({ "x-pattern-case-insensitive": true }), periodKey: text(160).regex(/^(daily|weekly):\d{4}-\d{2}-\d{2}:\d{4}-\d{2}-\d{2}:[A-Za-z0-9_+\-/]{1,80}$/), filter: z.enum(["all", ...evidenceGroups]), selectedRefs: z.array(evidenceViewRefSchema).max(100).refine(values => new Set(values.map(value => `${value.group}:${value.type}:${value.id}`)).size === values.length), evidenceScrollTop: scroll }).strict(),
  z.object({ kind: z.literal("briefing"), pathname: z.enum(["/briefing", "/briefing/events", "/briefing/sources", "/briefing/interests"]), eventId: uuid.nullable(), expandedIds: ids(20) }).strict(),
  z.object({ kind: z.literal("investment"), explainingAccountId: uuid.nullable(), expandedAccountIds: ids(20), selectedSection: z.enum(["ledger", "cash", "quotes", "strategies", "research"]).nullable() }).strict(),
  z.object({ kind: z.literal("shopping"), itemId: uuid.nullable(), section: z.enum(["details", "aftercare"]) }).strict(),
  z.object({ kind: z.literal("travel"), tripId: uuid, day: z.union([z.literal("all"), z.literal("unknown"), z.number().int().min(1).max(366)]), stopId: uuid.nullable(), map: z.object({ latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180), zoom: z.number().finite().min(0).max(22) }).strict().nullable() }).strict(),
  z.object({ kind: z.literal("leisure"), pathname: z.string().regex(/^\/leisure(?:\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$/i).meta({ "x-pattern-case-insensitive": true }), featuredId: uuid.nullable(), fieldSelectedId: uuid.nullable() }).strict(),
  z.object({ kind: z.literal("inbox"), currentId: uuid.nullable(), reviewId: uuid.nullable(), laterIds: ids(100), manualKind: z.enum(["task", "calendar", "note", "daily", "project", "link"]).nullable() }).strict(),
]);
export type WorkbenchViewState = z.infer<typeof workbenchViewStateSchema>;
export type ViewStateOf<K extends WorkbenchViewState["kind"]> = Extract<WorkbenchViewState, { kind: K }>;

/** Route + entity identity is checked before capture, consumption and every ack. */
export function viewStateMatchesHref(state: WorkbenchViewState, href: string) {
  const pathname = href.split(/[?#]/)[0];
  if (state.kind === "career" && state.contextId !== undefined) {
    const selected = new URL(href, "https://personal-os.local").searchParams.get("context");
    return state.pathname === pathname && (selected && selected !== "general" ? selected.toLowerCase() : null) === state.contextId;
  }
  if ("pathname" in state) return state.pathname === pathname;
  if (state.kind === "travel") return pathname === `/travel/${state.tripId}`;
  if (state.kind === "shopping") return pathname === (state.itemId ? `/shopping/${state.itemId}` : "/shopping");
  if (state.kind === "investment") return pathname === "/investments";
  return pathname === `/${state.kind}`;
}
export function viewStateIdentity(state: WorkbenchViewState) {
  if (state.kind === "career" && state.contextId !== undefined) return `${state.pathname}:${state.contextId ?? "general"}`;
  if (state.kind === "reviews") return `${state.pathname}:${state.periodKey}`;
  if (state.kind === "travel") return `/travel/${state.tripId}`;
  if (state.kind === "shopping") return state.itemId ? `/shopping/${state.itemId}` : "/shopping";
  return "pathname" in state ? state.pathname : state.kind;
}
