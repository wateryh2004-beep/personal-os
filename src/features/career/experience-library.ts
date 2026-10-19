import type { Tables } from "@/types/database";
import { careerLabel } from "./labels";

export type ExperienceRow = Pick<Tables<"experiences">, "id" | "organization" | "department" | "role" | "location" | "experience_type" | "is_current" | "start_date" | "end_date" | "status" | "confidentiality_level">;
export type ExperienceFilters = { q: string; type: string; period: string; status: string };
export const emptyExperienceFilters: ExperienceFilters = { q: "", type: "all", period: "all", status: "all" };
export function experienceFilters(params: URLSearchParams): ExperienceFilters {
  return { q: params.get("q") ?? "", type: params.get("type") || "all", period: params.get("period") || "all", status: params.get("status") || "all" };
}
export function experienceQuery(filters: ExperienceFilters) {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q);
  for (const key of ["type", "period", "status"] as const) if (filters[key] !== "all") params.set(key, filters[key]);
  return params.size ? `?${params}` : "";
}
export function experienceLibraryHref(filters = emptyExperienceFilters) { return `/career/experiences${experienceQuery(filters)}`; }
export function experienceDates(row: Pick<ExperienceRow, "start_date" | "end_date" | "is_current">) {
  return `${row.start_date || "未填写开始日期"} — ${row.end_date || (row.is_current ? "至今" : "未填写结束日期")}`;
}
export function filterExperiences(rows: readonly ExperienceRow[], filters: ExperienceFilters) {
  const terms = filters.q.normalize("NFKC").trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter(row => (filters.type === "all" || row.experience_type === filters.type)
    && (filters.status === "all" || row.status === filters.status)
    && (filters.period === "all" || (filters.period === "current" ? row.is_current : filters.period === "past" ? !row.is_current : false))
    && terms.every(term => [row.organization, row.department, row.role, row.location, careerLabel(row.experience_type)].filter(Boolean).join(" ").normalize("NFKC").toLocaleLowerCase().includes(term)));
}
export function safeOutputHref(value: string | null) {
  if (!value) return null;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}
export function experienceHistoryDate(value: string, timezone: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  try { return date.toLocaleString("zh-CN", { timeZone: timezone }); }
  catch { return `${date.toISOString()}（UTC）`; }
}
