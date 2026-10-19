"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ExperienceReadNotice({ unavailable }: { unavailable: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!unavailable) return null;
  return <div role="alert" className="mb-6 rounded-[var(--radius-lg)] border border-[var(--control-border)] p-4 text-sm leading-6"><p>部分资料未能读取，内容和数量可能不完整。</p><Button variant="link" disabled={pending} onClick={() => {
    // Explicit recovery: the local metadata/reader cannot repair a failed server read.
    start(() => router.refresh());
  }}>{pending ? "重新读取中…" : "重新读取经历资料"}</Button></div>;
}
