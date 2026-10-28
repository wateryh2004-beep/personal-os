import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ failed: "", throwNetwork: false }));
const owner = "11111111-1111-4111-8111-111111111111";
const entry = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const media = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const document = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
vi.mock("@/lib/auth/require-owner", () => ({ requireOwner: async () => ({ userId: owner, supabase: { from: (table: string) => builder(table) } }) }));
function builder(table: string) {
  const rows: Record<string, unknown[]> = {
    experience_library_captures: [{ id: "capture", capture_type: "post", raw_content: "合成原文", segments: [{ kind: "post", text: "合成原文", start: 0, end: 4, label: null }], speaker: null, created_at: "2026-10-28" }],
    experience_library_media: [{ id: media, entry_id: entry, capture_id: null, document_id: document, selection_start: null, selection_end: null, selection_quote: null, position: 0, caption: null, source_kind: "file", created_at: "2026-10-28" }],
    documents: [{ id: document, original_filename: "sample.png", mime_type: "image/png", file_size: 10, storage_state: "available", archived_at: null, ai_visibility: "sensitive", extracted_text: "旧识别文字", text_extraction_method: "ocr_local", text_extraction_source_sha256: "a".repeat(64), text_extracted_at: null }],
    experience_library_ocr_corrections: [], experience_library_task_links: [{ todo_task_id: "task" }], microsoft_todo_tasks: [{ id: "task", title: "合成任务", status: "notStarted" }],
  };
  const b = { select: () => b, eq: () => b, is: () => b, in: () => b, order: () => b,
    maybeSingle: async () => ({ data: { id: entry, title: "合成资料", source_url: null, tags: [], ai_summary: null, ai_status: "not_requested", ai_error_code: null, ai_provider: null, ai_model: null, ai_analyzed_at: null, ai_key_points: [], created_at: "2026-10-28", updated_at: "2026-10-28" }, error: null }),
    then: (resolve: (value: unknown) => void, reject: (error: unknown) => void) => state.failed === table && state.throwNetwork ? Promise.reject(new Error("offline")).then(resolve, reject) : Promise.resolve({ data: state.failed === table ? null : rows[table] ?? [], error: state.failed === table ? { message: "offline" } : null }).then(resolve, reject) };
  return b;
}
import { getExperienceEntry } from "@/features/experience-library/queries";
beforeEach(() => { state.failed = ""; state.throwNetwork = false; });
it("keeps the original and image available when correction data cannot be read", async () => {
  state.failed = "experience_library_ocr_corrections";
  const detail = await getExperienceEntry(entry);
  expect(detail?.captures[0].rawContent).toBe("合成原文");
  expect(detail?.media[0]).toMatchObject({ available: true, ocrUnavailable: true, ocrText: null });
  expect(detail?.tasksUnavailable).toBe(false);
});
it("reports task data as unavailable rather than claiming there are no tasks", async () => {
  state.failed = "experience_library_task_links"; state.throwNetwork = true;
  const detail = await getExperienceEntry(entry);
  expect(detail?.captures[0].rawContent).toBe("合成原文");
  expect(detail?.tasksUnavailable).toBe(true);
});
it("keeps working when the task cache query fails", async () => {
  state.failed = "microsoft_todo_tasks";
  const detail = await getExperienceEntry(entry);
  expect(detail?.tasksUnavailable).toBe(true);
  expect(detail?.media[0].ocrText).toBe("旧识别文字");
});
