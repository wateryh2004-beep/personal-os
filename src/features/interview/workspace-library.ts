import { interviewQuestionTypeKeys } from "./constants";
import type { WorkspaceAnswerMetadata } from "./workspace-answers";

export type WorkspaceItem = {
  preparationId: string;
  questionId: string;
  contextId: string | null;
  prompt: string;
  shortTitle?: string | null;
  category: string;
  categoryLabel: string;
  style: string;
  subcategory: string | null;
  parentQuestionId?: string | null;
  competencies: Array<{ key: string; label: string }>;
  learning?: { keyMessage: string; logic: string; pitfalls: string; nextFocus: string };
  thoughts: string;
  answer: string;
  answerId: string | null;
  answerMeta?: WorkspaceAnswerMetadata | null;
};

export type LibraryFilters = { category: string; domain: string; style: string; q: string };
export const emptyLibraryFilters: LibraryFilters = { category: "all", domain: "all", style: "all", q: "" };
export function normalizeLibraryFilters(filters: Partial<LibraryFilters>): LibraryFilters {
  return {
    category: interviewQuestionTypeKeys.includes(filters.category as typeof interviewQuestionTypeKeys[number]) ? filters.category! : "all",
    domain: filters.domain || "all",
    style: filters.category === "stress" || filters.style === "stress" ? "stress" : filters.style === "standard" ? "standard" : "all",
    q: filters.q ?? "",
  };
}
export function workspaceDomain(item: WorkspaceItem) { return item.subcategory?.replace(/^(通用|技术面|Case面)\s*·\s*/, "").trim() || "未分类"; }
export function filterWorkspaceItems(items: WorkspaceItem[], filters: LibraryFilters) {
  const terms = filters.q.normalize("NFKC").trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    if (filters.category !== "all" && item.category !== filters.category) return false;
    if (filters.domain !== "all" && workspaceDomain(item) !== filters.domain) return false;
    if (filters.style !== "all" && item.style !== filters.style) return false;
    if (!terms.length) return true;
    const text = [item.shortTitle, item.prompt, item.subcategory, item.categoryLabel, item.thoughts, item.answer, ...Object.values(item.learning ?? {}), ...item.competencies.map((entry) => entry.label)].filter(Boolean).join(" ").normalize("NFKC").toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
}
export function workspaceUrl(contextId: string, questionId: string, filters: LibraryFilters, answerId?: string | null) {
  const params = new URLSearchParams();
  if (contextId) params.set("context", contextId);
  if (questionId) params.set("question", questionId);
  if (filters.category !== "all") params.set("category", filters.category);
  if (filters.domain !== "all") params.set("domain", filters.domain);
  if (filters.style !== "all") params.set("style", filters.style);
  if (filters.q.trim()) params.set("q", filters.q.trim());
  if (questionId && answerId) params.set("answer", answerId);
  return params.size ? `/career/interview?${params}` : "/career/interview";
}
