import "server-only";

import { env } from "@/lib/env";
import { sealSecret, unsealSecret } from "@/lib/crypto/sealed-secret";
import { createAdminClient } from "@/lib/supabase/admin";

const MICROSOFT_CLIENT_ID = "084a3e9f-a9f4-43f7-89f9-d229cf97853e";
const MICROSOFT_TENANT = "consumers";
const MICROSOFT_SCOPES = "User.Read Calendars.ReadWrite offline_access";
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

type CalendarPayload = {
  subject: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  locationName: string | null;
  isAllDay: boolean;
};

type CalendarDeletePayload = {
  subject: string;
  startsAt: string;
  endsAt: string;
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

async function accessTokenForConnection(connectionId: string, userId: string) {
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
  if (!response.ok) throw new MicrosoftGraphError("graph_request_failed");
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
    if (operation.operation_type !== "create") throw new MicrosoftGraphError("operation_not_supported");
    const value = operation.payload as CalendarPayload;
    if (!value.subject || !value.startsAt || !value.endsAt) throw new MicrosoftGraphError("operation_payload_invalid");
    const accessToken = await accessTokenForConnection(operation.connection_id, userId);
    const created = await graph(accessToken, "/me/events", {
      method: "POST",
      body: JSON.stringify({
        subject: value.subject,
        ...(value.description ? { body: { contentType: "text", content: value.description } } : {}),
        start: { dateTime: value.startsAt, timeZone: "UTC" },
        end: { dateTime: value.endsAt, timeZone: "UTC" },
        isAllDay: value.isAllDay,
        ...(value.locationName ? { location: { displayName: value.locationName } } : {}),
      }),
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
