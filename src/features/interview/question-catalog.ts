import { normalizeLibraryFilters, workspaceDomain, type LibraryFilters } from "./workspace-library";
import { questionTypeLabels } from "./constants";

export type QuestionCatalogRow = {
  id: string; prompt: string; shortTitle: string | null; category: string;
  style: string; subcategory: string | null; preparationCount: number; competencyTags?: string[];
};
export function catalogFilters(params: URLSearchParams) {
  return normalizeLibraryFilters({ q: params.get("q") ?? "", category: params.get("category") ?? "all", domain: params.get("domain") ?? "all", style: params.get("style") ?? "all" });
}
export function filterQuestionCatalog(rows: QuestionCatalogRow[], filters: LibraryFilters) {
  const terms = filters.q.normalize("NFKC").trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter(row => (filters.category === "all" || row.category === filters.category)
    && (filters.domain === "all" || workspaceDomain(row) === filters.domain)
    && (filters.style === "all" || row.style === filters.style)
    && (!terms.length || terms.every(term => [row.prompt, row.shortTitle, ...(row.competencyTags ?? []), workspaceDomain(row), questionTypeLabels[row.category as keyof typeof questionTypeLabels]].filter(Boolean).join(" ").normalize("NFKC").toLocaleLowerCase().includes(term))));
}
export function catalogUrl(filters: LibraryFilters) {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set("q", filters.q);
  for (const key of ["category", "domain", "style"] as const) if (filters[key] !== "all") params.set(key, filters[key]);
  return `/career/interview/questions${params.size ? `?${params}` : ""}`;
}
