import type { NoteDocumentData } from "@/features/notes/queries";
import type { FileRecord } from "@/features/files/queries";
import type { CalendarEventRecord } from "@/features/calendar/types";
import type { TodoTask } from "@/features/tasks/types";
import type { ProjectPresentation } from "@/components/projects/project-progress";
import type { NowWorkspace } from "@/features/today/types";
export const fixtureOwner = "e1000000-0000-4000-8000-000000000001";
export const fixtureTimestamp = "2026-10-27T09:00:00Z";
export const fixtureNoteDocuments: NoteDocumentData[] = [1, 2].map(index => ({
  note: { id: `e2000000-0000-4000-8000-00000000000${index}`, user_id: fixtureOwner, title: `合成连续工作笔记 ${index}`,
    body_markdown: Array.from({ length: 80 }, (_, line) => `## 合成段落 ${line + 1}\n\n保留事实与原始来源，再写下自己的判断。这里全部是合成验证资料。\n\n`).join(""),
    revision: 1, last_saved_at: fixtureTimestamp, created_at: fixtureTimestamp, updated_at: fixtureTimestamp, folder_id: null, pinned_at: null, archived_at: null, deleted_at: null, status: "active", content_origin: "human", ai_visibility: "normal", source_url: null }, attachments: [],
}));
export const fixtureProject: ProjectPresentation = { id: "e3000000-0000-4000-8000-000000000001", name: "合成项目：保留资料来路", description: "把笔记、附件和下一步放在同一个可追溯项目里。", status: "active", due_date: "2026-11-01", updated_at: fixtureTimestamp, blocker_text: "", next_todo_task_id: null, mutation_revision: 1 };
export const fixtureFiles: FileRecord[] = [1, 2].map(index => ({ id: `e4000000-0000-4000-8000-00000000000${index}`, title: `合成原件 ${index}`, original_filename: `synthetic-${index}.pdf`, mime_type: "application/pdf", file_size: 2000, folder_id: null, created_at: fixtureTimestamp, uploaded_at: fixtureTimestamp, archived_at: null, ai_visibility: "normal", text_extraction_status: "completed", extracted_character_count: 100, mutation_revision: 1 }));
export const fixtureTask: TodoTask = { id: "e5000000-0000-4000-8000-000000000001", providerTaskId: "synthetic-task-1", todoListId: "e5000000-0000-4000-8000-000000000002", title: "合成任务：核对项目资料", bodyText: "完成后再记录结果。", status: "notStarted", importance: "normal", dueAt: "2026-10-27T10:00:00Z", completedAt: null, lastModifiedAt: fixtureTimestamp };
export const fixtureEvents: CalendarEventRecord[] = [{ id: "e6000000-0000-4000-8000-000000000001", provider_event_id: "synthetic-event-1", subject: "合成日程：资料核对", body_text: "保留原有时间范围。", starts_at: "2026-10-27T09:00:00Z", ends_at: "2026-10-27T10:00:00Z", is_all_day: false, location_name: null, categories: [], importance: "normal", show_as: "busy", last_synced_at: fixtureTimestamp }];
export const fixtureToday: NowWorkspace = {
  generatedAt: fixtureTimestamp, timezone: "UTC", calendar: { today: fixtureEvents, upcoming: [], connection: null }, tasks: { overdue: [], today: [], upcoming: [] }, career: { upcomingMilestones: [] },
  briefing: { entries: [], date: "2026-10-27" }, inboxCount: 0, commitments: [], nextAction: { kind: "none", reason: "合成验证工作区" },
  todayBrief: [{ id: "synthetic-source", title: "从原文继续判断", reason: "全部合成资料。", priority: 1, sourceRefs: [{ id: fixtureNoteDocuments[0].note.id, domain: "notes", title: fixtureNoteDocuments[0].note.title, href: `/notes/${fixtureNoteDocuments[0].note.id}` }] }], attention: [], upcoming: [],
  availability: { calendar: "ready", tasks: "ready", career: "ready", inbox: "ready", briefing: "ready" }, summary: { todayEventCount: 1, todayTaskCount: 0, attentionCount: 0 }, focus: { date: "2026-10-27", selectedIds: [], selectedTasks: [], candidates: [], available: true },
};
