-- Supabase can grant authenticated EXECUTE through database default privileges.
-- This function is only invoked by its existing table trigger, never a client RPC.
begin;
revoke all on function public.validate_investment_entry() from authenticated;
-- Cover the account ownership foreign key in its declared column order.
create index investment_ledger_account_owner on public.investment_ledger(account_id,user_id);
commit;
