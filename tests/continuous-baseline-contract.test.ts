import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("runs the baseline gap runner boundaries without connecting to PostgreSQL", () => {
  const output = execFileSync("python3", ["-m", "unittest", "discover", "-s", "tests", "-p", "test_continuous_baseline.py"], { encoding: "utf8", stdio: "pipe" });
  expect(output).toBe("");
});

it("upgrades only the fingerprinted legacy completion and otherwise repairs missing objects", () => {
  const sql = readFileSync("supabase/migrations/20261027175718_continuous_production_baseline.sql", "utf8");
  expect(sql.match(/^create function public\./gm)).toHaveLength(5);
  expect(sql.match(/create or replace function public\.complete_review_with_sources/g)).toHaveLength(1);
  expect(sql).toContain("baseline_compatibility_completion_definition_unrecognized");
  expect(sql).toContain("elsif needs_upgrade then");
  expect(sql).not.toContain("security definer");
  expect(sql).not.toMatch(/alter table|schema_migrations|create table|drop function|drop trigger|agent_runs_surface_check/i);
  expect(sql).toContain("needs_backfill:=true");
  expect(sql).toContain("if needs_backfill then");
  expect(sql).toContain("where indexed.entity_type='project'");
  expect(sql).toContain("project.user_id=indexed.user_id");
});
