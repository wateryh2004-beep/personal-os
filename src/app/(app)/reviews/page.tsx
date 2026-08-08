import Link from "next/link";
import { createReview } from "@/features/reviews/actions";
import { getReviewsDashboard } from "@/features/reviews/queries";

export default async function ReviewsPage() {
  const data = await getReviewsDashboard();
  const completed = new Set(
    data.reviews
      .filter((review) => review.status === "completed")
      .map((review) => review.review_key),
  );
  return (
    <section className="mx-auto max-w-3xl">
      <header className="border-b border-[#e7e5e4] pb-6">
        <p className="text-sm font-medium text-[#365f78]">PERSONAL OS</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-zinc-900">Reviews</h1>
        <p className="mt-2 text-sm text-zinc-500">把原始记录压缩为可回看的事实、判断与下一步；不会自动修改你的记忆或决定。</p>
      </header>

      <div className="mt-7 grid gap-4 md:grid-cols-2">
        <ReviewStartCard title="今日复盘" description="今天真正发生了什么，哪些事值得留下？" complete={completed.has(data.daily.key)} type="daily" />
        <ReviewStartCard title="本周复盘" description="把一周的推进、未收束事项和判断变化放在一起看。" complete={completed.has(data.weekly.key)} type="weekly" />
      </div>

      {data.dueDecisions.length ? (
        <section className="mt-8 border-t border-[#e7e5e4] pt-6">
          <h2 className="font-medium text-zinc-900">待复核的决定</h2>
          <p className="mt-1 text-sm text-zinc-500">决定复核会保留当时的判断过程；更新或反转仍需要你明确确认。</p>
          <div className="mt-3 divide-y border-y border-[#e7e5e4]">
            {data.dueDecisions.map((decision) => (
              <div key={decision.id} className="flex items-center justify-between gap-4 py-3">
                <div><p className="font-medium">{decision.title}</p><p className="mt-1 text-xs text-zinc-500">计划复核：{String(decision.review_at).slice(0, 10)}</p></div>
                <Link className="text-sm font-medium text-[#365f78]" href="/memory">查看决定 →</Link>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-8 border-t border-[#e7e5e4] pt-6">
        <h2 className="font-medium text-zinc-900">最近复盘</h2>
        <div className="mt-3 divide-y border-y border-[#e7e5e4]">
          {data.reviews.length ? data.reviews.map((review) => (
            <article key={review.id} className="py-4">
              <div className="flex items-baseline justify-between gap-3"><p className="font-medium">{review.title}</p><span className="shrink-0 text-xs text-zinc-400">{review.status === "completed" ? "已完成" : "草稿"}</span></div>
              <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm leading-6 text-zinc-500">{review.content_markdown || "尚未写下内容"}</p>
            </article>
          )) : <p className="py-8 text-sm text-zinc-500">还没有复盘。每天或每周花几分钟留下真正重要的事情。</p>}
        </div>
      </section>
    </section>
  );
}

function ReviewStartCard({ title, description, complete, type }: { title: string; description: string; complete: boolean; type: "daily" | "weekly" }) {
  return (
    <form action={async (formData) => { "use server"; await createReview({ type, content: String(formData.get("content") ?? "") }); }} className="border border-[#e7e5e4] bg-white p-5">
      <div className="flex items-center justify-between gap-3"><h2 className="font-medium text-zinc-900">{title}</h2><span className="text-xs text-zinc-400">{complete ? "可修正" : "尚未完成"}</span></div>
      <p className="mt-2 text-sm leading-6 text-zinc-500">{description}</p>
      <label className="sr-only" htmlFor={`${type}-reflection`}>{title}</label>
      <textarea id={`${type}-reflection`} name="content" required maxLength={10000} className="mt-4 min-h-32 w-full resize-y border border-[#deddd8] bg-[#fcfcfb] px-3 py-2 text-sm outline-none focus:border-[#365f78]" placeholder="用自己的话写下复盘；后续可在不覆盖历史的前提下修正。" />
      <button className="mt-3 bg-[#365f78] px-3 py-2 text-sm font-medium text-white hover:bg-[#294d63]">{complete ? "保存修正" : "完成复盘"}</button>
    </form>
  );
}
