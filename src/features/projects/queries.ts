import { attachmentRole, type NoteAttachment } from "@/features/notes/attachments";
export type ProjectMaterialAttachment = NoteAttachment & { noteId: string; projectId: string };

import { requireOwner } from "@/lib/auth/require-owner";

export async function getProjects() {
  const { supabase, userId } = await requireOwner();
  const { data, error } = await supabase
    .from("projects")
    .select(
      "id,name,description,status,due_date,updated_at,blocker_text,next_todo_task_id,mutation_revision",
    )
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false });
  if (error) return { projects: [], unavailable: true };
  const tasks = await supabase
    .from("microsoft_todo_tasks")
    .select("id,title,status,archived_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(501);
  const materials = await supabase
    .from("notes")
    .select("id,title,project_id")
    .eq("user_id", userId)
    .is("vault_group_id", null)
    .is("archived_at", null)
    .is("deleted_at", null)
    .in("project_id", (data ?? []).map(project => project.id))
    .order("updated_at", { ascending: false })
    .limit(501);
  // Only already-visible project notes may reveal their attachment metadata.
  // This never calls getNoteDocument or reads Markdown/extracted file contents.
  const visibleNotes = materials.error ? [] : (materials.data ?? []).slice(0, 500);
  const attachments: ProjectMaterialAttachment[] = [];
  let attachmentsUnavailable = false, attachmentsTruncated = false;
  if (visibleNotes.length) {
    const links = await supabase.from("entity_links").select("source_id,target_id,metadata")
      .eq("user_id", userId).eq("source_type", "note").in("source_id", visibleNotes.map(note => note.id))
      .eq("target_type", "document").in("relationship_type", ["attachment", "source"]).is("archived_at", null).limit(1001);
    attachmentsUnavailable = Boolean(links.error); attachmentsTruncated = (links.data?.length ?? 0) > 1000;
    if (!links.error) {
      const rolePriority = (metadata: unknown) => attachmentRole(metadata) === "primary_pdf" ? 0 : attachmentRole(metadata) === "pdf_snapshot" ? 1 : 2;
      const authorizedLinks = (links.data ?? []).slice(0, 1000).sort((a, b) => rolePriority(a.metadata) - rolePriority(b.metadata));
      const seen = new Set<string>();
      const ids = [...new Set(authorizedLinks.map(link => link.target_id))];
      for (let offset = 0; offset < ids.length; offset += 100) {
        const files = await supabase.from("documents").select("id,title,original_filename,mime_type,file_size")
          .eq("user_id", userId).eq("storage_provider", "cloudflare_r2").eq("storage_state", "available").is("vault_group_id", null)
          .is("archived_at", null).in("id", ids.slice(offset, offset + 100));
        if (files.error) { attachmentsUnavailable = true; continue; }
        for (const file of files.data ?? []) for (const link of authorizedLinks.filter(link => link.target_id === file.id)) {
          const note = visibleNotes.find(note => note.id === link.source_id);
          const key = `${note?.id}:${file.id}`;
          if (note?.project_id && !seen.has(key)) { seen.add(key); attachments.push({ ...file, noteId: note.id, projectId: note.project_id, role: attachmentRole(link.metadata) }); }
        }
      }
    }
  }
  return {
    attachments, attachmentsUnavailable, attachmentsTruncated,
    materials: visibleNotes,
    materialsUnavailable: Boolean(materials.error),
    materialsTruncated: (materials.data?.length ?? 0) > 500,
    projects: data ?? [],
    unavailable: false,
    todoTasks: tasks.data?.slice(0, 500) ?? [],
    tasksUnavailable: Boolean(tasks.error),
    tasksTruncated: (tasks.data?.length ?? 0) > 500,
  };
}
