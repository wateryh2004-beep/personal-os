import { PageHeader } from "@/components/shared/page-header";

export default function InvestmentsLoading() {
  return <section aria-busy="true"><PageHeader title="投资" description="看清持有，写下判断，让每一次验证都有来处。" /><p role="status" className="mt-8 border-t border-[var(--separator)] pt-5 text-[13px] text-[var(--text-tertiary)]">正在读取投资记录…</p></section>;
}
