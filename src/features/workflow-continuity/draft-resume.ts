"use client";

import { useEffect,useLayoutEffect, useRef,useState } from "react";
import { z } from "zod";
import { captureWorkspaceScope, registerWorkspaceScopeCleanup } from "@/lib/workspace-resource-cache";
import { draftOperations, isDraftOperation, type DraftOperation } from "./draft-contracts";
import { beginNavigationIntent } from "./navigation-intent";

type ContextualDraftOperation="interview.preparation"|"interview.answer"|"interview.evidence-link"|"interview.story-link"|"interview.question-create";
type InboxSurfaceOperation="inbox.task"|"inbox.calendar"|"inbox.note"|"inbox.daily";
type BatchDraftOperation="shopping.quantity"|"shopping.purchased"|"travel.stop-metadata";
export type DraftResumeTarget = { [K in DraftOperation]: { kind: K; id: string; parentId?: string } & (K extends ContextualDraftOperation?{contextId?:string}:{contextId?:never}) & (K extends BatchDraftOperation?{itemIds?:string[]}:{itemIds?:never}) & (K extends InboxSurfaceOperation?{surface?:"manual"|"proposal"}:{surface?:never}) }[DraftOperation];
const contextualOperations=new Set<DraftOperation>(["interview.preparation","interview.answer","interview.evidence-link","interview.story-link","interview.question-create"]);
export type DraftResumeAck = { status: "applied" | "missing" | "cancelled"; message?: string };
type Context = { signal: AbortSignal; current: () => boolean };
type Consumer = { target: DraftResumeTarget; ready: () => boolean; open: (target: DraftResumeTarget, context: Context) => Promise<DraftResumeAck>; current: () => boolean; priority: number };
const uuid = z.string().uuid();
const parentOperations = new Set<DraftOperation>(["career.fact-create", "career.fact-edit", "career.output", "career.bullet", "career.bullet-fact", "career.evidence", "career.requirement", "career.gap-resume", "career.target-add-question", "career.target-question", "interview.preparation", "interview.note-create", "interview.note-edit", "interview.answer", "interview.story-link", "interview.evidence-link", "practice.solo", "practice.session-attempt", "travel.stop-add", "travel.stop-text", "travel.stop-metadata", "travel.document", "note.selection-task"]);
const singletons = new Set<DraftOperation>(["capture.today", "capture.inbox", "career.profile", "briefing.settings", "settings.ai-governance", "memory.import"]);
singletons.add("briefing.event-editor");
parentOperations.add("career.material");
const newOperations = new Set<DraftOperation>(draftOperations.filter(value => /(?:create|\.global|^global\.|^investment\.(?:account|entry|strategy|research|cash|quote)$|^shopping\.create$|^travel\.create$|^file\.folder$|^note\.folder-create$|^briefing\.exclusion$|^memory\.(?:profile|working)$|^decision\.create$|^scene\.create$)/.test(value)));
for (const operation of ["career.output", "career.bullet", "career.evidence", "career.opportunity", "career.requirement"] as const) newOperations.add(operation);
export function parseDraftResumeTarget(input: unknown): DraftResumeTarget | null {
  const value = z.object({ kind: z.string(), id: z.string().min(1).max(512), parentId: uuid.optional(),contextId:uuid.optional(),surface:z.enum(["manual","proposal"]).optional(),itemIds:z.array(uuid).min(1).max(20).refine(values=>new Set(values).size===values.length).optional() }).strict().safeParse(input);
  if (!value.success || !isDraftOperation(value.data.kind)) return null;
  // All members have the same finite fields; the kind has been checked against
  // the operation registry. TypeScript cannot distribute a checked union key.
  const target = { ...value.data, kind: value.data.kind } as DraftResumeTarget;
  if(target.surface&&!(["inbox.task","inbox.calendar","inbox.note","inbox.daily"] as readonly string[]).includes(target.kind))return null;
  if(target.itemIds&&(!["shopping.quantity","shopping.purchased","travel.stop-metadata"].includes(target.kind)||!target.itemIds.includes(target.id)))return null;
  if(target.contextId&&(!contextualOperations.has(target.kind)||target.kind==="interview.question-create"&&(target.id==="new"||target.id==="root")))return null;
  if (parentOperations.has(target.kind) && !target.parentId) return null;
  if (!parentOperations.has(target.kind) && target.parentId) return null;
  if (target.kind === "planning.availability") return z.string().date().safeParse(target.id).success ? target : null;
  if (target.kind === "settings.prompt") return /^[a-z][a-z0-9_.:-]{0,119}$/i.test(target.id) ? target : null;
  if (target.kind === "calendar.edit" || target.kind === "calendar.classify") return /^[A-Za-z0-9_+=.\/-]{1,512}$/.test(target.id) ? target : null;
  if (singletons.has(target.kind)) return target.id === "owner" ? target : null;
  if (newOperations.has(target.kind) || ["task.quick-add", "task.create", "calendar.create", "career.bullet-fact", "career.gap-resume", "career.target-add-question", "career.target-question", "interview.note-create", "interview.answer", "interview.story-link", "interview.evidence-link", "practice.solo", "practice.session-attempt", "travel.stop-add", "travel.document", "file.staging"].includes(target.kind)) return target.id === "new" || target.id === "root" || uuid.safeParse(target.id).success ? target : null;
  return uuid.safeParse(target.id).success ? target : null;
}
export function draftResumeKey(target: DraftResumeTarget) { return `${target.kind}:${target.parentId ?? ""}:${target.id}${target.contextId?`:context:${target.contextId}`:""}${target.itemIds?`:items:${[...target.itemIds].sort().join(",")}`:""}${["inbox.task","inbox.calendar","inbox.note","inbox.daily"].includes(target.kind)?`:surface:${target.surface??"manual"}`:""}`; }
export function draftResumeHref(target: DraftResumeTarget): string | null {
  if (!parseDraftResumeTarget(target)) return null;
  const kind = target.kind;
  if (kind.startsWith("global.") || kind === "capture.today" || kind === "planning.availability") return "/today";
  if (kind === "capture.inbox" || kind.startsWith("inbox.")) return `/inbox${kind.startsWith("inbox.") ? `?entry=${target.id}` : ""}`;
  if (kind.startsWith("project.")) return "/projects";
  if (kind.startsWith("task.") || kind === "planning.estimate") return `/tasks${kind === "task.edit" || kind === "planning.estimate" ? `?task=${target.id}` : ""}`;
  if (kind.startsWith("calendar.")) return "/calendar";
  if (kind.startsWith("investment.")) return "/investments";
  if (kind.startsWith("shopping.")) return kind === "shopping.aftercare" ? `/shopping/${target.id}` : "/shopping";
  if (kind.startsWith("travel.")) return kind === "travel.create" ? "/travel" : `/travel/${target.parentId ?? target.id}`;
  if (kind.startsWith("leisure.")) return `/leisure/${target.id}`;
  if (kind.startsWith("file.")) return "/files";
  if (kind.startsWith("note.")) return ["note.move", "note.visibility", "note.selection-task"].includes(kind) ? `/notes/${target.parentId ?? target.id}` : "/notes";
  if (kind.startsWith("briefing.event")) return "/briefing/events";
  if (kind.startsWith("briefing.feed")) return "/briefing/sources";
  if (kind.startsWith("briefing.interest") || kind === "briefing.exclusion") return "/briefing/interests";
  if (kind === "briefing.judgment") return "/briefing";
  if (kind.startsWith("settings.") || kind === "briefing.settings") return "/settings";
  if (kind.startsWith("memory.") || kind.startsWith("decision.")) return kind.startsWith("decision.review") ? "/reviews" : "/memory";
  if (kind.startsWith("scene.")) return "/today";
  if (kind.startsWith("career.skill")) return "/career/skills";
  if (kind.startsWith("career.certification")) return "/career/certifications";
  if (kind.startsWith("career.direction")) return "/career/directions";
  if (kind === "career.profile") return "/career/profile";
  if(kind==="career.material")return `/career/opportunities/${target.parentId}/materials`;
  if (kind.startsWith("career.resume")) return `/career/resumes${kind !== "career.resume-create" ? `?resume=${target.id}` : ""}`;
  if (kind.startsWith("career.application")) return "/career/applications";
  if (kind === "career.opportunity" || kind === "career.requirement" || kind === "career.gap-resume") return "/career/opportunities";
  if (kind.startsWith("career.target")) return kind === "career.target-create" ? "/career/interview/targets" : `/career/interview/targets/${target.parentId ?? target.id}`;
  if (kind.startsWith("career.story")) return "/career/interview/stories";
  if (kind.startsWith("career.track") || kind.startsWith("career.milestone")) return "/career/roadmap";
  if (kind.startsWith("career.")) return target.parentId ? `/career/experiences/${target.parentId}` : "/career/experiences";
  if (kind === "practice.solo") return `/career/interview/practice/${target.parentId}${target.id !== "new" ? `?parent=${target.id}` : ""}`;
  if (kind === "practice.session-create") return "/career/interview/sessions";
  if (kind.startsWith("practice.")) return `/career/interview/sessions/${target.parentId ?? target.id}`;
  if (kind === "interview.narrative-baseline" || kind === "interview.reference-ack") return "/career/interview/consistency";
  if (kind === "interview.question-create") return target.id==="new"||target.id==="root"?"/career/interview/questions":`/career/interview/questions/${target.id}${target.contextId?`?context=${target.contextId}`:""}`;
  return `/career/interview/questions/${target.parentId ?? target.id}${target.contextId?`?context=${target.contextId}`:""}`;
}

const consumers = new Set<Consumer>();
type Pending = { target: DraftResumeTarget; requestId: string; controller: AbortController; current: () => boolean; deadline: number; running: boolean; consumer?: Consumer; removeInterruptionListeners: () => void; timer: ReturnType<typeof setTimeout> };
let pending: Pending | null = null;
type ResumeStatus = { status: "idle" | "pending" | "accepted" | "missing"; requestId?: string; message?: string };
let status: ResumeStatus = { status: "idle" };
const listeners = new Set<() => void>();
export const subscribeDraftResumeStatus = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getDraftResumeStatus = () => status;
const serverStatus: ResumeStatus = { status: "idle" };
export const getDraftResumeServerStatus = () => serverStatus;
function publish(next: ResumeStatus) { status = next; listeners.forEach(listener => listener()); }
function finish(request: Pending, accepted: boolean, message?: string) {
  if (pending !== request) return;
  clearTimeout(request.timer); request.removeInterruptionListeners(); request.controller.abort(); pending = null;
  publish({ status: accepted ? "accepted" : "missing", requestId: request.requestId, message });
}
function attempt() {
  const request = pending;
  if (!request || request.running || !request.current() || request.controller.signal.aborted) return;
  const matches = [...consumers].filter(row => row.current() && draftResumeKey(row.target) === draftResumeKey(request.target) && row.ready()).sort((a, b) => b.priority - a.priority);
  const candidate = matches[0];
  if (!candidate) return;
  if (matches[1]?.priority === candidate.priority) { finish(request, false, "此处有多个编辑入口，请关闭另一处后继续恢复。"); return; }
  request.running = true;
  request.consumer = candidate;
  const current = () => pending === request && request.current() && consumers.has(candidate) && candidate.current() && !request.controller.signal.aborted;
  void candidate.open(request.target, { signal: request.controller.signal, current }).then(result => {
    if (!current()) return;
    finish(request, result.status === "applied", result.message ?? (result.status === "missing" ? "原记录暂不可用，未保存内容仍保留。" : undefined));
  }).catch(() => { if (current()) finish(request, false, "暂时无法打开原表单，未保存内容仍保留。"); }).finally(() => { request.running = false; });
}
export async function requestDraftResume(input: DraftResumeTarget): Promise<{ status: "accepted" } | { status: "pending"; requestId: string } | { status: "missing" | "invalid"; message: string }> {
  const target = parseDraftResumeTarget(input);
  if (!target || !draftResumeHref(target)) return { status: "invalid", message: "无法识别原表单，未保存内容仍保留。" };
  if (pending) finish(pending, false);
  const requestId = crypto.randomUUID(), controller = new AbortController(), scope = captureWorkspaceScope(), navigationCurrent = beginNavigationIntent();
  const current = () => scope() && navigationCurrent();
  const request: Pending = { target, requestId, controller, current, deadline: Date.now() + 10000, running: false, removeInterruptionListeners: () => {}, timer: setTimeout(() => { if (pending === request) finish(request, false, "原表单尚未就绪，未保存内容仍保留。"); }, 10000) };
  pending = request; publish({ status: "pending", requestId }); attempt();
  const interrupt = () => { if (pending === request) finish(request, false, "恢复已中断，未保存内容仍保留。"); };
  for (const event of ["pointerdown", "keydown", "input", "wheel"] as const) document.addEventListener(event, interrupt, { capture: true, passive: true });
  window.addEventListener("popstate", interrupt); window.addEventListener("personal-os:navigation-start", interrupt);
  request.removeInterruptionListeners = () => { for (const event of ["pointerdown", "keydown", "input", "wheel"] as const) document.removeEventListener(event, interrupt, true); window.removeEventListener("popstate", interrupt); window.removeEventListener("personal-os:navigation-start", interrupt); };
  // A kept-mounted route may only change inert/visibility without re-rendering
  // its form. A single bounded readiness poll observes that actual DOM boundary.
  const poll = () => { if (pending !== request) return; if (!current()) { finish(request, false); return; } attempt(); if (pending === request) setTimeout(poll, 50); };
  setTimeout(poll, 50);
  await Promise.resolve();
  if (status.requestId === requestId && status.status === "accepted") return { status: "accepted" };
  if (status.requestId === requestId && status.status === "missing") return { status: "missing", message: status.message ?? "原表单暂不可用。" };
  return { status: "pending", requestId };
}
export function registerDraftResumeConsumer<K extends DraftOperation>(options: { kind: K; identity: { id: string; parentId?: string;contextId?:string;itemIds?:string[];surface?:"manual"|"proposal" }; ready: () => boolean; open: (target: Extract<DraftResumeTarget, { kind: K }>, context: Context) => Promise<DraftResumeAck>; priority?: number }) {
  const target = parseDraftResumeTarget({ kind: options.kind, ...options.identity });
  if (!target) return () => {};
  const row: Consumer = { target, ready: options.ready, open: (value, context) => options.open(value as Extract<DraftResumeTarget, { kind: K }>, context), current: captureWorkspaceScope(), priority: options.priority ?? 1 };
  consumers.add(row); queueMicrotask(attempt);
  return () => { consumers.delete(row); if (pending?.consumer === row) finish(pending, false, "原编辑入口已变化，未保存内容仍保留。"); };
}
export function useDraftResumeConsumer<K extends DraftOperation>(options: Parameters<typeof registerDraftResumeConsumer<K>>[0]) {
  const [origin] = useState(captureWorkspaceScope);
  const latest = useRef(options); useLayoutEffect(()=>{latest.current=options;},[options]);
  const {kind,identity:{id,parentId,contextId,surface},priority}=options;const itemIdsKey=options.identity.itemIds?.join(",");
  useEffect(() => registerDraftResumeConsumer({kind,identity:{id,parentId,contextId,surface,itemIds:itemIdsKey?.split(",")},priority, ready: () => origin() && latest.current.ready(), open: (target, context) => latest.current.open(target, context) }), [kind,id,parentId,contextId,surface,itemIdsKey,priority,origin]);
  useEffect(() => { attempt(); });
}
/** Parent controller opens the real dialog; the exact form must then mount and focus. */
export function useDraftResumeOpeners(targets: readonly DraftResumeTarget[], open: (target: DraftResumeTarget, context: Context) => boolean | void | Promise<boolean | void>,options?:{ready?:()=>boolean;priority?:number}) {
  const latest = useRef({ targets, open,options });useLayoutEffect(()=>{latest.current={targets,open,options};},[targets,open,options]);
  const priority=options?.priority??0;
  const keys = targets.map(draftResumeKey).sort().join("\n");
  useEffect(() => {
    const cleanups = latest.current.targets.map(target => registerDraftResumeConsumer({ kind: target.kind, identity: { id: target.id, parentId: target.parentId,contextId:target.contextId,itemIds:target.itemIds,surface:target.surface }, ready: () => latest.current.options?.ready?.()??true, open: async (value, context) => {
      if (!context.current() || await latest.current.open(value, context) === false) return { status: "missing" };
      if (!context.current() || context.signal.aborted) return { status: "cancelled" };
      return focusDraftForm(value, context);
    }, priority }));
    return () => { cleanups.forEach(cleanup => cleanup()); };
  }, [keys,priority]);
}
export function isDraftHostReady(node:HTMLElement|null):boolean{if(!node?.isConnected)return false;let current:HTMLElement|null=node;while(current){if(current.hidden||current.inert||current.getAttribute("aria-hidden")==="true")return false;const style=getComputedStyle(current);if(style.display==="none"||style.visibility==="hidden")return false;current=current.parentElement;}return true;}
export async function focusDraftForm(target: DraftResumeTarget, context: Context): Promise<DraftResumeAck> {
  const key = draftResumeKey(target);
  while (context.current() && !context.signal.aborted) {
    const node = [...document.querySelectorAll<HTMLElement>("[data-workflow-draft-key]")].find(element => element.dataset.workflowDraftKey === key && isDraftHostReady(element));
    if (node) {
      let parent = node.parentElement;
      while (parent) { if (parent instanceof HTMLDetailsElement) parent.open = true; parent = parent.parentElement; }
      const field = [...node.querySelectorAll<HTMLElement>('input:not([type="hidden"]):not([disabled]),textarea:not([disabled]),select:not([disabled]),[contenteditable="true"],[data-workflow-draft-focus]')].find(isDraftHostReady);
      if (field) { node.scrollIntoView({ block: "nearest", behavior: "instant" }); field.focus({ preventScroll: true }); return { status: "applied" }; }
    }
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }
  return { status: "cancelled" };
}
registerWorkspaceScopeCleanup(() => { if (pending) finish(pending, false); consumers.clear(); publish({ status: "idle" }); });
