"use client";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";

export default function InvestmentsError({ reset }: { reset: () => void }) {
  return <section><PageHeader title="投资" /><div role="alert" className="mt-8 space-y-3 text-[14px] text-[var(--text-secondary)]"><p>投资记录暂时无法显示，请稍后重试。</p><Button variant="secondary" onClick={reset}>重试读取</Button></div></section>;
}
