"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { announceNavigationIntent } from "@/features/workflow-continuity/navigation-intent";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/shared/page-header";
import { WorkbenchRecord, useWorkbench } from "@/components/workbench/workbench-record";
import { createPurchaseItem, readPurchaseItemState } from "@/features/shopping/actions";
import { type LifeFieldRow } from "@/features/life/contracts";
import { formatCny } from "@/lib/format";
import { useLifeUndo } from "@/components/life/use-life-undo";
import { ShoppingChange } from "./shopping-change-dialog";
import styles from "@/components/life/life-field.module.css";

type Item = { id: string; title: string; price_cny: number | null; status: string; cooldown_until: string | null; category: string | null; necessity: string; quantity?: string | null; quantity_unit?: string | null; mutation_revision?: number };
const statusLabels: Record<string, string> = { inbox: "待判断", cooling: "冷静期", ready: "可决定", purchased: "已购买", abandoned: "已放弃" };
const necessityLabels: Record<string, string> = { necessary: "必要品", nonessential: "非必要品", unknown: "尚未判断" };
const normalizedTitle = (title: string) => title.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("zh-CN");
const quantityLabel = (item: Item) => item.quantity && item.quantity_unit ? `${item.quantity} ${item.quantity_unit}` : "数量未记录";
const canPurchase = (item: Item) => item.status === "ready" || item.status === "cooling" && Boolean(item.cooldown_until && Date.parse(item.cooldown_until) <= Date.now());
const filterValues = ["active", "ready", "purchased", "abandoned", "all"] as const;
type ShoppingFilter = typeof filterValues[number];
const validFilter = (value: string | null): ShoppingFilter => filterValues.includes(value as ShoppingFilter) ? value as ShoppingFilter : "active";

export function ShoppingWorkspace({ items, stats: _stats, initialCreateOpen }: { items: Item[]; stats: { active: number; ready: number; purchased: number }; initialCreateOpen: boolean }) {
  void _stats;
  const router = useRouter(); const params = useSearchParams(); const workbench = useWorkbench();
  const fieldMode = params.get("mode") === "field";
  const [rows, setRows] = useState(items); const [creating, setCreating] = useState(initialCreateOpen);
  const [createPending, setCreatePending] = useState(false); const [error, setError] = useState("");
  const createBusy = useRef(false);
  const confirmedCreateId=useRef<string|null>(null);
  const [editing, setEditing] = useState<{ items: Item[]; kind: "quantity" | "purchased" } | null>(null);
  const routeFilter = validFilter(params.get("status"));
  // Urgent selection stays local while Next integrates the native history write.
  // Any later route query (scene restore or Back/Forward) is authoritative.
  const [filterDraft, setFilterDraft] = useState({ routeFilter, value: routeFilter });
  if (filterDraft.routeFilter !== routeFilter) setFilterDraft({ routeFilter, value: routeFilter });
  const filter = filterDraft.routeFilter === routeFilter ? filterDraft.value : routeFilter;
  const setFilter = (value: string) => {
    const next = validFilter(value);
    setFilterDraft({ routeFilter, value: next });
    const url = new URL(window.location.href);
    if (next === "active") url.searchParams.delete("status"); else url.searchParams.set("status", next);
    // Passing null lets Next preserve its private state and notify useSearchParams.
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };
  const [sourceItems, setSourceItems] = useState(items);
  if (sourceItems !== items) { setSourceItems(items); setRows(items); }
  const visible = rows.filter((item) => fieldMode ? !["purchased", "abandoned"].includes(item.status) : filter === "all" || (filter === "active" ? !["purchased", "abandoned"].includes(item.status) : filter === "ready" ? canPurchase(item) : item.status === filter));
  // Display grouping only: retain every record, quantity/unit and purchase decision.
  const fieldGroups = new Map<string, Item[]>();
  if (fieldMode) for (const item of visible) {
    const key = normalizedTitle(item.title);
    const records = fieldGroups.get(key);
    if (records) records.push(item); else fieldGroups.set(key, [item]);
  }
  const group = `shopping:${fieldMode ? "field" : filter}`;
  const selected = rows.filter((item) => workbench?.selected.some((ref) => ref.kind === "shopping" && ref.id === item.id));
  const setMode = () => { announceNavigationIntent(); const next = new URLSearchParams(params.toString()); if (fieldMode) next.delete("mode"); else next.set("mode", "field"); router.replace(`/shopping${next.size ? `?${next}` : ""}`, { scroll: false }); };
  const install = (saved: LifeFieldRow[]) => setRows((current) => current.map((item) => { const patch = saved.find((row) => row.id === item.id); return patch && Number(patch.mutation_revision??0)>=Number(item.mutation_revision??0) ? { ...item, ...patch } as Item : item; }));
  useLifeUndo((operation,saved)=>{if(operation.startsWith("shopping_"))install(saved);});
  async function create(form: FormData) {
    if (createBusy.current) return;
    createBusy.current = true; setCreatePending(true); setError("");
    try {
      const id = confirmedCreateId.current ?? await createPurchaseItem(form);
      confirmedCreateId.current=id;
      const state=await readPurchaseItemState(id);
      if(!state.ok){setError("项目已创建，但暂时无法核对最新字段。输入已保留；再次保存只会读取这条记录。");return;}
      setRows(current=>[state.item,...current.filter(item=>item.id!==id)]);
      confirmedCreateId.current=null;
      setCreating(false);
    } catch { setError("暂时无法确认保存结果，输入已保留。请先核对待购列表后再决定是否重试。"); }
    finally { createBusy.current = false; setCreatePending(false); }
  }
  const renderItem = (item: Item) => <li key={item.id} className={styles.row} data-shopping-record={item.id}><WorkbenchRecord entity={{ kind: "shopping", id: item.id }} title={item.title} group={group} draggable={false}><div className={styles.rowHead}><Link className="ui-link" href={`/shopping/${item.id}`}>{item.title}</Link><span className={styles.meta}>{item.price_cny === null ? "价格未知" : formatCny(item.price_cny)}</span><button className={styles.action} type="button" onClick={() => setEditing({ kind: "quantity", items: [item] })}>{quantityLabel(item)} · 修改</button>{fieldMode && canPurchase(item) ? <button className={styles.action} onClick={() => setEditing({ kind: "purchased", items: [item] })}>我买了</button> : null}</div><p className={styles.meta}>{statusLabels[item.status] ?? item.status}{item.status === "cooling" && item.cooldown_until ? ` · ${new Date(item.cooldown_until).toLocaleString("zh-CN")} 后可决定` : ""}</p>{fieldMode ? <p className={styles.meta}>必要性：{necessityLabels[item.necessity] ?? item.necessity} · 购买资格：{canPurchase(item) ? "可决定" : "尚不可购买"}</p> : null}</WorkbenchRecord></li>;
  return <section className={fieldMode ? styles.fieldMode : ""}>
    <PageHeader title={fieldMode ? "采购清单" : "待购"} description={fieldMode ? "按已保存的数量核对，买到后由你标记。" : "记录候选，按冷静期重新决定。"} action={<Button onClick={() => {confirmedCreateId.current=null;setError("");setCreating(true);}}>加入待购</Button>} />
    <div className={styles.toolbar} tabIndex={-1} data-life-return-focus><button type="button" onClick={setMode}>{fieldMode ? "退出现在用" : "现在用 · 采购"}</button>{!fieldMode ? <label className={styles.field}>显示<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="active">待购项目</option><option value="ready">可决定</option><option value="purchased">已购买</option><option value="abandoned">已放弃</option><option value="all">全部</option></select></label> : null}<span className={styles.meta}>{fieldMode ? `${fieldGroups.size} 组 · ${visible.length} 条记录` : `${visible.length} 项`}</span></div>
    {selected.length ? <div className={styles.toolbar} aria-label="所选待购操作"><span>已选 {selected.length} 项</span><button disabled={selected.length > 20} onClick={() => setEditing({ kind: "quantity", items: selected })}>批量改数量</button><button disabled={selected.length > 20 || selected.some((item) => !canPurchase(item))} onClick={() => setEditing({ kind: "purchased", items: selected })}>标记已购买</button><button disabled={selected.length < 2 || selected.length > 4} onClick={() => workbench?.compare(selected.map((item) => ({ kind: "shopping", id: item.id })))}>比较</button><button onClick={() => workbench?.clearSelection()}>取消选择</button></div> : null}
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    <ul className={styles.list}>{fieldMode ? [...fieldGroups].map(([key, records]) => records.length === 1 ? renderItem(records[0]) : <li key={`group:${key}`} className={styles.duplicateGroup}><details><summary className={styles.groupSummary}><span>{records[0].title.trim()}</span><span className={styles.meta}>{records.length} 条记录，分别核对 · 展开</span></summary><p className={styles.notice}>仅按名称归组；数量、单位、价格和资格逐条核对。</p><ul className={styles.list}>{records.map(renderItem)}</ul></details></li>) : visible.map(renderItem)}</ul>
    {!visible.length ? <p className={styles.notice}>{fieldMode ? "没有待采购项目。" : "当前条件下没有项目。"}</p> : null}
    {editing ? <ShoppingChange key={`${editing.kind}:${editing.items.map((item) => item.id).join(":")}`} {...editing} onClose={() => setEditing(null)} onSaved={(saved) => { install(saved); setEditing(null); workbench?.clearSelection(); }} /> : null}
    <Dialog open={creating} onOpenChange={(value) => { if(createPending)return false;setCreating(value); }}><DialogContent><DialogHeader><DialogTitle>加入待购</DialogTitle><DialogDescription>价格沿用原记录口径；数量单独记录。</DialogDescription></DialogHeader><form onSubmit={event=>{event.preventDefault();void create(new FormData(event.currentTarget));}}>
      <div className={styles.fields}><label className={styles.field}>名称<input name="title" required maxLength={500} /></label><label className={styles.field}>价格（元，可留空）<input name="priceCny" type="number" min="0" step="0.01" /></label><label className={styles.field}>数量<input name="quantity" inputMode="decimal" required pattern="[0-9]+(\.[0-9]{1,3})?" /></label><label className={styles.field}>单位<input name="quantityUnit" required maxLength={24} placeholder="件、瓶、千克…" /></label><label className={styles.field}>必要性<select name="necessity"><option value="unknown">尚未判断</option><option value="necessary">必要品</option><option value="nonessential">非必要品</option></select></label><label className="flex min-h-11 items-center gap-2 text-sm"><input name="necessityConfirmed" type="checkbox" />我确认这是必要品</label><label className={styles.field}>购买理由<input name="reasonToBuy" maxLength={2000} /></label></div>
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}<div className={styles.actions}><Button type="button" variant="outline" disabled={createPending} onClick={() => setCreating(false)}>取消</Button><Button disabled={createPending}>{createPending ? "保存中…" : "保存"}</Button></div></form></DialogContent></Dialog>
  </section>;
}
