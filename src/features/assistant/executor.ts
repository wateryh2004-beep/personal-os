import "server-only";
import { contentHash } from "@/features/notes/utils";
import { calendarPayload, calendarUpdatePayload } from "@/features/calendar/utils";
import { normalizeMemoryKey } from "@/features/memory/types";
import {
  createCalendarEventSchema,
  deleteCalendarEventSchema,
  updateCalendarEventSchema,
} from "@/features/calendar/schemas";
import { todoProposalSchema } from "@/features/tasks/schemas";
import { microsoftTodoRepository } from "@/features/tasks/repository";
import {
  executeCalendarOperation,
} from "@/lib/adapters/microsoft-graph/calendar";
import type { createClient } from "@/lib/supabase/server";
import { noteRevisionMatches } from "./action-guards";
import {
  noteCreateProposalSchema,
  noteMoveProposalSchema,
  noteUpdateProposalSchema,
  todoCompleteProposalSchema,
  todoDeleteProposalSchema,
  todoReopenProposalSchema,
  todoUpdateProposalSchema,
  careerFactProposalSchema,
  careerMilestoneProposalSchema,
  memoryCreateProposalSchema,
  memoryUpdateProposalSchema,
  projectCreateProposalSchema,
  shoppingCreateProposalSchema,
  travelCreateProposalSchema,
  type AgentActionType,
} from "./tools/schemas";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export class AgentActionConflict extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

export const executableAgentActionTypes: AgentActionType[] = [
  "calendar.create",
  "calendar.update",
  "calendar.delete",
  "tasks.create",
  "tasks.update",
  "tasks.delete",
  "tasks.complete",
  "tasks.reopen",
  "notes.create",
  "notes.update",
  "notes.move",
  "career.milestone.create",
  "career.fact.create",
  "memory.create",
  "memory.update",
  "projects.create",
  "shopping.create",
  "travel.create",
];

export function hasDeterministicExecutor(actionType: string): actionType is AgentActionType {
  return executableAgentActionTypes.includes(actionType as AgentActionType);
}

async function activeMicrosoftConnection(supabase: Supabase) {
  const { data, error } = await supabase
    .from("calendar_connections")
    .select("id,status,oauth_scope_version")
    .is("archived_at", null)
    .maybeSingle();
  if (error || !data || data.status !== "enabled")
    throw new Error("microsoft_disconnected");
  return { id: data.id as string, scopeReady: (data.oauth_scope_version ?? 1) >= 2 };
}

async function executeCalendar(input: {
  supabase: Supabase;
  userId: string;
  actionType: "calendar.create" | "calendar.update" | "calendar.delete";
  payload: Record<string, unknown>;
  timezone: string;
}) {
  const connection = await activeMicrosoftConnection(input.supabase);
  const connectionId = connection.id;
  let providerEventId: string | null = null;
  let operationPayload: Record<string, unknown>;
  if (input.actionType === "calendar.create") {
    const value = createCalendarEventSchema.parse(input.payload);
    const { data: rules } = connection.scopeReady ? await input.supabase.from("calendar_categories").select("managed_key,keywords,ai_enabled").not("managed_key", "is", null).is("archived_at", null) : { data: null };
    operationPayload = { ...calendarPayload(value, { enabled: connection.scopeReady, rules: rules ?? undefined }), timeZone: input.timezone };
  } else if (input.actionType === "calendar.update") {
    const value = updateCalendarEventSchema.parse(input.payload);
    const { data } = await input.supabase
      .from("calendar_events")
      .select("provider_event_id,subject,body_text,starts_at,ends_at,is_all_day,location_name,categories,importance,show_as")
      .eq("user_id", input.userId)
      .eq("provider_event_id", value.providerEventId)
      .eq("subject", value.originalSubject)
      .eq("starts_at", value.originalStartsAt)
      .eq("ends_at", value.originalEndsAt)
      .is("archived_at", null)
      .maybeSingle();
    if (!data) throw new AgentActionConflict("calendar_changed");
    providerEventId = data.provider_event_id;
    operationPayload = {
      ...calendarUpdatePayload(value, { categories: data.categories ?? [], body_text: data.body_text, location_name: data.location_name, is_all_day: data.is_all_day, importance: data.importance, show_as: data.show_as }),
      timeZone: input.timezone,
      previous: {
        subject: data.subject,
        startsAt: data.starts_at,
        endsAt: data.ends_at,
      },
    };
  } else {
    const value = deleteCalendarEventSchema.parse(input.payload);
    const { data } = await input.supabase
      .from("calendar_events")
      .select("provider_event_id,subject,starts_at,ends_at,is_all_day")
      .eq("user_id", input.userId)
      .eq("provider_event_id", value.providerEventId)
      .eq("subject", value.subject)
      .eq("starts_at", value.startsAt)
      .eq("ends_at", value.endsAt)
      .eq("is_all_day", value.isAllDay)
      .is("archived_at", null)
      .maybeSingle();
    if (!data) throw new AgentActionConflict("calendar_changed");
    providerEventId = data.provider_event_id;
    operationPayload = {
      subject: data.subject,
      startsAt: data.starts_at,
      endsAt: data.ends_at,
      isAllDay: data.is_all_day,
    };
  }
  const operationType = input.actionType.split(".")[1];
  const { data: operation, error } = await input.supabase
    .from("calendar_operations")
    .insert({
      user_id: input.userId,
      connection_id: connectionId,
      operation_type: operationType,
      status: "queued",
      provider_event_id: providerEventId,
      payload: operationPayload,
      confirmed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !operation) throw new Error("calendar_queue_failed");
  await executeCalendarOperation(operation.id, input.userId);
  return { operationId: operation.id };
}

async function executeTask(input: {
  supabase: Supabase;
  userId: string;
  actionType: "tasks.create" | "tasks.update" | "tasks.delete" | "tasks.complete" | "tasks.reopen";
  payload: Record<string, unknown>;
}) {
  const connectionId = (await activeMicrosoftConnection(input.supabase)).id;
  if (input.actionType === "tasks.create") {
    const value = todoProposalSchema.parse(input.payload);
    const taskId = await microsoftTodoRepository.create(connectionId, input.userId, value);
    return { taskId };
  }
  const schema = input.actionType === "tasks.complete" ? todoCompleteProposalSchema : input.actionType === "tasks.update" ? todoUpdateProposalSchema : input.actionType === "tasks.delete" ? todoDeleteProposalSchema : todoReopenProposalSchema;
  const value = schema.parse(input.payload);
  const { data } = await input.supabase
    .from("microsoft_todo_tasks")
    .select("id,title,status,provider_last_modified_at")
    .eq("id", value.taskId)
    .eq("title", value.title)
    .eq("status", value.expectedStatus)
    .eq("provider_last_modified_at", value.expectedLastModifiedAt)
    .is("archived_at", null)
    .maybeSingle();
  if (!data) throw new AgentActionConflict("task_changed");
  if (input.actionType === "tasks.update") await microsoftTodoRepository.update(connectionId, input.userId, data.id, todoUpdateProposalSchema.parse(input.payload).patch);
  else if (input.actionType === "tasks.delete") await microsoftTodoRepository.delete(connectionId, input.userId, data.id);
  else if (input.actionType === "tasks.reopen") {
    if (data.status !== "completed") throw new AgentActionConflict("task_changed");
    await microsoftTodoRepository.reopen(connectionId, input.userId, data.id);
  } else await microsoftTodoRepository.complete(connectionId, input.userId, data.id);
  return { taskId: data.id };
}

async function executeNote(input: {
  supabase: Supabase;
  userId: string;
  actionType: "notes.create" | "notes.update" | "notes.move";
  payload: Record<string, unknown>;
}) {
  const now = new Date().toISOString();
  if (input.actionType === "notes.create") {
    const value = noteCreateProposalSchema.parse(input.payload);
    if (value.folderId) {
      const { data: folder } = await input.supabase
        .from("note_folders")
        .select("id")
        .eq("id", value.folderId)
        .is("archived_at", null)
        .maybeSingle();
      if (!folder) throw new AgentActionConflict("folder_changed");
    }
    const body = value.bodyMarkdown;
    const hash = contentHash(body);
    const { data: note, error } = await input.supabase
      .from("notes")
      .insert({
        user_id: input.userId,
        folder_id: value.folderId,
        title: value.title,
        body_markdown: body,
        status: "active",
        revision: 1,
        content_hash: hash,
        word_count: body.trim() ? body.trim().split(/\s+/).length : 0,
        character_count: body.length,
        last_saved_at: now,
      })
      .select("id")
      .single();
    if (error || !note) throw new Error("note_create_failed");
    const version = await input.supabase.from("note_versions").insert({
      user_id: input.userId,
      note_id: note.id,
      title: value.title,
      body_markdown: body,
      version_number: 1,
      created_by: input.userId,
      content_hash: hash,
      revision: 1,
      reason: "assistant_confirmed",
    });
    if (version.error) throw new Error("note_version_failed");
    return { noteId: note.id, href: `/notes/${note.id}` };
  }
  if (input.actionType === "notes.move") {
    const value = noteMoveProposalSchema.parse(input.payload);
    const { data: note } = await input.supabase
      .from("notes")
      .select("id")
      .eq("id", value.noteId)
      .eq("status", "active")
      .is("deleted_at", null)
      .is("archived_at", null)
      .maybeSingle();
    if (!note) throw new AgentActionConflict("note_not_found");
    let targetFolderId: string | null = null;
    if (value.newFolderName) {
      // 新建文件夹：复用根级同名已有文件夹，避免重复建夹；否则新建（parent_id null）。
      const { data: existing } = await input.supabase
        .from("note_folders")
        .select("id")
        .eq("user_id", input.userId)
        .is("parent_id", null)
        .is("archived_at", null)
        .ilike("name", value.newFolderName.trim())
        .maybeSingle();
      if (existing) {
        targetFolderId = existing.id;
      } else {
        const { data: folder, error } = await input.supabase
          .from("note_folders")
          .insert({
            user_id: input.userId,
            parent_id: null,
            name: value.newFolderName.trim(),
            position: 0,
          })
          .select("id")
          .single();
        if (error || !folder) throw new Error("folder_create_failed");
        targetFolderId = folder.id;
      }
    } else if (value.destinationFolderId) {
      const { data: folder } = await input.supabase
        .from("note_folders")
        .select("id")
        .eq("id", value.destinationFolderId)
        .is("archived_at", null)
        .maybeSingle();
      if (!folder) throw new AgentActionConflict("folder_changed");
      targetFolderId = folder.id;
    } else {
      throw new AgentActionConflict("folder_required");
    }
    const { error } = await input.supabase
      .from("notes")
      .update({ folder_id: targetFolderId })
      .eq("id", value.noteId)
      .eq("user_id", input.userId)
      .eq("status", "active")
      .is("deleted_at", null)
      .is("archived_at", null);
    if (error) throw new Error("note_move_failed");
    return { noteId: note.id, href: `/notes/${note.id}` };
  }
  const value = noteUpdateProposalSchema.parse(input.payload);
  const { data: note } = await input.supabase
    .from("notes")
    .select("id,title,body_markdown,revision,content_hash")
    .eq("id", value.noteId)
    .eq("revision", value.expectedRevision)
    .eq("status", "active")
    .is("deleted_at", null)
    .is("archived_at", null)
    .maybeSingle();
  if (!note || !noteRevisionMatches({
    revision: note.revision,
    bodyMarkdown: note.body_markdown,
    contentHash: note.content_hash,
  }, {
    revision: value.expectedRevision,
    contentHash: value.currentBodyHash,
  }))
    throw new AgentActionConflict("note_revision_conflict");
  const { data: latest } = await input.supabase
    .from("note_versions")
    .select("version_number")
    .eq("note_id", note.id)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  const snapshot = await input.supabase.from("note_versions").insert({
    user_id: input.userId,
    note_id: note.id,
    title: note.title,
    body_markdown: note.body_markdown,
    version_number: (latest?.version_number ?? 0) + 1,
    created_by: input.userId,
    content_hash: note.content_hash || contentHash(note.body_markdown),
    revision: note.revision,
    reason: "before_assistant_update",
  });
  if (snapshot.error) throw new Error("note_version_failed");
  const title = value.newTitle ?? note.title;
  const body = value.suggestedBody;
  const { data: updated, error } = await input.supabase
    .from("notes")
    .update({
      title,
      body_markdown: body,
      revision: value.expectedRevision + 1,
      content_hash: contentHash(body),
      word_count: body.trim() ? body.trim().split(/\s+/).length : 0,
      character_count: body.length,
      last_saved_at: now,
    })
    .eq("id", note.id)
    .eq("revision", value.expectedRevision)
    .select("id,revision")
    .maybeSingle();
  if (error) throw new Error("note_update_failed");
  if (!updated) throw new AgentActionConflict("note_revision_conflict");
  return { noteId: note.id, revision: updated.revision, href: `/notes/${note.id}` };
}

async function executeCareer(input: {
  supabase: Supabase;
  userId: string;
  actionType: "career.milestone.create" | "career.fact.create";
  payload: Record<string, unknown>;
}) {
  if (input.actionType === "career.milestone.create") {
    const value = careerMilestoneProposalSchema.parse(input.payload);
    const [track, direction] = await Promise.all([
      input.supabase
        .from("career_tracks")
        .select("id")
        .eq("id", value.trackId)
        .is("archived_at", null)
        .maybeSingle(),
      value.careerDirectionId
        ? input.supabase
            .from("career_directions")
            .select("id")
            .eq("id", value.careerDirectionId)
            .is("archived_at", null)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (!track.data || (value.careerDirectionId && !direction.data))
      throw new AgentActionConflict("career_reference_changed");
    const { data, error } = await input.supabase
      .from("career_milestones")
      .insert({
        user_id: input.userId,
        track_id: value.trackId,
        career_direction_id: value.careerDirectionId,
        title: value.title,
        description: value.description,
        starts_on: null,
        target_date: value.targetDate,
        status: value.status,
        importance: value.importance,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error("career_milestone_create_failed");
    return { milestoneId: data.id, href: "/career/roadmap" };
  }

  const value = careerFactProposalSchema.parse(input.payload);
  const [experience, document] = await Promise.all([
    input.supabase
      .from("experiences")
      .select("id")
      .eq("id", value.experienceId)
      .is("archived_at", null)
      .maybeSingle(),
    value.sourceDocumentId
      ? input.supabase
          .from("documents")
          .select("id")
          .eq("id", value.sourceDocumentId)
          .is("archived_at", null)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (!experience.data || (value.sourceDocumentId && !document.data))
    throw new AgentActionConflict("career_reference_changed");
  const { data, error } = await input.supabase
    .from("experience_facts")
    .insert({
      user_id: input.userId,
      experience_id: value.experienceId,
      fact_type: value.factType,
      content: value.content,
      metric_value: value.metricValue,
      metric_unit: value.metricUnit,
      occurred_at: value.occurredAt,
      verification_status: "unverified",
      source_document_id: value.sourceDocumentId,
      notes_markdown: value.notesMarkdown,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error("career_fact_create_failed");
  return { factId: data.id, href: `/career/experiences/${value.experienceId}` };
}

async function executeMemory(input: {
  supabase: Supabase;
  userId: string;
  actionType: "memory.create" | "memory.update";
  payload: Record<string, unknown>;
}) {
  if (input.actionType === "memory.create") {
    const value = memoryCreateProposalSchema.parse(input.payload);
    if (value.type === "decision") {
      const { data, error } = await input.supabase
        .from("decisions")
        .insert({
          user_id: input.userId,
          title: value.title,
          decision_text: value.content,
          rationale_markdown: value.rationaleMarkdown,
          context_markdown: `由 Personal OS Agent 提案，经用户确认。理由：${value.reason}`,
          importance: value.importance,
          ai_visibility: value.aiVisibility,
          decided_at: value.decidedAt ?? new Date().toISOString(),
          review_at: value.reviewAt,
          created_via: "assistant_proposal",
        })
        .select("id")
        .single();
      if (error || !data) throw new Error("decision_create_failed");
      return { decisionId: data.id, href: "/memory" };
    }
    const key = normalizeMemoryKey(value.type, value.title);
    const { data, error } = await input.supabase
      .from("personal_memories")
      .insert({
        user_id: input.userId,
        memory_type: value.type,
        memory_key: key,
        title: value.title,
        content: value.content,
        ai_visibility: value.aiVisibility,
        valid_until: value.validUntil,
        review_at: value.reviewAt,
        created_via: "assistant_proposal",
      })
      .select("id")
      .single();
    if (error?.code === "23505") throw new AgentActionConflict("memory_key_conflict");
    if (error || !data) throw new Error("memory_create_failed");
    return { memoryId: data.id, href: "/memory" };
  }

  const value = memoryUpdateProposalSchema.parse(input.payload);
  const { data, error } = await input.supabase.rpc(
    "supersede_personal_memory_from_agent",
    {
      p_memory_id: value.memoryId,
      p_expected_updated_at: value.expectedUpdatedAt,
      p_title: value.title,
      p_content: value.content,
      p_ai_visibility: value.aiVisibility,
      p_valid_until: value.validUntil,
      p_review_at: value.reviewAt,
    },
  );
  if (error?.message?.includes("memory changed"))
    throw new AgentActionConflict("memory_changed");
  if (error || !data) throw new Error("memory_update_failed");
  const row = Array.isArray(data) ? data[0] : data;
  return { memoryId: row?.id ?? value.memoryId, href: "/memory" };
}

async function executeProject(input: {
  supabase: Supabase;
  userId: string;
  payload: Record<string, unknown>;
}) {
  const value = projectCreateProposalSchema.parse(input.payload);
  if (value.areaId) {
    const { data: area } = await input.supabase
      .from("areas")
      .select("id")
      .eq("id", value.areaId)
      .is("archived_at", null)
      .maybeSingle();
    if (!area) throw new AgentActionConflict("area_changed");
  }
  const { data, error } = await input.supabase
    .from("projects")
    .insert({
      user_id: input.userId,
      area_id: value.areaId,
      name: value.name,
      description: value.description,
      status: "active",
      start_date: value.startDate,
      due_date: value.dueDate,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error("project_create_failed");
  return { projectId: data.id, href: "/projects" };
}

async function executeShopping(input: { supabase: Supabase; userId: string; payload: Record<string, unknown> }) {
  const value = shoppingCreateProposalSchema.parse(input.payload);
  const duplicateQuery = value.title.replaceAll("%", "\\%");
  const { data: duplicate } = await input.supabase.from("purchase_items").select("id").ilike("title", `%${duplicateQuery}%`).is("archived_at", null).not("status", "in", "(abandoned,archived)").limit(1).maybeSingle();
  if (duplicate) throw new AgentActionConflict("purchase_duplicate");
  const decision = value.necessity === "necessary" && value.necessityConfirmed && value.priceCny !== undefined && value.priceCny <= 50;
  const { data, error } = await input.supabase.from("purchase_items").insert({ user_id: input.userId, title: value.title, category: value.category ?? null, source_url: value.sourceUrl || null, price_cny: value.priceCny ?? null, necessity: value.necessity, necessity_confirmed: value.necessityConfirmed, reason_to_buy: value.reasonToBuy ?? null, existing_alternative: value.existingAlternative ?? null, notes_markdown: value.notesMarkdown ?? "", created_via: "assistant", status: decision ? "ready" : "cooling", cooldown_until: decision ? null : new Date(Date.now() + 2 * 86_400_000).toISOString() }).select("id").single();
  if (error || !data) throw new Error("shopping_create_failed");
  return { purchaseItemId: data.id, href: `/shopping/${data.id}` };
}

async function executeTravel(input: { supabase: Supabase; userId: string; payload: Record<string, unknown> }) {
  const value = travelCreateProposalSchema.parse(input.payload);
  const { data, error } = await input.supabase.from("trips").insert({ user_id: input.userId, title: value.title, description: value.description, destination_label: value.destinationLabel, status: "dream", created_via: "assistant" }).select("id").single();
  if (error || !data) throw new Error("travel_create_failed");
  return { tripId: data.id, href: `/travel/${data.id}` };
}

export async function executeFrozenAgentAction(input: {
  supabase: Supabase;
  userId: string;
  actionType: string;
  payload: Record<string, unknown>;
  timezone: string;
}) {
  if (!hasDeterministicExecutor(input.actionType))
    throw new Error("unsupported_action");
  if (input.actionType === "calendar.create" || input.actionType === "calendar.update" || input.actionType === "calendar.delete")
    return executeCalendar({ ...input, actionType: input.actionType });
  if (input.actionType === "tasks.create" || input.actionType === "tasks.update" || input.actionType === "tasks.delete" || input.actionType === "tasks.complete" || input.actionType === "tasks.reopen")
    return executeTask({ ...input, actionType: input.actionType });
  if (input.actionType === "career.milestone.create" || input.actionType === "career.fact.create")
    return executeCareer({ ...input, actionType: input.actionType });
  if (input.actionType === "memory.create" || input.actionType === "memory.update")
    return executeMemory({ ...input, actionType: input.actionType });
  if (input.actionType === "projects.create")
    return executeProject(input);
  if (input.actionType === "shopping.create") return executeShopping(input);
  if (input.actionType === "travel.create") return executeTravel(input);
  return executeNote({ ...input, actionType: input.actionType });
}
