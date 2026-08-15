import "server-only";

import { env } from "@/lib/env";
import { sealSecret, unsealSecret } from "@/lib/crypto/sealed-secret";
import { createAdminClient } from "@/lib/supabase/admin";
import { calendarEventForGraph, type GraphCalendarCreatePayload } from "./event-payload";
import { managedCalendarCategories, type OutlookCategoryColor } from "@/features/calendar/classification/taxonomy";
import { wallTimeToInstant } from "@/features/calendar/timezone";
import { calendarSyncWindow, deltaLinkCarriesSelect, shouldUseCalendarDelta } from "@/features/calendar/sync-policy";

const MICROSOFT_CLIENT_ID = "084a3e9f-a9f4-43f7-89f9-d229cf97853e";
const MICROSOFT_TENANT = "consumers";
const MICROSOFT_LEGACY_SCOPES = "User.Read Calendars.ReadWrite Tasks.ReadWrite offline_access";
const MICROSOFT_SCOPES = `${MICROSOFT_LEGACY_SCOPES} MailboxSettings.ReadWrite`;
export const MICROSOFT_SCOPE_VERSION = 2;
const loginBaseUrl = `https://login.microsoftonline.com/${MICROSOFT_TENANT}/oauth2/v2.0`;
const graphBaseUrl = "https://graph.microsoft.com/v1.0";

export function microsoftScopeVersionForGrantedScopes(scopes: string[]) {
  return scopes.some((scope) => scope.toLocaleLowerCase("en-US") === "mailboxsettings.readwrite") ? MICROSOFT_SCOPE_VERSION : 1;
}

export function requiresCategoryReauthorization(scopeVersion: number | null | undefined) {
  return (scopeVersion ?? 1) < MICROSOFT_SCOPE_VERSION;
}

export type GraphDateTimeTimeZone = { dateTime?: string; timeZone?: string };
type GraphBody = { content?: string | null; contentType?: "text" | "html" | string | null };

type GraphEvent = {
  id: string;
  iCalUId?: string;
  subject?: string;
  body?: GraphBody;
  start?: GraphDateTimeTimeZone;
  end?: GraphDateTimeTimeZone;
  isAllDay?: boolean;
  location?: { displayName?: string | null };
  changeKey?: string | null;
  categories?: string[];
  importance?: "low" | "normal" | "high";
  showAs?: "free" | "tentative" | "busy" | "oof" | "workingElsewhere" | "unknown";
  "@removed"?: { reason?: string };
};

type GraphOutlookCategory = { id?: string; displayName?: string; color?: OutlookCategoryColor };

type CalendarPayload = {
  subject: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  locationName: string | null;
  isAllDay: boolean;
  timeZone?: string;
  categories?: string[];
  importance?: "low" | "normal" | "high";
  showAs?: "free" | "tentative" | "busy" | "oof" | "workingElsewhere" | "unknown";
};

type CalendarDeletePayload = {
  subject: string;
  startsAt: string;
  endsAt: string;
};
type CalendarUpdatePayload = CalendarPayload & {
  previous: CalendarDeletePayload;
};

type GraphTodoList = { id?: string; displayName?: string; wellknownListName?: string | null };
type GraphTodoTask = {
  id?: string; title?: string; body?: GraphBody;
  status?: "notStarted" | "inProgress" | "completed" | "waitingOnOthers" | "deferred";
  importance?: "low" | "normal" | "high" | null;
  dueDateTime?: { dateTime?: string } | null; completedDateTime?: { dateTime?: string } | null;
  lastModifiedDateTime?: string | null;
};
type CreateTodoTaskInput = { todoListId: string; title: string; bodyText: string | null; importance: "low" | "normal" | "high"; dueAt: string | null };
export type UpdateTodoTaskInput = { title?: string; bodyText?: string | null; importance?: "low" | "normal" | "high"; dueAt?: string | null };

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
    .select("oauth_refresh_token_ciphertext,oauth_scope_version")
    .eq("id", connectionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !credential?.oauth_refresh_token_ciphertext) throw new MicrosoftGraphError("calendar_not_connected");

  const refreshed = await microsoftForm("token", {
    grant_type: "refresh_token",
    client_id: MICROSOFT_CLIENT_ID,
    refresh_token: decryptMicrosoftRefreshToken(credential.oauth_refresh_token_ciphertext),
    scope: credential.oauth_scope_version >= MICROSOFT_SCOPE_VERSION ? MICROSOFT_SCOPES : MICROSOFT_LEGACY_SCOPES,
  });
  const accessToken = typeof refreshed.access_token === "string" ? refreshed.access_token : "";
  const refreshToken = typeof refreshed.refresh_token === "string" ? refreshed.refresh_token : "";
  const expiresIn = typeof refreshed.expires_in === "number" ? refreshed.expires_in : 3600;
  const grantedScopes = typeof refreshed.scope === "string" ? refreshed.scope.split(/\s+/).filter(Boolean) : [];
  if (!accessToken || !refreshToken) throw new MicrosoftGraphError("token_response_invalid");
  const { error: updateError } = await admin.from("calendar_connections").update({
    oauth_refresh_token_ciphertext: encryptMicrosoftRefreshToken(refreshToken),
    oauth_token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    granted_scopes: grantedScopes.length ? grantedScopes : undefined,
    oauth_scope_version: grantedScopes.length ? microsoftScopeVersionForGrantedScopes(grantedScopes) : undefined,
  }).eq("id", connectionId).eq("user_id", userId);
  if (updateError) throw new MicrosoftGraphError("credential_update_failed");
  return accessToken;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function graph(accessToken: string, path: string, init?: RequestInit) {
  // 只对幂等读取（GET）做瞬时错误/限流重试；写入（POST/PATCH/DELETE）失败直接抛出，
  // 避免请求被重复应用。全量同步会分页拉取 2 年窗口，撞上 429/5xx 的概率不低。
  const isRead = !init?.method || init.method === "GET";
  const maxAttempts = isRead ? 4 : 1;
  for (let attempt = 0; ; attempt += 1) {
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
      if (isRead && attempt + 1 < maxAttempts) {
        await delay(300 * 2 ** attempt);
        continue;
      }
      throw new MicrosoftGraphError("graph_unavailable");
    }
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const graphCode = payload && typeof payload === "object" && "error" in payload
        && payload.error && typeof payload.error === "object" && "code" in payload.error
        ? String(payload.error.code) : "";
      if (graphCode === "ErrorAccessDenied" || graphCode === "Authorization_RequestDenied") throw new MicrosoftGraphError("graph_access_denied");
      if (graphCode === "ErrorInvalidRequest" || graphCode === "ErrorInvalidTimeZone") throw new MicrosoftGraphError("graph_invalid_request");
      if (isRead && attempt + 1 < maxAttempts && (response.status === 429 || response.status >= 500)) {
        const retryAfter = Number(response.headers.get("Retry-After") ?? 0);
        await delay(Math.min(retryAfter > 0 ? retryAfter * 1000 : 300 * 2 ** attempt, 5000));
        continue;
      }
      throw new MicrosoftGraphError("graph_request_failed");
    }
    return payload;
  }
}

const graphResponseTimeZones: Record<string, string> = {
  UTC: "UTC",
  "China Standard Time": "Asia/Shanghai",
  "Singapore Standard Time": "Asia/Singapore",
  "Tokyo Standard Time": "Asia/Tokyo",
  "Eastern Standard Time": "America/New_York",
  "Pacific Standard Time": "America/Los_Angeles",
  "GMT Standard Time": "Europe/London",
  "Asia/Shanghai": "Asia/Shanghai",
  "Asia/Singapore": "Asia/Singapore",
  "Asia/Tokyo": "Asia/Tokyo",
  "America/New_York": "America/New_York",
  "America/Los_Angeles": "America/Los_Angeles",
  "Europe/London": "Europe/London",
};

/**
 * The only Graph DateTimeTimeZone -> app-instant boundary.  A Graph
 * `dateTime` without an offset is wall time in its accompanying `timeZone`,
 * not UTC.  Treating it as UTC was the source of the historic +8h cache bug.
 */
export function graphDateTimeTimeZoneToInstant(value: GraphDateTimeTimeZone | undefined) {
  const dateTime = value?.dateTime;
  if (!dateTime) throw new MicrosoftGraphError("graph_event_invalid");
  if (/(?:Z|[+-]\d\d:\d\d)$/i.test(dateTime)) {
    const instant = new Date(dateTime);
    if (Number.isNaN(instant.getTime())) throw new MicrosoftGraphError("graph_event_invalid");
    return instant.toISOString();
  }
  const timezone = value.timeZone ? graphResponseTimeZones[value.timeZone] : undefined;
  if (!timezone) throw new MicrosoftGraphError("graph_event_timezone_unsupported");
  try {
    return wallTimeToInstant(dateTime, timezone);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("calendar_wall_time_")) throw new MicrosoftGraphError(error.message);
    throw new MicrosoftGraphError("graph_event_invalid");
  }
}

/**
 * Microsoft Graph all-day events are DATE semantics. Their `dateTime` field
 * names the calendar day and must not first be converted to an instant: a UTC
 * midnight projected into a west-of-UTC profile would otherwise become the
 * preceding day. Keep that date component and anchor it exactly once in the
 * owner's timezone for our UTC-instant cache representation.
 */
export function graphDateTimeTimeZoneToDate(value: GraphDateTimeTimeZone | undefined) {
  const dateTime = value?.dateTime;
  const match = dateTime?.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (!match || Number.isNaN(Date.parse(`${match[1]}T00:00:00Z`)))
    throw new MicrosoftGraphError("graph_event_invalid");
  return match[1];
}

/** Converts Outlook's HTML event body to compact, display-safe plain text. */
export function graphBodyText(body: GraphBody | undefined) {
  const content = body?.content;
  if (!content) return null;
  if (body.contentType?.toLowerCase() !== "html" && !/<\/?[a-z][^>]*>/i.test(content))
    return content.replace(/\u00a0/g, " ").trim() || null;
  return content
    .replace(/<\s*(br|\/p|\/div|\/li|\/tr|\/h[1-6])\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim() || null;
}

export function graphEventRecord(event: GraphEvent, userId: string, fallback?: { subject?: string | null; location_name?: string | null; body_text?: string | null; categories?: string[] | null; importance?: string; show_as?: string }, timezone = "Asia/Shanghai") {
  const startsAt = event.isAllDay
    ? wallTimeToInstant(`${graphDateTimeTimeZoneToDate(event.start)}T00:00`, timezone)
    : graphDateTimeTimeZoneToInstant(event.start);
  const endsAt = event.isAllDay
    ? wallTimeToInstant(`${graphDateTimeTimeZoneToDate(event.end)}T00:00`, timezone)
    : graphDateTimeTimeZoneToInstant(event.end);
  return {
    user_id: userId,
    provider_event_id: event.id,
    calendar_id: event.iCalUId ?? null,
    // Graph 同步/更新响应有时对未变更字段返回空值；全量重同步如果照单全收，
    // 会把 App 打好的分类、标题等缓存覆盖成空。只在 Graph 给出真实值时采用，
    // 空值回退到镜像既有值，避免「同步一次、分类全没」。
    subject: event.subject?.trim() ? event.subject : fallback?.subject ?? "",
    body_text: graphBodyText(event.body) ?? fallback?.body_text ?? null,
    starts_at: startsAt,
    ends_at: endsAt,
    is_all_day: Boolean(event.isAllDay),
    location_name: event.location?.displayName?.trim() ? event.location.displayName : fallback?.location_name ?? null,
    provider_change_key: event.changeKey ?? null,
    categories: event.categories?.length ? event.categories : fallback?.categories ?? [],
    importance: event.importance ?? fallback?.importance ?? "normal",
    show_as: event.showAs ?? fallback?.show_as ?? "unknown",
    last_synced_at: new Date().toISOString(),
    archived_at: null,
  };
}

export async function markConnectionError(connectionId: string, code: string) {
  const admin = createAdminClient();
  await admin.from("calendar_connections").update({ last_error_code: code }).eq("id", connectionId);
}

async function audit(userId: string, action: string, entityId: string, afterData: Record<string, unknown>) {
  const admin = createAdminClient();
  await admin.from("audit_logs").insert({ user_id: userId, action, entity_type: "calendar_operation", entity_id: entityId, after_data: afterData, actor_type: "user" });
}

type ExistingMirrorEvent = { provider_event_id: string; subject: string | null; location_name: string | null; body_text: string | null; categories: string[] | null };

/**
 * 读取同步窗口内镜像已存在的日程，供 graphEventRecord 在 Graph 返回空值
 * （subject/location/categories/body 为空）时回退保留。镜像里 App 打好的分类、
 * 标题必须跨全量重同步存活，否则「同步一次、分类全没」。
 */
async function existingCalendarEvents(admin: ReturnType<typeof createAdminClient>, userId: string, start: string, end: string) {
  const rows: ExistingMirrorEvent[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await admin.from("calendar_events")
      .select("provider_event_id,subject,location_name,body_text,categories")
      .eq("user_id", userId)
      .lt("starts_at", end)
      .gt("ends_at", start)
      .is("archived_at", null)
      .order("provider_event_id")
      .range(offset, offset + 999);
    if (error) throw new MicrosoftGraphError("calendar_cache_failed");
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < 1000) break;
    offset += 1000;
  }
  return new Map(rows.map((row) => [row.provider_event_id, row]));
}

export async function syncMicrosoftCalendar(
  connectionId: string,
  userId: string,
  options: { forceFull?: boolean } = {},
) {
  try {
    const accessToken = await accessTokenForConnection(connectionId, userId);
    const admin = createAdminClient();
    const [{ data: connection, error: connectionError }, { data: profile }] = await Promise.all([
      admin.from("calendar_connections").select("calendar_delta_link,calendar_sync_window_start,calendar_sync_window_end").eq("id", connectionId).eq("user_id", userId).maybeSingle(),
      admin.from("profiles").select("timezone").eq("user_id", userId).maybeSingle(),
    ]);
    if (connectionError || !connection) throw new MicrosoftGraphError("calendar_not_connected");
    const now = Date.now(); const defaultWindow = calendarSyncWindow(now);
    // Delta only yields changes since the previous cursor. A user-triggered
    // reconciliation must also repair legacy cache rows that were parsed
    // incorrectly before the DateTimeTimeZone fix, even if Outlook has not
    // changed them since, so it intentionally starts a fresh full window.
    // shouldUseCalendarDelta additionally requires the stored window to cover
    // the 2-year history horizon, so the first sync after this change runs a
    // full read that backfills historical events and rebuilds the delta cursor.
    // deltaLink 会编码创建时的查询参数：若它不含 $select（如历史上不带 $select
    // 创建的光标），增量响应会缺 subject/categories 等字段。遇到这种光标直接
    // 走全量重建，让新光标带上 $select，避免增量把新/改日程写成空值。
    const canUseDelta = shouldUseCalendarDelta(connection, now, defaultWindow.start, Boolean(options.forceFull)) && deltaLinkCarriesSelect(connection.calendar_delta_link);
    const start = canUseDelta ? connection.calendar_sync_window_start! : defaultWindow.start;
    const end = canUseDelta ? connection.calendar_sync_window_end! : defaultWindow.end;
    // calendarView/delta 必须显式带 $select：不带时实际返回的是精简字段集
    // （id/start/end 等），subject/categories/body/location 都会缺失——文档声称
    // 「默认返回 GET /calendarView 的完整属性」，实测并不成立（曾因此出现过
    // 日历上日程标题全部为空）。$top 被 delta 忽略，页大小由
    // Prefer: odata.maxpagesize 控制（默认每页只有 10 条）。
    const query = new URLSearchParams({
      startDateTime: start,
      endDateTime: end,
      "$select": "id,iCalUId,subject,body,start,end,isAllDay,location,changeKey,categories,importance,showAs",
    });
    const pageRequest: RequestInit = { headers: { Prefer: 'outlook.timezone="UTC", odata.maxpagesize=500' } };
    let pagePath = canUseDelta ? connection.calendar_delta_link!.replace(graphBaseUrl, "") : `/me/calendarView/delta?${query.toString()}`;
    const remoteEvents: GraphEvent[] = [];
    let deltaLink: string | null = null;
    // 兜底页数上限：曾有账号级服务端 bug 让 calendarView/delta 无限返回相同页面、
    // 永不给出 deltaLink。这里在超限时抛错而不是死循环（或把窗口内合法日程误归档）。
    let pageCount = 0;
    const MAX_PAGES = 200;
    while (pagePath) {
      pageCount += 1;
      if (pageCount > MAX_PAGES) throw new MicrosoftGraphError("graph_delta_loop");
      const payload = await graph(accessToken, pagePath, pageRequest) as { value?: GraphEvent[]; "@odata.nextLink"?: string; "@odata.deltaLink"?: string };
      remoteEvents.push(...(payload.value ?? []));
      deltaLink = payload["@odata.deltaLink"] ?? deltaLink;
      pagePath = payload["@odata.nextLink"]?.replace(graphBaseUrl, "") ?? "";
    }
    const deletedIds = remoteEvents.flatMap((event) => event["@removed"] && event.id ? [event.id] : []);
    const existing = await existingCalendarEvents(admin, userId, start, end);
    const records = remoteEvents.filter((event) => !event["@removed"]).map((event) => graphEventRecord(event, userId, existing.get(event.id), profile?.timezone || "Asia/Shanghai"));
    if (records.length) {
      // 2 年窗口可能返回数千条日程；分批 upsert 避免单次请求超出 Supabase 负载上限。
      const CHUNK = 400;
      for (let index = 0; index < records.length; index += CHUNK) {
        const { error } = await admin.from("calendar_events").upsert(records.slice(index, index + CHUNK), { onConflict: "user_id,provider_event_id" });
        if (error) throw new MicrosoftGraphError("calendar_cache_failed");
      }
    }
    if (deletedIds.length) {
      const { error } = await admin.from("calendar_events").update({ archived_at: new Date().toISOString() }).eq("user_id", userId).in("provider_event_id", deletedIds).is("archived_at", null);
      if (error) throw new MicrosoftGraphError("calendar_cache_failed");
    }
    if (!canUseDelta) {
      const remoteIds = new Set(records.map((record) => record.provider_event_id));
      const { data: cached, error } = await admin.from("calendar_events").select("provider_event_id").eq("user_id", userId).lt("starts_at", end).gt("ends_at", start).is("archived_at", null);
      if (error) throw new MicrosoftGraphError("calendar_cache_failed");
      const staleIds = (cached ?? []).flatMap((event) => remoteIds.has(event.provider_event_id) ? [] : [event.provider_event_id]);
      if (staleIds.length) {
        const { error: archiveError } = await admin.from("calendar_events").update({ archived_at: new Date().toISOString() }).eq("user_id", userId).in("provider_event_id", staleIds).is("archived_at", null);
        if (archiveError) throw new MicrosoftGraphError("calendar_cache_failed");
      }
    }
    await admin.from("calendar_connections").update({ last_seen_at: new Date().toISOString(), last_sync_at: new Date().toISOString(), last_error_code: null, calendar_delta_link: deltaLink, calendar_sync_window_start: start, calendar_sync_window_end: end }).eq("id", connectionId).eq("user_id", userId);
    return records.length;
  } catch (error) {
    const code = error instanceof MicrosoftGraphError ? error.code : "calendar_sync_failed";
    await markConnectionError(connectionId, code);
    throw new MicrosoftGraphError(code);
  }
}

async function categoryScopeVersion(connectionId: string, userId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("calendar_connections").select("oauth_scope_version").eq("id", connectionId).eq("user_id", userId).is("archived_at", null).maybeSingle();
  if (error || !data) throw new MicrosoftGraphError("calendar_not_connected");
  return data.oauth_scope_version as number;
}

export async function listOutlookMasterCategories(accessToken: string) {
  const payload = await graph(accessToken, "/me/outlook/masterCategories?$top=100") as { value?: GraphOutlookCategory[] };
  return (payload.value ?? []).flatMap((category) => category.id && category.displayName ? [{ id: category.id, displayName: category.displayName, color: category.color ?? "None" as OutlookCategoryColor }] : []);
}

export async function createOutlookMasterCategory(accessToken: string, input: { displayName: string; color: OutlookCategoryColor }) {
  const category = await graph(accessToken, "/me/outlook/masterCategories", { method: "POST", body: JSON.stringify(input) }) as GraphOutlookCategory;
  if (!category.id || !category.displayName) throw new MicrosoftGraphError("graph_category_invalid");
  return { id: category.id, displayName: category.displayName, color: category.color ?? input.color };
}

export async function updateOutlookMasterCategoryColor(accessToken: string, providerCategoryId: string, color: OutlookCategoryColor) {
  await graph(accessToken, `/me/outlook/masterCategories/${encodeURIComponent(providerCategoryId)}`, { method: "PATCH", body: JSON.stringify({ color }) });
}

async function cacheOutlookMasterCategories(userId: string, categories: Array<{ id: string; displayName: string; color: OutlookCategoryColor }>) {
  const admin = createAdminClient();
  const syncedAt = new Date().toISOString();
  const { data: preferences } = await admin.from("calendar_categories").select("managed_key,ai_description,keywords,ai_enabled").eq("user_id", userId).not("managed_key", "is", null);
  const preferencesByKey = new Map((preferences ?? []).map((preference) => [preference.managed_key, preference]));
  const { error: archiveError } = await admin.from("calendar_categories").update({ archived_at: syncedAt }).eq("user_id", userId).is("archived_at", null);
  if (archiveError) throw new MicrosoftGraphError("calendar_category_cache_failed");
  const records = categories.map((category) => {
    const managed = managedCalendarCategories.find((item) => item.displayName === category.displayName);
    const preference = managed ? preferencesByKey.get(managed.key) : null;
    return {
      user_id: userId,
      provider_category_id: category.id,
      display_name: category.displayName,
      color: category.color,
      managed_key: managed?.key ?? null,
      category_kind: managed?.kind ?? "external",
      ai_description: preference?.ai_description ?? managed?.aiDescription ?? null,
      keywords: preference?.keywords ?? (managed ? [...managed.keywords] : []),
      display_order: managed?.order ?? 1000,
      is_ai_managed: Boolean(managed),
      ai_enabled: preference?.ai_enabled ?? Boolean(managed),
      last_synced_at: syncedAt,
      archived_at: null,
    };
  });
  if (records.length) {
    const { error } = await admin.from("calendar_categories").upsert(records, { onConflict: "user_id,display_name" });
    if (error) throw new MicrosoftGraphError("calendar_category_cache_failed");
  }
  return records.length;
}

export async function syncOutlookMasterCategories(connectionId: string, userId: string) {
  if (requiresCategoryReauthorization(await categoryScopeVersion(connectionId, userId))) return { status: "reauthorization_required" as const, count: 0 };
  try {
    const accessToken = await accessTokenForConnection(connectionId, userId);
    if (requiresCategoryReauthorization(await categoryScopeVersion(connectionId, userId))) return { status: "reauthorization_required" as const, count: 0 };
    const categories = await listOutlookMasterCategories(accessToken);
    return { status: "ok" as const, count: await cacheOutlookMasterCategories(userId, categories) };
  } catch (error) {
    const code = error instanceof MicrosoftGraphError ? error.code : "calendar_category_sync_failed";
    await markConnectionError(connectionId, code);
    throw new MicrosoftGraphError(code);
  }
}

/** Explicitly invoked by the user. Existing Outlook categories are never renamed, recolored, or deleted. */
export async function ensureManagedOutlookCategories(connectionId: string, userId: string) {
  if (requiresCategoryReauthorization(await categoryScopeVersion(connectionId, userId))) throw new MicrosoftGraphError("calendar_category_reauthorization_required");
  const accessToken = await accessTokenForConnection(connectionId, userId);
  if (requiresCategoryReauthorization(await categoryScopeVersion(connectionId, userId))) throw new MicrosoftGraphError("calendar_category_reauthorization_required");
  const existing = await listOutlookMasterCategories(accessToken);
  const names = new Set(existing.map((category) => category.displayName));
  const created = [] as Array<{ id: string; displayName: string; color: OutlookCategoryColor }>;
  for (const category of managedCalendarCategories) {
    if (!names.has(category.displayName)) created.push(await createOutlookMasterCategory(accessToken, { displayName: category.displayName, color: category.color }));
  }
  const all = [...existing, ...created];
  await cacheOutlookMasterCategories(userId, all);
  return { createdCount: created.length, totalCount: all.length };
}

export function optionalIso(value: string | undefined | null) {
  if (!value) return null;
  // Microsoft To Do's separate date-time fields do not carry a companion
  // DateTimeTimeZone object. Preserve their existing explicit UTC contract;
  // Calendar events must use graphDateTimeTimeZoneToInstant above instead.
  const instant = new Date(/(?:Z|[+-]\d\d:\d\d)$/i.test(value) ? value : `${value}Z`);
  if (Number.isNaN(instant.getTime())) throw new MicrosoftGraphError("graph_event_invalid");
  return instant.toISOString();
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
  const updated = await graph(accessToken, `/me/todo/lists/${encodeURIComponent(list.provider_list_id)}/tasks/${encodeURIComponent(task.provider_task_id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "completed", completedDateTime: { dateTime: completedAt.replace("Z", ""), timeZone: "UTC" } }),
  }) as GraphTodoTask;
  const { error: updateError } = await admin.from("microsoft_todo_tasks").update({ status: "completed", completed_at: optionalIso(updated.completedDateTime?.dateTime) ?? completedAt, provider_last_modified_at: optionalIso(updated.lastModifiedDateTime) ?? completedAt, last_synced_at: completedAt }).eq("id", task.id).eq("user_id", userId);
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
  const updated = await graph(accessToken, `/me/todo/lists/${encodeURIComponent(list.provider_list_id)}/tasks/${encodeURIComponent(task.provider_task_id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "notStarted" }),
  }) as GraphTodoTask;
  const { error: updateError } = await admin.from("microsoft_todo_tasks")
    .update({ status: "notStarted", completed_at: null, provider_last_modified_at: optionalIso(updated.lastModifiedDateTime) ?? now, last_synced_at: now })
    .eq("id", task.id).eq("user_id", userId);
  if (updateError) throw new MicrosoftGraphError("todo_cache_failed");
}

async function ownedTodoTask(connectionId: string, userId: string, localTaskId: string) {
  const admin = createAdminClient();
  const { data: task, error } = await admin.from("microsoft_todo_tasks")
    .select("id,provider_task_id,todo_list_id,title,body_text,status,importance,due_at,completed_at,provider_last_modified_at,microsoft_todo_lists!inner(provider_list_id,connection_id)")
    .eq("id", localTaskId).eq("user_id", userId).is("archived_at", null).maybeSingle();
  if (error || !task) throw new MicrosoftGraphError("todo_task_not_found");
  const list = task.microsoft_todo_lists as unknown as { provider_list_id: string; connection_id: string };
  if (list.connection_id !== connectionId) throw new MicrosoftGraphError("todo_list_not_found");
  return { admin, task, providerListId: list.provider_list_id };
}

/** PATCHes Graph first, then synchronously writes the returned provider truth to the private cache. */
export async function updateMicrosoftTodoTask(connectionId: string, userId: string, localTaskId: string, patch: UpdateTodoTaskInput) {
  if (!Object.keys(patch).length) throw new MicrosoftGraphError("todo_update_empty");
  const { admin, task, providerListId } = await ownedTodoTask(connectionId, userId, localTaskId);
  const graphPatch: Record<string, unknown> = {};
  if (patch.title !== undefined) graphPatch.title = patch.title;
  if (patch.bodyText !== undefined) graphPatch.body = patch.bodyText === null ? null : { content: patch.bodyText, contentType: "text" };
  if (patch.importance !== undefined) graphPatch.importance = patch.importance;
  if (patch.dueAt !== undefined) graphPatch.dueDateTime = patch.dueAt === null ? null : { dateTime: patch.dueAt.replace("Z", ""), timeZone: "UTC" };
  try {
    const accessToken = await accessTokenForConnection(connectionId, userId);
    const updated = await graph(accessToken, `/me/todo/lists/${encodeURIComponent(providerListId)}/tasks/${encodeURIComponent(task.provider_task_id)}`, { method: "PATCH", body: JSON.stringify(graphPatch) }) as GraphTodoTask;
    const now = new Date().toISOString();
    const { error } = await admin.from("microsoft_todo_tasks").update({
      title: updated.title ?? (patch.title ?? task.title),
      body_text: updated.body?.content ?? (patch.bodyText === undefined ? task.body_text : patch.bodyText),
      importance: updated.importance ?? (patch.importance ?? task.importance ?? "normal"),
      due_at: optionalIso(updated.dueDateTime?.dateTime) ?? (patch.dueAt === undefined ? task.due_at : patch.dueAt),
      provider_last_modified_at: optionalIso(updated.lastModifiedDateTime) ?? now,
      last_synced_at: now,
    }).eq("id", task.id).eq("user_id", userId).is("archived_at", null);
    if (error) throw new MicrosoftGraphError("todo_cache_failed");
    return task.id;
  } catch (error) {
    const code = error instanceof MicrosoftGraphError ? error.code : "todo_update_failed";
    await markConnectionError(connectionId, code);
    throw new MicrosoftGraphError(code);
  }
}

/** DELETEs the authoritative provider record, then archives the local cache record for auditability. */
export async function deleteMicrosoftTodoTask(connectionId: string, userId: string, localTaskId: string) {
  const { admin, task, providerListId } = await ownedTodoTask(connectionId, userId, localTaskId);
  try {
    const accessToken = await accessTokenForConnection(connectionId, userId);
    await graph(accessToken, `/me/todo/lists/${encodeURIComponent(providerListId)}/tasks/${encodeURIComponent(task.provider_task_id)}`, { method: "DELETE" });
    const now = new Date().toISOString();
    const { error } = await admin.from("microsoft_todo_tasks").update({ archived_at: now, last_synced_at: now }).eq("id", task.id).eq("user_id", userId).is("archived_at", null);
    if (error) throw new MicrosoftGraphError("todo_cache_failed");
  } catch (error) {
    const code = error instanceof MicrosoftGraphError ? error.code : "todo_delete_failed";
    await markConnectionError(connectionId, code);
    throw new MicrosoftGraphError(code);
  }
}

export async function executeCalendarOperation(operationId: string, userId: string) {
  const admin = createAdminClient();
  const { data: operation, error } = await admin.from("calendar_operations")
    .update({ status: "processing", claimed_at: new Date().toISOString() })
    .eq("id", operationId).eq("user_id", userId).eq("status", "queued")
    .select("id,connection_id,operation_type,provider_event_id,payload,status").maybeSingle();
  if (error || !operation) throw new MicrosoftGraphError("calendar_operation_already_processed");
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
      await admin.from("calendar_operations").update({ status: "remote_committed", remote_committed_at: new Date().toISOString(), result: { provider_event_id: operation.provider_event_id } }).eq("id", operation.id);
      const { error: archiveError } = await admin.from("calendar_events")
        .update({ archived_at: new Date().toISOString() })
        .eq("user_id", userId).eq("provider_event_id", operation.provider_event_id).is("archived_at", null);
      if (archiveError) {
        await admin.from("calendar_operations").update({ status: "reconciliation_required", error_code: "calendar_remote_committed_cache_failed" }).eq("id", operation.id);
        throw new MicrosoftGraphError("calendar_remote_committed_cache_failed");
      }
      await admin.from("calendar_operations").update({ status: "succeeded", completed_at: new Date().toISOString(), cache_committed_at: new Date().toISOString(), result: { provider_event_id: operation.provider_event_id } }).eq("id", operation.id);
      await audit(userId, "execute", operation.id, { operation_type: "delete", result: "succeeded", provider_event_id: operation.provider_event_id });
      return;
    }
    if (operation.operation_type === "update") {
      const value = operation.payload as CalendarUpdatePayload;
      if (!operation.provider_event_id || !value.subject || !value.startsAt || !value.endsAt || !value.previous) throw new MicrosoftGraphError("operation_payload_invalid");
      const accessToken = await accessTokenForConnection(operation.connection_id, userId);
      const { data: cached } = await admin.from("calendar_events").select("subject,location_name,body_text,categories,importance,show_as").eq("user_id", userId).eq("provider_event_id", operation.provider_event_id).maybeSingle();
      const updated = await graph(accessToken, `/me/events/${encodeURIComponent(operation.provider_event_id)}`, {
        method: "PATCH",
        body: JSON.stringify(calendarEventForGraph(value as GraphCalendarCreatePayload)),
      }) as GraphEvent;
      const record = graphEventRecord(updated, userId, cached ?? undefined, value.timeZone || "Asia/Shanghai");
      await admin.from("calendar_operations").update({ status: "remote_committed", remote_committed_at: new Date().toISOString(), provider_event_id: record.provider_event_id, provider_change_key: record.provider_change_key, result: { provider_event_id: record.provider_event_id } }).eq("id", operation.id);
      const { error: cacheError } = await admin.from("calendar_events").upsert(record, { onConflict: "user_id,provider_event_id" });
      if (cacheError) {
        await admin.from("calendar_operations").update({ status: "reconciliation_required", error_code: "calendar_remote_committed_cache_failed" }).eq("id", operation.id);
        throw new MicrosoftGraphError("calendar_remote_committed_cache_failed");
      }
      await admin.from("calendar_operations").update({ status: "succeeded", completed_at: new Date().toISOString(), cache_committed_at: new Date().toISOString(), provider_change_key: record.provider_change_key, result: { provider_event_id: record.provider_event_id } }).eq("id", operation.id);
      await audit(userId, "execute", operation.id, { operation_type: "update", result: "succeeded", provider_event_id: record.provider_event_id });
      return;
    }
    if (operation.operation_type !== "create") throw new MicrosoftGraphError("operation_not_supported");
    const value = operation.payload as CalendarPayload;
    if (!value.subject || !value.startsAt || !value.endsAt) throw new MicrosoftGraphError("operation_payload_invalid");
    const accessToken = await accessTokenForConnection(operation.connection_id, userId);
    const created = await graph(accessToken, "/me/events", {
      method: "POST",
      body: JSON.stringify(calendarEventForGraph({ ...value, transactionId: operation.id } as GraphCalendarCreatePayload)),
    }) as GraphEvent;
    const record = graphEventRecord(created, userId, undefined, value.timeZone || "Asia/Shanghai");
    await admin.from("calendar_operations").update({ status: "remote_committed", provider_event_id: record.provider_event_id, remote_committed_at: new Date().toISOString(), provider_change_key: record.provider_change_key, result: { provider_event_id: record.provider_event_id } }).eq("id", operation.id);
    const { error: cacheError } = await admin.from("calendar_events").upsert(record, { onConflict: "user_id,provider_event_id" });
    if (cacheError) {
      await admin.from("calendar_operations").update({ status: "reconciliation_required", error_code: "calendar_remote_committed_cache_failed" }).eq("id", operation.id);
      throw new MicrosoftGraphError("calendar_remote_committed_cache_failed");
    }
    await admin.from("calendar_operations").update({ status: "succeeded", completed_at: new Date().toISOString(), cache_committed_at: new Date().toISOString(), provider_event_id: record.provider_event_id, provider_change_key: record.provider_change_key, result: { provider_event_id: record.provider_event_id } }).eq("id", operation.id);
    await audit(userId, "execute", operation.id, { operation_type: "create", result: "succeeded", provider_event_id: record.provider_event_id });
  } catch (error) {
    const code = error instanceof MicrosoftGraphError ? error.code : "calendar_operation_failed";
    if (code !== "calendar_remote_committed_cache_failed") await admin.from("calendar_operations").update({ status: "failed", completed_at: new Date().toISOString(), error_code: code }).eq("id", operation.id);
    await audit(userId, "execute", operation.id, { operation_type: operation.operation_type, result: "failed", error_code: code });
    throw new MicrosoftGraphError(code);
  }
}

/** Repairs the local cache after Outlook has already accepted an operation. Never issues a second create. */
export async function reconcileCalendarOperation(operationId: string, userId: string) {
  const admin = createAdminClient();
  const { data: operation, error } = await admin.from("calendar_operations")
    .select("id,connection_id,operation_type,provider_event_id,status")
    .eq("id", operationId).eq("user_id", userId)
    .in("status", ["remote_committed", "reconciliation_required"]).maybeSingle();
  if (error || !operation || !operation.provider_event_id) throw new MicrosoftGraphError("calendar_operation_already_processed");
  const accessToken = await accessTokenForConnection(operation.connection_id, userId);
  if (operation.operation_type === "delete") {
    const { error: archiveError } = await admin.from("calendar_events").update({ archived_at: new Date().toISOString() }).eq("user_id", userId).eq("provider_event_id", operation.provider_event_id).is("archived_at", null);
    if (archiveError) throw new MicrosoftGraphError("calendar_cache_failed");
  } else {
    const [remote, profile] = await Promise.all([
      graph(accessToken, `/me/events/${encodeURIComponent(operation.provider_event_id)}?$select=id,iCalUId,subject,body,start,end,isAllDay,location,changeKey,categories,importance,showAs`) as Promise<GraphEvent>,
      admin.from("profiles").select("timezone").eq("user_id", userId).maybeSingle(),
    ]);
    const { error: cacheError } = await admin.from("calendar_events").upsert(graphEventRecord(remote, userId, undefined, profile.data?.timezone || "Asia/Shanghai"), { onConflict: "user_id,provider_event_id" });
    if (cacheError) throw new MicrosoftGraphError("calendar_cache_failed");
  }
  await admin.from("calendar_operations").update({ status: "succeeded", completed_at: new Date().toISOString(), cache_committed_at: new Date().toISOString(), error_code: null }).eq("id", operation.id);
  await audit(userId, "reconcile", operation.id, { operation_type: operation.operation_type, provider_event_id: operation.provider_event_id });
}

export const microsoftCalendarConfiguration = { clientId: MICROSOFT_CLIENT_ID, scopes: MICROSOFT_SCOPES, scopeVersion: MICROSOFT_SCOPE_VERSION };
