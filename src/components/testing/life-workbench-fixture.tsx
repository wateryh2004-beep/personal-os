"use client";
import { useEffect } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { WorkspaceIdentityBoundary } from "@/components/layout/workspace-identity-boundary";
import { ShoppingWorkspace } from "@/components/shopping/shopping-workspace";
import { TripDetail } from "@/components/travel/trip-detail";
import { LeisureHome } from "@/components/leisure/leisure-home";
import { workbenchEntityResource } from "@/features/workbench/resource";
import type { LeisureSummary } from "@/features/leisure/types";
import type { WorkbenchEntity } from "@/features/workbench/contracts";

const timestamp = "2026-10-25T00:00:00Z";
export const lifeFixtureShopping = [
  { id: "20000000-0000-4000-8000-000000000001", title: "合成采购 · 燕麦", category: "合成食品", price_cny: 22.5, necessity: "necessary", status: "ready", cooldown_until: null, quantity: "2.125", quantity_unit: "千克", mutation_revision: 1 },
  { id: "20000000-0000-4000-8000-000000000002", title: "合成采购 · 水杯", category: "合成用品", price_cny: 38, necessity: "necessary", status: "ready", cooldown_until: null, quantity: "1", quantity_unit: "只", mutation_revision: 1 },
  { id: "20000000-0000-4000-8000-000000000003", title: "合成候选 · 等待比较", category: null, price_cny: null, necessity: "unknown", status: "cooling", cooldown_until: "2099-01-01T00:00:00Z", quantity: null, quantity_unit: null, mutation_revision: 1 },
  { id: "20000000-0000-4000-8000-000000000004", title: " 合成采购 · 燕麦 ", category: "合成食品", price_cny: 15, necessity: "nonessential", status: "ready", cooldown_until: null, quantity: "2", quantity_unit: "袋", mutation_revision: 1 },
  { id: "20000000-0000-4000-8000-000000000005", title: "合成采购 · 燕麦", category: "合成食品", price_cny: null, necessity: "unknown", status: "inbox", cooldown_until: null, quantity: null, quantity_unit: null, mutation_revision: 1 },
];
const tripId = "30000000-0000-4000-8000-000000000001";
const stops = [
  { id: "40000000-0000-4000-8000-000000000001", place_name: "合成旅行 · 第一站", day_number: 1, sort_order: 0, latitude: null, longitude: null, notes: "合成路线备注，仅供界面验证", planned_time: "09:15:00", duration_minutes: 45, mutation_revision: 1, arrived_at: timestamp },
  { id: "40000000-0000-4000-8000-000000000002", place_name: "合成旅行 · 下一站", day_number: 1, sort_order: 1, latitude: null, longitude: null, notes: null, planned_time: "13:30:00", duration_minutes: 60, mutation_revision: 1, arrived_at: null },
];
const documents = [{ id: "50000000-0000-4000-8000-000000000001", title: "合成预订票据.pdf", mime_type: "application/pdf", storage_state: "available" }];
const experiences: LeisureSummary[] = [{ id: "60000000-0000-4000-8000-000000000001", title: "合成闲暇 · 正在读的书", kind: "book", why: "仅供验证用户明确记录的页码进度", how_to_start: "从自己记录的位置继续", duration_minutes: null, platform: "合成平台", location: null, starts_at: null, cost_text: null, setting: "home", company: "solo", budget: "unknown", content_revision: 1, created_at: timestamp, updated_at: timestamp, feedback: { status: "current", reaction: "none", personal_note: "合成感想", linked_note_id: null, linked_note_title: null, linked_note_available: false, revision: 1, updated_at: timestamp, progress_unit: "page", progress_value: 42, progress_total: 200 } }];
function Content({ workspace }: { workspace: string }) {
  useEffect(() => {
    for (const item of lifeFixtureShopping) {
      const entity: WorkbenchEntity = { ref: { kind: "shopping", id: item.id }, title: item.title, href: `/shopping/${item.id}`, subtitle: item.category, fields: [{ key: "price", label: "价格（CNY）", value: item.price_cny === null ? null : String(item.price_cny) }, { key: "quantity", label: "数量", value: item.quantity ? `${item.quantity} ${item.quantity_unit}` : null }], sourceUrls: [], asOf: timestamp, currency: "CNY" };
      workbenchEntityResource(entity.ref).set({ status: "ready", entity });
    }
  }, []);
  return <div data-testid="life-workbench-fixture"><p className="mb-4 border-b pb-3 text-sm">合成生活数据 · 本地/CI阻断全部真实写入</p>{workspace === "travel" ? <TripDetail trip={{ id: tripId, title: "合成旅行现场", status: "planning", description: "仅用于界面验证", start_date: "2026-11-01", end_date: "2026-11-02", mutation_revision: 1, current_stop_id: stops[0].id, next_stop_id: stops[1].id }} stops={stops} documents={documents} availableDocuments={documents} /> : workspace === "leisure" ? <LeisureHome experiences={experiences} /> : <ShoppingWorkspace items={lifeFixtureShopping} stats={{ active: 5, ready: 3, purchased: 0 }} initialCreateOpen={false} />}</div>;
}
/** Only imported from the existing E2E_MOBILE_HARNESS route; never a business data source. */
export function LifeWorkbenchFixture({ workspace = "shopping" }: { workspace?: string }) {
  const active = ["shopping", "travel", "leisure"].includes(workspace) ? workspace : "shopping";
  return <WorkspaceIdentityBoundary ownerId="synthetic-life-owner" revision="life-workbench-v2"><AppShell presentationPathname={active === "travel" ? `/travel/${tripId}` : `/${active}`}><Content workspace={active} /></AppShell></WorkspaceIdentityBoundary>;
}
