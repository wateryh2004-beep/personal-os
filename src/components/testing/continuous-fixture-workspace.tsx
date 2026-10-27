"use client";
import { NoteSourceExcerptView, type NoteSourceExcerptData } from "@/components/notes/note-source-excerpt-view";
import { ContinuousPracticeWorkspace } from "./continuous-practice-workspace";
import { ContinuousCareerWorkspace } from "./continuous-career-workspace";
import { fixtureProjectTransport, fixtureCalendarCreate, fixtureCalendarEdit, fixturePlanningTransport, fixtureProjectCreation, fixtureTaskCreation } from "@/features/testing/continuous-domain-transports";
import { ContinuousDomainWorkspace } from "./continuous-domain-workspace";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { z } from "zod";
import { NotesWorkspaceShell } from "@/components/notes/notes-workspace-shell";
import { NotesWorkspace } from "@/components/notes/notes-workspace";
import { NoteDocumentShell } from "@/components/notes/note-document-shell";
import { NoteEditor } from "@/components/notes/note-editor";
import { NotesLibraryChat } from "@/components/assistant/notes-library-chat";
import { ProjectsWorkspace } from "@/components/projects/projects-workspace";
import { TaskWorkspace } from "@/components/tasks/task-workspace";
import { CalendarWorkspace } from "@/components/calendar/calendar-workspace";
import { FilesWorkspace } from "@/components/files/files-workspace";
import { TodayWorkspaceLoader } from "@/components/today/today-workspace-loader";
import { fixtureUnknownTask } from "@/features/testing/continuous-domain-fixture-data";
import { ReviewComposer } from "@/components/reviews/review-composer";
import { SourceLink } from "@/components/workflow-continuity/source-link";
import { WorkbenchRecord } from "@/components/workbench/workbench-record";
import { noteDocumentCache } from "@/features/notes/document-resource";
import { useWorkspaceResource } from "@/lib/workspace-resource-cache";
import { fixtureAi, fixtureNote, postFixture, fixtureAgentActions } from "@/features/testing/continuous-fixture-transports";
import { fixtureNoteDocuments, fixtureProject, fixtureFiles, fixtureTask, fixtureEvents, fixtureTimestamp } from "@/features/testing/continuous-fixture-data";
import type { ReviewEvidence } from "@/features/reviews/evidence";
const notes = fixtureNoteDocuments.map(({ note }) => ({ ...note, excerpt: "全部为合成资料。" }));
const lists = [{ id: fixtureTask.todoListId, displayName: "合成清单", isDefault: true }];
const emptyReview = { wins: [], friction: [], openLoops: [], changes: [], lessons: [], nextFocus: [], freeReflection: "" };
function FixtureNote({ id }: { id: string }) {
  const resource = useMemo(() => noteDocumentCache.get(id), [id]);
  const result = useWorkspaceResource(resource, "note-document");
  if (!result.data) return <p role="status">{result.error ? "合成笔记读取失败" : "正在打开合成笔记…"}</p>;
  const data = result.data;
  return <NoteDocumentShell noteId={id} attachments={data.attachments} editor={<NoteEditor verificationTransport={fixtureNote} note={data.note} noteAiDefaultModel="deepseek-v4-flash" />} inspector={<aside className="p-3"><p>合成来源</p><SourceLink href="/projects" className="ui-link inline-flex min-h-11 items-center">返回合成项目</SourceLink><WorkbenchRecord entity={{ kind: "note", id: fixtureNoteDocuments[1].note.id }} title="另一篇合成笔记" group="continuous-notes"><SourceLink href={`/notes/${fixtureNoteDocuments[1].note.id}`} className="ui-link inline-flex min-h-11 items-center">另一篇合成笔记</SourceLink></WorkbenchRecord><WorkbenchRecord entity={{ kind: "document", id: fixtureFiles[0].id }} title={fixtureFiles[0].title} group="continuous-files"><SourceLink href={`/files?file=${fixtureFiles[0].id}`} className="ui-link inline-flex min-h-11 items-center">核对合成原件</SourceLink></WorkbenchRecord></aside>} />;
}
export function ContinuousFixtureWorkspace({ path, inboxItems, sourceExcerpt }: { path: string; sourceExcerpt?:NoteSourceExcerptData; inboxItems?:import("react").ComponentProps<typeof import("@/components/inbox/inbox-workspace").InboxWorkspace>["items"] }) {
  const params = useSearchParams();
  if (path === "/notes/ask") return <NotesLibraryChat actionTransport={fixtureAgentActions} />;
  if (path === "/notes" || /^\/notes\/[0-9a-f-]{36}$/.test(path)) {
    const id = path === "/notes" ? null : path.split("/").at(-1)!;
    return <NotesWorkspaceShell folders={[]} notes={notes} documentView={Boolean(id)}>{id ? <div className="flex h-full min-h-0 flex-col">{sourceExcerpt?<NoteSourceExcerptView {...sourceExcerpt}/>:null}<div className="min-h-0 flex-1"><FixtureNote key={id} id={id}/></div></div> : <NotesWorkspace notes={notes} folders={[]} timezone="UTC" state="ready" selectedFolder={null} initialView="all" dailyError={false} initialHasMore={false} />}</NotesWorkspaceShell>;
  }
  if (path === "/today") return <TodayWorkspaceLoader verificationTransport={{ai:fixtureAi,planning:fixturePlanningTransport}} />;
  if (path === "/projects") return <ProjectsWorkspace creationTransport={fixtureProjectCreation} workflowTransport={fixtureProjectTransport} projects={[fixtureProject]} materials={notes.map(note => ({ id: note.id, title: note.title, project_id: fixtureProject.id }))} attachments={[{ ...fixtureFiles[0], role: "primary_pdf", noteId: notes[0].id, projectId: fixtureProject.id }]} todoTasks={[{ id: fixtureTask.id, title: fixtureTask.title, status: fixtureTask.status, archived_at: null }]} />;
  if (path === "/tasks") return <TaskWorkspace taskCreationTransport={fixtureTaskCreation} planningTransport={fixturePlanningTransport} actionTransport={fixtureAgentActions} tasks={[fixtureTask,fixtureUnknownTask]} lists={lists} initialDayBounds={{ startMs: Date.parse("2026-10-27T00:00:00Z"), endMs: Date.parse("2026-10-28T00:00:00Z") }} initialTaskId={params.get("task") ?? undefined} />;
  if (path === "/calendar") return <CalendarWorkspace creationTransport={fixtureCalendarCreate} editTransport={fixtureCalendarEdit} actionTransport={fixtureAgentActions} events={fixtureEvents} categories={[]} timezone="UTC" syncStatus={null} scopeReady initialEventId={params.get("event") ?? undefined} />;
  if (path === "/files") return <FilesWorkspace files={fixtureFiles} folders={[]} initialFileId={params.get("file") ?? undefined} />;
  if (path === "/reviews/daily" || path === "/reviews/weekly") {
    const type = path.endsWith("weekly") ? "weekly" : "daily";
    const evidence: ReviewEvidence = { reviewType: type, periodStart: "2026-10-27", periodEnd: "2026-10-27", generatedAt: fixtureTimestamp, timezone: "UTC", calendar: [], tasksCompleted: [], tasksOpen: [], notes: notes.map(note=>({id:note.id,type:"note",title:note.title,occurredAt:fixtureTimestamp,href:`/notes/${note.id}`})), inbox: [], career: [], projects: [], decisions: [] };
    return <ReviewComposer key={type} type={type} evidence={evidence} initialValue={emptyReview} verificationTransport={{ ai: fixtureAi, completeReview: async input => z.object({ reviewId: z.uuid(), sourceCount: z.number().int(), versionNumber: z.number().int() }).strict().parse(await postFixture("review-save", input)) }} />;
  }
  if (path === "/career/interview/insights" || path.startsWith("/career/interview/practice/")) return <ContinuousPracticeWorkspace path={path} />;
  if (["/career/experiences", "/career/skills"].includes(path)) return <ContinuousCareerWorkspace path={path} />;
  if (["/briefing", "/briefing/events", "/shopping", "/travel", "/leisure", "/investments", "/inbox"].includes(path) || /^\/(shopping|travel|leisure)\//.test(path) || /\/materials$/.test(path)) return <ContinuousDomainWorkspace path={path} inboxItems={inboxItems} />;
  return <div data-testid="continuous-fixture-unimplemented" className="p-5"><p>该合成领域尚未接入验证，不能计为通过。</p><SourceLink className="ui-link inline-flex min-h-11 items-center" href="/notes">回到合成笔记</SourceLink></div>;
}
