import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sql=readFileSync("supabase/migrations/20261007093144_investment_daily_overview.sql","utf8");
describe("daily migration review boundaries",()=>{
  it("is additive, unseeded, invoker-only, owner-scoped and append-only",()=>{
    expect(sql.toLowerCase()).not.toContain("security definer");expect(sql.toLowerCase()).not.toMatch(/drop\s+(table|policy|function)/);
    for(const table of ["investment_cash_ledger","investment_quotes"]) expect(sql).toContain(`alter table public.${table} enable row level security`);
    expect(sql.match(/foreign key\(account_id,user_id\) references public.investment_accounts\(id,user_id\)/g)).toHaveLength(2);
    expect(sql).toContain("grant select,insert on public.investment_cash_ledger,public.investment_quotes to authenticated");
    expect(sql).not.toMatch(/grant\s+(update|delete|all)/i);
    expect(sql).toContain("from public,anon,authenticated");
    expect(sql.match(/\(select auth.uid\(\)\)=user_id/g)).toHaveLength(4);
  });
  it("keeps date/currency checks, shared lock, immutable voids and atomic audit",()=>{
    for(const marker of ["new.currency<>account.currency","new.as_of>now()","for update","new.sequence:=account.revision+1","quote timezone required","unique(account_id,void_entry_id)","foreign key(void_entry_id,user_id)","investment_cash_audit after insert","investment_quote_audit after insert"]) expect(sql).toContain(marker);
  });
  it("registers actual PostgreSQL regression, contention and browser gates in CI",()=>{
    const workflow=readFileSync(".github/workflows/verify.yml","utf8");
    for(const file of ["*_investment_daily_overview.sql","daily-regression.sql","investment-daily-sql-concurrency.py","investment-daily-e2e.cjs"]) expect(workflow).toContain(file);
  });
});
