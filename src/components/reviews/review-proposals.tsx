"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  acceptReviewProposal,
  dismissReviewProposal,
  generateReviewProposals,
} from "@/features/reviews/actions";
import type { ReviewSourceDetail } from "@/features/reviews/queries";

type ProposalRow = {
  id: string;
  proposal_type: string;
  payload: unknown;
  status: string;
  resulting_entity_type: string | null;
  resulting_entity_id: string | null;
  resolved_at: string | null;
  created_at: string;
};

const typeLabels: Record<string, string> = {
  profile_memory: "长期档案记忆",
  working_memory: "当前工作记忆",
  decision_keep: "维持现有决定",
  decision_supersede: "更新现有决定",
  decision_reverse: "反转现有决定",
};

function payloadOf(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function ReviewProposals({
  reviewId,
  proposals,
  sources,
}: {
  reviewId: string;
  proposals: ProposalRow[];
  sources: ReviewSourceDetail[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isGenerating, startGenerating] = useTransition();
  const [isResolving, startResolving] = useTransition();
  const sourceById = new Map(sources.map((source) => [source.source_id, source]));
  const pending = proposals.filter((proposal) => proposal.status === "pending");

  const generate = () => {
    setMessage(null);
    startGenerating(async () => {
      try {
        const result = await generateReviewProposals(reviewId);
        setMessage(
          result.alreadyPending
            ? "已有待确认候选，请先逐条处理。"
            : result.created
              ? `已生成 ${result.created} 条候选；Memory 与 Decision 尚未改变。`
              : "没有足够证据形成长期信息候选。",
        );
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "候选生成失败。");
      }
    });
  };

  const resolve = (proposalId: string, outcome: "accept" | "dismiss") => {
    setPendingId(proposalId);
    setMessage(null);
    startResolving(async () => {
      try {
        if (outcome === "accept") await acceptReviewProposal(proposalId);
        else await dismissReviewProposal(proposalId);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "候选处理失败。");
      } finally {
        setPendingId(null);
      }
    });
  };

  return (
    <section className="border-t border-zinc-200 pt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-zinc-900">长期信息候选</h2>
          <p className="mt-1 text-sm leading-6 text-zinc-500">
            只在你主动提炼后生成；逐条 Accept 才会写入 Memory 或更新 Decision。
          </p>
        </div>
        <Button variant="outline" onClick={generate} disabled={isGenerating || pending.length > 0}>
          {isGenerating ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
          {isGenerating ? "正在提炼…" : "从本次复盘提炼长期信息"}
        </Button>
      </div>
      {message ? <p className="mt-3 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-600">{message}</p> : null}
      <div className="mt-4 divide-y divide-zinc-200 border-y border-zinc-200">
        {proposals.length ? (
          proposals.map((proposal) => {
            const payload = payloadOf(proposal.payload);
            const evidenceIds = Array.isArray(payload.evidenceSourceIds)
              ? payload.evidenceSourceIds.filter((id): id is string => typeof id === "string")
              : [];
            return (
              <article key={proposal.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#365f78]">
                      {typeLabels[proposal.proposal_type] ?? proposal.proposal_type}
                    </p>
                    <h3 className="mt-1 font-semibold text-zinc-900">
                      {typeof payload.title === "string" ? payload.title : "未命名候选"}
                    </h3>
                  </div>
                  <span className="text-xs text-zinc-400">
                    {proposal.status === "pending" ? "待确认" : proposal.status === "accepted" ? "已接受" : "已忽略"}
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-zinc-700">
                  {typeof payload.content === "string" ? payload.content : ""}
                </p>
                {typeof payload.rationale === "string" ? (
                  <p className="mt-2 text-xs leading-5 text-zinc-500">为什么建议：{payload.rationale}</p>
                ) : null}
                {evidenceIds.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {evidenceIds.map((id) => (
                      <span key={id} className="rounded-md bg-zinc-100 px-2 py-1 text-[11px] text-zinc-500">
                        {sourceById.get(id)?.title ?? "来源已不可用"}
                      </span>
                    ))}
                  </div>
                ) : null}
                {proposal.status === "pending" ? (
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => resolve(proposal.id, "accept")}
                      disabled={isResolving}
                      className="bg-[#365f78] hover:bg-[#294d63]"
                    >
                      {pendingId === proposal.id ? <LoaderCircle className="animate-spin" /> : <Check />}
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => resolve(proposal.id, "dismiss")}
                      disabled={isResolving}
                    >
                      <X /> Dismiss
                    </Button>
                  </div>
                ) : null}
              </article>
            );
          })
        ) : (
          <p className="py-6 text-sm text-zinc-500">尚未提炼长期信息。</p>
        )}
      </div>
    </section>
  );
}
