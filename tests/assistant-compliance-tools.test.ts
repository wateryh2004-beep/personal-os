import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ memory: false }));
vi.mock("@/features/assistant/persistence", () => ({ recordAgentStep: vi.fn(), storeAgentAction: vi.fn() }));
vi.mock("@/features/search/queries", () => ({ searchPersonalOs: vi.fn(async () => []) }));
vi.mock("@/features/ai/governance", async importOriginal => {
  const original = await importOriginal<typeof import("@/features/ai/governance")>();
  return { ...original, getAiGovernance: vi.fn(async () => ({ ...original.defaultAiGovernance, longTermMemoryOptIn: state.memory })) };
});
import { noteTools } from "@/features/assistant/tools/notes";
import { memoryTools } from "@/features/assistant/tools/memory";
import { searchTools } from "@/features/assistant/tools/search";
import { buildAssistantTools } from "@/features/assistant/tools";
import { defaultAiGovernance } from "@/features/ai/governance";
import { sourceEntityId, type AssistantStreamSource } from "@/features/assistant/stream-metadata";
import { complianceDb } from "./helpers/compliance-db";
const owner = "00000000-0000-4000-8000-000000000001";
const noteId = "10000000-0000-4000-8000-000000000001";
const options = { toolCallId: "synthetic", messages: [], context: {} };
beforeEach(() => { state.memory = false; });

describe("AI boundaries at actual tool execution", () => {
  it("never lists sensitive, never-send or AI-generated titles in organization results", async () => {
    const { supabase } = complianceDb({ notes: ["normal", "sensitive", "never"].map((visibility, index) => ({ id: `${noteId.slice(0,-1)}${index+1}`, title: visibility, user_id: owner, ai_visibility: visibility, content_origin: "human", status: "active", folder_id: null, archived_at: null, deleted_at: null })).concat([{ id: noteId, title: "generated", user_id: owner, ai_visibility: "normal", content_origin: "ai_generated", status: "active", folder_id: null, archived_at: null, deleted_at: null }]) });
    const result = await noteTools.build({ supabase, userId: owner, timezone: "Asia/Shanghai" }).listNoteOrganization.execute!({ maxRootNotes: 100 }, options);
    expect(result).toMatchObject({ rootNotes: [{ title: "normal" }], rootTotal: 1 });
    expect(JSON.stringify(result)).not.toMatch(/sensitive|never|generated/);
  });
  it("denies both memory tools and cross-domain memory lookup while consent is off", async () => {
    const { supabase, reads } = complianceDb({ personal_memories: [{ id: noteId, title: "private memory", content: "never fetched" }] });
    const tools = memoryTools.build({ supabase, userId: owner, timezone: "Asia/Shanghai" });
    expect(await tools.getRelevantMemories.execute!({ includeProfile: true, includeWorking: true, includeDecisions: true, limit: 12 }, options)).toMatchObject({ blocked: "memory_opt_in_required", profileAndWorking: [] });
    expect(await tools.searchMemory.execute!({ query: "private", limit: 8 }, options)).toMatchObject({ blocked: "memory_opt_in_required", results: [] });
    await searchTools.build({ supabase, userId: owner, timezone: "Asia/Shanghai" }).searchPersonalOs.execute!({ query: "private", domains: ["memory"], limit: 8 }, options);
    expect(reads).not.toContain("personal_memories");
    expect(reads).not.toContain("decisions");
  });
  it("enforces the cumulative setting across tools and collects single-note sources with real IDs", async () => {
    const notes = [1, 2].map(n => ({ id: `${noteId.slice(0,-1)}${n}`, title: `note ${n}`, body_markdown: "x".repeat(650), revision: 1, content_hash: "hash", content_origin: "human", ai_visibility: "normal", status: "active", archived_at: null, deleted_at: null }));
    const { supabase } = complianceDb({ notes });
    const sources: AssistantStreamSource[] = [];
    const tools = buildAssistantTools({ supabase, userId: owner, policy: { context: "personal", tools: ["notes_read"], maxSteps: 4, maxOutputTokens: 1200, instruction: "" }, toolNames: ["readNote"], governance: { ...defaultAiGovernance, maxContextCharsPerRequest: 1200 }, onSources: rows => sources.push(...rows) });
    expect(await tools.readNote.execute!({ noteId, maxChars: 6000 }, options)).toMatchObject({ note: { id: noteId } });
    expect(await tools.readNote.execute!({ noteId: notes[1].id, maxChars: 6000 }, options)).toMatchObject({ blocked: "ai_context_limit" });
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ entityId: noteId, entityType: "note", domain: "notes" });
  });
  it("keeps memory opt-in enforcement even through the registry wrapper", async () => {
    const { supabase, reads } = complianceDb({});
    const tools = buildAssistantTools({ supabase, userId: owner, policy: { context: "personal", tools: ["memory_read"], maxSteps: 1, maxOutputTokens: 1200, instruction: "" }, toolNames: ["getRelevantMemories"] });
    expect(await tools.getRelevantMemories.execute!({}, options)).toMatchObject({ blocked: "memory_opt_in_required" });
    expect(reads).toEqual([]);
  });
  it("reports nested memories and decisions as actual sources when enabled", async () => {
    state.memory = true;
    const { supabase } = complianceDb({ personal_memories: [{ id: noteId, title: "memory", content: "synthetic", memory_type: "profile", status: "active", ai_visibility: "normal" }], decisions: [{ id: owner, title: "decision", status: "active", ai_visibility: "normal" }] });
    const onSources = vi.fn();
    const tools = buildAssistantTools({ supabase, userId: owner, policy: { context: "personal", tools: ["memory_read"], maxSteps: 1, maxOutputTokens: 1200, instruction: "" }, toolNames: ["getRelevantMemories"], onSources });
    await tools.getRelevantMemories.execute!({ includeProfile: true, includeWorking: false, includeDecisions: true, limit: 12 }, options);
    expect(onSources).toHaveBeenCalledWith(expect.arrayContaining([expect.objectContaining({ entityId: noteId, title: "memory" }), expect.objectContaining({ entityId: owner, title: "decision" })]));
  });
  it("separates citation IDs from entity IDs, including safe legacy note links", () => {
    expect(sourceEntityId({ id: "S1", entityId: noteId, domain: "notes" })).toBe(noteId);
    expect(sourceEntityId({ id: "S1", href: `/notes/${noteId}`, domain: "notes" })).toBe(noteId);
    expect(sourceEntityId({ id: "S1", href: "https://untrusted.example/notes/bad", domain: "notes" })).toBeNull();
  });
});
