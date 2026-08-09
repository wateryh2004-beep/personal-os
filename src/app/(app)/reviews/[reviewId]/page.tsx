import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Bot, Database, History } from "lucide-react";
import { ReviewProposals } from "@/components/reviews/review-proposals";
import { getReviewDetail } from "@/features/reviews/queries";
import type { ReviewStructuredData } from "@/features/reviews/types";

const sections: Array<[keyof ReviewStructuredData, string]> = [
  ["wins", "进展与收获"],
  ["changes", "发生的变化"],
  ["friction", "阻力与摩擦"],
  ["openLoops", "仍未解决"],
  ["lessons", "经验与认识"],
  ["nextFocus", "下一步重点"],
];

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ reviewId: string }>;
}) {
  const { reviewId } = await params;
  const data = await getReviewDetail(reviewId);
  if (!data) notFound();
  const structured = data.review.structured_data;
  return (
    <section className="mx-auto max-w-4xl">
      <Link href="/reviews" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-[#365f78]">
        <ArrowLeft className="size-4" /> Reviews
      </Link>
      <header className="mt-5 border-b border-zinc-200 pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-[#365f78]">COMPLETED REVIEW</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-900">{data.review.title}</h1>
            <p className="mt-2 text-sm text-zinc-500">
              {data.review.completed_at ? new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.review.completed_at)) : "未标记完成时间"}
            </p>
          </div>
          <Link href={data.review.review_type === "decision" ? "/reviews" : `/reviews/${data.review.review_type}`} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50">
            继续修正
          </Link>
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-zinc-500">
          <span className="flex items-center gap-1.5"><Database className="size-3.5" /> 基于 {data.sources.length} 条 Personal OS 记录</span>
          <span className="flex items-center gap-1.5"><History className="size-3.5" /> {data.versions.length} 个版本</span>
          {data.review.generated_with_ai ? <span className="flex items-center gap-1.5"><Bot className="size-3.5" /> 使用过 AI 草稿</span> : null}
        </div>
      </header>

      <div className="mt-7 grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <main className="min-w-0 space-y-7">
          {sections.map(([key, title]) => {
            const values = structured[key];
            if (!Array.isArray(values) || !values.length) return null;
            return (
              <section key={key}>
                <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
                <ul className="mt-2 space-y-2 text-sm leading-6 text-zinc-700">
                  {values.map((value, index) => <li key={`${key}-${index}`} className="flex gap-2"><span className="text-zinc-300">—</span><span>{value}</span></li>)}
                </ul>
              </section>
            );
          })}
          {structured.freeReflection ? (
            <section>
              <h2 className="text-sm font-semibold text-zinc-900">自由复盘</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-zinc-700">{structured.freeReflection}</p>
            </section>
          ) : null}
        </main>
        <aside className="border-l border-zinc-200 pl-5">
          <h2 className="font-semibold text-zinc-900">Sources</h2>
          <div className="mt-3 divide-y divide-zinc-100">
            {data.sources.length ? data.sources.map((source) => (
              <Link key={source.id} href={source.href} className="block py-2.5 text-sm outline-none hover:text-[#365f78] focus-visible:ring-2 focus-visible:ring-[#365f78]/30">
                <span className="line-clamp-2 font-medium">{source.title}</span>
                <span className="mt-1 block text-[11px] text-zinc-400">{source.source_type} · {source.source_role}</span>
              </Link>
            )) : <p className="py-3 text-sm text-zinc-500">这个旧版本没有来源快照。</p>}
          </div>
          <h2 className="mt-7 font-semibold text-zinc-900">Version history</h2>
          <div className="mt-3 space-y-2">
            {data.versions.map((version) => (
              <div key={version.id} className="text-xs text-zinc-500">
                v{version.version_number} · {version.reason} · {new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(version.created_at))}
              </div>
            ))}
          </div>
        </aside>
      </div>

      <div className="mt-10">
        <ReviewProposals reviewId={reviewId} proposals={data.proposals} sources={data.sources} />
      </div>
    </section>
  );
}
