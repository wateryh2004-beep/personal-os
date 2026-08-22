import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, "utf8");

describe("AI governance guardrails", () => {
  it("stores consent and audit data under RLS without raw model payload fields", () => {
    const migration = read("supabase/migrations/20260822031335_ai_governance_boundaries.sql");
    expect(migration).toContain("alter table public.ai_governance_settings enable row level security");
    expect(migration).toContain("alter table public.ai_request_audits enable row level security");
    expect(migration).toContain("revoke insert, update, delete on public.ai_request_audits from authenticated");
    expect(migration).toContain("no prompt body, model output, provider payload, API key, or reasoning chain");
  });

  it("fails closed for Notes and Files without normal AI visibility", () => {
    expect(read("src/features/assistant/retrieval/notes.ts")).toContain('if (error) return []');
    expect(read("src/features/assistant/tools/files.ts")).toContain('.eq("ai_visibility", "normal")');
    expect(read("src/features/assistant/tools/memory.ts")).toContain('.eq("ai_visibility", "normal")');
  });

  it("keeps assistant writes behind proposals and exposes a per-source opt-out", () => {
    expect(read("src/features/assistant/tools/notes.ts")).toContain("不会直接创建");
    expect(read("src/components/assistant/agent-sources.tsx")).toContain("不再使用");
    expect(read("src/features/ai/actions.ts")).toContain("blockAiSource");
  });
});
