"use client";
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { InvestmentCashEntry, InvestmentDailyAccount, InvestmentQuote } from "@/features/investment/daily-types";
import { formatInvestmentDecimal } from "./presentation";
import type { DailyDialog } from "./investment-daily-dialog";
import styles from "./investment.module.css";

const cashLabels = { opening: "期初现金", deposit: "入金", withdrawal: "出金", dividend: "现金分红", fee: "独立费用", void: "作废" };
export function InvestmentDailyOverview({ daily, cashEntries, quotes, onOpen }: { daily: InvestmentDailyAccount; cashEntries: InvestmentCashEntry[]; quotes: InvestmentQuote[]; onOpen: (dialog: DailyDialog) => void }) {
  const { account } = daily;
  const voided = new Set(cashEntries.filter((entry) => entry.kind === "void").map((entry) => entry.void_entry_id));
  const metric = (value: string | null, missing = "资料不足") => value === null ? <span className={styles.missing}>{missing}</span> : formatInvestmentDecimal(value);
  return <div className={styles.dailyAccount}>
    <div className={styles.dailyHeading}><p>账户概览 <span>· {account.currency}</span></p><div className={styles.dailyActions}><Button size="sm" variant="ghost" onClick={() => onOpen({ kind: "cash", account, importKey: crypto.randomUUID() })}><Plus aria-hidden="true" />现金 / 分红</Button><Button size="sm" variant="ghost" onClick={() => onOpen({ kind: "quote", account, importKey: crypto.randomUUID() })}><RefreshCw aria-hidden="true" />更新报价</Button></div></div>
    <dl className={styles.dailyMetrics}>
      <div><dt>账面现金</dt><dd>{metric(daily.cash, "期初待补")}</dd></div>
      <div><dt>持仓估值</dt><dd>{metric(daily.marketValue, "报价待补")}</dd></div>
      <div><dt>未实现盈亏</dt><dd>{metric(daily.unrealizedPnl)}</dd></div>
      <div><dt>累计净分红</dt><dd>{metric(daily.netDividends)}</dd></div>
    </dl>
    <p className={styles.dailyStatus}>账面现金 + 持仓估值：{metric(daily.recordedAssets)} {account.currency}{daily.missingQuotes ? ` · ${daily.missingQuotes} 个标的缺报价` : ""}{daily.staleQuotes ? ` · ${daily.staleQuotes} 个标的报价较旧（超过 72 小时）` : ""}</p>
    {daily.cashState !== "known" ? <p className={styles.dailyHint}>{daily.cashState === "invalid_opening" ? "存在早于现金期初的交易，请更正期初日期；现金和合计暂不计算。" : "补充首次记账日开始时的期初现金，才会显示现金余额。未知不会按零处理。"}</p> : daily.cash?.startsWith("-") ? <p className={styles.dailyHint}>账面现金为负，请核对期初、入出金及成交记录；这不表示实际账户可用资金。</p> : null}
    <details className={styles.ledger}><summary>现金与报价记录（{cashEntries.length + quotes.length}）</summary>
      {!cashEntries.length && !quotes.length ? <p className={styles.caption}>尚未记录现金或报价。这里只展示你提供的数据。</p> : null}
      <ol className={styles.ledgerList}>{cashEntries.toSorted((a, b) => b.occurred_on.localeCompare(a.occurred_on) || b.sequence - a.sequence).map((entry) => <li key={entry.id} className={styles.ledgerRow}><div><p>{entry.occurred_on} · {cashLabels[entry.kind]}{entry.symbol ? ` · ${entry.symbol}` : ""}{voided.has(entry.id) ? " · 已作废" : ""}</p><p>{entry.kind === "void" ? "作废原因" : "来源"}：{entry.source}</p></div>{entry.kind !== "void" ? <div><p>{formatInvestmentDecimal(entry.amount)} {account.currency}{entry.kind === "dividend" ? ` · 扣税 ${formatInvestmentDecimal(entry.tax)} · 费用 ${formatInvestmentDecimal(entry.fees)}` : ""}</p>{!voided.has(entry.id) ? <Button variant="ghost" size="xs" onClick={() => onOpen({ kind: "cash-void", account, entry, importKey: crypto.randomUUID() })}>作废现金记录</Button> : null}</div> : null}</li>)}</ol>
      <ol className={styles.ledgerList}>{quotes.toSorted((a, b) => b.sequence - a.sequence).map((quote) => <li key={quote.id} className={styles.ledgerRow}><div><p>{quote.symbol} · {quote.source_kind === "manual" ? "手工报价" : "导入报价"} · {formatInvestmentDecimal(quote.price)} {quote.currency}</p><p>截至 {formatQuoteTime(quote.as_of)} · 来源：{quote.source}</p></div></li>)}</ol>
      {quotes.length ? <p className={styles.caption}>同一标的使用截至时间最新的报价；相同截至时间使用最后记录。更正请添加同一截至时间的新报价，旧记录保留。</p> : null}
    </details>
  </div>;
}

export function formatQuoteTime(value: string) { return new Date(value).toISOString().replace("T", " ").replace(".000Z", " UTC").replace("Z", " UTC"); }
export function HoldingValuation({ daily, symbol, field }: { daily?: InvestmentDailyAccount; symbol: string; field: "marketValue" | "unrealizedPnl" }) {
  const holding = daily?.holdings.find((row) => row.symbol === symbol);
  const value = holding?.[field];
  return <><span className={value == null ? styles.missing : undefined}>{value == null ? field === "marketValue" ? "暂无估值" : "无法计算" : formatInvestmentDecimal(value)}</span>{field === "marketValue" && holding?.quote ? <span className={styles.quoteMeta}>{holding.quoteState === "stale" ? "较旧 · " : ""}{holding.quote.source_kind === "manual" ? "手工" : "导入"} · {formatQuoteTime(holding.quote.as_of)}<span>来源：{holding.quote.source}</span></span> : null}</>;
}
