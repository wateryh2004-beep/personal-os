"use client";
import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  InvestmentCashEntry,
  InvestmentDailyAccount,
  InvestmentQuote,
} from "@/features/investment/daily-types";
import { formatInvestmentDecimal } from "./presentation";
import type { DailyDialog } from "./investment-daily-dialog";
import styles from "./investment.module.css";

const cashLabels = {
  opening: "期初现金",
  deposit: "入金",
  withdrawal: "出金",
  dividend: "现金分红",
  fee: "独立费用",
  void: "作废",
};
export function InvestmentDailyOverview({
  daily,
  cashEntries,
  quotes,
  onOpen,
}: {
  daily: InvestmentDailyAccount;
  cashEntries: InvestmentCashEntry[];
  quotes: InvestmentQuote[];
  onOpen: (dialog: DailyDialog) => void;
}) {
  const { account } = daily;
  const [explaining, setExplaining] = useState(false);
  const revealTarget = useRef<string | null>(null);
  const reveal = (id: string) => {
    revealTarget.current = id;
    setExplaining(false);
  };
  const revealAfterClose = (event: Event) => {
    const id = revealTarget.current;
    if (!id) return;
    event.preventDefault();
    revealTarget.current = null;
    const element = document.getElementById(id);
    if (!element) return;
    let parent = element.parentElement;
    while (parent) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
      parent = parent.parentElement;
    }
    element.tabIndex = -1;
    element.scrollIntoView({ block: "center", behavior: "instant" });
    element.focus({ preventScroll: true });
  };
  const voided = new Set(
    cashEntries
      .filter((entry) => entry.kind === "void")
      .map((entry) => entry.void_entry_id),
  );
  const metric = (value: string | null, missing = "资料不足") =>
    value === null ? (
      <span className={styles.missing}>{missing}</span>
    ) : (
      formatInvestmentDecimal(value)
    );
  return (
    <div className={styles.dailyAccount}>
      <div className={styles.dailyHeading}>
        <p>
          账户概览 <span>· {account.currency}</span>
        </p>
        <div className={styles.dailyActions}>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              onOpen({ kind: "cash", account, importKey: crypto.randomUUID() })
            }
          >
            <Plus aria-hidden="true" />
            现金 / 分红
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              onOpen({ kind: "quote", account, importKey: crypto.randomUUID() })
            }
          >
            <RefreshCw aria-hidden="true" />
            更新报价
          </Button>
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={() => setExplaining(true)}>
        这些数字怎么算？
      </Button>
      <dl className={styles.dailyMetrics}>
        <div>
          <dt>账面现金</dt>
          <dd>
            <button
              className="ui-link min-h-11"
              onClick={() => setExplaining(true)}
              aria-label="解释账面现金"
            >
              {metric(daily.cash, "期初待补")}
            </button>
          </dd>
        </div>
        <div>
          <dt>持仓估值</dt>
          <dd>
            <button
              className="ui-link min-h-11"
              onClick={() => setExplaining(true)}
              aria-label="解释持仓估值"
            >
              {metric(daily.marketValue, "报价待补")}
            </button>
          </dd>
        </div>
        <div>
          <dt>未实现盈亏</dt>
          <dd>
            <button
              className="ui-link min-h-11"
              onClick={() => setExplaining(true)}
              aria-label="解释未实现盈亏"
            >
              {metric(daily.unrealizedPnl)}
            </button>
          </dd>
        </div>
        <div>
          <dt>累计净分红</dt>
          <dd>
            <button
              className="ui-link min-h-11"
              onClick={() => setExplaining(true)}
              aria-label="解释累计净分红"
            >
              {metric(daily.netDividends)}
            </button>
          </dd>
        </div>
      </dl>
      <p className={styles.dailyStatus}>
        账面现金 + 持仓估值：{metric(daily.recordedAssets)} {account.currency}
        {daily.missingQuotes ? ` · ${daily.missingQuotes} 个标的缺报价` : ""}
        {daily.staleQuotes
          ? ` · ${daily.staleQuotes} 个标的报价较旧（超过 72 小时）`
          : ""}
      </p>
      {daily.cashState !== "known" ? (
        <p className={styles.dailyHint}>
          {daily.cashState === "invalid_opening"
            ? "存在早于现金期初的交易，请更正期初日期；现金和合计暂不计算。"
            : "补充首次记账日开始时的期初现金，才会显示现金余额。未知不会按零处理。"}
        </p>
      ) : daily.cash?.startsWith("-") ? (
        <p className={styles.dailyHint}>
          账面现金为负，请核对期初、入出金及成交记录；这不表示实际账户可用资金。
        </p>
      ) : null}
      <Dialog open={explaining} onOpenChange={setExplaining}>
        <DialogContent
          onCloseAutoFocus={revealAfterClose}
          className="max-h-[85dvh] overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>数字的来处 · {account.name}</DialogTitle>
            <DialogDescription>
              {account.mode === "real" ? "实盘记录" : "模拟记录"} ·{" "}
              {account.currency}
              。按同一次核对快照计算，不换汇，不代表券商可用资金。
            </DialogDescription>
          </DialogHeader>
          {daily.explanation ? (
            <div className="space-y-5 text-sm leading-6">
              <p>
                核对时间：{formatQuoteTime(daily.explanation.checkedAt)}
                {daily.explanation.accountRevision !== null
                  ? ` · 账簿版本 ${daily.explanation.accountRevision}`
                  : ""}
              </p>
              <section>
                <h3 className="font-medium">
                  账面现金 = 有效现金记录净额 + 买卖净额
                </h3>
                <p>
                  期初持仓不重复扣现金；买入扣成交额与费用，卖出加成交额并扣费用。作废记录不参与。
                </p>
                <p>
                  结果：{metric(daily.cash)} {account.currency} ·{" "}
                  {daily.cashState === "known"
                    ? "期初已记录"
                    : daily.cashState === "missing_opening"
                      ? "缺少现金期初"
                      : "有早于期初的记录"}
                </p>
                <ul>
                  {daily.explanation.cash.map((entry) => (
                    <li key={entry.id}>
                      <a
                        className="ui-link"
                        href={`#cash-${entry.id}`}
                        onClick={(event) => {
                          event.preventDefault();
                          reveal(`cash-${entry.id}`);
                        }}
                      >
                        {entry.occurredOn} · {cashLabels[entry.kind]}
                      </a>
                      ：{entry.amount} − 税 {entry.tax} − 费用 {entry.fees} →
                      净变化 {entry.effect}
                    </li>
                  ))}
                  {daily.explanation.ledger.map((entry) => (
                    <li key={entry.id}>
                      {entry.occurredOn} · {entry.symbol} · {entry.kind}：数量{" "}
                      {entry.quantity} × 价格 {entry.price ?? "未知"} · 费用{" "}
                      {entry.fees} → 现金{" "}
                      {entry.cashEffect ?? "期初持仓不计现金"}{" "}
                      <a
                        className="ui-link"
                        href={`#ledger-${entry.id}`}
                        onClick={(event) => {
                          event.preventDefault();
                          reveal(`ledger-${entry.id}`);
                        }}
                      >
                        查看原记账
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
              <section>
                <h3 className="font-medium">持仓估值 / 成本 / 盈亏</h3>
                <p>
                  估值 = 剩余数量 × 同币报价。成本按加权成本分摊；卖出已实现盈亏
                  = 卖出净额 − 分摊成本。未实现盈亏 = 估值 −
                  剩余成本。计算保留八位小数。
                </p>
                <ul>
                  {daily.holdings.map((holding) => (
                    <li
                      key={holding.symbol}
                      className="border-b border-[var(--separator)] py-3"
                    >
                      <strong>{holding.symbol}</strong> · 数量{" "}
                      {holding.quantity} · 剩余成本{" "}
                      {holding.costBasis ?? "未知"} · 已实现{" "}
                      {holding.realizedPnl ?? "无法计算"}
                      <br />
                      估值 {holding.marketValue ?? "缺少报价"} · 未实现{" "}
                      {holding.unrealizedPnl ?? "成本或报价缺失"}
                      {holding.quote ? (
                        <p>
                          <a
                            className="ui-link"
                            href={`#quote-${holding.quote.id}`}
                            onClick={(event) => {
                              event.preventDefault();
                              reveal(`quote-${holding.quote!.id}`);
                            }}
                          >
                            报价 {holding.quote.price} ·{" "}
                            {formatQuoteTime(holding.quote.as_of)}
                          </a>{" "}
                          · 来源 {holding.quote.source}
                          {holding.quoteState === "stale"
                            ? " · 超过72小时"
                            : ""}
                        </p>
                      ) : (
                        <p>
                          {holding.quoteState === "closed"
                            ? "持仓为零，估值为零"
                            : "没有有效报价，未按零计算"}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
              <p>
                累计净分红 = 各笔有效分红 − 对应税 − 对应费用：
                {daily.netDividends}。资产合计 = 账面现金 + 持仓估值：
                {daily.recordedAssets ?? "资料不足，未给出合计"}。
              </p>
            </div>
          ) : (
            <p role="status">当前没有可解释的完整计算快照，请重新读取账簿。</p>
          )}
        </DialogContent>
      </Dialog>
      <details className={styles.ledger}>
        <summary>
          现金与报价记录（{cashEntries.length + quotes.length}）
        </summary>
        {!cashEntries.length && !quotes.length ? (
          <p className={styles.caption}>
            尚未记录现金或报价。这里只展示你提供的数据。
          </p>
        ) : null}
        <ol className={styles.ledgerList}>
          {cashEntries
            .toSorted(
              (a, b) =>
                b.occurred_on.localeCompare(a.occurred_on) ||
                b.sequence - a.sequence,
            )
            .map((entry) => (
              <li
                id={`cash-${entry.id}`}
                key={entry.id}
                className={styles.ledgerRow}
              >
                <div>
                  <p>
                    {entry.occurred_on} · {cashLabels[entry.kind]}
                    {entry.symbol ? ` · ${entry.symbol}` : ""}
                    {voided.has(entry.id) ? " · 已作废" : ""}
                  </p>
                  <p>
                    {entry.kind === "void" ? "作废原因" : "来源"}：
                    {entry.source}
                  </p>
                </div>
                {entry.kind !== "void" ? (
                  <div>
                    <p>
                      {formatInvestmentDecimal(entry.amount)} {account.currency}
                      {entry.kind === "dividend"
                        ? ` · 扣税 ${formatInvestmentDecimal(entry.tax)} · 费用 ${formatInvestmentDecimal(entry.fees)}`
                        : ""}
                    </p>
                    {!voided.has(entry.id) ? (
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() =>
                          onOpen({
                            kind: "cash-void",
                            account,
                            entry,
                            importKey: crypto.randomUUID(),
                          })
                        }
                      >
                        作废现金记录
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
        </ol>
        <ol className={styles.ledgerList}>
          {quotes
            .toSorted((a, b) => b.sequence - a.sequence)
            .map((quote) => (
              <li
                id={`quote-${quote.id}`}
                key={quote.id}
                className={styles.ledgerRow}
              >
                <div>
                  <p>
                    {quote.symbol} ·{" "}
                    {quote.source_kind === "manual" ? "手工报价" : "导入报价"} ·{" "}
                    {formatInvestmentDecimal(quote.price)} {quote.currency}
                  </p>
                  <p>
                    截至 {formatQuoteTime(quote.as_of)} · 来源：{quote.source}
                  </p>
                </div>
              </li>
            ))}
        </ol>
        {quotes.length ? (
          <p className={styles.caption}>
            同一标的使用截至时间最新的报价；相同截至时间使用最后记录。更正请添加同一截至时间的新报价，旧记录保留。
          </p>
        ) : null}
      </details>
    </div>
  );
}

export function formatQuoteTime(value: string) {
  return new Date(value)
    .toISOString()
    .replace("T", " ")
    .replace(".000Z", " UTC")
    .replace("Z", " UTC");
}
export function HoldingValuation({
  daily,
  symbol,
  field,
}: {
  daily?: InvestmentDailyAccount;
  symbol: string;
  field:
    | "marketValue"
    | "unrealizedPnl"
    | "costBasis"
    | "realizedPnl"
    | "quantity";
}) {
  const holding = daily?.holdings.find((row) => row.symbol === symbol);
  const [open, setOpen] = useState(false);
  const value = holding?.[field];
  const names = {
    marketValue: "市值",
    unrealizedPnl: "未实现盈亏",
    costBasis: "剩余成本",
    realizedPnl: "已实现盈亏",
    quantity: "数量",
  };
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`ui-link min-h-11 ${value == null ? styles.missing : ""}`}
        aria-label={`解释${symbol}${names[field]}`}
      >
        {value == null ? (field==="marketValue"?"暂无估值":field==="costBasis"?"成本未知":"无法计算") : formatInvestmentDecimal(value)}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {symbol} · {names[field]}
            </DialogTitle>
            <DialogDescription>
              {daily?.account.currency} ·
              同一次账簿与报价快照；不跨账户、不换汇。
            </DialogDescription>
          </DialogHeader>
          {holding && daily?.explanation ? (
            <div className="space-y-3 text-sm leading-6">
              <p>核对于{formatQuoteTime(daily.explanation.checkedAt)}</p>
              <p>
                数量{holding.quantity}；加权分摊后剩余成本
                {holding.costBasis ?? "未知"}；已实现盈亏
                {holding.realizedPnl ?? "无法计算"}。
              </p>
              <p>
                估值 = 数量 × 最新有效报价；未实现盈亏 = 估值 −
                剩余成本。卖出已实现盈亏 = 卖出数量 × 成交价 − 卖出费用 −
                分摊成本；加权成本包含买入费用。使用固定八位小数。
              </p>
              {holding.quote ? (
                <p>
                  报价{holding.quote.price} {holding.quote.currency} · 截至
                  {formatQuoteTime(holding.quote.as_of)} · 来源
                  {holding.quote.source}
                  {holding.quoteState === "stale" ? " · 超过72小时" : ""}
                </p>
              ) : (
                <p>
                  {holding.quoteState === "closed"
                    ? "数量为零，持仓估值为零。"
                    : "缺少报价，估值不会按零处理。"}
                </p>
              )}
              <ul>
                {daily.explanation.ledger
                  .filter((entry) => entry.symbol === symbol)
                  .map((entry) => (
                    <li key={entry.id}>
                      {entry.occurredOn} · {entry.kind} · {entry.quantity} ×{" "}
                      {entry.price ?? "未知成本"} · 费用{entry.fees}
                      <a
                        className="ui-link ml-2"
                        href={`#ledger-${entry.id}`}
                        onClick={(event) => {
                          event.preventDefault();
                          setOpen(false);
                          requestAnimationFrame(() => {
                            const target = document.getElementById(
                              `ledger-${entry.id}`,
                            );
                            let parent = target?.parentElement;
                            while (parent) {
                              if (parent instanceof HTMLDetailsElement)
                                parent.open = true;
                              parent = parent.parentElement;
                            }
                            target?.scrollIntoView({
                              block: "center",
                              behavior: "instant",
                            });
                          });
                        }}
                      >
                        查看来源记账
                      </a>
                    </li>
                  ))}
              </ul>
            </div>
          ) : (
            <p>没有完整计算快照，暂不能解释。</p>
          )}
        </DialogContent>
      </Dialog>
      {field === "marketValue" && holding?.quote ? (
        <span className={styles.quoteMeta}>
          {holding.quoteState === "stale" ? "较旧 · " : ""}
          {formatQuoteTime(holding.quote.as_of)}
          <span>来源：{holding.quote.source}</span>
        </span>
      ) : null}
    </>
  );
}
