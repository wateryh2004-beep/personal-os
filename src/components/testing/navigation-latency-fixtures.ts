import type { TasksWorkspaceData } from "@/features/tasks/workspace-resource";
import type { NotesWorkspaceData } from "@/features/notes/workspace-resource";

// Synthetic metadata only. No account data or authentication bypass for APIs.
export const latencyTasks: TasksWorkspaceData = {
  connection: { id: "fixture-connection", status: "active", oauth_connected_at: null, last_error_code: null },
  lists: [{ id: "fixture-list", displayName: "测试清单", isDefault: true }],
  tasks: [{ id: "fixture-task", providerTaskId: "fixture-task", todoListId: "fixture-list", title: "Synthetic latency task", bodyText: "Fixture only", status: "notStarted", importance: "normal", dueAt: null, completedAt: null, lastModifiedAt: null }],
  unavailable: false, schemaMissing: false,
};
export const latencyNotes: NotesWorkspaceData = {
  folders: [{ id: "fixture-folder", name: "测试文件夹", parent_id: null }],
  notes: [{ id: "fixture-note", title: "Synthetic latency note", excerpt: "Fixture only", folder_id: null, updated_at: "2026-10-02T00:00:00Z", pinned_at: null, content_origin: "human" }],
  navigatorNotes: [{ id: "fixture-note", title: "Synthetic latency note", folder_id: null, updated_at: "2026-10-02T00:00:00Z", content_origin: "human" }],
  timezone: "UTC", state: "ready", hasMore: false,
};
