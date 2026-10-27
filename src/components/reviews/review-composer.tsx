"use client";

import { z } from "zod";
import {
  useState,
  useTransition,
  useEffect,
  useLayoutEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { beginNavigationIntent, captureNavigationIntent } from "@/features/workflow-continuity/navigation-intent";
import { captureWorkspaceScope } from "@/lib/workspace-resource-cache";
import { LoaderCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  completeReview,
} from "@/features/reviews/actions";
import { assertContinuousFixtureTransport } from "@/features/testing/continuous-fixture-gate";
import type { AiActionFixtureTransport } from "@/features/assistant/ai-action-fixtures";
import { startAiAction, getAiActionRecords, getAiActionServerRecords, subscribeAiActionRecords, consumeAiAction, type AiActionRecord } from "@/features/assistant/ai-action-runtime";
import { registerAiResumeConsumer } from "@/features/assistant/ai-continuity";
import { draftValueFingerprint, useWorkflowDraft } from "@/features/workflow-continuity/drafts";
import type { ReviewEvidence } from "@/features/reviews/evidence";
import type { ReviewStructuredData } from "@/features/reviews/types";
import { ReviewEditor } from "./review-editor";
import { ReviewEvidencePanel } from "./review-evidence";

export function ReviewComposer({
  type,
  evidence,
  initialValue,
  existingReviewId,
  verificationTransport,
}: {
  type: "daily" | "weekly";
  evidence: ReviewEvidence;
  initialValue: ReviewStructuredData;
  existingReviewId?: string | null;
  verificationTransport?: { ai: AiActionFixtureTransport; completeReview: typeof completeReview };
}) {
  assertContinuousFixtureTransport(verificationTransport);
  const router = useRouter();
  const periodKey = JSON.stringify([type, evidence.periodStart, evidence.periodEnd, evidence.timezone]);
  const periodLease = useRef({ key: periodKey });
  useLayoutEffect(() => { if (periodLease.current.key !== periodKey) periodLease.current = { key: periodKey }; }, [periodKey]);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const refs = z
    .array(z.object({ sourceType: z.string(), sourceId: z.string().uuid() }))
    .max(200);
  const rawLines = z.array(z.string().max(400_000)).max(10_000);
  const rawStructured = z.object({ wins: rawLines, friction: rawLines, openLoops: rawLines, changes: rawLines, lessons: rawLines, nextFocus: rawLines, freeReflection: z.string().max(400_000) }).strict();
  const envelopeSchema = z.object({
    structured: rawStructured,
    selectedSources: refs,
    aiContextSources: refs,
    generatedWithAi: z.boolean(),
  });
  const {
    value: envelope,
    setValue: setDraftEnvelope,
    commit,
    recoveryUnavailable,
    isCurrent: draftIsCurrent,
    scopeRevoked,
  } = useWorkflowDraft({
    kind: "review",
    id: `${type}:${evidence.periodStart}`,
    label: type === "daily" ? "每日复盘" : "每周复盘",
    resumeHref: `/reviews/${type}`,
    resumeAiTarget: { kind: "review-input", reviewType: type, periodStart: evidence.periodStart },
    initialValue: {
      structured: initialValue,
      selectedSources: [] as { sourceType: string; sourceId: string }[],
      aiContextSources: [] as { sourceType: string; sourceId: string }[],
      generatedWithAi: false,
    },
    parse: (input) => {
      const result = envelopeSchema.safeParse(input);
      return result.success ? result.data : null;
    },
  });
  const liveEnvelope = useRef(envelope);
  useLayoutEffect(() => { liveEnvelope.current = envelope; }, [envelope]);
  const setEnvelope: typeof setDraftEnvelope = (next) => setDraftEnvelope((before) => {
    const updated = typeof next === "function" ? next(before) : next;
    liveEnvelope.current = updated;
    return updated;
  });
  const {
    structured: value,
    selectedSources,
    aiContextSources,
    generatedWithAi,
  } = envelope;
  const setValue: Dispatch<SetStateAction<ReviewStructuredData>> = (next) =>
    setEnvelope((before) => ({
      ...before,
      structured: typeof next === "function" ? next(before.structured) : next,
    }));
  const setSelectedSources: Dispatch<
    SetStateAction<{ sourceType: string; sourceId: string }[]>
  > = (next) =>
    setEnvelope((before) => ({
      ...before,
      selectedSources:
        typeof next === "function" ? next(before.selectedSources) : next,
    }));
  const [notice, setNotice] = useState<{
    text: string;
    tone: "info" | "error";
  } | null>(null);
  const operations = useSyncExternalStore(subscribeAiActionRecords, getAiActionRecords, getAiActionServerRecords);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const matchingDrafts = operations.filter(record => record.kind === "review-draft" && record.input.kind === "review-draft" && record.input.reviewType === type && record.input.periodStart === evidence.periodStart && record.input.timezone === evidence.timezone && record.current()) as AiActionRecord<"review-draft">[];
  const activeDraft = matchingDrafts.find(record => record.id === selectedDraftId && !record.consumed) ?? [...matchingDrafts].reverse().find(record => !record.consumed);
  const isDrafting = activeDraft?.status === "running";
  const resultPanel = useRef<HTMLElement>(null);
  const suggestion = activeDraft?.result?.ok && !activeDraft.consumed && activeDraft.result.period.periodStart === evidence.periodStart && activeDraft.result.period.periodEnd === evidence.periodEnd && activeDraft.result.period.timezone === evidence.timezone ? { draft: activeDraft.result.draft, baseline: activeDraft.input.baseline, sources: activeDraft.result.sources } : null;
  const displayedNotice = notice ?? (activeDraft?.result ? activeDraft.result.ok ? { text: `AI 草稿 · 尚未保存 · 基于 ${activeDraft.result.coverage} 条记录`, tone: "info" as const } : { text: activeDraft.result.error, tone: "error" as const } : activeDraft?.error ? { text: activeDraft.error, tone: "error" as const } : null);
  useEffect(() => registerAiResumeConsumer(target => (target.kind === "review-draft" && target.reviewType === type && target.periodStart === evidence.periodStart && matchingDrafts.some(record => record.id === target.proposalId && !record.consumed)) || (target.kind === "review-input" && target.reviewType === type && target.periodStart === evidence.periodStart), async target => {
    if (!draftIsCurrent()) return false;
    const navigation = captureNavigationIntent();
    if (target.kind === "review-draft") setSelectedDraftId(target.proposalId);
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    if (target.kind === "review-draft" && resultPanel.current?.dataset.proposalId !== target.proposalId) return false;
    const focus = resultPanel.current?.querySelector<HTMLTextAreaElement>("textarea") ?? resultPanel.current;
    if (!focus || !draftIsCurrent() || !navigation()) return false; focus.focus(); return document.activeElement === focus;
  }), [matchingDrafts, evidence.periodStart, type, draftIsCurrent]);
  const [isSaving, startSaving] = useTransition();
  const periodLabel =
    type === "daily"
      ? evidence.periodStart
      : `${evidence.periodStart} — ${evidence.periodEnd}`;

  const draft = () => {
    if (!draftIsCurrent()) { setNotice({ text: "工作区已变化，请重新打开此编辑入口。", tone: "error" }); return; }
    setNotice(null);
    if (!evidence.timezone) { setNotice({ text: "证据的时区尚未读全，文字草稿保留，请重新读取。", tone: "error" }); return; }
    try { setSelectedDraftId(null); startAiAction({ kind: "review-draft", id: crypto.randomUUID(), reviewType: type, periodStart: evidence.periodStart, periodEnd: evidence.periodEnd, timezone: evidence.timezone, baseline: structuredClone(value) }, verificationTransport?.ai); }
    catch (error) { setNotice({ text: error instanceof Error ? error.message : "暂时无法开始，文字草稿仍保留。", tone: "error" }); }
  };

  const save = () => {
    if (!draftIsCurrent()) { setNotice({ text: "工作区已变化，请重新打开此编辑入口。", tone: "error" }); return; }
    const savedPeriodLease = periodLease.current;
    const periodIsCurrent = () => periodLease.current === savedPeriodLease;
    const navigationIsCurrent = beginNavigationIntent();
    const scopeIsCurrent = captureWorkspaceScope();
    setNotice(null);
    startSaving(async () => {
      try {
        const result = await (verificationTransport?.completeReview ?? completeReview)({
          type,
          period: { periodStart: evidence.periodStart, periodEnd: evidence.periodEnd, timezone: evidence.timezone },
          structuredData: value,
          generatedWithAi,
          selectedSources,
          aiContextSources,
        });
        if (!periodIsCurrent() || !scopeIsCurrent() || !mounted.current) return;
        const unchanged = draftValueFingerprint(liveEnvelope.current) === draftValueFingerprint(envelope);
        commit(envelope, current => current);
        if (!navigationIsCurrent() || !scopeIsCurrent() || !mounted.current) return;
        if (!unchanged) {
          setNotice({ text: "本次提交已保存，后续修改尚未保存。", tone: "info" });
          return;
        }
        router.push(`/reviews/${result.reviewId}`);
      } catch (error) {
        if (!periodIsCurrent() || !scopeIsCurrent() || !mounted.current) return;
        setNotice({
          text:
            error instanceof Error
              ? error.message
              : "复盘保存失败，请稍后再试。",
          tone: "error",
        });
      }
    });
  };

  return (
    <section ref={resultPanel} data-proposal-id={activeDraft?.id} tabIndex={-1} className="mx-auto max-w-[1080px]">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--separator)] pb-4.5">
        <div>
          <p className="text-[12px] font-semibold tracking-[0.08em] text-[var(--accent)]">
            {type === "daily" ? "每日复盘" : "每周复盘"}
          </p>
          <h1 className="page-title">
            {type === "daily" ? "今日复盘" : "本周复盘"}
          </h1>
          <p className="mt-1.5 text-[12px] text-[var(--text-tertiary)]">
            {periodLabel} ·{" "}
            {existingReviewId ? "已完成，可继续修正" : "尚未完成"}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            onClick={draft}
            disabled={isDrafting || isSaving}
          >
            {isDrafting ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Sparkles />
            )}
            {isDrafting ? "正在生成…" : "基于记录生成草稿"}
          </Button>
          <Button onClick={save} disabled={isSaving || isDrafting}>
            {isSaving ? <LoaderCircle className="animate-spin" /> : null}
            {existingReviewId ? "保存修正" : "完成复盘"}
          </Button>
        </div>
      </header>
      {displayedNotice ? (
        <p
          className={`mt-3.5 rounded-[9px] px-3 py-2 text-[12px] ${displayedNotice.tone === "info" ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-red-50 text-[var(--danger)]"}`}
        >
          {displayedNotice.text}
        </p>
      ) : null}
      <div className="mt-6 grid gap-7 lg:grid-cols-[minmax(0,1fr)_300px]">
        <main className="min-w-0">
          {recoveryUnavailable ? (
            <p role="status">
              {scopeRevoked ? "工作区已变化，请重新打开此编辑入口。" : "输入仍在当前页面，暂时无法跨页恢复，请先完成保存。"}
            </p>
          ) : null}
          {suggestion ? (
            <section className="mb-5 space-y-3 rounded-lg border border-[var(--separator)] p-4">
              <h2 className="font-medium">逐项采纳 AI 草稿 · 尚未保存</h2>
              <p className="text-xs">
                采纳字段会保留本次AI使用的{suggestion.sources.length}
                条资料作为上下文来源，独立于你选择的引用。
              </p>
              {(
                Object.keys(suggestion.draft) as (keyof ReviewStructuredData)[]
              ).map((key) => (
                <div key={key}>
                  <p className="whitespace-pre-wrap text-sm">
                    {Array.isArray(suggestion.draft[key])
                      ? (suggestion.draft[key] as string[]).join("\n")
                      : suggestion.draft[key]}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEnvelope((before) => {
                        if (JSON.stringify(before.structured[key]) !== JSON.stringify(suggestion.baseline[key])) {
                          setNotice({ text: "这项已有新的手动编辑，保留你的内容。请先核对再采纳。", tone: "error" });
                          return before;
                        }
                        return { ...before, structured: { ...before.structured, [key]: suggestion.draft[key] }, generatedWithAi: true,
                          aiContextSources: [...new Map([...before.aiContextSources, ...suggestion.sources].map(item => [`${item.sourceType}:${item.sourceId}`, item])).values()] };
                      });

                    }}
                  >
                    采纳
                    {
                      {
                        wins: "进展",
                        friction: "阻力",
                        openLoops: "未完成",
                        changes: "变化",
                        lessons: "收获",
                        nextFocus: "下一步",
                        freeReflection: "自由复盘",
                      }[key]
                    }
                  </Button>
                </div>
              ))}
              <Button variant="ghost" onClick={() => { if (activeDraft) consumeAiAction(activeDraft.id); }}>
                关闭建议
              </Button>
            </section>
          ) : null}
          <ReviewEditor type={type} value={value} onChange={setValue} />
          <p className="mt-3.5 text-[12px] leading-5 text-[var(--text-tertiary)]">
            保存后会创建新版本，并记录本次证据来源。AI
            草稿不会自动进入记忆或改变决定。
          </p>
        </main>
        <ReviewEvidencePanel
          evidence={evidence}
          onInsert={(items) => {
            setValue((before) => ({
              ...before,
              freeReflection: [
                before.freeReflection,
                ...items.map(
                  (item) =>
                    `- [${item.title.replace(/[\[\]\n]/g, " ")}](${item.href}) · ${item.state ?? "记录"}`,
                ),
              ]
                .filter(Boolean)
                .join("\n"),
            }));
            setSelectedSources((before) => [
              ...new Map(
                [
                  ...before,
                  ...items.map((item) => ({
                    sourceType: item.type,
                    sourceId: item.id,
                  })),
                ].map((item) => [`${item.sourceType}:${item.sourceId}`, item]),
              ).values(),
            ]);
          }}
        />
      </div>
    </section>
  );
}
