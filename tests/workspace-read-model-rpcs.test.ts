import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260823005000_workspace_read_model_rpcs.sql";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("workspace read-model RPC performance boundary", () => {
  it("defines one owner-scoped RPC per high-frequency workspace", () => {
    const migration = source(migrationPath);
    expect(migration).toContain("get_tasks_workspace_read_model()");
    expect(migration).toContain("get_calendar_workspace_read_model()");
    expect(migration).toContain("get_today_workspace_read_model(");
    expect(migration.match(/security invoker/g)?.length).toBe(3);
    expect(migration.match(/set search_path = ''/g)?.length).toBe(3);
  });

  it("keeps RPC execution private to authenticated callers", () => {
    const migration = source(migrationPath);
    expect(migration.match(/revoke all on function/g)?.length).toBe(3);
    expect(migration.match(/grant execute on function/g)?.length).toBe(3);
    expect(migration.match(/to authenticated;/g)?.length).toBe(3);
  });

  it("keeps Today date bounds and briefing selection inside the database read model", () => {
    const migration = source(migrationPath);
    expect(migration).toContain("date_trunc(");
    expect(migration).toContain("recent_briefings as");
    expect(migration).toContain("limit 20");
    expect(migration).toContain("join public.feed_items as item");
    expect(migration).toContain("'weekly:'");
  });

  it("restores InitPlan ownership checks for the high-frequency Inbox path", () => {
    const migration = source(migrationPath);
    expect(migration).toContain('alter policy "inbox_select_own"');
    expect(migration).toContain("user_id = (select auth.uid())");
  });

  it("uses compact RPCs as the primary path while retaining legacy fallbacks", () => {
    const tasks = source("src/features/tasks/queries.ts");
    const calendar = source("src/features/calendar/queries.ts");
    const today = source("src/features/today/queries.ts");

    expect(tasks).toContain('rpc("get_tasks_workspace_read_model")');
    expect(calendar).toContain('rpc("get_calendar_workspace_read_model")');
    expect(today).toContain('rpc("get_today_workspace_read_model"');

    expect(tasks).toContain("getMicrosoftTodoWorkspaceLegacy");
    expect(calendar).toContain("getCalendarWorkspaceLegacy");
    expect(today).toContain("getTodayWorkspaceSourcesLegacy");

    expect(tasks).toContain('.from("microsoft_todo_tasks")');
    expect(calendar).toContain('.from("calendar_categories")');
    expect(today).toContain('.from("calendar_events")');
  });

  it("leaves Today judgment and presentation logic in TypeScript", () => {
    const today = source("src/features/today/queries.ts");
    expect(today).toContain("buildProactiveInsights");
    expect(today).toContain("buildNowCommitments");
    expect(today).toContain("selectNextAction");
    expect(today).toContain("buildTodayBrief");
  });
});
