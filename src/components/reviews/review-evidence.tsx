import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type {
  ReviewEvidence,
  ReviewEvidenceItem,
} from "@/features/reviews/evidence";

function timeLabel(value: string, type: "daily" | "weekly") {
  return new Intl.DateTimeFormat("zh-CN", {
    month: type === "weekly" ? "numeric" : undefined,
    day: type === "weekly" ? "numeric" : undefined,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function EvidenceGroup({
  title,
  items,
  type,
}: {
  title: string;
  items: ReviewEvidenceItem[];
  type: "daily" | "weekly";
}) {
  if (!items.length) return null;
  return (
    <section>
      <h3 className="text-[10px] font-semibold tracking-[0.06em] text-[var(--text-tertiary)]">
        {title}
      </h3>
      <div className="mt-1.5 divide-y divide-[var(--separator)]">
        {items.map((item) => (
          <Link
            key={`${item.type}:${item.id}`}
            href={item.href}
            className="group block py-2 outline-none hover:text-[var(--accent)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--accent)_18%,transparent)]"
          >
            <span className="flex items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block truncate text-[12px] font-medium text-[var(--text-primary)] group-hover:text-[var(--accent)]">
                  {item.title}
                </span>
                {item.summary ? (
                  <span className="mt-0.5 line-clamp-2 block text-[10.5px] leading-4.5 text-[var(--text-secondary)]">
                    {item.summary}
                  </span>
                ) : null}
              </span>
              <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-[var(--text-tertiary)] group-hover:text-[var(--accent)]" />
            </span>
            <span className="mt-1 flex gap-2 text-[10px] tabular-nums text-[var(--text-tertiary)]">
              <span>{timeLabel(item.occurredAt, type)}</span>
              {item.state ? <span>· {item.state}</span> : null}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function ReviewEvidencePanel({ evidence }: { evidence: ReviewEvidence }) {
  const count = [
    evidence.calendar,
    evidence.tasksCompleted,
    evidence.tasksOpen,
    evidence.notes,
    evidence.inbox,
    evidence.career,
    evidence.projects,
    evidence.decisions,
  ].reduce((total, items) => total + items.length, 0);
  return (
    <aside className="lg:sticky lg:top-5 lg:max-h-[calc(100dvh-2.5rem)] lg:overflow-y-auto lg:border-l lg:border-[var(--separator)] lg:pl-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">证据</h2>
        <span className="text-[10.5px] tabular-nums text-[var(--text-tertiary)]">{count} 条记录</span>
      </div>
      <p className="mt-1 text-[10.5px] leading-5 text-[var(--text-secondary)]">
        本周期由系统确定性收集。AI 草稿与最终来源使用同一快照。
      </p>
      {count < 3 ? (
        <p className="mt-3.5 rounded-[9px] bg-amber-50 px-3 py-2 text-[10.5px] leading-5 text-amber-800">
          {count === 0
            ? "本周期暂时没有可验证活动。你仍可以写下自己的 复盘。"
            : `本周期记录较少，目前只有 ${count} 条可验证活动。`}
        </p>
      ) : null}
      <div className="mt-4.5 space-y-5">
        <EvidenceGroup title="发生了什么" items={evidence.calendar} type={evidence.reviewType} />
        <EvidenceGroup title="完成了什么" items={evidence.tasksCompleted} type={evidence.reviewType} />
        <EvidenceGroup title="写了什么" items={[...evidence.notes, ...evidence.inbox]} type={evidence.reviewType} />
        <EvidenceGroup title="仍未解决" items={evidence.tasksOpen} type={evidence.reviewType} />
        <EvidenceGroup title="职业 / 项目" items={[...evidence.career, ...evidence.projects]} type={evidence.reviewType} />
        <EvidenceGroup title="决定" items={evidence.decisions} type={evidence.reviewType} />
      </div>
    </aside>
  );
}
