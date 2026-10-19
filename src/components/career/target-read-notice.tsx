"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
export function TargetReadNotice({unavailable}:{unavailable:boolean}) {
  const router=useRouter(); const [pending,start]=useTransition();
  return unavailable ? <div role="alert" className="mb-6 rounded-xl border border-[var(--control-border)] p-4 text-sm leading-7"><p>部分岗位资料未能读取，题目和数量可能不完整。</p><Button variant="link" disabled={pending} onClick={()=>start(()=>router.refresh())}>{pending?"重新读取中…":"重新读取岗位资料"}</Button></div>:null;
}
