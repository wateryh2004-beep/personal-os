export const personalMemoryTypes = ["profile", "working"] as const;
export type PersonalMemoryType = (typeof personalMemoryTypes)[number];
export type AiVisibility = "normal" | "sensitive" | "never";
export function normalizeMemoryKey(type: PersonalMemoryType, title: string) {
  return `${type}:${title.normalize("NFKC").trim().toLocaleLowerCase().replace(/\s+/g, " ")}`;
}
export function getWorkingMemoryState(
  memory: {
    status: string;
    archived_at: string | null;
    valid_until: string | null;
    review_at: string | null;
  },
  now = new Date(),
) {
  if (memory.status !== "active" || memory.archived_at) return "inactive";
  if (memory.valid_until && new Date(memory.valid_until) <= now)
    return "expired";
  if (memory.review_at && new Date(memory.review_at) < now)
    return "needs_review";
  return "active";
}
