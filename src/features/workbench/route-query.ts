import { z } from "zod";
import { normalizeLeisureFrom } from "@/features/leisure/browse";
import { interviewQuestionStyles, interviewQuestionTypeKeys } from "@/features/interview/constants";

type Rule = (value: string) => boolean;
const uuid: Rule = value => z.uuid().safeParse(value).success;
const oneOf = (...values: string[]): Rule => value => values.includes(value);
const bounded = (limit: number): Rule => value => value.length <= limit && !/[\u0000-\u001f\u007f]/.test(value);
const query = bounded(200);
const integer = (maximum: number): Rule => value => /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= maximum;
const day: Rule = value => value === "all" || value === "unknown" || integer(366)(value);
const date: Rule = value => Number(value.slice(0, 4)) >= 1 && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const projectStatus = oneOf("all", "active", "completed", "paused", "other");
const uuidPath = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const route = (expression: string, pathname: string) => new RegExp(`^${expression}$`, "i").test(pathname);
function rules(path: string): Record<string, Rule> {
  if (path === "/notes") return { q: query, scope: oneOf("context", "all"), folder: uuid, view: oneOf("all", "favorites", "recent") };
  if (path === "/files") return { q: query, folder: uuid, view: oneOf("list", "grid"), sort: oneOf("uploaded-desc", "uploaded-asc", "name", "size-desc", "size-asc"), type: oneOf("all", "photo", "document", "spreadsheet", "presentation", "audio", "video", "archive", "other"), page: integer(200), file: uuid };
  if (path === "/tasks") return { q: query, task: uuid, status: oneOf("all", "active", "completed"), view: oneOf("today", "upcoming", "all", "completed") };
  if (path === "/calendar") return { event: uuid, view: oneOf("dayGridMonth", "timeGridWeek", "timeGridDay", "listWeek", "month", "week", "day", "agenda"), date };
  if (path === "/projects") return { status: projectStatus };
  if (path === "/inbox") return { entry: uuid, draft: oneOf("task", "calendar", "note", "daily", "project", "link") };
  if (path === "/investments" || path === "/investing") return { tab: oneOf("holdings", "strategies", "research"), mode: oneOf("real", "paper"), item: uuid };
  if (path === "/career/resumes") return { q: query, resume: uuid, direction: value => value === "all" || value === "general" || uuid(value), status: oneOf("all", "draft", "approved") };
  if (path === "/career/applications") return { opportunity: uuid };
  if (path === "/career/roadmap") return { milestone: uuid };
  if (path === "/career/opportunities") return { q: query, status: oneOf("all", "watching", "researching", "preparing", "closed") };
  if (path === "/career/interview") return { q: query, context: value => value === "general" || uuid(value), question: uuid, answer: uuid, category: oneOf("all", ...interviewQuestionTypeKeys), domain: bounded(120), style: oneOf("all", ...interviewQuestionStyles) };
  if (route(`/career/interview/questions/${uuidPath}`, path)) return { context: uuid };
  if (route(`/career/interview/practice/${uuidPath}`, path)) return { parent: uuid };
  if (["/career/interview/practice", "/career/interview/insights", "/career/interview/questions"].includes(path)) return { context: value => value === "general" || uuid(value), q: query };
  if (path === "/shopping") return { q: query, status: oneOf("all", "active", "inbox", "cooling", "ready", "purchased", "abandoned"), mode: oneOf("field") };
  if (path === "/travel") return { q: query, status: oneOf("all", "planning", "booked", "completed", "dream", "shortlist"), mode: oneOf("field") };
  if (route(`/travel/${uuidPath}`, path)) return { mode: oneOf("field"), day, stop: uuid };
  if (path === "/leisure") return { q: query, mode: oneOf("field"), kind: oneOf("film", "series", "game", "book", "music", "outing", "other"), minutes: integer(1440), setting: oneOf("home", "out", "either"), company: oneOf("solo", "together", "either"), budget: oneOf("free", "paid", "unknown") };
  if (route(`/leisure/${uuidPath}`, path)) return { from: value => value.length <= 1024 && normalizeLeisureFrom(value) === value && !/[\u0000-\u001f]/.test(value) && new Set([...new URLSearchParams(value).keys()]).size === [...new URLSearchParams(value).keys()].length };
  return {};
}
/** Reject malformed encodings/duplicates; sanitize unknown ordinary view keys. */
export function sanitizeWorkbenchQuery(url: URL): boolean {
  const seen = new Set<string>();
  for (const part of url.search.slice(1).split("&").filter(Boolean)) {
    try { for (const piece of [part.split("=", 1)[0], part.slice(part.indexOf("=") + 1)]) decodeURIComponent(piece.replace(/\+/g, " ")); } catch { return false; }
  }
  const allowed = rules(url.pathname);
  for (const [key, value] of [...url.searchParams]) {
    if (seen.has(key)) return false;
    seen.add(key);
    if (!allowed[key]?.(value)) url.searchParams.delete(key);
  }
  const hash = url.hash;
  if (!hash) return true;
  const allowedAnchor = url.pathname === "/leisure" && hash === "#leisure-collection"
    || url.pathname === "/projects" && route(`#project-${uuidPath}`, hash)
    || url.pathname === "/career/opportunities" && route(`#opportunity-${uuidPath}`, hash)
    || url.pathname === "/career/resumes" && route(`#resume-${uuidPath}`, hash)
    || url.pathname === "/career/applications" && route(`#application-${uuidPath}`, hash)
    || url.pathname === "/investments" && route(`#investment-${uuidPath}`, hash)
    || url.pathname === "/memory" && route(`#decision-${uuidPath}`, hash)
    || route(`/briefing/history/${uuidPath}`, url.pathname) && route(`#entry-${uuidPath}`, hash);
  if (!allowedAnchor) url.hash = "";
  return true;
}
