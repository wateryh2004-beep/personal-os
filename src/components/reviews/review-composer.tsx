"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { completeReview, generateReviewDraft } from "@/features/reviews/actions";
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
  const [value, setValue] = useState(initialValue);
  const [generatedWithAi, setGeneratedWithAi] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: "info" | "error" } | null>(null);
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
      setValue(result.draft);
      setGeneratedWithAi(true);
      setNotice({
        text: `AI 草稿 · 尚未保存 · 基于 ${result.coverage} 条记录`,
        tone: "info",
      });
    });
  };

  const save = () => {
    setNotice(null);
    startSaving(async () => {
      try {
        const result = await completeReview({
          type,
          structuredData: value,
          generatedWithAi,
        });
        router.push(`/reviews/${result.reviewId}`);
      } catch (error) {
        setNotice({
          text: error instanceof Error ? error.message : "复盘保存失败，请稍后再试。",
          tone: "error",
        });
      }
    });
  };

  return (
    <section className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-zinc-200 pb-5">
        <div>
          <p className="text-sm font-medium text-[#365f78]">
            {type === "daily" ? "DAILY REVIEW" : "WEEKLY REVIEW"}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-900">
            {type === "daily" ? "今日复盘" : "本周复盘"}
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            {periodLabel} · {existingReviewId ? "已完成，可继续修正" : "尚未完成"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={draft} disabled={isDrafting || isSaving}>
            {isDrafting ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
            {isDrafting ? "正在生成…" : "基于记录生成草稿"}
          </Button>
          <Button onClick={save} disabled={isSaving || isDrafting} className="bg-[#365f78] hover:bg-[#294d63]">
            {isSaving ? <LoaderCircle className="animate-spin" /> : null}
            {existingReviewId ? "保存修正" : "完成 Review"}
          </Button>
        </div>
      </header>
      {notice ? (
        <p className={`mt-4 rounded-lg px-3 py-2 text-sm ${notice.tone === "info" ? "bg-[#eef4f7] text-[#365f78]" : "bg-red-50 text-red-700"}`}>
          {notice.text}
        </p>
      ) : null}
      <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="min-w-0">
          <ReviewEditor type={type} value={value} onChange={setValue} />
          <p className="mt-4 text-xs leading-5 text-zinc-400">
            保存后会创建新版本，并记录本次 Evidence 来源。AI 草稿不会自动进入 Memory 或改变 Decision。
          </p>
        </main>
        <ReviewEvidencePanel evidence={evidence} />
      </div>
    </section>
  );
}
