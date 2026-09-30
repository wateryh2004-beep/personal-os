"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shared/page-header";
import { createPurchaseItem } from "@/features/shopping/actions";
import { formatCny } from "@/lib/format";

type Item = { id: string; title: string; price_cny: number | null; status: string; cooldown_until: string | null; category: string | null; necessity: string };
const shoppingStatus: Record<string,string> = { cooling:"冷静期", ready:"可决定", purchased:"已购买", abandoned:"已放弃" };

export function ShoppingWorkspace({ items, stats: _stats, initialCreateOpen }: { items: Item[]; stats: { active: number; ready: number; purchased: number }; initialCreateOpen: boolean }) {
  void _stats;
  const [creating, setCreating] = useState(initialCreateOpen);
  const [pending, start] = useTransition();
  const [rows, setRows] = useState(items);
  const [error, setError] = useState("");
  const ready = rows.filter((item) => item.status === "ready" || (item.status === "cooling" && item.cooldown_until && new Date(item.cooldown_until) <= new Date()));
  const cooling = rows.filter((item) => item.status === "cooling" && (!item.cooldown_until || new Date(item.cooldown_until) > new Date()));
  const currentStats = { active: rows.filter((item) => !["purchased", "abandoned"].includes(item.status)).length, ready: ready.length, purchased: rows.filter((item) => item.status === "purchased").length };
  const submit = (form: FormData) => {
    const tempId = `optimistic-${crypto.randomUUID()}`;
    const title = String(form.get("title") || "").trim();
    const price = Number(form.get("priceCny"));
    const necessary = form.get("necessity") === "necessary" && form.get("necessityConfirmed") === "on";
    const optimistic: Item = { id: tempId, title, price_cny: Number.isFinite(price) && String(form.get("priceCny") || "") ? price : null, category: null, necessity: String(form.get("necessity") || "unknown"), status: necessary && Number.isFinite(price) && price <= 50 ? "ready" : "cooling", cooldown_until: necessary && Number.isFinite(price) && price <= 50 ? null : new Date(Date.now() + 7 * 86_400_000).toISOString() };
    setRows((current) => [optimistic, ...current]);
    setCreating(false);
    setError("");
    start(async () => {
      try {
        const created = await createPurchaseItem(form);
        setRows((current) => current.map((item) => item.id === tempId ? { ...optimistic, id: created.id } : item));
      } catch {
        setRows((current) => current.filter((item) => item.id !== tempId));
        setError("保存失败，待购项目未创建。请稍后重试。");
      }
    });
  };

  return <section className="space-y-6">
    <PageHeader title="待购" description="默认等待；必要且不超过 ¥50 才允许立即购买。" action={<Button onClick={() => setCreating(true)}>加入待购</Button>} />
    {error ? <p role="alert" className="rounded-[9px] bg-red-50 px-3 py-2 text-[11.5px] text-[var(--danger)]">{error}</p> : null}
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-y border-[var(--separator)] py-2.5 text-[12px] text-[var(--text-secondary)]"><span>待购 <strong className="tabular-nums">{currentStats.active}</strong></span><span className="text-[var(--text-tertiary)]">·</span><span>可决定 <strong className="tabular-nums">{currentStats.ready}</strong></span><span className="text-[var(--text-tertiary)]">·</span><span>已购买 <strong className="tabular-nums">{currentStats.purchased}</strong></span></div>
    <ItemSection title="待决定" items={ready}/><ItemSection title="冷静期" items={cooling}/><ItemSection title="全部" items={rows}/>
    <Dialog open={creating} onOpenChange={setCreating}><DialogContent><DialogHeader><DialogTitle>加入待购</DialogTitle><DialogDescription>默认进入冷静期；确认必要且价格不超过 ¥50 时才可立即购买。</DialogDescription></DialogHeader><form action={submit} className="grid gap-3 sm:grid-cols-2"><Input name="title" required placeholder="想买什么？"/><Input name="priceCny" type="number" min="0" step="0.01" placeholder="价格（元，可选）"/><label className="grid gap-1.5 text-[11px] font-medium text-[var(--text-secondary)]">必要性<select name="necessity" className="h-9 rounded-[9px] border border-transparent bg-[var(--surface-control)] px-2.5 text-[12.5px] text-[var(--text-primary)] outline-none"><option value="unknown">还没决定是否必要</option><option value="necessary">必要品</option><option value="nonessential">非必要品</option></select></label><label className="flex min-h-9 items-center gap-2 self-end pb-0.5 text-[12px] text-[var(--text-secondary)]"><input name="necessityConfirmed" type="checkbox"/> 我确认这是必要品</label><Textarea name="reasonToBuy" placeholder="为什么想买（可选）" className="sm:col-span-2"/><div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="outline" onClick={() => setCreating(false)}>取消</Button><Button disabled={pending}>保存</Button></div></form></DialogContent></Dialog>
  </section>;
}

function ItemSection({ title, items }: { title: string; items: Item[] }) {
  return <section><h2 className="mb-2.5 text-[12px] font-semibold text-[var(--text-secondary)]">{title}</h2><div className="divide-y divide-[var(--separator)] border-y border-[var(--separator)]">{items.length ? items.map((item) => item.id.startsWith("optimistic-") ? <div key={item.id} className="flex min-h-12 items-center justify-between gap-4 px-2 py-2.5 opacity-70"><div><p className="text-[13px] font-medium text-[var(--text-primary)]">{item.title}</p><p className="mt-0.5 text-[10.5px] text-[var(--text-tertiary)]">正在保存…</p></div><span className="text-[12px] tabular-nums text-[var(--text-secondary)]">{item.price_cny === null ? "价格未知" : formatCny(item.price_cny)}</span></div> : <Link key={item.id} href={`/shopping/${item.id}`} className="pressable flex min-h-12 items-center justify-between gap-4 px-2 py-2.5 hover:bg-[var(--surface-hover)]"><div><p className="text-[13px] font-medium text-[var(--text-primary)]">{item.title}</p><p className="mt-1 text-xs text-[var(--text-tertiary)]">{item.category || "未分类"} · {shoppingStatus[item.status] ?? item.status}</p></div><span className="text-sm tabular-nums">{item.price_cny === null ? "价格未知" : formatCny(item.price_cny)}</span></Link>) : <p className="px-2 py-5 text-[11.5px] text-[var(--text-tertiary)]">暂无项目。</p>}</div></section>;
}
