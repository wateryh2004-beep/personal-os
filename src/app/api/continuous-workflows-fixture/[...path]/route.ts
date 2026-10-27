import { z } from "zod";
import { syntheticReading } from "@/features/testing/continuous-reading-fixture";
import { syntheticInboxConversion } from "@/features/testing/continuous-inbox-fixture";
import { fixtureProject } from "@/features/testing/continuous-fixture-data";
import { syntheticBriefingEvent } from "@/features/testing/continuous-briefing-fixture";
import { syntheticTripRead, syntheticStopText } from "@/features/testing/continuous-travel-fixture";
import { syntheticLeisure } from "@/features/testing/continuous-leisure-fixture";
import { syntheticCreation, syntheticTaskCreation } from "@/features/testing/continuous-creation-fixture";
import { syntheticPlanning, syntheticPlanningDay } from "@/features/testing/continuous-planning-fixture";
import { fixtureUnknownTask } from "@/features/testing/continuous-domain-fixture-data";
import { syntheticCalendarAction } from "@/features/testing/continuous-calendar-fixture";
import { syntheticMetadata, previewSyntheticMetadata, undoSyntheticMetadata } from "@/features/testing/continuous-metadata-fixture";
import { syntheticUploadHttp } from "@/features/testing/continuous-upload-fixture";
import { syntheticJudgment } from "@/features/testing/continuous-judgment-fixture";
import { lifeFieldInputSchema } from "@/features/life/contracts";
import { syntheticPracticeOperation } from "@/features/testing/continuous-practice-fixture";
import { syntheticDomainOperation, syntheticSkillSnapshots } from "@/features/testing/continuous-domain-fixture";
import { applySyntheticLife, readSyntheticLife, listSyntheticOperations, previewSyntheticUndo, undoSyntheticLife } from "@/features/testing/continuous-life-fixture";
import { continuousFixturePdf } from "@/features/testing/continuous-fixture-pdf";
import { isContinuousFixtureRequest } from "@/features/testing/continuous-fixture-gate";
import { continuousFixtureState, countFixtureCall, syntheticTime, discardContinuousFixtureState } from "@/features/testing/continuous-fixture-state";
import { fixturePracticeAttempts } from "@/features/testing/continuous-domain-fixture-data";
import { fixtureFiles, fixtureTask, fixtureToday } from "@/features/testing/continuous-fixture-data";
import { workspaceSceneSnapshotSchema, workspaceSceneSchema } from "@/features/workbench/contracts";
import { continuitySummaryDomains } from "@/features/assistant/continuity-summary-contracts";
import { assistantSurfaces } from "@/features/assistant/types";
import { captureIntentSchema } from "@/features/inbox/capture-intents";
import { completeReviewSchema, reviewStructuredDataSchema } from "@/features/reviews/schemas";
import { contentHash } from "@/features/notes/utils";
import { noteSourceLocatorSchema, sourceLocatorHref } from "@/features/links/source-locator";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Personal-OS-Synthetic": "continuous-v3" };
const json = (value: unknown, status = 200) => Response.json(value, { status, headers });
type Context = { params: Promise<{ path: string[] }> };
const saveInput = z.object({ noteId: z.uuid(), expectedRevision: z.number().int().nonnegative(), title: z.string().max(240), bodyMarkdown: z.string().max(200000) }).strict();
const sceneInput = z.object({ id: z.uuid(), requestId: z.uuid(), expectedRevision: z.number().int().nonnegative(), name: z.string().trim().min(1).max(80), snapshot: workspaceSceneSnapshotSchema, archive: z.boolean().default(false) }).strict();
async function handle(request: Request, context: Context) {
  if (!isContinuousFixtureRequest(request.url, request.headers.get("cookie"))) return json({ error: "not_found" }, 404);
  const path = (await context.params).path.join("/"), url = new URL(request.url);
  const state = continuousFixtureState(request.headers.get("cookie"));
  if (path !== "control" && (state.runs.size > 50 || state.actions.size > 250 || state.captures.size > 100 || state.sceneReceipts.size > 100 || state.domainObjects.size > 100)) return json({ error: "synthetic_session_capacity" }, 429);
  const uploadResponse = await syntheticUploadHttp(state, path, request);
  if (uploadResponse) return json(uploadResponse.data ?? { error: "synthetic_upload_unavailable" }, uploadResponse.status);
  if (path === "control") {
    if (request.method === "DELETE") { discardContinuousFixtureState(request.headers.get("cookie")); return json({ discarded: true }); }
    if (request.method === "GET") return json({ uploads: [...state.uploads.values()].map(upload => ({ id: upload.file.id, bytes: upload.bytes?.length ?? 0, available: upload.available, checksum: upload.input.checksum, title: upload.file.title })), captures: [...state.captures.values()], actions: [...state.actions.values()], calls: state.calls, writes: state.writes, notes: state.notes, scenes: state.scenes, careerSkills: syntheticSkillSnapshots(state), mode: state.mode, lastSource:state.domainObjects.get("last-note-source")??null });
    const input = z.object({ mode: z.enum(["normal", "save-conflict", "save-unknown", "ai-error"]).optional(), delay: z.number().int().min(0).max(3000).optional(), failUploadNames: z.array(z.string().min(1).max(255)).max(20).optional(), calendarComplete:z.boolean().optional(), materialDocumentRevision:z.number().int().min(1).max(20).optional(), taskCompleted:z.boolean().optional(), pdfSourceVersion:z.uuid().optional(), projectRevision:z.number().int().min(1).max(20).optional(), scenario:z.enum(["default","dst"]).optional() }).strict().safeParse(await request.json());
    if (!input.success) return json({ error: "invalid_fixture_control" }, 400);
    const { failUploadNames, calendarComplete, materialDocumentRevision, taskCompleted, pdfSourceVersion, projectRevision, scenario, ...configuration } = input.data;
    if(scenario!==undefined)state.domainObjects.set("scenario",scenario);
    if(calendarComplete!==undefined)state.domainObjects.set("calendar-complete",calendarComplete);
    if(materialDocumentRevision!==undefined)state.domainObjects.set("material-document-revision",materialDocumentRevision);
    if(pdfSourceVersion!==undefined)state.domainObjects.set("pdf-source-version",pdfSourceVersion);
    if(projectRevision!==undefined)state.domainObjects.set("project",{...fixtureProject,mutation_revision:projectRevision,description:"合成远端目标新版本"});
    if(taskCompleted!==undefined)state.domainObjects.set(`todo:${fixtureTask.id}`,{...fixtureTask,status:taskCompleted?"completed":"notStarted",completedAt:taskCompleted?syntheticTime():null}); if (failUploadNames !== undefined) state.uploadFailures = new Set(failUploadNames);
    Object.assign(state, configuration); return json({ configured: true });
  }
  if (["GET", "HEAD"].includes(request.method) && /^api\/files\/[0-9a-f-]{36}\/preview$/.test(path)) {
    const documentId = path.split("/")[2], uploaded = state.uploads.get(documentId);
    if (!fixtureFiles.some(file => file.id === documentId) && !uploaded?.available) return json({ error: "synthetic_file_missing" }, 404);
    const bytes = uploaded?.bytes ? new Uint8Array(uploaded.bytes) : documentId===fixtureFiles[1].id ? new Uint8Array(await (await import("node:fs/promises")).readFile("tests/fixtures/pdf-covers/chinese-embedded.pdf")) : continuousFixturePdf(), range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.get("range") ?? "");
    const start = range ? Number(range[1]) : 0, end = range?.[2] ? Math.min(bytes.length - 1, Number(range[2])) : bytes.length - 1;
    if (start > end || start >= bytes.length) return json({ error: "synthetic_range_invalid" }, 416);
    const responseHeaders = { ...headers, "Content-Type": "application/pdf", "Content-Length": String(end - start + 1), "Accept-Ranges": "bytes", "X-Reading-Source-Version": uploaded ? uploaded.file.id : String(state.domainObjects.get("pdf-source-version")??"e4000000-0000-4000-8000-000000000099"), ...(range ? { "Content-Range": `bytes ${start}-${end}/${bytes.length}` } : {}) };
    return new Response(request.method === "HEAD" ? null : bytes.slice(start, end + 1), { status: range ? 206 : 200, headers: responseHeaders });
  }
  if (request.method === "GET") {
    countFixtureCall(state, path);
    if (path === "api/workflow-continuity/summary") return json({ entries: [], coverage: continuitySummaryDomains.map(kind => ({ kind, checked: true, count: 0, truncated: false, error: null })), checkedAt: syntheticTime(), partial: false, truncated: false });
    if (path === "api/today/workspace") return json(state.domainObjects.get("scenario")==="dst"?{...fixtureToday,timezone:"America/New_York",generatedAt:"2026-11-01T06:00:00Z"}:fixtureToday);
    if (path === "api/planning/day") return json(syntheticPlanningDay(state, url.searchParams.get("date") ?? "2026-10-27"));
    if (path === "api/calendar/schedule-task") { const found = [fixtureTask,fixtureUnknownTask].find(item => item.id === url.searchParams.get("id")); const task=found?z.object({id:z.uuid(),title:z.string(),importance:z.enum(["low","normal","high"]),dueAt:z.string().nullable(),status:z.enum(["notStarted","completed","inProgress","waitingOnOthers","deferred"]),completedAt:z.string().nullable(),lastModifiedAt:z.string().nullable()}).parse(state.domainObjects.get(`todo:${found.id}`)??found):null; return task ? json({id:task.id,title:task.title,importance:task.importance,dueAt:task.dueAt,status:task.status,completedAt:task.completedAt,lastModifiedAt:task.lastModifiedAt,etag:null}) : json(null); }
    if (path === "api/calendar/schedule-conflicts") return json({events:state.events.filter(item => Date.parse(item.starts_at)<Date.parse(url.searchParams.get("endsAt")??"")&&Date.parse(item.ends_at)>Date.parse(url.searchParams.get("startsAt")??"")).map(({id,subject,starts_at,ends_at})=>({id,subject,starts_at,ends_at})),truncated:false});
    if (path === "api/workbench/scenes") return json({ scenes: state.scenes });
    if (path === "api/notes" || path === "api/notes/workspace") return json({ notes: state.notes.map(({ note }) => ({ ...note, excerpt: "合成资料" })), folders: [], navigatorNotes: [], timezone: "UTC", state: "ready", hasMore: false });
    const note = /^api\/notes\/([0-9a-f-]{36})(?:\/document)?$/.exec(path);
    if (note) return json(state.notes.find(item => item.note.id === note[1]) ?? null);
    if (path === "api/tasks/workspace") return json({ connection: null, lists: [{ id: fixtureTask.todoListId, displayName: "合成清单", isDefault: true }], tasks: [fixtureTask,fixtureUnknownTask], unavailable: false, schemaMissing: false });
    if (path === "api/calendar/workspace") return json({ connection: null, categories: [], timezone: "UTC", unavailable: false, sync: null });
    if (path === "api/workbench/entities") {
      const refs = z.array(z.object({ kind: z.string(), id: z.uuid(), investmentType: z.string().optional() }).strict()).max(4).parse(JSON.parse(url.searchParams.get("refs") ?? "[]"));
      return json({ results: refs.map(ref => { const item = state.notes.find(item => ref.kind === "note" && item.note.id === ref.id); return item ? { status: "ready", entity: { ref, title: item.note.title, href: `/notes/${ref.id}`, subtitle: "合成资料", fields: [], bodyMarkdown: item.note.body_markdown, note: item.note, attachments: [], sourceUrls: [], asOf: syntheticTime() } } : { status: "missing", ref }; }) });
    }
    if (path === "api/calendar/events") return json({ events: state.events, truncated: false });
    if (path === "api/calendar/events/by-id") { const event = state.events.find(event => event.id === url.searchParams.get("id") || event.provider_event_id === url.searchParams.get("providerId")); return event ? json({ event }) : json({ error: "not_found" }, 404); }
    if (path === "api/calendar/pending-tasks") return json({ tasks: [fixtureTask,fixtureUnknownTask].map(task => ({ id:task.id,title:task.title,status:task.status,provider_last_modified_at:task.lastModifiedAt,estimated_minutes:task.id===fixtureTask.id?120:null })), timezone: "UTC", truncated: false });
    if (path === "api/search") return json({ results: state.notes.filter(({ note }) => !!url.searchParams.get("q") && note.title.toLocaleLowerCase().includes(url.searchParams.get("q")!.toLocaleLowerCase())).map(({ note }) => ({ id: note.id, domain: "notes", entityType: "note", entityId: note.id, title: note.title, subtitle: "合成资料", snippet: "合成搜索结果", href: `/notes/${note.id}`, score: 1, sourceUpdatedAt: syntheticTime(), metadata: {} })) });
    if (/^api\/assistant\/runs\/[0-9a-f-]{36}$/.test(path)) { const run = state.runs.get(path.split("/").at(-1)!); return run ? json({ run, messages: run.messages, steps: [], actions: [...state.actions.values()].filter(action => action.runId === path.split("/").at(-1)) }) : json({ error: "not_found" }, 404); }
    if (path === "api/workbench/timezone") return json({ timezone: "UTC" });
    if (path === "api/files") return json({ files: [...state.files.filter(file => !file.archived_at), ...[...state.uploads.values()].filter(upload => upload.available).map(upload => upload.file)], folders: [] });
    return json({ error: "unhandled_synthetic_read" }, 503);
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 1_000_000) return json({ error: "synthetic_input_capacity" }, 413);
  const body: unknown = JSON.parse(text);
  if(path==="reading-read"||path==="reading-save"){countFixtureCall(state,path);return json(syntheticReading(state,body,path.endsWith("read")));}
  if(path==="inbox-project-choices")return json({projects:[{id:fixtureProject.id,name:fixtureProject.name}],unavailable:false,truncated:false});
  if(path==="inbox-convert"||path==="inbox-convert-read"){countFixtureCall(state,path);if(state.delay)await new Promise(resolve=>setTimeout(resolve,state.delay));const input=z.object({kind:z.enum(["note","daily","project","link"]),entries:z.unknown()}).strict().parse(body);const result=syntheticInboxConversion(state,input.kind,input.entries,path.endsWith("read"));return !path.endsWith("read")&&state.mode==="save-unknown"?json({error:"synthetic_response_lost"},503):json(result);}
  if(path==="briefing-event-read"||path==="briefing-event-save"){countFixtureCall(state,path);if(state.delay)await new Promise(resolve=>setTimeout(resolve,state.delay));try{return json(syntheticBriefingEvent(state,body,path.endsWith("read")));}catch{return json({error:"synthetic_event_conflict"},409);}}
  if (["trip-read","trip-start","stop-text-save","stop-text-read","leisure-save","leisure-read"].includes(path)) {countFixtureCall(state,path);if(state.delay)await new Promise(resolve=>setTimeout(resolve,state.delay));const result=path==="trip-read"?syntheticTripRead(state,body):path==="trip-start"?{ok:false}:path.startsWith("stop-text")?syntheticStopText(state,body,path.endsWith("read")):syntheticLeisure(state,body,path.endsWith("read"));return !path.endsWith("read")&&state.mode==="save-unknown"?json({error:"synthetic_response_lost"},503):json(result);}
  if (["creation-submit","creation-read","task-create","task-create-read"].includes(path)) {countFixtureCall(state,path);if(state.delay)await new Promise(resolve=>setTimeout(resolve,state.delay));const result=path.startsWith("task-create")?syntheticTaskCreation(state,body,path.endsWith("read")):syntheticCreation(state,body,path.endsWith("read"));return !path.endsWith("read")&&state.mode==="save-unknown"?json({error:"synthetic_response_lost"},503):json(result);}
  if (["planning-task-read","planning-task-save","planning-day-read","planning-day-save"].includes(path)) { countFixtureCall(state,path); if(state.delay) await new Promise(resolve=>setTimeout(resolve,state.delay)); try { return json(syntheticPlanning(state,path,body)); } catch { return json({error:"synthetic_planning_conflict"},409); } }
  if (["calendar-create", "calendar-create-read", "calendar-edit", "calendar-edit-read"].includes(path)) { countFixtureCall(state, path); if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay)); const result=syntheticCalendarAction(state,path,body); return !path.endsWith("-read")&&state.mode==="save-unknown"?json({error:"synthetic_response_lost"},503):json(result); }
  if (["metadata-targets", "metadata-apply", "metadata-receipt-read"].includes(path)) { countFixtureCall(state, path); if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay)); return json(syntheticMetadata(state, path, body)); }
  if (path === "judgment-save" || path === "judgment-read") { countFixtureCall(state, path); if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay)); const result = syntheticJudgment(state, body, path === "judgment-read"); return path === "judgment-save" && state.mode === "save-unknown" ? json({ error: "synthetic_response_lost" }, 503) : json(result); }
  if (path === "practice-snapshot") return json([...fixturePracticeAttempts, ...[...state.domainObjects.entries()].filter(([key]) => key.startsWith("attempt:")).map(([,value]) => value)]);
  if (path === "practice-save" || path === "practice-read") { countFixtureCall(state, path); if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay)); const result = syntheticPracticeOperation(state, body, path === "practice-read"); return path === "practice-save" && state.mode === "save-unknown" ? json({ error: "synthetic_response_lost" }, 503) : json(result); }
  if (["career-form", "project-read", "project-save", "material-read", "material-save", "aftercare-read", "aftercare-save"].includes(path)) { countFixtureCall(state, path); if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay)); try { const result = syntheticDomainOperation(state, path, body); return path.endsWith("save") && state.mode === "save-unknown" ? json({ error: "synthetic_response_lost" }, 503) : json(result); } catch { return json({ error: "synthetic_conflict" }, 409); } }
  if (["life-apply", "life-read", "life-request-read", "operations-list", "operations-preview", "operations-undo"].includes(path)) {
    countFixtureCall(state, path);
    if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
    if (path === "life-apply") { const outcome = applySyntheticLife(state, body); return state.mode === "save-unknown" ? json({ error: "synthetic_response_lost" }, 503) : json(outcome); }
    if (path === "life-request-read") { const input = lifeFieldInputSchema.parse(body), receipt = [...state.lifeReceipts.values()].find(row => row.requestId === input.requestId); if (!receipt) return json({ status: "missing" }); if (receipt.payload !== JSON.stringify(input)) return json({ status: "rejected", code: "conflict" }); const current = readSyntheticLife(state, receipt.id); return json({ status: "saved", receiptId: receipt.id, receiptStatus: receipt.status, ...current }); }
    if (path === "operations-list") return json([...listSyntheticOperations(state), ...[...state.metadataReceipts.values()].map(row => ({ id: row.id, operation: row.operation, status: row.status, target_id: row.after[0].id, created_at: syntheticTime(), expires_at: "2099-01-01T00:00:00Z", title: row.after[0].title, count: row.after.length }))]);
    const id = z.uuid().parse(body);
    if (path === "life-read") return json(readSyntheticLife(state, id));
    if (path === "operations-preview") return json(state.metadataReceipts.has(id) ? previewSyntheticMetadata(state, id) : previewSyntheticUndo(state, id));
    return json(state.metadataReceipts.has(id) ? undoSyntheticMetadata(state, id) : undoSyntheticLife(state, id));
  }
  if (path === "capture-submit" || path === "capture-read") {
    const intent = captureIntentSchema.parse(body), content = intent.content.trim(), previous = state.captures.get(intent.intentId); countFixtureCall(state, path);
    if (!content) return json({ status: "rejected", intentId: intent.intentId, code: "invalid", message: "请输入内容。" });
    if (previous) return previous.content === content ? json(previous.outcome) : json({ status: "rejected", intentId: intent.intentId, code: "conflict", message: "合成提交已对应其他内容。" });
    if (path === "capture-read") return json({ status: "needs-check", intentId: intent.intentId, message: "合成记录尚未确认。" });
    if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
    const raced = state.captures.get(intent.intentId);
    if (raced) return raced.content === content ? json(raced.outcome) : json({ status: "rejected", intentId: intent.intentId, code: "conflict", message: "合成提交已对应其他内容。" });
    const outcome = { status: "saved" as const, intentId: intent.intentId, inboxId: intent.intentId, classification: state.mode === "ai-error" ? "failed" as const : "ready" as const };
    state.captures.set(intent.intentId, { content, outcome }); state.writes["capture"] = (state.writes["capture"] ?? 0) + 1; state.calls["capture-classify"] = (state.calls["capture-classify"] ?? 0) + 1;
    return state.mode === "save-unknown" ? json({ error: "synthetic_response_lost" }, 503) : json(outcome);
  }
  if (path === "review-save") {
    const input = completeReviewSchema.parse(body); countFixtureCall(state, "review-save");
    if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
    state.writes["review-save"] = (state.writes["review-save"] ?? 0) + 1;
    return json({ reviewId: "e7000000-0000-4000-8000-000000000001", sourceCount: new Set([...input.selectedSources, ...input.aiContextSources].map(ref => `${ref.sourceType}:${ref.sourceId}`)).size, versionNumber: state.writes["review-save"] });
  }
  if (path === "agent-read" || path === "agent-approve" || path === "agent-approve-many" || path === "agent-reject") {
    const ids = z.array(z.uuid()).min(1).max(20).parse(body); countFixtureCall(state, path);
    if (path === "agent-read") return json(ids.flatMap(id => { const action = state.actions.get(id); return action ? [{ actionId: id, status: action.status, ...(action.result?.href ? { href: String(action.result.href) } : {}) }] : []; }));
    const results = [];
    for (const id of ids) {
      const action = state.actions.get(id);
      if (!action || action.status !== "proposed") { results.push({ status: "error", actionId: id, message: "合成提案已处理或不存在。" }); continue; }
      if (path === "agent-reject") { action.status = "rejected"; results.push({ status: "rejected", actionId: id, message: "已拒绝合成提案。" }); continue; }
      action.status = "succeeded"; action.result = { href: "/tasks" }; state.writes[id] = (state.writes[id] ?? 0) + 1;
      results.push({ status: "success", actionId: id, message: "合成操作已记录。", href: "/tasks" });
    }
    return state.mode === "save-unknown" ? json({ error: "synthetic_response_lost" }, 503) : json(path === "agent-approve-many" ? results : results[0]);
  }
  if (path === "ai-action") {
    const input = z.object({ kind: z.enum(["note-suggestion", "review-draft", "review-proposals", "inbox-classification", "today-summary", "briefing-generation"]), id: z.string() }).passthrough().parse(body);
    countFixtureCall(state, `ai:${input.kind}`);
    if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
    if (state.mode === "ai-error") return json({ error: "synthetic_model_unavailable" }, 503);
    if (input.kind === "note-suggestion") {
      const note = z.object({ content: z.string(), operation: z.string(), scope: z.enum(["note", "selection"]) }).passthrough().parse(input);
      return json({ status: "success", message: "合成建议已生成，尚未应用。", suggestion: note.content.replace("事实", "原始事实") + "\n\n合成补充判断。", operation: note.operation, scope: note.scope });
    }
    if (input.kind === "review-draft") {
      const review = z.object({ baseline: reviewStructuredDataSchema, periodStart: z.string(), periodEnd: z.string(), timezone: z.string() }).passthrough().parse(input);
      return json({ ok: true, draft: { ...review.baseline, wins: ["核对了原始记录"], lessons: ["保留原文来路"], freeReflection: "这是一份合成草稿。" }, period: { periodStart: review.periodStart, periodEnd: review.periodEnd, timezone: review.timezone }, coverage: 1, sources: [{ sourceType: "note", sourceId: state.notes[0].note.id }] });
    }
    if (input.kind === "today-summary") { const today = z.object({ localDate: z.string(), sourceFingerprint: z.string() }).passthrough().parse(input); return json({ summary: "合成总结：核对资料，再做判断。", localDate: today.localDate, sourceFingerprint: today.sourceFingerprint }); }
    if (input.kind === "briefing-generation") { if (input.mode === "ensure") return json({ started: false }); state.writes["briefing-generation"] = (state.writes["briefing-generation"] ?? 0) + 1; return json({ status: "success", message: "合成简报生成完成。", selected: 1, candidateCount: 2, feedsRefreshed: 1, feedsFailed: 0 }); }
    if (input.kind === "inbox-classification") { const capture = state.captures.get(String(input.inboxId)); return capture ? json({ status: "success", message: "合成分类完成。" }) : json({ status: "error", message: "原合成收集项不可用。" }); }
    return json({ error: "unhandled_synthetic_ai_action" }, 503);
  }
  if (path === "note-save") {
    const input = saveInput.parse(body); countFixtureCall(state, "note-save");
    if (state.delay) await new Promise(resolve => setTimeout(resolve, state.delay));
    const item = state.notes.find(item => item.note.id === input.noteId);
    if (!item || item.note.revision !== input.expectedRevision || state.mode === "save-conflict") return json({ status: "conflict" });
    item.note = { ...item.note, title: input.title, body_markdown: input.bodyMarkdown, revision: input.expectedRevision + 1, last_saved_at: syntheticTime(), updated_at: syntheticTime() };
    state.writes["note-save"] = (state.writes["note-save"] ?? 0) + 1;
    if (state.mode === "save-unknown") return json({ error: "synthetic_response_lost" }, 503);
    return json({ status: "saved", revision: item.note.revision, lastSavedAt: syntheticTime() });
  }
  if (path === "note-source") {
    const input = z.object({ noteId: z.uuid(), revision: z.number().int(), body: z.string(), from: z.number().int().nonnegative(), to: z.number().int().positive() }).strict().parse(body);
    const note = state.notes.find(item => item.note.id === input.noteId)?.note;
    if (!note || note.revision !== input.revision || note.body_markdown !== input.body || input.to > input.body.length || input.to <= input.from) return json({ status: "conflict", message: "合成原文已变化。" });
    const versionKey=`note-version-id:${input.noteId}:${input.revision}`, previousVersion=state.domainObjects.get(versionKey), versionId=typeof previousVersion==="string"?previousVersion:crypto.randomUUID();
    if(!previousVersion){state.domainObjects.set(versionKey,versionId);state.domainObjects.set(`note-version:${versionId}`,{noteId:input.noteId,revision:input.revision,body:input.body});}
    const locator = noteSourceLocatorSchema.parse({ kind: "note", noteId: input.noteId, versionId, revision: input.revision, from: input.from, to: input.to, hash: contentHash(input.body.slice(input.from, input.to)) });
    state.domainObjects.set("last-note-source",locator);
    countFixtureCall(state, "note-source", true); return json({ status: "ready", locator, href: sourceLocatorHref(locator) });
  }
  if (path === "scene-save") {
    const input = sceneInput.parse(body), previous = state.sceneReceipts.get(input.requestId); countFixtureCall(state, "scene-save");
    if (previous) return previous.payload === JSON.stringify(input) ? json({ status: "saved", scene: previous.scene }) : json({ status: "conflict" });
    const existing = state.scenes.find(scene => scene.id === input.id);
    if ((existing?.revision ?? 0) !== input.expectedRevision) return json({ status: "conflict" });
    const scene = workspaceSceneSchema.parse({ id: input.id, name: input.name, snapshot: input.snapshot, revision: input.expectedRevision + 1, created_at: existing?.created_at ?? syntheticTime(), updated_at: syntheticTime(), archived_at: input.archive ? syntheticTime() : null });
    state.scenes = [...state.scenes.filter(row => row.id !== scene.id), scene]; state.sceneReceipts.set(input.requestId, { payload: JSON.stringify(input), scene }); state.writes["scene-save"] = (state.writes["scene-save"] ?? 0) + 1;
    return json({ status: "saved", scene });
  }
  if (path === "api/workbench/entities") {
    const input = z.object({ refs: z.array(z.object({ kind: z.string(), id: z.uuid(), investmentType: z.string().optional() }).strict()).max(4) }).strict().parse(body);
    return json({ results: input.refs.map(ref => { const note = state.notes.find(item => ref.kind === "note" && item.note.id === ref.id); const file = fixtureFiles.find(file => ref.kind === "document" && file.id === ref.id); return note ? { status: "ready", entity: { ref, title: note.note.title, href: `/notes/${ref.id}`, subtitle: "合成资料", fields: [], bodyMarkdown: note.note.body_markdown, note: note.note, attachments: [], sourceUrls: [], asOf: syntheticTime() } } : file ? { status: "ready", entity: { ref, title: file.title, href: `/files?file=${file.id}`, subtitle: null, fields: [], sourceUrls: [], asOf: syntheticTime(), pdf: { documentId: file.id, title: file.title } } } : { status: "missing", ref }; }) });
  }
  if (path === "api/assistant/runs") {
    if (state.runs.size >= 50) return json({ error: "synthetic_run_capacity" }, 429);
    const input = z.object({ surface: z.enum(assistantSurfaces), currentEntity: z.object({ type: z.string(), id: z.uuid() }).nullable().optional() }).passthrough().parse(body), id = crypto.randomUUID();
    state.runs.set(id, { surface: input.surface, current_entity_type: input.currentEntity?.type ?? null, current_entity_id: input.currentEntity?.id ?? null, status: "pending", messages: [] }); countFixtureCall(state, "agent-run-create", true); return json({ runId: id });
  }
  if (path === "api/assistant") {
    const input = z.object({ runId: z.uuid().nullable().optional(), surface: z.enum(assistantSurfaces) }).passthrough().parse(body); countFixtureCall(state, "assistant");
    const run = input.runId ? state.runs.get(input.runId) : null;
    if (input.runId && (!run || run.surface !== input.surface)) return json({ error: "synthetic_run_identity_conflict" }, 409);
    if (state.mode === "ai-error") return json({ error: "synthetic_model_unavailable" }, 503);
    const encoder = new TextEncoder();
    let stopped = false;
    return new Response(new ReadableStream({ cancel() { stopped = true; }, async start(controller) {
      const emit = (part: unknown) => { if (!stopped) controller.enqueue(encoder.encode(`data: ${JSON.stringify(part)}\n\n`)); };
      emit({ type: "start", messageId: crypto.randomUUID() }); emit({ type: "text-start", id: "synthetic-text" }); emit({ type: "text-delta", id: "synthetic-text", delta: "合成回答前半段。" });
      await new Promise(resolve => setTimeout(resolve, state.delay || 800));
      if (stopped) return;
      emit({ type: "text-delta", id: "synthetic-text", delta: "返回原位置后继续阅读完整结果。" }); emit({ type: "text-end", id: "synthetic-text" }); emit({ type: "finish", finishReason: "stop" }); controller.enqueue(encoder.encode("data: [DONE]\n\n")); controller.close();
      if (run && input.runId) {
        run.status = "completed";
        // The actual tasks surface permits todo_proposal (proposeTodoCreate).
        // Only these two surfaces get this finite synthetic tasks.create set;
        // calendar/notes/career never receive a task proposal from this fixture.
        if ((input.surface === "global" || input.surface === "tasks") && ![...state.actions.values()].some(action => action.runId === input.runId)) for (let index = 1; index <= 5; index++) {
          const id = crypto.randomUUID();
          if (!state.actions.has(id)) state.actions.set(id, { id, runId: input.runId, domain: "tasks", actionType: "tasks.create", status: "proposed", preview: { title: `合成冻结任务 ${index}`, bodyPreview: "确认前不会写入。" }, riskLevel: "low" });
        }
      }
      if (run) run.messages = [{ id: "synthetic-result", role: "assistant", parts: [{ type: "text", text: "合成回答前半段。返回原位置后继续阅读完整结果。" }] }];
    } }), { headers: { ...headers, "Content-Type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" } });
  }
  return json({ error: "unhandled_synthetic_write" }, 403);
}
async function guarded(request: Request, context: Context) {
  try { return await handle(request, context); } catch (error) { return json({ error: error instanceof z.ZodError ? "synthetic_input_invalid" : "synthetic_transport_failed" }, error instanceof z.ZodError ? 400 : 503); }
}
export const GET = guarded;
export const POST = guarded;
export const DELETE = guarded;

export const PUT = guarded;
export const PATCH = guarded;
export const HEAD = guarded;
