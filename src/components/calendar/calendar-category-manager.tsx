"use client";

import { useActionState } from "react";
import { backfillCalendarCategoriesAction, initializeCalendarCategoriesAction, updateCalendarCategoryAiAction, updateCalendarCategoryColorAction, updateCalendarEvent, type CalendarBackfillState, type CalendarCreateState } from "@/features/calendar/actions";
import type { CalendarCategory } from "@/features/calendar/categories/types";
import { outlookCategoryPalette } from "@/features/calendar/categories/visual";
import { MicrosoftDeviceConnect } from "@/components/calendar/microsoft-device-connect";
import { classifyCalendarEvent } from "@/features/calendar/classification/classifier";
import { getManagedCalendarCategory, primaryCalendarCategories } from "@/features/calendar/classification/taxonomy";
import type { CalendarEventRecord } from "@/features/calendar/types";

const initial: CalendarCreateState = { status: "idle", message: "" };
const initialBackfill: CalendarBackfillState = { status: "idle", message: "" };
const control = "h-8 rounded-[7px] border-0 bg-[var(--surface-control)] px-2 text-xs text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_18%,transparent)]";

function CategoryRow({ category }: { category: CalendarCategory }) {
  const [state, action, pending] = useActionState(updateCalendarCategoryColorAction, initial);
  const [aiState, aiAction, aiPending] = useActionState(updateCalendarCategoryAiAction, initial);
  const dot = outlookCategoryPalette[category.color]?.hex ?? "#8e8e93";
  return (
    <div className="border-b border-[var(--border-subtle)] py-3 last:border-0">
      <form action={action} className="grid grid-cols-[minmax(0,1fr)_118px] items-center gap-3">
        <input type="hidden" name="category_id" value={category.id} />
        <div className="flex min-w-0 items-center gap-2">
          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} />
          <div className="min-w-0"><p className="truncate text-[13px] font-medium text-[var(--text-primary)]">{category.display_name}</p><p className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">{category.category_kind === "external" ? "Outlook 分类" : category.category_kind === "context" ? "长期场景" : "主分类"}</p></div>
        </div>
        <select name="color" defaultValue={category.color} disabled={pending || !category.provider_category_id} onChange={(event) => event.currentTarget.form?.requestSubmit()} className={control} aria-label={`修改 ${category.display_name} 的颜色`}>
          {Object.entries(outlookCategoryPalette).map(([value, visual]) => <option key={value} value={value}>{visual.label}</option>)}
        </select>
      </form>
      {state.status === "error" ? <p className="mt-1 pl-4 text-[10px] text-[var(--danger)]">{state.message}</p> : null}
      {category.category_kind !== "external" ? (
        <details className="ml-4 mt-2">
          <summary className="cursor-pointer list-none text-[10.5px] text-[var(--text-tertiary)]">AI 分类规则</summary>
          <form action={aiAction} className="mt-2 grid gap-2.5 border-l border-[var(--border-subtle)] pl-3">
            <label className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]"><input type="checkbox" name="ai_enabled" defaultChecked={category.ai_enabled} className="size-3.5 accent-[var(--accent)]"/>允许 AI 建议此分类</label>
            <label className="grid gap-1 text-[10px] text-[var(--text-tertiary)]">说明<input name="ai_description" maxLength={500} defaultValue={category.ai_description ?? ""} className={control}/></label>
            <label className="grid gap-1 text-[10px] text-[var(--text-tertiary)]">关键词（逗号分隔）<input name="keywords" maxLength={1500} defaultValue={category.keywords.join("，")} className={control}/></label>
            <div className="flex items-center gap-2"><button disabled={aiPending} className="rounded-[7px] bg-[var(--surface-control)] px-2.5 py-1.5 text-[10.5px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-control-hover)] disabled:opacity-50">{aiPending ? "保存中…" : "保存规则"}</button>{aiState.status !== "idle" ? <span className={`text-[10px] ${aiState.status === "error" ? "text-[var(--danger)]" : "text-[var(--success)]"}`}>{aiState.message}</span> : null}</div>
          </form>
        </details>
      ) : null}
    </div>
  );
}

function UnclassifiedRow({ event, categories, timezone }: { event: CalendarEventRecord; categories: CalendarCategory[]; timezone: string }) {
  const suggestion = classifyCalendarEvent(
    { subject: event.subject, description: event.body_text, locationName: event.location_name },
    categories.filter((category) => category.managed_key).map((category) => ({ managed_key: category.managed_key, keywords: category.keywords, ai_enabled: category.ai_enabled })),
  );
  const [state, action, pending] = useActionState(updateCalendarEvent, initial);
  return (
    <form action={action} className="grid gap-2 border-b border-[var(--border-subtle)] py-3 last:border-0">
      <input type="hidden" name="provider_event_id" value={event.provider_event_id}/><input type="hidden" name="original_subject" value={event.subject}/><input type="hidden" name="original_starts_at" value={event.starts_at}/><input type="hidden" name="original_ends_at" value={event.ends_at}/><input type="hidden" name="subject" value={event.subject}/><input type="hidden" name="starts_at" value={event.starts_at}/><input type="hidden" name="ends_at" value={event.ends_at}/><input type="hidden" name="preserve_categories" value="false"/>{suggestion.contextCategoryKeys.map((key) => <input key={key} type="hidden" name="context_category_keys" value={key}/>)}
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-[12px] font-medium text-[var(--text-primary)]">{event.subject || "无标题日程"}</p><p className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">{new Intl.DateTimeFormat("zh-CN", { timeZone: timezone, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(event.starts_at))} · {suggestion.needsConfirmation ? "低置信度，请确认" : suggestion.reason}</p></div><select name="category_choice" defaultValue={suggestion.primaryCategoryKey} className={`${control} w-28`}><option value="__none">不设置</option>{primaryCalendarCategories.map((category) => <option key={category.key} value={category.key}>{category.shortName}</option>)}</select></div>
      <div className="flex items-center justify-between gap-3"><p className="text-[10px] text-[var(--text-tertiary)]">{suggestion.contextCategoryKeys.map((key) => getManagedCalendarCategory(key)?.shortName).filter(Boolean).join(" · ") || "无长期场景"}</p><button disabled={pending || state.status === "success"} className="rounded-[7px] px-2 py-1 text-[10.5px] font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:opacity-50">{pending ? "写入中…" : state.status === "success" ? "已写入" : "确认"}</button></div>
      {state.status === "error" ? <p className="text-[10px] text-[var(--danger)]">{state.message}</p> : null}
    </form>
  );
}

export function CalendarCategoryManager({ categories, timezone, scopeReady, events, referenceTime }: { categories: CalendarCategory[]; timezone: string; scopeReady: boolean; events: CalendarEventRecord[]; referenceTime: number }) {
  const [state, action, pending] = useActionState(initializeCalendarCategoriesAction, initial);
  const [backfillState, backfillAction, backfillPending] = useActionState(backfillCalendarCategoriesAction, initialBackfill);
  const now = referenceTime;
  const horizon = now + 90 * 24 * 60 * 60 * 1000;
  const unclassified = events.filter((event) => !event.categories.length && Date.parse(event.ends_at) >= now && Date.parse(event.starts_at) <= horizon).slice(0, 50);

  if (!scopeReady) return <div><div className="border-l-2 border-[var(--warning)] bg-[rgba(255,249,235,.7)] px-3 py-2 text-sm leading-6 text-[var(--warning)]">当前 Microsoft 授权缺少 Outlook 分类权限。重新授权后，Personal OS 才能读取、创建和同步 Master Categories。</div><MicrosoftDeviceConnect reconnect /></div>;

  return (
    <div className="grid gap-0">
      <section className="border-b border-[var(--border-subtle)] pb-5">
        <div className="flex items-start justify-between gap-4"><div><h2 className="text-[18px] font-semibold tracking-[-0.025em] text-[var(--text-primary)]">日历分类</h2><p className="mt-1 max-w-lg text-[11px] leading-5 text-[var(--text-secondary)]">管理 Outlook 分类颜色和 AI 分类规则。Personal OS 不会重命名或删除已有外部分类。</p></div><form action={action}><button disabled={pending} className="rounded-[8px] bg-[var(--surface-control)] px-3 py-2 text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-control-hover)] disabled:opacity-50">{pending ? "同步中…" : "初始化分类"}</button></form></div>
        {state.status !== "idle" ? <p role="status" className={`mt-2 text-[10.5px] ${state.status === "error" ? "text-[var(--danger)]" : "text-[var(--success)]"}`}>{state.message}</p> : null}
        <div className="mt-3">{categories.length ? categories.map((category) => <CategoryRow key={category.id} category={category} />) : <p className="py-8 text-center text-[12px] text-[var(--text-tertiary)]">尚未同步分类</p>}</div>
      </section>

      <section className="pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-[14px] font-semibold tracking-[-0.015em] text-[var(--text-primary)]">整理未分类日程</h3><p className="mt-1 max-w-xl text-[11px] leading-5 text-[var(--text-secondary)]">规则先生成建议，再写回 Outlook。低置信度日程不会被强行打标。</p></div><div className="flex items-center gap-2"><span className="text-[10px] text-[var(--text-tertiary)]">未来 90 天 · {unclassified.length} 项</span><form action={backfillAction}><button disabled={backfillPending} className="rounded-[8px] bg-[var(--surface-control)] px-3 py-2 text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--surface-control-hover)] disabled:opacity-50">{backfillPending ? "分类中…" : "自动分类历史日程"}</button></form></div></div>
        {backfillState.status !== "idle" ? <p role="status" className={`mt-2 text-[10.5px] ${backfillState.status === "error" ? "text-[var(--danger)]" : "text-[var(--success)]"}`}>{backfillState.message}</p> : null}
        <div className="mt-2">{unclassified.length ? unclassified.map((event) => <UnclassifiedRow key={event.id} event={event} categories={categories} timezone={timezone}/>) : <p className="py-8 text-center text-[11px] text-[var(--text-tertiary)]">未来 90 天没有未分类日程</p>}</div>
      </section>
    </div>
  );
}
