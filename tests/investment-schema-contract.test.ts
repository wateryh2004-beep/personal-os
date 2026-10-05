import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sql = readFileSync("docs/sql/investment-v1-candidate.sql", "utf8");
// Static contract checks only: these do NOT replace execution in a local PostgreSQL instance.
describe("investment migration candidate security contract", () => {
  it("keeps the CLI-generated production migration identical to reviewed SQL", () => {
    const names = readdirSync("supabase/migrations").filter((name) => name.endsWith("_investment_journal_v1.sql"));
    expect(names).toHaveLength(1);
    const statements = (value: string) => value.split("\n").filter((line) => !line.trimStart().startsWith("--")).join("\n").trim();
    expect(statements(readFileSync(`supabase/migrations/${names[0]}`, "utf8"))).toBe(statements(sql));
  });
  it("removes inherited client execution from the trigger-only validator", () => {
    const names = readdirSync("supabase/migrations").filter((name) => name.endsWith("_investment_trigger_execute_boundary.sql"));
    expect(names).toHaveLength(1);
    const boundary = readFileSync(`supabase/migrations/${names[0]}`, "utf8");
    expect(boundary).toContain("revoke all on function public.validate_investment_entry() from authenticated;");
    expect(boundary).toContain("create index investment_ledger_account_owner on public.investment_ledger(account_id,user_id);");
  });
  it("enables RLS and removes anonymous grants for each dedicated table", () => { for (const table of ["investment_accounts","investment_ledger","investment_strategy_versions","investment_research_runs"]) expect(sql).toContain(`alter table public.${table} enable row level security`); expect(sql).toContain("from anon, authenticated;"); expect(sql).not.toContain("security definer"); });
  it("makes ledger and strategy/research records append-only to the application", () => { expect(sql).not.toMatch(/grant\s+(?:[^;]*,)?(?:update|delete)[^;]*on\s+public\.investment_(?:ledger|strategy|research)/i); expect(sql).toContain("foreign key (account_id,user_id)"); expect(sql).toContain("foreign key (strategy_version_id,user_id)"); });
  it("locks account revisions and refuses changed retries", () => { expect(sql).toContain("for update;"); expect(sql).toContain("current_revision<>p_expected_revision"); expect(sql).toContain("prior.payload_hash<>p_payload_hash"); expect(sql).toContain("unique (user_id,import_key)"); });
  it("compares actual replay fields and audits direct inserts", () => { expect(sql).toContain("jsonb_build_object('kind',prior.kind"); expect(sql).toContain("jsonb_build_object('title',prior.title"); for (const table of ["investment_accounts","investment_ledger","investment_strategy_versions","investment_research_runs"]) expect(sql).toContain(`after insert on public.${table} for each row execute function public.audit_investment_insert()`); });
  it("validates nested research JSON in SQL as well as the app", () => { expect(sql).toContain("check (public.valid_investment_research_json(kind,as_of,source_urls,provenance,metrics))"); expect(sql).toContain("jsonb_typeof(p_provenance->key) is distinct from 'string'"); expect(sql).toContain("jsonb_typeof(p_metrics->'total_return_pct') is distinct from 'string'"); expect(sql).toContain("for item in select value from jsonb_array_elements(p_sources)"); });
  it("preserves correction targets and rejects duplicate/unsafe voids", () => { expect(sql).toContain("foreign key (void_entry_id,user_id)"); expect(sql).toContain("unique (account_id,void_entry_id)"); expect(sql).toContain("target.kind='void'"); expect(sql).toContain("e.id<>new.void_entry_id"); });
  it("keeps all strategy versions under a compound unique key", () => { expect(sql).toContain("unique (user_id,strategy_key,version)"); expect(sql).toContain("coalesce(max(version),0)+1"); });
  it("guards direct ledger inserts and makes audits part of append transactions", () => { expect(sql).toContain("before insert on public.investment_ledger"); expect(sql).toContain("if running_quantity < 0"); expect(sql).toContain("investment_entry_append"); expect(sql).toContain("investment_strategy_version_append"); expect(sql).toContain("investment_research_import"); });
});
