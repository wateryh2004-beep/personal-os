import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { entityHref } from "@/features/search/queries";
import { searchDomains, searchInputSchema } from "@/features/search/types";

const migration = readFileSync(
  "supabase/migrations/20260809092458_notes_workspace_listing_and_project_search.sql",
  "utf8",
);

describe("Projects Global Search", () => {
  it("accepts projects as a first-class search domain", () => {
    expect(searchDomains).toContain("projects");
    expect(
      searchInputSchema.parse({ query: "Personal OS", domains: ["projects"] }),
    ).toMatchObject({ domains: ["projects"] });
  });

  it("opens project search results in the existing Projects workspace", () => {
    expect(
      entityHref(
        "project",
        "20cbfbca-c1af-40aa-9796-7564f985f009",
        "projects",
        {},
      ),
    ).toBe("/projects");
  });

  it("indexes active projects and removes deleted or archived documents", () => {
    expect(migration).toContain("create or replace function public.sync_project_search_document()");
    expect(migration).toContain("if tg_op = 'DELETE' then");
    expect(migration).toContain("if new.archived_at is not null then");
    expect(migration).toContain("entity_type = 'project'");
    expect(migration).toContain("where project.archived_at is null");
    expect(migration).toContain("on conflict (user_id, entity_type, entity_id) do update");
    expect(migration).not.toContain("service_role");
  });

  it("keeps the Notes listing RPC owner-scoped and body-free", () => {
    expect(migration).toContain("security invoker");
    expect(migration).toContain("note.user_id = (select auth.uid())");
    expect(migration).toContain("grant execute on function public.list_notes_workspace(integer, integer)");
    expect(migration).not.toMatch(/returns table[\s\S]{0,220}body_markdown/);
  });
});
