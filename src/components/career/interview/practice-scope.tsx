import Link from "next/link";
import { Button } from "@/components/ui/button";

export function practiceScopeHref(path: string, context?: string) {
  return context ? `${path}?context=${encodeURIComponent(context)}` : path;
}

/** Server-rendered GET form retains ordinary navigation, reload and Back semantics. */
export function PracticeScope({ contexts, context }: { contexts: readonly { id: string; title: string; status?: string | null }[]; context?: string }) {
  const unknown = Boolean(context && context !== "general" && !contexts.some((item) => item.id === context));
  return <form className="my-6 flex min-w-0 flex-wrap items-end gap-3">
    <label className="min-w-0 flex-1 sm:max-w-md">
      <span className="mb-2 block text-[13px] font-medium text-[var(--text-secondary)]">面试范围</span>
      <select name="context" defaultValue={context ?? ""} className="ui-field min-h-11 w-full min-w-0 rounded-[var(--radius-md)] bg-[var(--surface-control)] px-3 text-base text-[var(--text-primary)]">
        <option value="">当前目标与通用题</option>
        <option value="general">通用面试</option>
        {unknown ? <option value={context}>当前岗位不可用</option> : null}
        {contexts.map((item) => <option key={item.id} value={item.id}>{item.title}{item.status === "paused" ? " · 已暂停" : item.status === "closed" ? " · 已结束" : ""}</option>)}
      </select>
    </label>
    <Button type="submit" variant="secondary" className="min-h-11">切换范围</Button>
  </form>;
}

export function PracticeUnavailable({ href }: { href: string }) {
  return <div role="alert" className="my-6 rounded-[var(--radius-lg)] border border-[var(--control-border)] bg-[var(--surface-canvas)] p-5 text-sm leading-6 text-[var(--text-secondary)]">
    <p className="font-medium text-[var(--text-primary)]">部分资料未能读取</p>
    <p>当前数量和排序可能不完整，请重试后再判断准备情况。</p>
    <Link href={href} className="ui-link mt-2 inline-block">重新读取</Link>
  </div>;
}
