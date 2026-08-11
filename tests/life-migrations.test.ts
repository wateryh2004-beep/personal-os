import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = (name: string) => readFileSync(resolve(process.cwd(), "supabase/migrations", name), "utf8");

describe("Life workspace migrations", () => {
  it("protects purchase items with owner-bound RLS and lifecycle constraints", () => {
    const sql = migration("20260811120000_shopping_decision_system.sql");
    expect(sql).toContain("alter table public.purchase_items enable row level security");
    expect(sql).toContain("purchase_items_select_own");
    expect(sql).toContain("(select auth.uid())=user_id");
    expect(sql).toContain("necessity in ('unknown','necessary','nonessential')");
  });
  it("protects trips and stops through both the stop owner and its parent trip", () => {
    const sql = migration("20260811130000_travel_workspace.sql");
    expect(sql).toContain("alter table public.trips enable row level security");
    expect(sql).toContain("alter table public.trip_stops enable row level security");
    expect(sql).toContain("exists(select 1 from public.trips where id=trip_id and user_id=(select auth.uid()))");
  });
  it("indexes active Shopping and Travel records for global search", () => {
    const sql = migration("20260811140000_travel_shopping_global_search.sql");
    expect(sql).toContain("'shopping','travel'");
    expect(sql).toContain("search_purchase_items");
    expect(sql).toContain("search_trips");
    expect(sql).toContain("status not in ('archived','abandoned')");
  });
  it("persists the Graph delta cursor and its bounded calendar window", () => {
    const sql = migration("20260811150000_calendar_delta_sync.sql");
    expect(sql).toContain("calendar_delta_link text");
    expect(sql).toContain("calendar_sync_window_start timestamptz");
    expect(sql).toContain("calendar_sync_window_end timestamptz");
  });
});
