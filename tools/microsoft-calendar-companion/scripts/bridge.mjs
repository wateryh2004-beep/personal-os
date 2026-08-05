import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const baseUrl = (process.env.PERSONAL_OS_CALENDAR_BASE_URL || "").replace(/\/$/, "");
const bridgeToken = process.env.PERSONAL_OS_CALENDAR_BRIDGE_TOKEN || "";
const connectionId = process.env.PERSONAL_OS_CALENDAR_CONNECTION_ID || "";
const once = process.argv.includes("--once");
const pollMs = Number(process.env.PERSONAL_OS_CALENDAR_POLL_MS || 5000);

if (!/^https:\/\//.test(baseUrl) || !bridgeToken || !connectionId) {
  console.error("Set PERSONAL_OS_CALENDAR_BASE_URL, PERSONAL_OS_CALENDAR_BRIDGE_TOKEN, and PERSONAL_OS_CALENDAR_CONNECTION_ID before starting the bridge.");
  process.exit(2);
}
if (!Number.isFinite(pollMs) || pollMs < 1000 || pollMs > 60_000) {
  console.error("PERSONAL_OS_CALENDAR_POLL_MS must be between 1000 and 60000.");
  process.exit(2);
}

const headers = {
  authorization: `Bearer ${bridgeToken}`,
  "x-calendar-connection": connectionId,
  "content-type": "application/json",
};

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } });
  if (!response.ok) throw new Error(`Personal OS bridge request failed (${response.status}).`);
  return response.json();
}

function textResult(result) {
  if (result.structuredContent && typeof result.structuredContent === "object") return result.structuredContent;
  for (const item of result.content || []) {
    if (item.type !== "text") continue;
    try { return JSON.parse(item.text); } catch { /* next item */ }
  }
  throw new Error("The Microsoft Calendar Companion returned an unreadable response.");
}

function utc(dateTime, timeZone) {
  if (typeof dateTime !== "string") throw new Error("Calendar event is missing a timestamp.");
  if (/Z$|[+-]\d\d:\d\d$/.test(dateTime)) return new Date(dateTime).toISOString();
  // Calendar MCP's default Graph response is UTC. Rejecting other unqualified
  // values is safer than silently shifting a personal event to the wrong hour.
  if (timeZone && timeZone !== "UTC") throw new Error(`Unsupported unqualified Outlook timezone: ${timeZone}`);
  return new Date(`${dateTime}Z`).toISOString();
}

function normalizeEvent(event) {
  const start = event.start || {};
  const end = event.end || {};
  return {
    providerEventId: String(event.id || ""),
    calendarId: event.calendarId ? String(event.calendarId) : null,
    subject: String(event.subject || ""),
    startsAt: utc(start.dateTime, start.timeZone),
    endsAt: utc(end.dateTime, end.timeZone),
    isAllDay: Boolean(event.isAllDay),
    locationName: event.location?.displayName ? String(event.location.displayName) : null,
    providerChangeKey: event.changeKey ? String(event.changeKey) : null,
  };
}

function payloadToGraph(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Operation payload is invalid.");
  const { subject, startsAt, endsAt, locationName, isAllDay } = payload;
  if (typeof subject !== "string" || typeof startsAt !== "string" || typeof endsAt !== "string") throw new Error("Operation payload is incomplete.");
  return {
    subject,
    start: { dateTime: startsAt, timeZone: "UTC" },
    end: { dateTime: endsAt, timeZone: "UTC" },
    isAllDay: Boolean(isAllDay),
    ...(typeof locationName === "string" && locationName ? { location: { displayName: locationName } } : {}),
  };
}

function calendarItems(payload) {
  if (Array.isArray(payload?.value)) return payload.value;
  if (Array.isArray(payload?.events)) return payload.events;
  if (Array.isArray(payload?.data?.value)) return payload.data.value;
  throw new Error("The Outlook calendar response does not contain an event list.");
}

async function createMcp() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [join(root, "scripts", "run-calendar-mcp.mjs")],
    cwd: root,
    env: process.env.PERSONAL_OS_MS365_DATA_DIR ? { PERSONAL_OS_MS365_DATA_DIR: process.env.PERSONAL_OS_MS365_DATA_DIR } : {},
  });
  const client = new Client({ name: "life-of-hang-calendar-bridge", version: "0.1.0" });
  await client.connect(transport);
  return { client, transport };
}

async function execute(client, operation) {
  if (operation.operation_type === "sync") {
    const start = new Date();
    const end = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);
    const result = await client.callTool({ name: "get-calendar-view", arguments: { startDateTime: start.toISOString(), endDateTime: end.toISOString(), "$top": 500 } });
    const events = calendarItems(textResult(result)).map(normalizeEvent);
    await request("/api/calendar/companion/results", { method: "PUT", body: JSON.stringify({ events }) });
    return {};
  }
  if (operation.operation_type === "create") {
    const result = await client.callTool({ name: "create-calendar-event", arguments: { body: payloadToGraph(operation.payload) } });
    return { event: normalizeEvent(textResult(result)) };
  }
  if (operation.operation_type === "update") {
    if (!operation.provider_event_id) throw new Error("Update operation is missing its Outlook event ID.");
    await client.callTool({ name: "update-calendar-event", arguments: { eventId: operation.provider_event_id, body: payloadToGraph(operation.payload) } });
    return {};
  }
  if (operation.operation_type === "delete") {
    if (!operation.provider_event_id) throw new Error("Delete operation is missing its Outlook event ID.");
    await client.callTool({ name: "delete-calendar-event", arguments: { eventId: operation.provider_event_id } });
    return {};
  }
  throw new Error("Unsupported calendar operation.");
}

function errorCode(error) {
  const text = error instanceof Error ? error.message : "unknown_error";
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 120) || "companion_failed";
}

async function runOnce() {
  const claimed = await request("/api/calendar/companion/operations");
  if (!claimed.operation) return false;
  const { client, transport } = await createMcp();
  try {
    const result = await execute(client, claimed.operation);
    await request("/api/calendar/companion/results", { method: "POST", body: JSON.stringify({ operationId: claimed.operation.id, outcome: "succeeded", ...result }) });
  } catch (error) {
    console.error(`Calendar operation ${claimed.operation.id} failed:`, error instanceof Error ? error.message : "unknown error");
    await request("/api/calendar/companion/results", { method: "POST", body: JSON.stringify({ operationId: claimed.operation.id, outcome: "failed", errorCode: errorCode(error) }) });
  } finally {
    await transport.close();
  }
  return true;
}

async function main() {
  do { await runOnce(); if (!once) await new Promise((resolve) => setTimeout(resolve, pollMs)); } while (!once);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
