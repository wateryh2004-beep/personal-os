import { z } from "zod";

export const readingProgressSchema = z.object({
  documentId: z.string().uuid(), sourceVersion: z.string().uuid(),
  page: z.number().int().min(1).max(500), totalPages: z.number().int().min(1).max(500),
  expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER - 1),
  mutationId: z.string().uuid(),
}).strict().refine(value => value.page <= value.totalPages);
export type ReadingProgress = { page: number; totalPages: number; revision: number; updatedAt: string };
export type ReadingSnapshot = { sourceVersion: string; progress: ReadingProgress | null };
export type ReadingSaveResult =
  | { status: "saved" | "conflict"; progress: ReadingProgress }
  | { status: "unavailable" | "source_changed" };

/** One ordered queue per reader. A stale device never silently rebases a write. */
export function createReadingProgressQueue(options: {
  documentId: string; sourceVersion: string; totalPages: number; revision: number;
  save: (input: z.infer<typeof readingProgressSchema>) => Promise<ReadingSaveResult>;
  report: (result: ReadingSaveResult) => void;
}) {
  let revision = options.revision;
  let pending: number | null = null;
  let running = false;
  let blocked = false;
  let lastPage: number | null = null;
  async function drain() {
    if (running || blocked) return;
    running = true;
    try {
      while (pending !== null && !blocked) {
        const page = pending; pending = null;
        const input = { documentId: options.documentId, sourceVersion: options.sourceVersion,
          page, totalPages: options.totalPages, expectedRevision: revision, mutationId: crypto.randomUUID() };
        let result: ReadingSaveResult = { status: "unavailable" };
        // Same mutation ID makes a lost-response retry idempotent.
        for (let attempt = 0; attempt < 2; attempt++) {
          try { result = await options.save(input); } catch { result = { status: "unavailable" }; }
          if (result.status !== "unavailable") break;
        }
        if (result.status === "saved") revision = result.progress.revision;
        else { blocked = true; pending = null; }
        options.report(result);
      }
    } finally { running = false; }
  }
  return {
    record(page: number) {
      if (blocked || page === lastPage || !Number.isInteger(page) || page < 1 || page > options.totalPages) return;
      lastPage = page; pending = page; void drain();
    },
    /** Called only after the user chooses how to resolve a conflict. */
    resolve(nextRevision: number) { revision = nextRevision; blocked = false; lastPage = null; },
  };
}
