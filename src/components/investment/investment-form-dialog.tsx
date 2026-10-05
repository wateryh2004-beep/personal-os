"use client";

import { useId, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useMobileBackLayer } from "@/lib/mobile/use-mobile-back-layer";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { addInvestmentEntry, createInvestmentAccount, importInvestmentResearch, saveInvestmentStrategy, voidInvestmentEntry } from "@/features/investment/actions";
import type { InvestmentAccount, InvestmentActionResult, LedgerEntry, StrategyVersion } from "@/features/investment/types";
import type { InvestmentMode } from "./presentation";

export type InvestmentDialog = { kind: "account" } | { kind: "entry"; accountId?: string; importKey: string } | { kind: "strategy"; strategy?: StrategyVersion } | { kind: "research" } | { kind: "void"; entry: LedgerEntry; importKey: string };
const selectClass = "h-9 min-w-0 w-full rounded-[var(--radius-md)] border border-[var(--control-border)] bg-[var(--surface-control)] px-3 text-[14px] text-[var(--text-primary)]";
const decimalPattern = "[0-9]{1,12}(\\.[0-9]{1,8})?";

export function InvestmentFormDialog({ dialog, mode, accounts, importExample, onClose, onSaved, onRestoreFocus }: { dialog: InvestmentDialog; mode: InvestmentMode; accounts: InvestmentAccount[]; importExample: string; onClose: () => void; onSaved: (message: string) => void; onRestoreFocus: () => void }) {
  const router = useRouter();
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const busyRef = useRef(false);
  useMobileBackLayer(true, () => {
    if (busyRef.current) return false;
    onClose();
  }, "investment-form");
  const modeLabel = mode === "real" ? "实盘" : "模拟";
  const title = dialog.kind === "void" ? "作废一条记录" : dialog.kind === "account" ? `添加${modeLabel}账户` : dialog.kind === "entry" ? `添加${modeLabel}记录` : dialog.kind === "research" ? "导入研究" : dialog.strategy ? "保存策略新版本" : "写下策略";
  const description = dialog.kind === "void" ? "作废会重新计算持仓，原记录与作废原因都会保留。这不会执行任何真实交易。" : dialog.kind === "account" ? "一个账户使用一种币种。实盘和模拟会分别记录。" : dialog.kind === "entry" ? "只记录已经发生的持仓或成交，不会连接券商或下单。" : dialog.kind === "strategy" ? "记录判断、执行条件与风险。保存后保留版本，后续修改另存为新版本。" : "粘贴包含来源与方法的 JSON。导入后保留原始结论，不会自动变成持仓或交易。";
  const saveLabel = dialog.kind === "void" ? "确认作废" : dialog.kind === "account" ? "创建账户" : dialog.kind === "entry" ? "确认记录" : dialog.kind === "research" ? "导入研究" : "保存版本";
  const action = dialog.kind === "void" ? voidInvestmentEntry : dialog.kind === "account" ? createInvestmentAccount : dialog.kind === "entry" ? addInvestmentEntry : dialog.kind === "research" ? importInvestmentResearch : saveInvestmentStrategy;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // A synchronous guard covers repeated submissions before React paints pending.
    if (busyRef.current) return;
    const form = new FormData(event.currentTarget);
    busyRef.current = true;
    setError("");
    startTransition(async () => {
      try {
        const result: InvestmentActionResult = await action(form);
        if (!result.ok) {
          setError(result.error || "尚未保存，请检查填写内容后重试。");
          return;
        }
        onSaved(result.duplicate ? "这份记录已经保存，没有重复添加。" : dialog.kind === "void" ? "记录已作废，原始记录仍保留" : dialog.kind === "account" ? "账户已创建" : dialog.kind === "entry" ? "持仓记录已保存" : dialog.kind === "research" ? "研究已导入" : "策略新版本已保存");
        router.refresh();
      } catch {
        setError("暂时无法确认保存结果。内容已保留，请稍后重试。");
      } finally {
        busyRef.current = false;
      }
    });
  }

  return <DialogPrimitive.Root open onOpenChange={(open) => { if (!open && !busyRef.current) onClose(); }}>
    <DialogContent showCloseButton={!pending} className="max-h-[85dvh] overflow-y-auto sm:max-w-xl" onEscapeKeyDown={(event) => { if (busyRef.current) event.preventDefault(); }} onInteractOutside={(event) => { if (busyRef.current) event.preventDefault(); }} onCloseAutoFocus={(event) => { event.preventDefault(); onRestoreFocus(); }}>
      <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
      <form onSubmit={submit} aria-busy={pending} aria-describedby={error ? `${id}-error` : undefined}>
        <fieldset disabled={pending} className="grid min-w-0 gap-4">
          {dialog.kind === "void" ? <VoidFields id={id} entry={dialog.entry} importKey={dialog.importKey} /> : dialog.kind === "account" ? <AccountFields id={id} mode={mode} /> : dialog.kind === "entry" ? <EntryFields id={id} accounts={accounts} initialAccountId={dialog.accountId} importKey={dialog.importKey} mode={mode} /> : dialog.kind === "strategy" ? <StrategyFields id={id} strategy={dialog.strategy} /> : <ResearchFields id={id} example={importExample} />}
        </fieldset>
        {error ? <p id={`${id}-error`} role="alert" className="mt-4 rounded-[var(--radius-md)] bg-[var(--danger-soft)] p-3 text-[13px] leading-6 text-[var(--danger)]">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2 border-t border-[var(--separator)] pt-4"><Button type="button" variant="outline" disabled={pending} onClick={onClose}>取消</Button><Button type="submit" disabled={pending}>{pending ? "保存中…" : error ? "重试保存" : saveLabel}</Button></div>
      </form>
    </DialogContent>
  </DialogPrimitive.Root>;
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return <div className="grid min-w-0 gap-1.5"><label htmlFor={id} className="text-[13px] font-medium text-[var(--text-secondary)]">{label}</label>{children}{hint ? <p id={`${id}-hint`} className="text-[12px] leading-5 text-[var(--text-tertiary)]">{hint}</p> : null}</div>;
}

function AccountFields({ id, mode }: { id: string; mode: InvestmentMode }) {
  return <><input type="hidden" name="mode" value={mode} /><Field id={`${id}-name`} label="账户名称"><Input id={`${id}-name`} name="name" required maxLength={80} autoComplete="off" placeholder="用你熟悉的名称区分账户" /></Field><Field id={`${id}-currency`} label="账户币种" hint="不同币种请分开建账，当前不做汇率换算。"><select id={`${id}-currency`} name="currency" defaultValue="CNY" className={selectClass} aria-describedby={`${id}-currency-hint`}><option value="CNY">CNY · 人民币</option><option value="USD">USD · 美元</option><option value="HKD">HKD · 港币</option></select></Field></>;
}

function EntryFields({ id, accounts, initialAccountId, importKey, mode }: { id: string; accounts: InvestmentAccount[]; initialAccountId?: string; importKey: string; mode: InvestmentMode }) {
  const [kind, setKind] = useState("opening");
  const [accountId, setAccountId] = useState(initialAccountId || accounts[0]?.id || "");
  const currency = accounts.find((account) => account.id === accountId)?.currency ?? "";
  return <>
    <input type="hidden" name="import_key" value={importKey} />
    <div className="grid gap-4 sm:grid-cols-2"><Field id={`${id}-account`} label="账户"><select id={`${id}-account`} name="account_id" value={accountId} required onChange={(event) => setAccountId(event.target.value)} className={selectClass}>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}</select></Field><Field id={`${id}-kind`} label="记录类型"><select id={`${id}-kind`} name="kind" value={kind} onChange={(event) => setKind(event.target.value)} className={selectClass}><option value="opening">期初持仓</option><option value="buy">买入</option><option value="sell">卖出</option></select></Field></div>
    <div className="grid gap-4 sm:grid-cols-2"><Field id={`${id}-symbol`} label="市场与标的代码" hint="用市场前缀区分同名标的，如 XSHG:510300。"><Input id={`${id}-symbol`} name="symbol" required maxLength={40} placeholder="市场:代码" autoCapitalize="characters" autoComplete="off" aria-describedby={`${id}-symbol-hint`} /></Field><Field id={`${id}-date`} label={kind === "opening" ? "期初日期" : "成交日期"}><Input id={`${id}-date`} name="occurred_on" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} max={new Date().toISOString().slice(0, 10)} /></Field></div>
    <div className="grid gap-4 sm:grid-cols-2"><Field id={`${id}-quantity`} label="数量"><Input id={`${id}-quantity`} name="quantity" required inputMode="decimal" pattern={decimalPattern} placeholder="份额或股数" /></Field><Field id={`${id}-price`} label={`${kind === "opening" ? "单位成本（可留空）" : "成交单价"} · ${currency}`} hint={kind === "opening" ? "不知道成本时留空，不会当作成本为零。" : undefined}><Input id={`${id}-price`} name="price" required={kind !== "opening"} inputMode="decimal" pattern={decimalPattern} placeholder={kind === "opening" ? "未知时留空" : "实际成交单价"} aria-describedby={kind === "opening" ? `${id}-price-hint` : undefined} /></Field></div>
    <Field id={`${id}-fees`} label={`费用 · ${currency}`} hint="没有费用填 0。费用会计入成本或从卖出所得中扣除。"><Input id={`${id}-fees`} name="fees" required inputMode="decimal" pattern={decimalPattern} defaultValue="0" aria-describedby={`${id}-fees-hint`} /></Field>
    <Field id={`${id}-source`} label="记录来源" hint="填写账单名称、成交记录日期或模拟依据，不要填写账号、密码等敏感信息。"><Input id={`${id}-source`} name="source" required maxLength={500} placeholder="这笔记录依据什么？" aria-describedby={`${id}-source-hint`} /></Field>
    <label className="flex items-start gap-2 text-[13px] leading-6 text-[var(--text-secondary)]"><input type="checkbox" name="confirmed" required className="mt-1.5 size-4 accent-[var(--accent)]" />{mode === "real" ? "我已核对，这是实际持仓或已发生的成交，不是未来计划。" : "我已核对，这是明确的模拟记录，不是实盘成交。"}</label>
  </>;
}

function StrategyFields({ id, strategy }: { id: string; strategy?: StrategyVersion }) {
  return <><Field id={`${id}-title`} label="策略名称"><Input id={`${id}-title`} name="title" required maxLength={160} defaultValue={strategy?.title} placeholder="给这套判断一个简短的名字" /></Field><Field id={`${id}-key`} label="策略标识" hint={strategy ? "沿用同一标识，保存为独立新版本；原版本保持不变。" : "使用小写字母、数字或短横线。后续版本使用同一标识。"}><Input id={`${id}-key`} name="strategy_key" required maxLength={80} pattern="[a-z0-9][a-z0-9_-]{0,79}" defaultValue={strategy?.strategy_key} readOnly={!!strategy} aria-describedby={`${id}-key-hint`} placeholder="my-strategy" /></Field><Field id={`${id}-body`} label="判断与规则" hint="可用 Markdown，建议包含：依据、买入与退出条件、仓位约束、风险和反例。"><Textarea id={`${id}-body`} name="body_markdown" required maxLength={40000} defaultValue={strategy?.body_markdown} rows={8} className="min-h-48" placeholder="这条策略想验证什么？什么会让它失效？" aria-describedby={`${id}-body-hint`} /></Field></>;
}

function ResearchFields({ id, example }: { id: string; example: string }) {
  return <><Field id={`${id}-payload`} label="研究 JSON" hint="研究观点使用 kind: research，metrics 为 null。外部回测还需数据快照、代码版本、回测区间、基准、成本假设与原始产物链接。"><Textarea id={`${id}-payload`} name="payload" required maxLength={120000} rows={12} className="min-h-64 font-mono text-[12px]" spellCheck={false} placeholder="粘贴完整 JSON…" aria-describedby={`${id}-payload-hint`} /></Field><details className="min-w-0 text-[12px] leading-6 text-[var(--text-tertiary)]"><summary className="cursor-pointer">查看研究观点的格式模板</summary><p className="mt-2">模板只说明格式。请替换标题、日期、来源和内容，并为每份研究填写独立的 import_key。</p><pre className="mt-2 max-h-60 overflow-auto rounded-[var(--radius-md)] bg-[var(--surface-control)] p-3 text-[11px]">{example}</pre></details></>;
}

function VoidFields({ id, entry, importKey }: { id: string; entry: LedgerEntry; importKey: string }) {
  return <>
    <input type="hidden" name="entry_id" value={entry.id} />
    <input type="hidden" name="import_key" value={importKey} />
    <div className="rounded-[var(--radius-md)] bg-[var(--surface-control)] p-3 text-[13px] leading-6 text-[var(--text-secondary)]"><p>{entry.occurred_on} · {entry.symbol} · 数量 {entry.quantity}</p><p className="break-words text-[12px] text-[var(--text-tertiary)]">原来源：{entry.source}</p></div>
    <Field id={`${id}-reason`} label="作废原因" hint="如填错数量、日期或重复录入。若作废会使后续卖出缺少持仓，系统会拒绝本次操作。"><Textarea id={`${id}-reason`} name="reason" required maxLength={500} rows={3} placeholder="为什么需要作废这条记录？" aria-describedby={`${id}-reason-hint`} /></Field>
    <label className="flex items-start gap-2 text-[13px] leading-6 text-[var(--text-secondary)]"><input name="confirmed" type="checkbox" required className="mt-1.5 size-4 accent-[var(--accent)]" />我确认排除这条记录，并保留原记录与作废原因。</label>
  </>;
}
