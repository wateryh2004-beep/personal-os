"use client";
import { useId, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useMobileBackLayer } from "@/lib/mobile/use-mobile-back-layer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addInvestmentCash, saveInvestmentQuotes, voidInvestmentCash } from "@/features/investment/daily-actions";
import type { InvestmentAccount } from "@/features/investment/types";
import type { InvestmentCashEntry } from "@/features/investment/daily-types";
export type DailyDialog = { kind: "cash" | "quote"; account: InvestmentAccount; importKey: string } | { kind: "cash-void"; account: InvestmentAccount; entry: InvestmentCashEntry; importKey: string };
const selectClass = "h-9 w-full rounded-[var(--radius-md)] border border-[var(--control-border)] bg-[var(--surface-control)] px-3 text-[14px]";
const decimalPattern = "[0-9]{1,12}(\\.[0-9]{1,8})?";
function Field({ id, name, label, children }: { id: string; name: string; label: string; children: ReactNode }) { return <div className="grid min-w-0 gap-1.5"><label htmlFor={`${id}-${name}`} className="text-[13px] font-medium text-[var(--text-secondary)]">{label}</label>{children}</div>; }
export function InvestmentDailyDialog({ dialog, onClose, onSaved, onRestoreFocus }: { dialog: DailyDialog; onClose: () => void; onSaved: (message: string) => void; onRestoreFocus: () => void }) {
  const id = useId(), router = useRouter(), busy = useRef(false);
  const [pending, startTransition] = useTransition(), [error, setError] = useState("");
  useMobileBackLayer(true, () => { if (busy.current) return false; onClose(); }, "investment-daily");
  const [kind, setKind] = useState("opening"), [importing, setImporting] = useState(false);
  const title = dialog.kind === "cash" ? "记录现金与分红" : dialog.kind === "quote" ? "更新持仓报价" : "作废现金记录";
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy.current) return;
    const form = new FormData(event.currentTarget); busy.current = true; setError("");
    startTransition(async () => {
      try {
        const result = await (dialog.kind === "cash" ? addInvestmentCash : dialog.kind === "quote" ? saveInvestmentQuotes : voidInvestmentCash)(form);
        if (!result.ok) { setError(result.error || "尚未保存，请核对后重试"); return; }
        onSaved(result.duplicate ? "记录已经保存，没有重复添加" : dialog.kind === "quote" ? "报价已记录，估值已更新" : "现金记录已保存"); router.refresh();
      } catch { setError("无法确认保存结果，输入已保留。请稍后用同一记录重试。"); }
      finally { busy.current = false; }
    });
  }
  const input = (name: string, label: string, options: React.ComponentProps<typeof Input> = {}) => <Field id={id} name={name} label={label}><Input id={`${id}-${name}`} name={name} required {...options} /></Field>;
  return <DialogPrimitive.Root open onOpenChange={(open) => { if (!open && !busy.current) onClose(); }}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl" showCloseButton={!pending} onEscapeKeyDown={(event) => { if (busy.current) event.preventDefault(); }} onInteractOutside={(event) => { if (busy.current) event.preventDefault(); }} onCloseAutoFocus={(event) => { event.preventDefault(); onRestoreFocus(); }}>
    <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{dialog.account.name} · {dialog.account.mode === "real" ? "实盘" : "模拟"} · {dialog.account.currency}。仅补充账本，不连接券商或执行交易。</DialogDescription></DialogHeader>
    <form onSubmit={submit} aria-busy={pending}><fieldset disabled={pending} className="grid min-w-0 gap-4"><input type="hidden" name="account_id" value={dialog.account.id} /><input type="hidden" name="import_key" value={dialog.importKey} />
      {dialog.kind === "cash" ? <>
        <Field id={id} name="kind" label="记录类型"><select id={`${id}-kind`} name="kind" className={selectClass} value={kind} onChange={(event) => setKind(event.target.value)}><option value="opening">期初现金</option><option value="deposit">入金</option><option value="withdrawal">出金</option><option value="dividend">现金分红</option><option value="fee">独立费用</option></select></Field>
        <p className="text-[12px] leading-6 text-[var(--text-tertiary)]">{kind === "opening" ? "填写首次记账日开始时、当日交易之前的现金余额（可为 0）。日期须不晚于已记录买卖和现金事件。" : kind === "fee" ? "只记未包含在成交费用中的独立费用，避免重复扣减。" : kind === "dividend" ? "记录实际到账的现金分红。总额减去扣税及费用计入现金；不改持仓成本。" : "仅记录已发生的资金流动；买卖产生的现金自动从成交记录计算，不要重复录入。"}</p>
        {input("occurred_on", "发生日期", { type: "date", defaultValue: new Date().toISOString().slice(0, 10), max: new Date().toISOString().slice(0, 10) })}
        {input("amount", `${kind === "dividend" ? "分红税前总额" : "金额"} · ${dialog.account.currency}`, { inputMode: "decimal", pattern: decimalPattern })}
        {kind === "dividend" ? <>{input("symbol", "市场与标的代码", { maxLength: 40, placeholder: "市场:代码" })}<div className="grid gap-4 sm:grid-cols-2">{input("tax", "扣税", { inputMode: "decimal", pattern: decimalPattern, defaultValue: "0" })}{input("fees", "分红费用", { inputMode: "decimal", pattern: decimalPattern, defaultValue: "0" })}</div></> : null}
        {input("source", "记录来源", { maxLength: 500, placeholder: "账单名称、日期或模拟依据" })}
      </> : dialog.kind === "cash-void" ? <><input type="hidden" name="entry_id" value={dialog.entry.id} /><p className="text-[13px] leading-6">{dialog.entry.occurred_on} · {dialog.entry.amount} {dialog.account.currency}。原记录会保留；作废期初现金会让余额恢复为未知。</p>{input("source", "作废原因", { maxLength: 500 })}</> : <>
        <Field id={id} name="method" label="录入方式"><select id={`${id}-method`} className={selectClass} value={importing ? "import" : "manual"} onChange={(event) => setImporting(event.target.value === "import")}><option value="manual">手工记录报价</option><option value="import">导入报价 JSON</option></select></Field>
        <p className="text-[12px] leading-6 text-[var(--text-tertiary)]">不自动拉取行情。请填写实际报价及其截至时间；超过 72 小时会标记较旧，不代表实时价格。同一截至时间的新记录可更正旧报价。</p>
        {importing ? <><Field id={id} name="payload" label="报价 JSON（最多 100 条，币种须与账户一致）"><Textarea id={`${id}-payload`} name="payload" required maxLength={180000} rows={8} className="font-mono text-[12px]" /></Field><details className="min-w-0 text-[12px] leading-6 text-[var(--text-tertiary)]"><summary>查看格式说明</summary><p>schema_version 为 1，quotes 是数组。每条包含 symbol、currency、price（数字字符串）、as_of（ISO 时间含时区）、source、import_key（独立 UUID）。不会推测或补全价格、日期或持仓。</p><p>例如字段结构（请填入自己的数据）：</p><pre className="overflow-auto">{'{"schema_version":1,"quotes":[{"symbol":"市场:代码","currency":"账户币种","price":"实际报价","as_of":"ISO时间含时区","source":"原始来源","import_key":"独立UUID"}]}'}</pre></details></> : <><input type="hidden" name="currency" value={dialog.account.currency} />{input("symbol", "市场与标的代码", { maxLength: 40, placeholder: "市场:代码" })}{input("price", `报价 · ${dialog.account.currency}`, { inputMode: "decimal", pattern: decimalPattern })}{input("as_of", "报价截至时间（UTC）", { type: "datetime-local", step: 1 })}{input("source", "原始报价来源", { maxLength: 500, placeholder: "账单、交易所或报价页面及日期" })}</>}
      </>}
      <label className="flex items-start gap-2 text-[13px] leading-6 text-[var(--text-secondary)]"><input type="checkbox" name="confirmed" required className="mt-1.5 size-4 accent-[var(--accent)]" />{dialog.kind === "quote" ? "我已核对价格、币种、来源与截至时间；这不是实时行情。" : dialog.kind === "cash-void" ? "我确认作废仅更正账本，不撤销实际资金流动。" : `我已核对，这是${dialog.account.mode === "real" ? "已发生的真实" : "明确的模拟"}资金记录。`}</label>
    </fieldset>{error ? <p role="alert" className="mt-4 text-[13px] leading-6 text-[var(--danger)]">{error}</p> : null}<div className="mt-5 flex justify-end gap-2 border-t border-[var(--separator)] pt-4"><Button type="button" variant="outline" disabled={pending} onClick={onClose}>取消</Button><Button type="submit" disabled={pending}>{pending ? "保存中…" : "确认保存"}</Button></div></form>
  </DialogContent></DialogPrimitive.Root>;
}
