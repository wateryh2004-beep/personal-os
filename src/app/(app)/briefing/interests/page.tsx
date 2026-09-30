import { Button } from "@/components/ui/button";
import {
  archiveBriefingExclusionAction,
  createBriefingExclusionAction,
  createBriefingInterestAction,
  setBriefingInterestStatusAction,
  updateBriefingInterestAction,
} from "@/features/briefing/actions";
import { getBriefingInterests } from "@/features/briefing/queries";
import { BriefingSettings } from "@/components/briefing/briefing-settings";

const weights = [[80, "高"], [50, "中"], [25, "低"]] as const;
const control = "h-9 w-full rounded-[10px] border border-transparent bg-[var(--surface-control)] px-3 text-[12.5px] text-[var(--text-primary)] outline-none hover:bg-[var(--surface-control-hover)] focus:bg-[var(--surface-canvas)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]";
const textarea = "min-h-20 w-full resize-y rounded-[10px] border border-transparent bg-[var(--surface-control)] px-3 py-2.5 text-[12.5px] leading-5 text-[var(--text-primary)] outline-none hover:bg-[var(--surface-control-hover)] focus:bg-[var(--surface-canvas)] focus:shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_14%,transparent)]";

export default async function BriefingInterestsPage() {
  const { interests, exclusions } = await getBriefingInterests();
  return (
    <main className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_296px]">
      <section>
        <h2 className="text-[13.25px] font-semibold text-[var(--text-primary)]">兴趣主题</h2>
        <form action={createBriefingInterestAction} className="mt-2.5 grid gap-2.5 rounded-[13px] border border-[var(--separator)] bg-[var(--material-regular)] p-3.5 sm:grid-cols-2">
          <input name="name" required placeholder="主题名称" className={control} />
          <select name="weight" defaultValue="50" className={control}>{weights.map(([value,label]) => <option key={value} value={value}>{label}优先级</option>)}</select>
          <textarea name="keywords" required placeholder="关键词，以逗号或换行分隔" className={`${textarea} sm:col-span-2`} />
          <textarea name="excluded_keywords" placeholder="主题内排除词" className={`${textarea} min-h-16 sm:col-span-2`} />
          <Button className="w-fit">添加兴趣</Button>
        </form>

        <div className="mt-3.5 divide-y divide-[var(--separator)] border-y border-[var(--separator)]">
          {interests.map((interest) => (
            <details key={interest.id} className="py-2.5">
              <summary className="pressable flex cursor-pointer list-none items-center justify-between gap-3 rounded-[8px] px-1 py-0.5">
                <span className="text-[13px] font-medium text-[var(--text-primary)]">{interest.name}</span>
                <span className="text-[10.5px] text-[var(--text-tertiary)]">{weights.find(([weight]) => weight === interest.weight)?.[1] ?? "中"} · {interest.status === "active" ? "启用" : interest.status === "paused" ? "暂停" : "已归档"}</span>
              </summary>
              <form action={updateBriefingInterestAction} className="mt-2.5 grid gap-2.5 rounded-[11px] bg-[color-mix(in_srgb,var(--surface-control)_48%,transparent)] p-3">
                <input type="hidden" name="interest_id" value={interest.id} />
                <input name="name" defaultValue={interest.name} required className={control} />
                <select name="weight" defaultValue={interest.weight} className={control}>{weights.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
                <textarea name="keywords" defaultValue={(interest.keywords ?? []).join("\n")} className={textarea} />
                <textarea name="excluded_keywords" defaultValue={(interest.excluded_keywords ?? []).join("\n")} className={`${textarea} min-h-16`} />
                <Button className="w-fit">保存</Button>
              </form>
              <div className="mt-2 flex gap-2">
                <form action={setBriefingInterestStatusAction}><input type="hidden" name="interest_id" value={interest.id}/><input type="hidden" name="status" value={interest.status === "active" ? "paused" : "active"}/><Button size="sm" variant="ghost">{interest.status === "active" ? "暂停" : "启用"}</Button></form>
                <form action={setBriefingInterestStatusAction}><input type="hidden" name="interest_id" value={interest.id}/><input type="hidden" name="status" value="archived"/><Button size="sm" variant="ghost">归档</Button></form>
              </div>
            </details>
          ))}
        </div>
      </section>

      <aside>
        <h2 className="text-[13.25px] font-semibold text-[var(--text-primary)]">全局排除</h2>
        <p className="mt-1 text-[11.5px] leading-5 text-[var(--text-secondary)]">命中后直接排除，不依赖兴趣主题。</p>
        <form action={createBriefingExclusionAction} className="mt-2.5 flex gap-2">
          <input name="phrase" required placeholder="例如：娱乐八卦" className={control} />
          <Button>添加</Button>
        </form>
        <ul className="mt-3 divide-y divide-[var(--separator)] border-y border-[var(--separator)]">
          {exclusions.map((item) => (
            <li key={item.id} className="flex min-h-[38px] items-center justify-between gap-3 px-1 py-1.5 text-[12px] text-[var(--text-primary)]">
              <span className="truncate">{item.phrase}</span>
              <form action={archiveBriefingExclusionAction}><input type="hidden" name="exclusion_id" value={item.id}/><button className="text-[10.5px] text-[var(--danger)]">移除</button></form>
            </li>
          ))}
        </ul>
      </aside>

      <div className="lg:col-span-2"><BriefingSettings /></div>
    </main>
  );
}
