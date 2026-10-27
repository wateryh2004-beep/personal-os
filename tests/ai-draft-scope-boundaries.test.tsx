// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const boundary = vi.hoisted(() => ({ reviewSave: vi.fn(), reviewDraft: vi.fn(), note: vi.fn(), briefing: vi.fn(), ensure: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/today" }));
vi.mock("@/components/ai/ai-sidecar", () => ({ AISidecar: ({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) => <section>{children}{footer}</section> }));
vi.mock("@/features/reviews/actions", () => ({ completeReview: boundary.reviewSave, generateReviewDraft: boundary.reviewDraft, generateReviewProposals: vi.fn(), readReviewProposalGeneration: vi.fn() }));
vi.mock("@/features/notes/ai-actions", () => ({ generateNoteAiSuggestion: boundary.note }));
vi.mock("@/features/briefing/actions", () => ({ generateBriefingAction: boundary.briefing, ensureTodayBriefingAction: boundary.ensure, readBriefingGenerationAction: vi.fn() }));
import { GlobalAgent } from "@/components/assistant/global-agent";
import { NotesLibraryChat } from "@/components/assistant/notes-library-chat";
import { TaskAssistant } from "@/components/tasks/task-assistant";
import { CalendarAssistant } from "@/components/calendar/calendar-assistant";
import { CareerAssistant } from "@/components/career/career-assistant";
import { NoteAiAssistant } from "@/components/notes/note-ai-assistant";
import { ReviewComposer } from "@/components/reviews/review-composer";
import { TodayBrief } from "@/components/today/today-brief";
import { GenerateBriefingControl } from "@/components/briefing/generate-briefing-control";
import { clearWorkspaceResources, reconcileWorkspaceScope } from "@/lib/workspace-resource-cache";
import { registerNoteAiTarget } from "@/features/assistant/note-ai-live";
import { getAiActionRecords } from "@/features/assistant/ai-action-runtime";
import { takeAssistantSubmission } from "@/features/assistant/pending-submission";
import type { ReviewEvidence } from "@/features/reviews/evidence";
const ownerA = "11111111-1111-4111-8111-111111111111", ownerB = "22222222-2222-4222-8222-222222222222", noteId = "33333333-3333-4333-8333-333333333333", runId = "44444444-4444-4444-8444-444444444444";
const initial = { wins: [], friction: [], openLoops: [], changes: [], lessons: [], nextFocus: [], freeReflection: "" };
const evidence: ReviewEvidence = { reviewType: "daily", periodStart: "2026-10-27", periodEnd: "2026-10-27", timezone: "Asia/Shanghai", generatedAt: "2026-10-27T00:00:00Z", calendar: [], tasksCompleted: [], tasksOpen: [], notes: [], inbox: [], career: [], projects: [], decisions: [] };
let host: HTMLDivElement, root: ReturnType<typeof createRoot>, fetcher: ReturnType<typeof vi.fn>;
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const answer = () => new Response([{ type: "start", messageId: "synthetic-answer" }, { type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: "SAFE RESPONSE" }, { type: "text-end", id: "t" }, { type: "finish", finishReason: "stop" }].map(item => `data: ${JSON.stringify(item)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" } });
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); clearWorkspaceResources(); reconcileWorkspaceScope(ownerA, "r1"); vi.clearAllMocks();
  boundary.reviewSave.mockResolvedValue({ reviewId: noteId }); boundary.reviewDraft.mockResolvedValue({ ok: true, draft: initial, coverage: 0, sources: [], period: { periodStart: evidence.periodStart, periodEnd: evidence.periodEnd, timezone: evidence.timezone } }); boundary.note.mockResolvedValue({ status: "success", message: "synthetic", suggestion: "SAFE NOTE", operation: "askNote" });
  boundary.briefing.mockResolvedValue({ status: "success", message: "synthetic briefing" }); boundary.ensure.mockResolvedValue({ started: false });
  fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    if (url === "/api/assistant/runs" && options?.method === "POST") return Response.json({ runId });
    if (url.startsWith("/api/assistant/runs?noteId=")) return Response.json({ run: null, messages: [] });
    if (url.startsWith(`/api/assistant/runs/${runId}?`)) { const params = new URL(url, "https://synthetic.invalid").searchParams; return Response.json({ run: { id: runId, surface: params.get("surface"), current_entity_type: params.get("entityType"), current_entity_id: params.get("entityId") }, messages: [], steps: [], actions: [] }); }
    if (url === "/api/assistant") return answer();
    if (url === "/api/today/brief-synthesis") return Response.json({ summary: "SAFE SUMMARY", localDate: "2026-10-27", sourceFingerprint: "synthetic-fingerprint" });
    throw new Error(`Unexpected synthetic endpoint ${url}`);
  }); vi.stubGlobal("fetch", fetcher);
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); clearWorkspaceResources(); vi.unstubAllGlobals(); });
async function enter(selector: string, text: string) { await act(async () => { const input = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!; Object.getOwnPropertyDescriptor(input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(input, text); input.dispatchEvent(new Event("input", { bubbles: true })); }); }
async function submit() { await act(async () => { host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); await tick(); }); }
const chatCases = [
  ["global", () => <GlobalAgent open onClose={() => {}} />],
  ["notes-library", () => <NotesLibraryChat />],
  ["tasks", () => <TaskAssistant />],
  ["calendar", () => <CalendarAssistant timezone="Asia/Shanghai" categories={[]} />],
  ["career", () => <CareerAssistant experienceId={noteId} />],
] as const;
for (const [name, render] of chatCases) it(`${name} actual parent cannot send its old mounted raw input after owner replacement`, async () => {
  await act(async () => root.render(render())); await enter("[data-assistant-input]", "owner A private question");
  await act(async () => { reconcileWorkspaceScope(ownerB, "r1"); }); fetcher.mockClear();
  await submit();
  expect(fetcher).not.toHaveBeenCalled(); expect(host.textContent).toContain("工作区已变化，请重新打开");
});
it("actual Review parent cannot generate or save A raw under replacement owner B", async () => {
  await act(async () => root.render(<ReviewComposer type="daily" evidence={evidence} initialValue={initial} />)); await enter("textarea", "owner A review");
  await act(async () => { reconcileWorkspaceScope(ownerB, "r1"); });
  await act(async () => { [...host.querySelectorAll("button")].find(button => button.textContent === "基于记录生成草稿")!.click(); [...host.querySelectorAll("button")].find(button => button.textContent === "完成复盘")!.click(); await tick(); });
  expect(boundary.reviewDraft).not.toHaveBeenCalled(); expect(boundary.reviewSave).not.toHaveBeenCalled(); expect(host.textContent).toContain("工作区已变化，请重新打开");
});
function noteView() { return <NoteAiAssistant open onOpen={() => {}} onClose={() => {}} noteId={noteId} title="Synthetic" bodyMarkdown="SOURCE BODY" defaultModel="deepseek-v4-flash" selection={null} onClearSelection={() => {}} onReplaceNote={() => false} onInsertNote={() => false} onReplaceTitle={() => false} />; }
function noteTarget() { return registerNoteAiTarget({ read: () => ({ noteId, revision: 1, knownRemoteRevision: 1, title: "Synthetic", sourceMarkdown: "SOURCE BODY", role: "main", editable: true, composing: false, conflict: false }), apply: () => false }); }
it("actual Note parent does not send A raw even if a valid new-owner target with the same identity is mounted", async () => {
  const unregister = noteTarget(); await act(async () => { root.render(noteView()); await tick(); }); await enter("#note-ai-question", "owner A note question");
  await act(async () => { reconcileWorkspaceScope(ownerB, "r1"); }); unregister(); const nextTarget = noteTarget(); fetcher.mockClear();
  await act(async () => { host.querySelector("#note-ai-question")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true })); await tick(); });
  expect(boundary.note).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled(); expect(host.textContent).toContain("工作区已变化，请重新打开"); nextTarget();
});

for (const [name, render] of chatCases) it(`${name} actual parent preserves input and sends normally across same-owner server revision refresh`, async () => {
  await act(async () => root.render(render())); expect(host.textContent).not.toContain("工作区已变化"); await enter("[data-assistant-input]", "same owner question");
  await act(async () => { reconcileWorkspaceScope(ownerA, "r2"); });
  expect(host.querySelector<HTMLInputElement>("[data-assistant-input]")!.value).toBe("same owner question");
  await submit();
  const sent = fetcher.mock.calls.filter(([url]) => url === "/api/assistant"); expect(sent).toHaveLength(1);
  expect(JSON.parse(String(sent[0][1]?.body))).toMatchObject({ surface: name });
  expect(host.textContent).toContain("SAFE RESPONSE"); expect(host.textContent).not.toContain("工作区已变化");
});
for (const kind of ["vault", "owner A to B to A"] as const) it(`mounted Global raw never regains send authority after ${kind} scope eviction`, async () => {
  await act(async () => root.render(<GlobalAgent open onClose={() => {}} />)); await enter("[data-assistant-input]", "revoked raw");
  await act(async () => { if (kind === "vault") clearWorkspaceResources(); else reconcileWorkspaceScope(ownerB, "r1"); reconcileWorkspaceScope(ownerA, "r2"); }); fetcher.mockClear();
  await submit(); expect(fetcher).not.toHaveBeenCalled(); expect(host.textContent).toContain("工作区已变化，请重新打开");
});
it("same-owner revision refresh permits actual Review generation and saving the unchanged live raw", async () => {
  await act(async () => root.render(<ReviewComposer type="daily" evidence={evidence} initialValue={initial} />)); await enter("textarea", "current review text");
  await act(async () => { reconcileWorkspaceScope(ownerA, "r2"); });
  await act(async () => { [...host.querySelectorAll("button")].find(button => button.textContent === "基于记录生成草稿")!.click(); await getAiActionRecords()[0].completion; });
  await act(async () => { [...host.querySelectorAll("button")].find(button => button.textContent === "完成复盘")!.click(); await tick(); });
  expect(boundary.reviewDraft).toHaveBeenCalledTimes(1); expect(boundary.reviewSave).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ structuredData: expect.objectContaining({ wins: ["current review text"] }) }));
});
it("same-owner revision refresh permits an actual Note request with its live original question", async () => {
  const unregister = noteTarget(); await act(async () => { root.render(noteView()); await tick(); }); await enter("#note-ai-question", "current note question");
  await act(async () => { reconcileWorkspaceScope(ownerA, "r2"); });
  await act(async () => { host.querySelector("#note-ai-question")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true })); await tick(); });
  expect(boundary.note).toHaveBeenCalledTimes(1); expect((boundary.note.mock.calls[0][0] as FormData).get("instruction")).toBe("current note question"); unregister();
});
const todayItems = [{ id: "synthetic-item", title: "Synthetic context", reason: "Synthetic reason", priority: 1, sourceRefs: [], suggestedAction: { label: "询问此事项", agentPrompt: "owner A contextual prompt" } }];
it("an old Today parent neither generates nor queues its old contextual prompt for a replacement owner", async () => {
  await act(async () => root.render(<TodayBrief items={todayItems} localDate="2026-10-27" sourceFingerprint="synthetic-fingerprint" />));
  await act(async () => { reconcileWorkspaceScope(ownerB, "r1"); }); fetcher.mockClear();
  await act(async () => { [...host.querySelectorAll("button")].find(button => button.textContent === "AI 总结")!.click(); [...host.querySelectorAll("button")].find(button => button.textContent === "询问此事项")!.click(); await tick(); });
  expect(fetcher).not.toHaveBeenCalled(); expect(takeAssistantSubmission()).toBeNull(); expect(host.textContent).toContain("工作区已变化，请重新打开");
});
it("same-owner Today refresh retains its date and fingerprint and allows the normal AI summary", async () => {
  await act(async () => root.render(<TodayBrief items={todayItems} localDate="2026-10-27" sourceFingerprint="synthetic-fingerprint" />));
  await act(async () => { reconcileWorkspaceScope(ownerA, "r2"); });
  await act(async () => { [...host.querySelectorAll("button")].find(button => button.textContent === "AI 总结")!.click(); await getAiActionRecords()[0].completion; });
  expect(fetcher).toHaveBeenCalledExactlyOnceWith("/api/today/brief-synthesis", expect.objectContaining({ body: JSON.stringify({ localDate: "2026-10-27", sourceFingerprint: "synthetic-fingerprint" }) })); expect(host.textContent).toContain("SAFE SUMMARY");
});
it("an old Briefing parent blocks manual generation and a later ensure-effect after owner replacement", async () => {
  await act(async () => root.render(<GenerateBriefingControl hasBriefing localDate="2026-10-27" />));
  await act(async () => { reconcileWorkspaceScope(ownerB, "r1"); });
  await act(async () => root.render(<GenerateBriefingControl hasBriefing={false} localDate="2026-10-28" />));
  await submit(); expect(boundary.briefing).not.toHaveBeenCalled(); expect(boundary.ensure).not.toHaveBeenCalled(); expect(host.textContent).toContain("工作区已变化，请重新打开");
});
it("same-owner Briefing refresh preserves normal manual generation", async () => {
  await act(async () => root.render(<GenerateBriefingControl hasBriefing localDate="2026-10-27" />)); await act(async () => { reconcileWorkspaceScope(ownerA, "r2"); });
  await submit(); expect(boundary.briefing).toHaveBeenCalledExactlyOnceWith(expect.any(Object), "2026-10-27"); expect(boundary.ensure).not.toHaveBeenCalled();
});
it("a fresh Briefing parent still ensures the actual expected date once", async () => {
  await act(async () => { root.render(<GenerateBriefingControl hasBriefing={false} localDate="2026-10-27" />); await tick(); });
  expect(boundary.ensure).toHaveBeenCalledExactlyOnceWith("2026-10-27"); expect(boundary.briefing).not.toHaveBeenCalled();
});
for (const edit of ["newer B", ""] as const) it(`same-owner Chat remount does not refill A after a user's later ${edit ? "B edit" : "explicit clear"}`, async () => {
  let release!: (response: Response) => void; fetcher.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  await act(async () => root.render(<GlobalAgent open onClose={() => {}} />)); await enter("[data-assistant-input]", "First question"); await submit();
  await enter("[data-assistant-input]", "newer B"); if (!edit) await enter("[data-assistant-input]", "");
  await act(async () => root.render(null)); await act(async () => { release(new Response('{"error":"synthetic failure"}', { status: 503 })); await tick(); await tick(); });
  await act(async () => root.render(<GlobalAgent open onClose={() => {}} />));
  expect(host.querySelector<HTMLInputElement>("[data-assistant-input]")!.value).toBe(edit); expect(fetcher).toHaveBeenCalledTimes(1);
});
it("an explicit clear after a known Chat failure stays empty on same-owner remount", async () => {
  fetcher.mockResolvedValue(new Response('{"error":"synthetic failure"}', { status: 503 }));
  await act(async () => root.render(<GlobalAgent open onClose={() => {}} />)); await enter("[data-assistant-input]", "First question"); await submit();
  expect(host.querySelector<HTMLInputElement>("[data-assistant-input]")!.value).toBe("First question");
  await enter("[data-assistant-input]", ""); await act(async () => root.render(null)); await act(async () => root.render(<GlobalAgent open onClose={() => {}} />));
  expect(host.querySelector<HTMLInputElement>("[data-assistant-input]")!.value).toBe(""); expect(fetcher).toHaveBeenCalledTimes(1);
});
for (const edit of [null, "newer note B", ""] as const) it(`same-owner Note remount ${edit === null ? "recovers its original failed question" : "preserves later input including an explicit clear"}`, async () => {
  let release!: (value: { status: string; message: string; suggestion: string }) => void; boundary.note.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const unregister = noteTarget(); await act(async () => { root.render(noteView()); await tick(); }); await enter("#note-ai-question", "Original note question");
  let completion!: Promise<void>; await act(async () => { host.querySelector("#note-ai-question")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true })); completion = getAiActionRecords()[0].completion; });
  if (edit !== null) { await enter("#note-ai-question", "newer note B"); if (!edit) await enter("#note-ai-question", ""); }
  await act(async () => root.render(null)); await act(async () => { release({ status: "error", message: "Synthetic failed response", suggestion: "" }); await completion; });
  await act(async () => root.render(noteView()));
  expect(host.querySelector<HTMLTextAreaElement>("#note-ai-question")!.value).toBe(edit ?? "Original note question"); expect(boundary.note).toHaveBeenCalledTimes(1); unregister();
});
it("requesting a new Chat session while pending prevents its old failed input from refilling on remount", async () => {
  let release!: (response: Response) => void; fetcher.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  await act(async () => root.render(<GlobalAgent open onClose={() => {}} />)); await enter("[data-assistant-input]", "First question"); await submit();
  await act(async () => { [...host.querySelectorAll("button")].find(button => button.textContent === "新会话")!.click(); });
  await act(async () => root.render(null)); await act(async () => { release(new Response('{"error":"synthetic failure"}', { status: 503 })); await tick(); await tick(); });
  await act(async () => root.render(<GlobalAgent open onClose={() => {}} />)); expect(host.querySelector<HTMLInputElement>("[data-assistant-input]")!.value).toBe(""); expect(fetcher).toHaveBeenCalledTimes(1);
});
it("an expired Chat engine and ordinary draft do not renew the old failed question on remount", async () => {
  fetcher.mockResolvedValue(new Response('{"error":"synthetic failure"}', { status: 503 }));
  await act(async () => root.render(<GlobalAgent open onClose={() => {}} />)); await enter("[data-assistant-input]", "Expired question"); await submit();
  expect(host.querySelector<HTMLInputElement>("[data-assistant-input]")!.value).toBe("Expired question"); await act(async () => root.render(null));
  const now = Date.now(); const clock = vi.spyOn(Date, "now").mockReturnValue(now + 900_001);
  try { await act(async () => root.render(<GlobalAgent open onClose={() => {}} />)); expect(host.querySelector<HTMLInputElement>("[data-assistant-input]")!.value).toBe(""); expect(fetcher).toHaveBeenCalledTimes(1); } finally { clock.mockRestore(); }
});
it("an older Note result does not renew its expired ordinary question draft", async () => {
  const unregister = noteTarget(); boundary.note.mockResolvedValue({ status: "error", message: "Synthetic failure", suggestion: "" });
  await act(async () => { root.render(noteView()); await tick(); }); await enter("#note-ai-question", "Expired note question");
  await act(async () => { host.querySelector("#note-ai-question")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true })); await getAiActionRecords()[0].completion; });
  expect(host.querySelector<HTMLTextAreaElement>("#note-ai-question")!.value).toBe("Expired note question"); await act(async () => root.render(null));
  const now = Date.now(); const clock = vi.spyOn(Date, "now").mockReturnValue(now + 900_001);
  try { await act(async () => root.render(noteView())); expect(host.querySelector<HTMLTextAreaElement>("#note-ai-question")!.value).toBe(""); expect(boundary.note).toHaveBeenCalledTimes(1); } finally { clock.mockRestore(); unregister(); }
});
