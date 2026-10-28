import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20261028073144_experience_library_v1.sql",
  "utf8",
);
const backupSchema = JSON.parse(
  readFileSync("src/features/system-backup/schema.json", "utf8"),
) as {
  tables: Record<string, { columns: Record<string, unknown> }>;
  excludedTables: Record<string, string>;
};

describe("Experience Library database boundary", () => {
  it("enables forced owner RLS and append-only capture storage", () => {
    for (const table of [
      "experience_library_entries",
      "experience_library_captures",
      "experience_library_media",
      "experience_library_ai_settings",
    ]) {
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`alter table public.${table} force row level security`);
    }
    expect(sql).toContain("before update or delete on public.experience_library_captures");
    expect(sql).toContain("experience library captures are append-only");
    expect(sql).not.toMatch(/grant[^;]*delete[^;]*experience_library_captures/i);
  });

  it("checks entry, capture, text selection and sealed document ownership in the database", () => {
    const trigger = sql.slice(
      sql.indexOf("create or replace function public.ensure_experience_library_media_owner"),
      sql.indexOf("create trigger experience_library_media_owner_integrity"),
    );
    expect(trigger).toContain("capture_entry <> new.entry_id");
    expect(trigger).toContain("selection is outside the capture or splits a character");
    expect(trigger).toContain("selection quote does not match the capture");
    expect(trigger).toContain("document_owner <> new.user_id");
    expect(trigger).toContain("document_state <> 'available'");
    expect(trigger).toContain("document_provider <> 'cloudflare_r2'");
    expect(trigger).toContain("document_mime not in ('image/png'");
    expect(sql).toContain("unique (user_id, request_id)");
    expect(sql).toContain("experience_library_captures_owner_integrity");
    expect(sql).toContain("entry is unavailable or not owned");
    expect(sql).toContain("create or replace function public.search_experience_library");
    expect(sql).toContain("capture.user_id = (select auth.uid())");
    expect(sql).toContain("limit 60");
    expect(sql).not.toContain("search_documents");
  });

  it("classifies durable metadata for backup while excluding encrypted provider credentials", () => {
    for (const table of [
      "experience_library_entries",
      "experience_library_captures",
      "experience_library_media",
    ]) {
      expect(backupSchema.tables[table]).toBeDefined();
      expect(backupSchema.tables[table].columns.user_id).toEqual({
        type: "uuid",
        nullable: false,
      });
    }
    expect(backupSchema.tables.experience_library_media.columns.document_id).toEqual({
      type: "uuid",
      nullable: false,
    });
    expect(backupSchema.tables.experience_library_captures.columns.raw_content).toEqual({
      type: "string",
      nullable: false,
    });
    expect(backupSchema.excludedTables.experience_library_ai_settings).toContain("credentials");
    expect(JSON.stringify(backupSchema.tables)).not.toContain("api_key_ciphertext");
  });
});
