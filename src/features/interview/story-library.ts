import type { Tables } from "@/types/database";

export const storySections = [
  { name: "situation_markdown", label: "背景", hint: "发生了什么？只保留理解故事所需的背景。", max: 20_000, rows: 4 },
  { name: "task_markdown", label: "任务", hint: "你承担的任务和职责边界是什么？", max: 20_000, rows: 4 },
  { name: "action_markdown", label: "行动", hint: "具体做了什么？说明判断、取舍和实施过程。", max: 40_000, rows: 7 },
  { name: "result_markdown", label: "结果", hint: "形成了什么可验证的结果？", max: 20_000, rows: 4 },
  { name: "reflection_markdown", label: "反思", hint: "这件事改变了你的什么方法或判断？", max: 20_000, rows: 4 },
] as const;
export type EditableStory = Pick<Tables<"interview_stories">, "id" | "experience_id" | "title" | "one_line" | "status" | typeof storySections[number]["name"]>;
export type StoryExperience = { id: string; organization: string; role: string | null };
export type StoryLibraryRow = {
  id: string; title: string; oneLine: string; status: string; experienceId: string | null; experienceLabel: string;
  competencies: { id: string; label: string }[]; archetypeCount: number;
};
export type StoryFilters = { q: string; status: string; experience: string; competency: string };
export const emptyStoryFilters: StoryFilters = { q: "", status: "all", experience: "all", competency: "all" };
export function storyFilters(params: URLSearchParams): StoryFilters {
  return { q: params.get("q") ?? "", status: params.get("status") || "all", experience: params.get("experience") || "all", competency: params.get("competency") || "all" };
}
export function storyFilterQuery(filters: StoryFilters) {
  const params = new URLSearchParams();
  // Preserve composing whitespace so entering the next search term does not join words.
  if (filters.q.trim()) params.set("q", filters.q);
  for (const key of ["status", "experience", "competency"] as const) if (filters[key] !== "all") params.set(key, filters[key]);
  return params.size ? `?${params}` : "";
}
export function storyLibraryHref(filters: StoryFilters = emptyStoryFilters) { return `/career/interview/stories${storyFilterQuery(filters)}`; }
export function filterStoryLibrary(rows: readonly StoryLibraryRow[], filters: StoryFilters) {
  const terms = filters.q.normalize("NFKC").trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter(row => (filters.status === "all" || row.status === filters.status)
    && (filters.experience === "all" || (row.experienceId ?? "unbound") === filters.experience)
    && (filters.competency === "all" || row.competencies.some(item => item.id === filters.competency))
    && terms.every(term => [row.title, row.oneLine, row.experienceLabel, ...row.competencies.map(item => item.label)].join(" ").normalize("NFKC").toLocaleLowerCase().includes(term)));
}
