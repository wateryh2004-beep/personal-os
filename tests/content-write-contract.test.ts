import { describe, expect, it, vi } from "vitest";
import { contentWriteSchema, ContentWriteError } from "@/features/content/contracts";
import { writeContent } from "@/lib/adapters/content/supabase-content";

const operationId = "11111111-1111-4111-8111-111111111111";
const entityId = "22222222-2222-4222-8222-222222222222";
const answerId = "33333333-3333-4333-8333-333333333333";
const updatedAt = "2026-10-04T17:00:00.123456+00:00";
const createNote = { operation: "note.create", operationId, source: "codex", contentOrigin: "human", captureMode: "original", title: "Selected conversation", bodyMarkdown: "\n# Original\n\n  exact Markdown  \n" };
const updateNote = { ...createNote, operation: "note.update", noteId: entityId, expectedRevision: 3, expectedUpdatedAt: updatedAt };
const appendAnswer = { operation: "interview.answer.append", operationId, source: "claude", preparationId: entityId, answerMode: "spoken", language: "en", targetSeconds: 90, expectedVersion: 0, expectedAnswerId: null, expectedUpdatedAt: null, bodyMarkdown: "  My exact draft\n" };
const noteResult = { operationId, entityType: "note", entityId, revision: 1, updatedAt, href: `/notes/${entityId}/read`, replayed: false };

describe("strict external content commands", () => {
  it("preserves exact Markdown and separate source metadata", () => {
    const sourceUrl = "https://chatgpt.com/c/selected-conversation";
    const value = contentWriteSchema.parse({ ...createNote, sourceUrl });
    expect(value.bodyMarkdown).toBe(createNote.bodyMarkdown);
    expect(value.sourceUrl).toBe(sourceUrl);
    expect(value).toMatchObject({ folderId: null });
  });

  it("requires an explicit authorship choice without inferring it from the tool or capture mode", () => {
    expect(contentWriteSchema.safeParse({ ...createNote, contentOrigin: undefined }).success).toBe(false);
    expect(contentWriteSchema.safeParse({ ...updateNote, contentOrigin: undefined }).success).toBe(false);
    expect(contentWriteSchema.safeParse({ ...createNote, contentOrigin: "mixed" }).success).toBe(false);
    expect(contentWriteSchema.parse({ ...createNote, contentOrigin: "human", captureMode: "original" })).toMatchObject({ contentOrigin: "human" });
    expect(contentWriteSchema.parse({ ...createNote, contentOrigin: "ai_generated", captureMode: "original" })).toMatchObject({ contentOrigin: "ai_generated", captureMode: "original" });
    expect(contentWriteSchema.parse({ ...updateNote, contentOrigin: "ai_generated", captureMode: "curated" })).toMatchObject({ contentOrigin: "ai_generated", captureMode: "curated" });
    expect(contentWriteSchema.safeParse({ ...createNote, captureMode: "automatic" }).success).toBe(false);
  });

  it.each(["user_id", "userId", "status", "confirmed_at", "makeCurrent", "ai_visibility", "content_origin", "requestHeaders"])("rejects caller-supplied %s", (field) => {
    expect(contentWriteSchema.safeParse({ ...createNote, [field]: "spoofed" }).success).toBe(false);
    expect(contentWriteSchema.safeParse({ ...appendAnswer, [field]: "spoofed" }).success).toBe(false);
  });

  it.each(["https://chatgpt.com/c/original", "https://claude.ai/chat/original", null])("accepts bounded explicit source URL %s", (sourceUrl) => {
    expect(contentWriteSchema.safeParse({ ...createNote, sourceUrl }).success).toBe(true);
  });

  it.each(["javascript:alert(1)", "file:///tmp/notes.md", "data:text/plain,secret", "not-a-url"])("rejects unsafe provenance URL %s", (sourceUrl) => {
    expect(contentWriteSchema.safeParse({ ...createNote, sourceUrl }).success).toBe(false);
  });

  it("requires both note revision and full row updatedAt", () => {
    expect(contentWriteSchema.safeParse(updateNote).success).toBe(true);
    expect(contentWriteSchema.safeParse({ ...updateNote, expectedRevision: undefined }).success).toBe(false);
    expect(contentWriteSchema.safeParse({ ...updateNote, expectedUpdatedAt: undefined }).success).toBe(false);
    expect(contentWriteSchema.safeParse({ ...updateNote, expectedRevision: "3" }).success).toBe(false);
  });

  it("requires a complete selected base while allowing fresh drafts after archived history", () => {
    expect(contentWriteSchema.safeParse(appendAnswer).success).toBe(true);
    expect(contentWriteSchema.safeParse({ ...appendAnswer, expectedVersion: 1 }).success).toBe(true);
    expect(contentWriteSchema.safeParse({ ...appendAnswer, expectedVersion: 0, expectedAnswerId: answerId, expectedUpdatedAt: updatedAt }).success).toBe(false);
    const existing = { ...appendAnswer, expectedVersion: 4, expectedAnswerId: answerId, expectedUpdatedAt: updatedAt };
    expect(contentWriteSchema.safeParse(existing).success).toBe(true);
    expect(contentWriteSchema.safeParse({ ...existing, expectedUpdatedAt: null }).success).toBe(false);
  });

  it.each(["outline", "framework", "notes"])("rejects unsupported %s authoring until a read-after-write surface exists", (answerMode) => {
    expect(contentWriteSchema.safeParse({ ...appendAnswer, answerMode }).success).toBe(false);
  });

  it("enforces payload limits and nonempty answers without trimming", () => {
    expect(contentWriteSchema.safeParse({ ...createNote, bodyMarkdown: "x".repeat(200_001) }).success).toBe(false);
    expect(contentWriteSchema.safeParse({ ...appendAnswer, bodyMarkdown: "x".repeat(50_001) }).success).toBe(false);
    expect(contentWriteSchema.safeParse({ ...appendAnswer, bodyMarkdown: " \n " }).success).toBe(false);
    expect(contentWriteSchema.parse(appendAnswer).bodyMarkdown).toBe(appendAnswer.bodyMarkdown);
    expect(contentWriteSchema.safeParse({ ...createNote, title: " \n " }).success).toBe(false);
    expect(contentWriteSchema.safeParse({ ...updateNote, expectedRevision: 2_147_483_647 }).success).toBe(false);
  });
});

describe("single-call content adapter", () => {
  it("sends only the strict command through the session-scoped RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: noteResult, error: null });
    expect(await writeContent({ rpc }, createNote)).toEqual(noteResult);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("write_content", { p_command: { ...createNote, sourceUrl: null, folderId: null } });
  });

  it("normalizes uppercase UUIDs before RPC fingerprinting and receipt verification", async () => {
    const upper = "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE";
    const result = { ...noteResult, operationId: upper.toLowerCase(), replayed: true };
    const rpc = vi.fn().mockResolvedValue({ data: result, error: null });
    expect(await writeContent({ rpc }, { ...createNote, operationId: upper })).toEqual(result);
    expect(rpc.mock.calls[0][1].p_command.operationId).toBe(upper.toLowerCase());
  });

  it("returns the stored revision and href on idempotent replay", async () => {
    const replay = { ...noteResult, replayed: true };
    expect(await writeContent({ rpc: vi.fn().mockResolvedValue({ data: replay, error: null }) }, createNote)).toEqual(replay);
  });

  it("returns stable preparation identity and distinct new answer identity", async () => {
    const result = { ...noteResult, entityType: "interview_preparation", answerId, href: `/career/interview?question=${entityId}&answer=${answerId}` };
    expect(await writeContent({ rpc: vi.fn().mockResolvedValue({ data: result, error: null }) }, appendAnswer)).toEqual(result);
  });

  it("never calls the database for unvalidated identity or status fields", async () => {
    const rpc = vi.fn();
    await expect(writeContent({ rpc }, { ...createNote, user_id: entityId })).rejects.toMatchObject({ code: "invalid_input" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["P0101", "conflict"], ["23505", "conflict"], ["40001", "conflict"],
    ["P0102", "idempotency_conflict"], ["P0103", "not_found"],
    ["PGRST202", "migration_required"], ["42883", "migration_required"],
    ["42501", "forbidden"], ["22P02", "invalid_input"], ["22003", "invalid_input"],
    ["unknown", "write_failed"],
  ])("maps database %s to bounded %s without leaking database details", async (code, expected) => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code, message: "secret database details" } });
    try {
      await writeContent({ rpc }, createNote);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ContentWriteError);
      expect(error).toMatchObject({ code: expected });
      expect((error as Error).message).not.toContain("secret");
    }
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("does not perform fallback direct-table writes on missing migrations", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    await expect(writeContent({ rpc }, createNote)).rejects.toMatchObject({ code: "migration_required" });
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("fails closed on malformed or mismatched receipts", async () => {
    for (const data of [null, {}, { ...noteResult, operationId: answerId }]) {
      await expect(writeContent({ rpc: vi.fn().mockResolvedValue({ data, error: null }) }, createNote)).rejects.toMatchObject({ code: "write_failed" });
    }
  });

  it("does not automatically retry an ambiguous transport result", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("network"));
    await expect(writeContent({ rpc }, createNote)).rejects.toMatchObject({ code: "write_failed" });
    expect(rpc).toHaveBeenCalledOnce();
  });
});
