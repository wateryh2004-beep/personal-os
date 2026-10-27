"use client";

import { z } from "zod";
import {
  useState,
  useTransition,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useRouter } from "next/navigation";
import { beginNavigationIntent } from "@/features/workflow-continuity/navigation-intent";
import { captureWorkspaceScope } from "@/lib/workspace-resource-cache";
import { LoaderCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  completeReview,
  generateReviewDraft,
} from "@/features/reviews/actions";
import { useWorkflowDraft } from "@/features/workflow-continuity/drafts";
import { reviewStructuredDataSchema } from "@/features/reviews/schemas";
import type { ReviewEvidence } from "@/features/reviews/evidence";
import type { ReviewStructuredData } from "@/features/reviews/types";
import { ReviewEditor } from "./review-editor";
import { ReviewEvidencePanel } from "./review-evidence";

export function ReviewComposer({
  type,
  evidence,
  initialValue,
  existingReviewId,
}: {
  type: "daily" | "weekly";
  evidence: ReviewEvidence;
  initialValue: ReviewStructuredData;
  existingReviewId?: string | null;
}) {
  const router = useRouter();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const refs = z
    .array(z.object({ sourceType: z.string(), sourceId: z.string().uuid() }))
    .max(200);
  const envelopeSchema = z.object({
    structured: reviewStructuredDataSchema,
    selectedSources: refs,
    aiContextSources: refs,
    generatedWithAi: z.boolean(),
  });
  const {
    value: envelope,
    setValue: setEnvelope,
    clear,
    recoveryUnavailable,
  } = useWorkflowDraft({
    kind: "review",
    id: `${type}:${evidence.periodStart}`,
    label: type === "daily" ? "每日复盘" : "每周复盘",
    resumeHref: `/reviews/${type}`,
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
  const [suggestion, setSuggestion] = useState<{
    draft: ReviewStructuredData;
    baseline: ReviewStructuredData;
    sources: { sourceType: string; sourceId: string }[];
  } | null>(null);
  const [notice, setNotice] = useState<{
    text: string;
    tone: "info" | "error";
  } | null>(null);
  const [isDrafting, startDrafting] = useTransition();
  const [isSaving, startSaving] = useTransition();
  const periodLabel =
    type === "daily"
      ? evidence.periodStart
      : `${evidence.periodStart} — ${evidence.periodEnd}`;

  const draft = () => {
    setNotice(null);
    startDrafting(async () => {
      const result = await generateReviewDraft(type);
      if (!result.ok) {
        setNotice({ text: result.error, tone: "error" });
        return;
      }
      setSuggestion({
        draft: result.draft,
        baseline: value,
        sources: result.sources,
      });
      setNotice({
        text: `AI 草稿 · 尚未保存 · 基于 ${result.coverage} 条记录`,
        tone: "info",
      });
    });
  };

  const save = () => {
    const navigationIsCurrent = beginNavigationIntent();
    const scopeIsCurrent = captureWorkspaceScope();
    setNotice(null);
    startSaving(async () => {
      try {
        const result = await completeReview({
          type,
          structuredData: value,
          generatedWithAi,
          selectedSources,
          aiContextSources,
        });
        clear(envelope);
        if (navigationIsCurrent() && scopeIsCurrent() && mounted.current) router.push(`/reviews/${result.reviewId}`);
      } catch (error) {
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
    <section className="mx-auto max-w-[1080px]">
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
      {notice ? (
        <p
          className={`mt-3.5 rounded-[9px] px-3 py-2 text-[12px] ${notice.tone === "info" ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-red-50 text-[var(--danger)]"}`}
        >
          {notice.text}
        </p>
      ) : null}
      <div className="mt-6 grid gap-7 lg:grid-cols-[minmax(0,1fr)_300px]">
        <main className="min-w-0">
          {recoveryUnavailable ? (
            <p role="status">
              输入仍在当前页面，暂时无法跨页恢复，请先完成保存。
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
                      if (
                        JSON.stringify(value[key]) !==
                        JSON.stringify(suggestion.baseline[key])
                      ) {
                        setNotice({
                          text: "这项已有新的手动编辑，保留你的内容。请先核对再采纳。",
                          tone: "error",
                        });
                        return;
                      }
                      setEnvelope((before) => ({
                        ...before,
                        structured: {
                          ...before.structured,
                          [key]: suggestion.draft[key],
                        },
                        generatedWithAi: true,
                        aiContextSources: [
                          ...new Map(
                            [
                              ...before.aiContextSources,
                              ...suggestion.sources,
                            ].map((item) => [
                              `${item.sourceType}:${item.sourceId}`,
                              item,
                            ]),
                          ).values(),
                        ],
                      }));
                      setSuggestion((before) =>
                        before
                          ? {
                              ...before,
                              baseline: {
                                ...before.baseline,
                                [key]: suggestion.draft[key],
                              },
                            }
                          : null,
                      );
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
              <Button variant="ghost" onClick={() => setSuggestion(null)}>
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
