import { z } from "zod";
const roots = new Set(["/today", "/notes", "/notes/ask", "/tasks", "/calendar", "/files", "/projects", "/inbox", "/briefing", "/briefing/events", "/briefing/sources", "/briefing/interests", "/investments", "/shopping", "/travel", "/leisure", "/memory", "/reviews/daily", "/reviews/weekly", "/career/skills", "/career/experiences", "/career/opportunities", "/career/interview", "/career/interview/insights"]);
export function isContinuousFixturePath(pathname: string) {
  if (roots.has(pathname)) return true;
  if (/^\/career\/opportunities\/[0-9a-f-]{36}\/materials$/.test(pathname)) return z.uuid().safeParse(pathname.split("/")[3]).success;
  const match = /^(?:\/notes|\/shopping|\/travel|\/leisure|\/career\/experiences|\/career\/interview\/(?:questions|practice|sessions))\/([^/]+)$/.exec(pathname);
  return !!match && z.uuid().safeParse(match[1]).success;
}
/** Exact public HTTP boundaries used by the real UI; every other API is denied. */
export function isContinuousFixtureApi(pathname: string) {
  return ["/api/today/workspace", "/api/planning/day", "/api/calendar/schedule-task", "/api/calendar/schedule-conflicts", "/api/workbench/timezone", "/api/assistant", "/api/assistant/runs", "/api/workflow-continuity/summary", "/api/workbench/entities", "/api/workbench/scenes", "/api/notes", "/api/notes/workspace", "/api/tasks/workspace", "/api/calendar/workspace", "/api/calendar/events", "/api/calendar/events/by-id", "/api/calendar/pending-tasks", "/api/tasks", "/api/search", "/api/today/brief-synthesis", "/api/files", "/api/files/upload-url", "/api/files/upload-candidates"].includes(pathname)
    || /^\/api\/assistant\/runs\/[0-9a-f-]{36}$/.test(pathname)
    || /^\/api\/notes\/[0-9a-f-]{36}(?:\/document)?$/.test(pathname)
    || /^\/api\/files\/[0-9a-f-]{36}\/(?:preview|thumbnail|read|record)$/.test(pathname);
}
