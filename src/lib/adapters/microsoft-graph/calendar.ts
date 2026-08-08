import "server-only";

import { env } from "@/lib/env";
import { sealSecret, unsealSecret } from "@/lib/crypto/sealed-secret";
import { createAdminClient } from "@/lib/supabase/admin";
import { calendarEventForGraph, type GraphCalendarCreatePayload } from "./event-payload";

const MICROSOFT_CLIENT_ID = "084a3e9f-a9f4-43f7-89f9-d229cf97853e";
const MICROSOFT_TENANT = "consumers";
const MICROSOFT_SCOPES = "User.Read Calendars.ReadWrite Tasks.ReadWrite offline_access";
const loginBaseUrl = `https://login.microsoftonline.com/${MICROSOFT_TENANT}/oauth2/v2.0`;
const graphBaseUrl = "https://graph.microsoft.com/v1.0";

type GraphEvent = {
  id: string;
  iCalUId?: string;
  subject?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
  isAllDay?: boolean;
  location?: { displayName?: string | null };
  changeKey?: string | null;
};

type GraphTodoList = { id?: string; displayName?: string; wellknownListName?: string | null };
type GraphTodoTask = {
  id?: string;
  title?: string;
  body?: { content?: string | null };
  status?: "notStarted" | "inProgress" | "completed" | "waitingOnOthers" | "deferred";
  importance?: "low" | "normal" | "high" | null;
  dueDateTime?: { dateTime?: string } | null;
  completedDateTime?: { dateTime?: string } | null;
  lastModifiedDateTime?: string | null;
};

type CreateTodoTaskInput = {
  todoListId: string;
  title: string;
  bodyText: string | null;
  importance: "low" | "normal" | "high";
  dueAt: string | null;
};

type CalendarPayload = {
  subject: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  locationName: string | null;
  isAllDay: boolean;
  timeZone?: string;
};

type CalendarDeletePayload = {
  subject: string;
  startsAt: string;
  endsAt: string;
};
type CalendarUpdatePayload = CalendarPayload & {
  previous: CalendarDeletePayload;
};

export class MicrosoftGraphError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

function tokenKey() {
  if (!env.supabaseSecretKey) throw new MicrosoftGraphError("server_configuration_missing");
  return `life-of-hang/microsoft-calendar-token/v1:${env.supabaseSecretKey}`;
}

export function encryptMicrosoftRefreshToken(value: string) {
  return sealSecret(value, tokenKey());
}

export function decryptMicrosoftRefreshToken(value: string) {
  try {
    return unsealSecret(value, tokenKey());
  } catch {
    throw new MicrosoftGraphError("credential_unreadable");
  }
}

async function microsoftForm(path: "devicecode" | "token", values: Record<string, string>) {
  let response: Response;
  try {
    response = await fetch(`${loginBaseUrl}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(values),
      cache: "no-store",
    });
  } catch {
    throw new MicrosoftGraphError("microsoft_unavailable");
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code = payload && typeof payload === "object" && "error" in payload ? String(payload.error) : "microsoft_token_failed";
    throw new MicrosoftGraphError(code);
  }
  return payload as Record<string, unknown>;
}

export async function startMicrosoftDeviceAuthorization() {
  const payload = await microsoftForm("devicecode", {
    client_id: MICROSOFT_CLIENT_ID,
    scope: MICROSOFT_SCOPES,
  });
  const deviceCode = typeof payload.device_code === "string" ? payload.device_code : "";
  const userCode = typeof payload.user_code === "string" ? payload.user_code : "";
  const verificationUri = typeof payload.verification_uri === "string" ? payload.verification_uri : "";
  const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : 0;
  if (!deviceCode || !userCode || !verificationUri || !expiresIn) throw new MicrosoftGraphError("device_code_invalid");
  return { deviceCode, userCode, verificationUri, expiresIn };
}

export async function exchangeMicrosoftDeviceCode(deviceCode: string) {
  return microsoftForm("token", {
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    client_id: MICROSOFT_CLIENT_ID,
    device_code: deviceCode,
  });
}

export async function accessTokenForConnection(connectionId: string, userId: string) {
  const admin = createAdminClient();
  const { data: credential, error } = await admin
    .from("calendar_connections")
    .select("oauth_refresh_token_ciphertext")
    .eq("id", connectionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !credential?.oauth_refresh_token_ciphertext) throw new MicrosoftGraphError("calendar_not_connected");

  const refreshed = await microsoftForm("token", {
    grant_type: "refresh_token",
    client_id: MICROSOFT_CLIENT_ID,
    refresh_token: decryptMicrosoftRefreshToken(credential.oauth_refresh_token_ciphertext),
    scope: MICROSOFT_SCOPES,
  });
  const accessToken = typeof refreshed.access_token === "string" ? refreshed.access_token : "";
  const refreshToken = typeof refreshed.refresh_token === "string" ? refreshed.refresh_token : "";
  const expiresIn = typeof refreshed.expires_in === "number" ? refreshed.expires_in : 3600;
  if (!accessToken || !refreshToken) throw new MicrosoftGraphError("token_response_invalid");
  const { error: updateError } = await admin.from("calendar_connections").update({
    oauth_refresh_token_ciphertext: encryptMicrosoftRefreshToken(refreshToken),
    oauth_token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
  }).eq("id", connectionId).eq("user_id", userId);
  if (updateError) throw new MicrosoftGraphError("credential_update_failed");
  return accessToken;
}

async function graph(accessToken: string, path: string, init?: RequestInit) {
  let response: Response;
  try {
    response = await fetch(`${graphBaseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'outlook.timezone="UTC"',
        "Content-Type": "application/json",
        ...init?.headers,
      },
      cache: "no-store",
    });
  } catch {
    throw new MicrosoftGraphError("graph_unavailable");
  }
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const graphCode = payload && typeof payload === "object" && "error" in payload
      && payload.error && typeof payload.error === "object" && "code" in payload.error
      ? String(payload.error.code) : "";
    if (graphCode === "ErrorAccessDenied" || graphCode === "Authorization_RequestDenied") throw new MicrosoftGraphError("graph_access_denied");
    if (graphCode === "ErrorInvalidRequest" || graphCode === "ErrorInvalidTimeZone") throw new MicrosoftGraphError("graph_invalid_request");
    throw new MicrosoftGraphError("graph_request_failed");
  }
  return payload;
}

function toIso(value: string | undefined) {
  if (!value) throw new MicrosoftGraphError("graph_event_invalid");
  return /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`;
}

function graphEventRecord(event: GraphEvent, userId: string) {
  return {
    user_id: userId,
    provider_event_id: event.id,
    calendar_id: event.iCalUId ?? null,
    subject: event.subject ?? "",
    starts_at: toIso(event.start?.dateTime),
    ends_at: toIso(event.end?.dateTime),
    is_all_day: Boolean(event.isAllDay),
    location_name: event.location?.displayName ?? null,
    provider_change_key: event.changeKey ?? null,
    last_synced_at: new Date().toISOString(),
    archived_at: null,
  };
}

async function markConnectionError(connectionId: string, code: string) {
  const admin = createAdminClient();
  await admin.from("calendar_connections").update({ last_error_code: code }).eq("id", connectionId);
}

async function audit(userId: string, action: string, entityId: string, afterData: Record<string, unknown>) {
  const admin = createAdminClient();
  await admin.from("audit_logs").insert({ user_id: userId, action, entity_type: "calendar_operation", entity_id: entityId, after_data: afterData, actor_type: "user" });
}

export async function syncMicrosoftCalendar(connectionId: string, userId: string) {
  try {
    const accessToken = await accessTokenForConnection(connectionId, userId);
    const start = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const end = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    const query = new URLSearchParams({ startDateTime: start, endDateTime: end, "$top": "500", "$select": "id,iCalUId,subject,start,end,isAllDay,location,changeKey" });
    const payload = await graph(accessToken, `/me/calendarView?${query.toString()}`) as { value?: GraphEvent[] };
    const records = (payload.value ?? []).map((event) => graphEventRecord(event, userId));
    const admin = createAdminClient();
    if (records.length) {
      const { error } = await admin.from("calendar_events").upsert(records, { onConflict: "user_id,provider_event_id" });
      if (error) throw new MicrosoftGraphError("calendar_cache_failed");
    }
    await admin.from("calendar_connections").update({ last_seen_at: new Date().toISOString(), last_sync_at: new Date().toISOString(), last_error_code: null }).eq("id", connectionId).eq("user_id", userId);
    return records.length;
  } catch (error) {
    const code = error instanceof MicrosoftGraphError ? error.code : "calendar_sync_failed";
    await markConnectionError(connectionId, code);
    throw new MicrosoftGraphError(code);
  }
}

function optionalIso(value: string | undefined | null) {
  return value ? toIso(value) : null;
}

export async function syncMicrosoftTodo(connectionId: string, userId: string) {
  try {
    const accessToken = await accessTokenForConnection(connectionId, userId);
    const listsPayload = await graph(accessToken, "/me/todo/lists?$top=100") as { value?: GraphTodoList[] };
    const lists = (listsPayload.value ?? []).flatMap((list) => list.id ? [{
      user_id: userId,
      connection_id: connectionId,
      provider_list_id: list.id,
      display_name: list.displayName || "无标题列表",
      is_default: list.wellknownListName === "defaultList",
      last_synced_at: new Date().toISOString(),
      archived_at: null,
    }] : []);
    const admin = createAdminClient();
    if (lists.length) {
      const { error } = await admin.from("microsoft_todo_lists").upsert(lists, { onConflict: "user_id,provider_list_id" });
      if (error) throw new MicrosoftGraphError("todo_cache_failed");
    }
    const { data: cachedLists, error: cachedListsError } = await admin.from("microsoft_todo_lists")
      .select("id,provider_list_id").eq("user_id", userId).eq("connection_id", connectionId).is("archived_at", null);
    if (cachedListsError) throw new MicrosoftGraphError("todo_cache_failed");
    const localListIds = new Map((cachedLists ?? []).map((list) => [list.provider_list_id, list.id]));
    let taskCount = 0;
    for (const list of lists) {
      const localListId = localListIds.get(list.provider_list_id);
      if (!localListId) continue;
      const taskPayload = await graph(accessToken, `/me/todo/lists/${encodeURIComponent(list.provider_list_id)}/tasks?$top=100`) as { value?: GraphTodoTask[] };
      const tasks = (taskPayload.value ?? []).flatMap((task) => task.id ? [{
        user_id: userId,
        todo_list_id: localListId,
        provider_task_id: task.id,
        title: task.title || "无标题任务",
        body_text: task.body?.content || null,
        status: task.status || "notStarted",
        importance: task.importance || null,
        due_at: optionalIso(task.dueDateTime?.dateTime),
        completed_at: optionalIso(task.completedDateTime?.dateTime),
        provider_last_modified_at: optionalIso(task.lastModifiedDateTime),
        last_synced_at: new Date().toISOString(),
        archived_at: null,
      }] : []);
      const { error: archiveError } = await admin.from("microsoft_todo_tasks").update({ archived_at: new Date().toISOString() }).eq("user_id", userId).eq("todo_list_id", localListId).is("archived_at", null);
      if (archiveError) throw new MicrosoftGraphError("todo_cache_failed");
      if (tasks.length) {
        const { error: tasksError } = await admin.from("microsoft_todo_tasks").upsert(tasks, { onConflict: "user_id,provider_task_id" });
        if (tasksError) throw new MicrosoftGraphError("todo_cache_failed");
      }
      taskCount += tasks.length;
    }
    await admin.from("calendar_connections").update({ last_seen_at: new Date().toISOString(), last_error_code: null }).eq("id", connectionId).eq("user_id", userId);
    return { listCount: lists.length, taskCount };
  } catch (error) {
    const code = error instanceof MicrosoftGraphError ? error.code : "todo_sync_failed";
    await markConnectionError(connectionId, code);
    throw new MicrosoftGraphError(code);
  }
}

export async function createMicrosoftTodoTask(connectionId: string, userId: string, input: CreateTodoTaskInput) {
  const admin = createAdminClient();
  const { data: list, error: listError } = await admin.from("microsoft_todo_lists")
    .select("id,provider_list_id")
    .eq("id", input.todoListId).eq("user_id", userId).eq("connection_id", connectionId).is("archived_at", null).maybeSingle();
  if (listError || !list) throw new MicrosoftGraphError("todo_list_not_found");

  try {
    const accessToken = await accessTokenForConnection(connectionId, userId);
    const payload = await graph(accessToken, `/me/todo/lists/${encodeURIComponent(list.provider_list_id)}/tasks`, {
      method: "POST",
      body: JSON.stringify({
        title: input.title,
        body: input.bodyText ? { content: input.bodyText, contentType: "text" } : undefined,
        importance: input.importance,
        dueDateTime: input.dueAt ? { dateTime: input.dueAt.replace("Z", ""), timeZone: "UTC" } : undefined,
      }),
    }) as GraphTodoTask;
    if (!payload.id) throw new MicrosoftGraphError("graph_task_invalid");
    const now = new Date().toISOString();
    const { data: record, error: cacheError } = await admin.from("microsoft_todo_tasks").upsert({
      user_id: userId,
      todo_list_id: list.id,
      provider_task_id: payload.id,
      title: payload.title || input.title,
      body_text: payload.body?.content || input.bodyText,
      status: payload.status || "notStarted",
      importance: payload.importance || input.importance,
      due_at: optionalIso(payload.dueDateTime?.dateTime) || input.dueAt,
      completed_at: optionalIso(payload.completedDateTime?.dateTime),
      provider_last_modified_at: optionalIso(payload.lastModifiedDateTime),
      last_synced_at: now,
      archived_at: null,
    }, { onConflict: "user_id,provider_task_id" }).select("id").single();
    if (cacheError || !record) throw new MicrosoftGraphError("todo_cache_failed");
    await admin.from("calendar_connections").update({ last_seen_at: now, last_error_code: null }).eq("id", connectionId).eq("user_id", userId);
    return record.id;
  } catch (error) {
    const code = error instanceof MicrosoftGraphError ? error.code : "todo_create_failed";
    await markConnectionError(connectionId, code);
    throw new MicrosoftGraphError(code);
  }
}

export async function completeMicrosoftTodoTask(connectionId: string, userId: string, localTaskId: string) {
  const admin = createAdminClient();
  const { data: task, error } = await admin.from("microsoft_todo_tasks")
    .select("id,provider_task_id,todo_list_id,microsoft_todo_lists!inner(provider_list_id)")
    .eq("id", localTaskId).eq("user_id", userId).is("archived_at", null).maybeSingle();
  if (error || !task) throw new MicrosoftGraphError("todo_task_not_found");
  const list = task.microsoft_todo_lists as unknown as { provider_list_id: string };
  const accessToken = await accessTokenForConnection(connectionId, userId);
  const completedAt = new Date().toISOString();
  await graph(accessToken, `/me/todo/lists/${encodeURIComponent(list.provider_list_id)}/tasks/${encodeURIComponent(task.provider_task_id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "completed", completedDateTime: { dateTime: completedAt.replace("Z", ""), timeZone: "UTC" } }),
  });
  const { error: updateError } = await admin.from("microsoft_todo_tasks").update({ status: "completed", completed_at: completedAt, last_synced_at: completedAt }).eq("id", task.id).eq("user_id", userId);
  if (updateError) throw new MicrosoftGraphError("todo_cache_failed");
}

export async function reopenMicrosoftTodoTask(connectionId: string, userId: string, localTaskId: string) {
  const admin = createAdminClient();
  const { data: task, error } = await admin.from("microsoft_todo_tasks")
    .select("id,provider_task_id,todo_list_id,microsoft_todo_lists!inner(provider_list_id)")
    .eq("id", localTaskId).eq("user_id", userId).is("archived_at", null).maybeSingle();
  if (error || !task) throw new MicrosoftGraphError("todo_task_not_found");

  const list = task.microsoft_todo_lists as unknown as { provider_list_id: string };
  const accessToken = await accessTokenForConnection(connectionId, userId);
  const now = new Date().toISOString();
  await graph(accessToken, `/me/todo/lists/${encodeURIComponent(list.provider_list_id)}/tasks/${encodeURIComponent(task.provider_task_id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "notStarted" }),
  });
  const { error: updateError } = await admin.from("microsoft_todo_tasks")
    .update({ status: "notStarted", completed_at: null, last_synced_at: now })
    .eq("id", task.id).eq("user_id", userId);
  if (updateError) throw new MicrosoftGraphError("todo_cache_failed");
}

export async function executeCalendarOperation(operationId: string, userId: string) {
  const admin = createAdminClient();
  const { data: operation, error } = await admin.from("calendar_operations")
    .select("id,connection_id,operation_type,provider_event_id,payload,status")
    .eq("id", operationId).eq("user_id", userId).eq("status", "queued").maybeSingle();
  if (error || !operation) throw new MicrosoftGraphError("operation_unavailable");
  await admin.from("calendar_operations").update({ status: "processing", claimed_at: new Date().toISOString() }).eq("id", operation.id);
  try {
    if (operation.operation_type === "sync") {
      const count = await syncMicrosoftCalendar(operation.connection_id, userId);
      await admin.from("calendar_operations").update({ status: "succeeded", completed_at: new Date().toISOString(), result: { synced_event_count: count } }).eq("id", operation.id);
      await audit(userId, "execute", operation.id, { operation_type: "sync", result: "succeeded", synced_event_count: count });
      return;
    }
    if (operation.operation_type === "delete") {
      const value = operation.payload as CalendarDeletePayload;
      if (!operation.provider_event_id || !value.subject || !value.startsAt || !value.endsAt) throw new MicrosoftGraphError("operation_payload_invalid");
      const accessToken = await accessTokenForConnection(operation.connection_id, userId);
      await graph(accessToken, `/me/events/${encodeURIComponent(operation.provider_event_id)}`, { method: "DELETE" });
      const { error: archiveError } = await admin.from("calendar_events")
        .update({ archived_at: new Date().toISOString() })
        .eq("user_id", userId).eq("provider_event_id", operation.provider_event_id).is("archived_at", null);
      if (archiveError) throw new MicrosoftGraphError("calendar_cache_failed");
      await admin.from("calendar_operations").update({ status: "succeeded", completed_at: new Date().toISOString(), result: { provider_event_id: operation.provider_event_id } }).eq("id", operation.id);
      await audit(userId, "execute", operation.id, { operation_type: "delete", result: "succeeded", provider_event_id: operation.provider_event_id });
      return;
    }
    if (operation.operation_type === "update") {
      const value = operation.payload as CalendarUpdatePayload;
      if (!operation.provider_event_id || !value.subject || !value.startsAt || !value.endsAt || !value.previous) throw new MicrosoftGraphError("operation_payload_invalid");
      const accessToken = await accessTokenForConnection(operation.connection_id, userId);
      const updated = await graph(accessToken, `/me/events/${encodeURIComponent(operation.provider_event_id)}`, {
        method: "PATCH",
        body: JSON.stringify(calendarEventForGraph(value as GraphCalendarCreatePayload)),
      }) as GraphEvent;
      const record = graphEventRecord(updated, userId);
      const { error: cacheError } = await admin.from("calendar_events").upsert(record, { onConflict: "user_id,provider_event_id" });
      if (cacheError) throw new MicrosoftGraphError("calendar_cache_failed");
      await admin.from("calendar_operations").update({ status: "succeeded", completed_at: new Date().toISOString(), result: { provider_event_id: record.provider_event_id } }).eq("id", operation.id);
      await audit(userId, "execute", operation.id, { operation_type: "update", result: "succeeded", provider_event_id: record.provider_event_id });
      return;
    }
    if (operation.operation_type !== "create") throw new MicrosoftGraphError("operation_not_supported");
    const value = operation.payload as CalendarPayload;
    if (!value.subject || !value.startsAt || !value.endsAt) throw new MicrosoftGraphError("operation_payload_invalid");
    const accessToken = await accessTokenForConnection(operation.connection_id, userId);
    const created = await graph(accessToken, "/me/events", {
      method: "POST",
      body: JSON.stringify(calendarEventForGraph(value as GraphCalendarCreatePayload)),
    }) as GraphEvent;
    const record = graphEventRecord(created, userId);
    const { error: cacheError } = await admin.from("calendar_events").upsert(record, { onConflict: "user_id,provider_event_id" });
    if (cacheError) throw new MicrosoftGraphError("calendar_cache_failed");
    await admin.from("calendar_operations").update({ status: "succeeded", completed_at: new Date().toISOString(), provider_event_id: record.provider_event_id, result: { provider_event_id: record.provider_event_id } }).eq("id", operation.id);
    await audit(userId, "execute", operation.id, { operation_type: "create", result: "succeeded", provider_event_id: record.provider_event_id });
  } catch (error) {
    const code = error instanceof MicrosoftGraphError ? error.code : "calendar_operation_failed";
    await admin.from("calendar_operations").update({ status: "failed", completed_at: new Date().toISOString(), error_code: code }).eq("id", operation.id);
    await audit(userId, "execute", operation.id, { operation_type: operation.operation_type, result: "failed", error_code: code });
    throw new MicrosoftGraphError(code);
  }
}

export const microsoftCalendarConfiguration = { clientId: MICROSOFT_CLIENT_ID, scopes: MICROSOFT_SCOPES };
