import type { CareerTarget } from "./next-actions";
export type TargetFilters = { target_q: string; target_status: string };
export const emptyTargetFilters: TargetFilters = { target_q: "", target_status: "all" };
export const targetStatusLabels: Record<string, string> = { active: "进行中", paused: "已暂停", closed: "已结束" };
export function targetFilters(params: Pick<URLSearchParams, "get">): TargetFilters { return { target_q: params.get("target_q") ?? "", target_status: params.get("target_status") || "all" }; }
export function targetQuery(filters: TargetFilters) {
  const params = new URLSearchParams();
  if (filters.target_q.trim()) params.set("target_q", filters.target_q);
  if (filters.target_status !== "all") params.set("target_status", filters.target_status);
  return params.size ? `?${params}` : "";
}
export function targetLibraryHref(filters: TargetFilters) { return `/career${targetQuery(filters)}#target-library`; }
export function targetDetailHref(id: string, filters = emptyTargetFilters) { return `/career/interview/targets/${encodeURIComponent(id)}${targetQuery(filters)}`; }
export function filterTargets(rows: readonly CareerTarget[], filters: TargetFilters) {
  const terms = filters.target_q.normalize("NFKC").trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter(row => (filters.target_status === "all" || row.status === filters.target_status) && terms.every(term => [row.title,row.organization_snapshot,row.role_title_snapshot].filter(Boolean).join(" ").normalize("NFKC").toLocaleLowerCase().includes(term)));
}
