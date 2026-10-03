"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";

export default function WorkspaceError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const [pending, startTransition] = useTransition();
  return <section role="alert" className="mx-auto w-full max-w-xl px-5 py-10 sm:px-6">
    <h1 className="page-title">这个页面暂时无法打开</h1>
    <p className="mt-3 text-[14px] leading-6 text-[var(--text-secondary)]">可以重新读取页面，或先回到今日。已保存的内容仍保留。</p>
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <Button disabled={pending} onClick={() => startTransition(retry)}><RefreshCw aria-hidden="true" className={pending ? "animate-spin motion-reduce:animate-none" : ""} />{pending ? "正在重试…" : "重新读取页面"}</Button>
      <Button asChild variant="outline"><Link href="/today">回到今日</Link></Button>
    </div>
  </section>;
}
