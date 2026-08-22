import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260823003500_restore_lightweight_notes_listing.sql";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Notes workspace listing performance boundary", () => {
  it("keeps full-body excerpt work out of the navigator RPC", () => {
    const migration = source(migrationPath);
    expect(migration).toContain("null::text as excerpt");
    expect(migration).toContain("note.content_origin");
    expect(migration).not.toContain("regexp_replace(");
    expect(migration).not.toContain("body_markdown");
  });

  it("keeps high-frequency Notes and profile RLS on InitPlan auth checks", () => {
    const migration = source(migrationPath);
    expect(migration).toContain('alter policy "notes_select_own"');
    expect(migration).toContain('alter policy "profiles_select_own"');
    expect(migration.match(/\(select auth\.uid\(\)\)/g)?.length).toBeGreaterThanOrEqual(8);
  });

  it("documents that RPC list excerpts are intentionally absent", () => {
    const types = source("src/features/notes/types.ts");
    expect(types).toContain("always null from the RPC listing");
  });
});
