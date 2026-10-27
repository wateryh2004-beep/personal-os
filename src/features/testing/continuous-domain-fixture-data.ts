import type { ComponentProps } from "react";
import type { TripDetail } from "@/components/travel/trip-detail";
import type { CareerMaterialChecklist } from "@/components/career/material-checklist";
import type { LeisureExperience } from "@/features/leisure/types";
import type { InvestmentWorkspaceData } from "@/features/investment/types";
import type { InvestmentDailyData } from "@/features/investment/daily-types";
import { fixtureFiles, fixtureOwner, fixtureTimestamp } from "./continuous-fixture-data";
export const fixtureShopping = [
  { id: "ea000000-0000-4000-8000-000000000001", title: "合成采购：燕麦", category: "合成食品", price_cny: 22.5, necessity: "necessary", status: "ready", cooldown_until: null, quantity: "2.125", quantity_unit: "千克", mutation_revision: 1 },
  { id: "ea000000-0000-4000-8000-000000000002", title: "合成购后记录", category: null, price_cny: null, necessity: "unknown", status: "purchased", cooldown_until: null, quantity: "1", quantity_unit: "份", mutation_revision: 1 },
];
export const fixtureTrip: Pick<ComponentProps<typeof TripDetail>, "trip" | "stops" | "documents" | "availableDocuments"> = {
  trip: { id: "eb000000-0000-4000-8000-000000000001", title: "合成旅行路线", status: "planning", description: "未知站点也保留在路线中。", start_date: "2026-11-01", end_date: "2026-11-02", mutation_revision: 1, current_stop_id: "eb000000-0000-4000-8000-000000000011", next_stop_id: "eb000000-0000-4000-8000-000000000012" },
  stops: [
    { id: "eb000000-0000-4000-8000-000000000011", place_name: "合成第一站", day_number: 1, sort_order: 0, latitude: 31.23, longitude: 121.47, notes: "合成路线备注", planned_time: "09:15:00", duration_minutes: 45, mutation_revision: 1, arrived_at: null },
    { id: "eb000000-0000-4000-8000-000000000012", place_name: "合成下一站", day_number: 1, sort_order: 1, latitude: 31.24, longitude: 121.48, notes: null, planned_time: "09:30:00", duration_minutes: 60, mutation_revision: 1, arrived_at: null },
    { id: "eb000000-0000-4000-8000-000000000013", place_name: "坐标与日期待定站", day_number: null, sort_order: 2, latitude: null, longitude: null, notes: null, planned_time: null, duration_minutes: null, mutation_revision: 1, arrived_at: null },
  ], documents: [{ id: fixtureFiles[0].id, title: fixtureFiles[0].title, mime_type: "application/pdf", storage_state: "available" }], availableDocuments: [{ id: fixtureFiles[0].id, title: fixtureFiles[0].title, mime_type: "application/pdf", storage_state: "available" }],
};
export const fixtureMaterials: Omit<ComponentProps<typeof CareerMaterialChecklist>, "transport"> = {
  opportunityId: "ec000000-0000-4000-8000-000000000001",
  checks: [{ id: "ec000000-0000-4000-8000-000000000011", user_id: fixtureOwner, opportunity_id: "ec000000-0000-4000-8000-000000000001", label: "核对合成文件", required: true, document_id: fixtureFiles[0].id, resume_version_id: "ec000000-0000-4000-8000-000000000021", verified_at: fixtureTimestamp, verified_object_revision: `document:${fixtureFiles[0].id}:1|resume:ec000000-0000-4000-8000-000000000021:${fixtureTimestamp}`, note: "原人工核验备注", revision: 1, created_at: fixtureTimestamp, updated_at: fixtureTimestamp, archived_at: null }],
  documents: [{ id: fixtureFiles[0].id, title: fixtureFiles[0].title, storage_state: "available", mutation_revision: 1 }], resumes: [{ id: "ec000000-0000-4000-8000-000000000021", title: "合成已确认简历", status: "approved", updated_at: fixtureTimestamp }],
};
export const fixtureLeisure: LeisureExperience[] = [70, 90, null].map((remaining, index) => ({ id: `ed000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, title: remaining === null ? "合成闲暇：未知时长的书" : `合成闲暇：还需${remaining}分钟`, kind: remaining === null ? "book" : "film", why: "用于验证自己的进度与筛选。", body_markdown: "## 合成作品手记\n\n保留自己的感受，不推测完成状态。", how_to_start: "从自己记录的位置继续", duration_minutes: remaining === null ? null : 120, platform: "合成平台", location: null, starts_at: null, cost_text: null, setting: "home", company: "solo", budget: "unknown", content_revision: 1, created_at: fixtureTimestamp, updated_at: fixtureTimestamp, sources: [], ratings: [], feedback: { status: "current", reaction: "none", personal_note: "合成个人感想", linked_note_id: null, linked_note_title: null, linked_note_available: false, revision: 1, updated_at: fixtureTimestamp, progress_unit: remaining === null ? "page" : "minute", progress_value: remaining === null ? 42 : 120 - remaining, progress_total: remaining === null ? 200 : 120 } }));
export const fixtureInvestment: InvestmentWorkspaceData = {
  accounts: [{ id: "ee000000-0000-4000-8000-000000000001", name: "合成实盘人民币账户", currency: "CNY", mode: "real", revision: 1 }, { id: "ee000000-0000-4000-8000-000000000002", name: "合成模拟美元账户", currency: "USD", mode: "paper", revision: 1 }, { id: "ee000000-0000-4000-8000-000000000003", name: "合成缺报价港币账户", currency: "HKD", mode: "real", revision: 1 }],
  entries: [{ id: "ee000000-0000-4000-8000-000000000011", account_id: "ee000000-0000-4000-8000-000000000001", sequence: 1, kind: "buy", void_entry_id: null, symbol: "SYNTH", occurred_on: "2026-10-26", quantity: "2", price: "20", fees: "1", source: "合成手工记录", import_key: "ee000000-0000-4000-8000-000000000021", created_at: fixtureTimestamp }, { id: "ee000000-0000-4000-8000-000000000012", account_id: "ee000000-0000-4000-8000-000000000003", sequence: 1, kind: "opening", void_entry_id: null, symbol: "UNKNOWN", occurred_on: "2026-10-26", quantity: "1", price: null, fees: "0", source: "合成未知成本", import_key: "ee000000-0000-4000-8000-000000000022", created_at: fixtureTimestamp }], strategies: [], research: [], unavailable: false,
};
export const fixtureInvestmentDaily: InvestmentDailyData = {
  cashEntries: [{ id: "ee000000-0000-4000-8000-000000000031", account_id: fixtureInvestment.accounts[0].id, sequence: 2, kind: "opening", void_entry_id: null, symbol: null, occurred_on: "2026-10-25", amount: "1000", tax: "0", fees: "0", source: "合成期初现金", import_key: "ee000000-0000-4000-8000-000000000041", created_at: fixtureTimestamp }],
  quotes: [{ id: "ee000000-0000-4000-8000-000000000032", account_id: fixtureInvestment.accounts[0].id, sequence: 3, symbol: "SYNTH", currency: "CNY", price: "25", as_of: fixtureTimestamp, source_kind: "manual", source: "合成报价", import_key: "ee000000-0000-4000-8000-000000000042", created_at: fixtureTimestamp }], unavailable: false, checkedAt: fixtureTimestamp,
};
export const fixturePracticeIds = { preparation: "ec100000-0000-4000-8000-000000000001", question: "ec100000-0000-4000-8000-000000000002", parent: "ec100000-0000-4000-8000-000000000003" };
export const fixturePracticeAttempts = [fixturePracticeIds.parent, "ec100000-0000-4000-8000-000000000004"].map((id, index) => ({ id, preparation_id: fixturePracticeIds.preparation, story_id: null, issue_tags: ["answer_not_direct"], strength_tags: [], practiced_at: `2026-10-${26 - index}T09:00:00Z`, duration_seconds: 90, next_focus: `合成重点${index + 1}：先给结论`, prompt_snapshot: "合成问题：如何核对资料？" }));
export const fixtureBriefingEntryId = "ef100000-0000-4000-8000-000000000001";
export const fixtureBriefingView: import("@/components/briefing/briefing-workspace-view").BriefingViewData = {
  date: "2026-10-27", timezone: "UTC", unavailable: false, todayGenerating: null,
  briefing: { id: "ef100000-0000-4000-8000-000000000002", briefing_date: "2026-10-27", status: "completed", generated_at: fixtureTimestamp, ranking_method: "deterministic", candidate_count: 2, selected_count: 1, ai_call_count: 0, input_tokens: 0, output_tokens: 0, ai_failure_code: null },
  entries: [{ id: fixtureBriefingEntryId, judgment: null, summary: "合成事件的来源原文与我的判断分别保存。", feed_items: { id: "ef100000-0000-4000-8000-000000000003", title: "合成资讯：核对相同事件的新来源", url: null, canonical_url: null, published_at: fixtureTimestamp, feeds: { title: "合成原始来源", category: "学习" } } }],
};

export const fixtureUnknownTask: import("@/features/tasks/types").TodoTask = { ...fixtureTaskForUnknown(), id: "e5000000-0000-4000-8000-000000000003", providerTaskId: "synthetic-unknown-task", title: "合成任务：估时尚未记录" };
function fixtureTaskForUnknown(): import("@/features/tasks/types").TodoTask { return { id: "e5000000-0000-4000-8000-000000000003", providerTaskId: "synthetic-unknown-task", todoListId: "e5000000-0000-4000-8000-000000000002", title: "合成任务：估时尚未记录", bodyText: null, status: "notStarted", importance: "normal", dueAt: null, completedAt: null, lastModifiedAt: fixtureTimestamp }; }
export const fixtureBriefingEvents: Omit<ComponentProps<typeof import("@/components/briefing/briefing-events").BriefingEvents>,"transport">={
 events:[{id:"ef200000-0000-4000-8000-000000000001",user_id:fixtureOwner,title:"合成事件：同一事实的来源变化",revision:1,created_at:fixtureTimestamp,updated_at:fixtureTimestamp,archived_at:null}],
 sources:[{id:"ef200000-0000-4000-8000-000000000011",user_id:fixtureOwner,event_id:"ef200000-0000-4000-8000-000000000001",feed_item_id:"ef100000-0000-4000-8000-000000000003",revision:1,created_at:fixtureTimestamp,updated_at:fixtureTimestamp,archived_at:null}],
 items:[{id:"ef100000-0000-4000-8000-000000000003",title:"合成原始来源1",url:null,published_at:fixtureTimestamp,fetched_at:fixtureTimestamp},{id:"ef100000-0000-4000-8000-000000000004",title:"合成原始来源2",url:null,published_at:fixtureTimestamp,fetched_at:fixtureTimestamp}],
 versions:[1,2].map(index=>({id:`ef200000-0000-4000-8000-00000000002${index}`,user_id:fixtureOwner,feed_item_id:"ef100000-0000-4000-8000-000000000003",title:`合成原始来源1版本${index}`,content_text:`合成原文版本${index}：保留原始证据。`,excerpt:null,url:null,content_hash:`synthetic-hash-${index}`,published_at:fixtureTimestamp,updated_at_source:null,observed_at:index===1?"2026-10-26T09:00:00Z":fixtureTimestamp,provenance:"feed_refresh"})),truncated:false,entries:[],judgments:[],
};
