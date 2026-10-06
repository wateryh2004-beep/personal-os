"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, FlaskConical, Plus, Upload, Wallet } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import type { Holding, InvestmentAccount, InvestmentWorkspaceData, LedgerEntry, ResearchRun, StrategyVersion } from "@/features/investment/types";
import { InvestmentFormDialog, type InvestmentDialog } from "./investment-form-dialog";
import { formatInvestmentDecimal, investmentHref, safeResearchUrl, type InvestmentMode, type InvestmentTab } from "./presentation";
import styles from "./investment.module.css";

const tabs = [{ value: "holdings", label: "持仓" }, { value: "strategies", label: "策略" }, { value: "research", label: "研究" }] as const;
const kindLabel = { opening: "期初持仓", buy: "买入", sell: "卖出", void: "作废记录" };

type Props = { data: InvestmentWorkspaceData; holdings: Holding[]; tab: InvestmentTab; mode: InvestmentMode; importExample: string };

export function InvestmentWorkspace({ data, holdings, tab, mode, importExample }: Props) {
  const [dialog, setDialog] = useState<InvestmentDialog | null>(null);
  const [notice, setNotice] = useState("");
  const triggerRef = useRef<HTMLElement | null>(null);
  const accounts = data.accounts.filter((account) => account.mode === mode);
  const modeLabel = mode === "real" ? "实盘" : "模拟";
  function open(next: InvestmentDialog) {
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setNotice("");
    setDialog(next);
  }
  const addAccount = () => open({ kind: "account" });
  const addEntry = (accountId?: string) => open({ kind: "entry", accountId, importKey: crypto.randomUUID() });
  const voidEntry = (entry: LedgerEntry) => open({ kind: "void", entry, importKey: crypto.randomUUID() });
  const addStrategy = (strategy?: StrategyVersion) => open({ kind: "strategy", strategy });
  const addResearch = () => open({ kind: "research" });
  const primary = tab === "holdings"
    ? <Button disabled={data.unavailable} onClick={() => accounts.length ? addEntry() : addAccount()}><Plus aria-hidden="true" />{accounts.length ? "记录持仓" : "添加账户"}</Button>
    : tab === "strategies"
      ? <Button disabled={data.unavailable} onClick={() => addStrategy()}><Plus aria-hidden="true" />写下策略</Button>
      : <Button disabled={data.unavailable} onClick={addResearch}><Upload aria-hidden="true" />导入研究</Button>;

  return <section className={styles.workspace}>
    <PageHeader title="投资" description="看清持有，写下判断，让每一次验证都有来处。" action={primary} />
    <div className={styles.navigation}>
      <nav className={styles.tabs} aria-label="投资视图">
        {tabs.map((item) => <Link key={item.value} className={styles.tab} href={investmentHref(item.value, mode)} aria-current={tab === item.value ? "page" : undefined} scroll={false}>{item.label}</Link>)}
      </nav>
      {tab === "holdings" ? <nav className={styles.modes} aria-label="账户模式">
        {(["real", "paper"] as const).map((value) => <Link key={value} className={styles.mode} href={investmentHref(tab, value)} aria-current={mode === value ? "true" : undefined} scroll={false}>{value === "real" ? "实盘" : "模拟"}</Link>)}
      </nav> : <span className={styles.libraryScope}>实盘与模拟共享</span>}
    </div>
    {notice ? <p role="status" className="mt-4 text-[13px] text-[var(--success)]">{notice}</p> : null}
    {data.unavailable ? <div role="alert" className={styles.warning}><p className="font-medium">投资数据暂时无法读取</p><p>存储可能尚未启用或连接暂时不可用。恢复后再添加记录；这里不会把未读取到的数据当作空账户。</p></div> : <>
      {tab === "holdings" ? <>
        <div className={styles.intro}><p className={styles.caption}>{modeLabel}账户 · 按账户与原币查看{mode === "paper" ? " · 仅用于模拟记录" : ""}</p>{accounts.length ? <Button variant="ghost" size="sm" onClick={addAccount}><Plus aria-hidden="true" />添加账户</Button> : null}</div>
        {!accounts.length ? <EmptyState icon={<Wallet className="size-5" aria-hidden="true" />} title={mode === "real" ? "从一笔真实持仓开始" : "先用模拟账户试一试"} description={mode === "real" ? "添加账户，再记录已有持仓或实际成交。暂时不知道成本也没关系，留空会保留为未知。" : "把想法放进独立的模拟账户，记录自己的假设与操作。模拟数据始终与实盘分开。"}>
          <Button onClick={addAccount}>添加{modeLabel}账户</Button>
          {mode === "real" ? <Button asChild variant="ghost"><Link href={investmentHref("holdings", "paper")}>先试试模拟</Link></Button> : null}
        </EmptyState> : <>
          <p className={styles.valuationNotice}>尚未接入行情 · 市值与浮动盈亏暂无估值；各账户金额按原币显示，不跨币种合计。</p>
          <dl className={styles.summary}><div><dt>{modeLabel}账户</dt><dd>{accounts.length}</dd></div><div><dt>持有标的（按账户）</dt><dd>{holdings.filter((holding) => holding.quantity !== "0").length}</dd></div><div><dt>当前市值</dt><dd className={styles.unavailableValue}>暂无估值</dd></div></dl>
          {accounts.map((account) => <AccountHoldings key={account.id} account={account} holdings={holdings.filter((holding) => holding.accountId === account.id)} entries={data.entries.filter((entry) => entry.account_id === account.id)} onAdd={() => addEntry(account.id)} onVoid={voidEntry} />)}
        </>}
        <p className={styles.notice}>当前支持期初持仓、买入与卖出记录。成本使用加权平均法；已实现盈亏仅覆盖开始记录后的卖出，不能视为完整投资收益。尚未接入行情，不计算市值、浮动盈亏或组合收益；现金、分红、拆股和汇率换算暂不支持。</p>
      </> : tab === "strategies" ? <>
        <div className={styles.intro}><p className={styles.caption}>共享策略库 · 实盘与模拟都可参考 · 最多显示最近 100 个版本</p></div>
        {!data.strategies.length ? <EmptyState icon={<BookOpen className="size-5" aria-hidden="true" />} title="给判断留一份底稿" description="为什么持有，什么情况下退出，哪些证据会让你改变想法？先写清楚，再慢慢验证。每次修订都会留下独立版本。"><Button onClick={() => addStrategy()}>写下第一条策略</Button></EmptyState> : <div className={styles.documentList}>{data.strategies.map((strategy) => <StrategyDocument key={strategy.id} strategy={strategy} onRevise={() => addStrategy(strategy)} />)}</div>}
      </> : <>
        <div className={styles.intro}><p className={styles.caption}>共享研究库 · 来源与方法一同保留 · 最多显示最近 100 份</p><span className={styles.badge}>JSON 导入</span></div>
        {!data.research.length ? <EmptyState icon={<FlaskConical className="size-5" aria-hidden="true" />} title="把有依据的研究留在这里" description="导入研究笔记或外部回测结果，保留来源与方法。研究观点和回测分别标记，不会被当作实盘业绩。"><Button onClick={addResearch}><Upload aria-hidden="true" />导入第一份研究</Button></EmptyState> : <div className={styles.documentList}>{data.research.map((research) => <ResearchDocument key={research.id} research={research} strategies={data.strategies} />)}</div>}
        <p className={styles.notice}>导入只检查数据格式与所需来源信息，不代表已独立复现或验证结论。回测结果属于历史模拟，研究观点不携带已验证的量化收益。</p>
      </>}
    </>}
    {dialog ? <InvestmentFormDialog key={dialog.kind} dialog={dialog} mode={mode} accounts={accounts} importExample={importExample} onClose={() => setDialog(null)} onSaved={(message) => { setNotice(message); setDialog(null); }} onRestoreFocus={() => triggerRef.current?.focus()} /> : null}
  </section>;
}

function EmptyState({ icon, title, description, children }: { icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) {
  return <div className={styles.empty}><div className={styles.emptyIcon}>{icon}</div><h2>{title}</h2><p>{description}</p><div className={styles.emptyActions}>{children}</div></div>;
}

function AccountHoldings({ account, holdings, entries, onAdd, onVoid }: { account: InvestmentAccount; holdings: Holding[]; entries: InvestmentWorkspaceData["entries"]; onAdd: () => void; onVoid: (entry: LedgerEntry) => void }) {
  const voidedIds = new Set(entries.filter((entry) => entry.kind === "void").map((entry) => entry.void_entry_id));
  return <section className={styles.account} aria-label={`${account.name}持仓`}>
    <header className={styles.accountHeader}><div><h2 className={styles.heading}>{account.name}</h2><p className={styles.accountMeta}>{account.currency} · {account.mode === "real" ? "实盘" : "模拟"}</p></div><Button size="sm" variant="ghost" onClick={onAdd}><Plus aria-hidden="true" />添加记录</Button></header>
    {holdings.length ? <>
      <ul className={styles.holdingCards} aria-label={`${account.name}持仓明细，金额以 ${account.currency} 计价`}>
        {holdings.map((holding) => <li key={holding.symbol} className={styles.holdingCard}>
          <div className={styles.holdingCardHeader}><h3>{holding.symbol}</h3><span className={styles.badge}>{holding.quantity === "0" ? "已清仓" : account.currency}</span></div>
          <dl className={styles.holdingMetrics}>
            <div><dt>数量</dt><dd>{formatInvestmentDecimal(holding.quantity)}</dd></div>
            <div><dt>剩余成本 · {account.currency}</dt><dd>{holding.costBasis === null ? <span className={styles.missing}>成本未知</span> : formatInvestmentDecimal(holding.costBasis)}</dd></div>
            <div><dt>已实现盈亏 · {account.currency}</dt><dd>{holding.realizedPnl === null ? <span className={styles.missing}>无法计算</span> : formatInvestmentDecimal(holding.realizedPnl)}</dd></div>
            <div><dt>市值 · {account.currency}</dt><dd className={styles.missing}>暂无估值</dd></div>
          </dl>
        </li>)}
      </ul>
      <div className={styles.tableScroll} role="region" aria-label={`${account.name}持仓明细，可横向滚动`} tabIndex={0}><table className={styles.table}><caption className="sr-only">{account.name}持仓，金额以 {account.currency} 计价</caption><thead><tr><th scope="col">标的</th><th scope="col">数量</th><th scope="col">剩余成本</th><th scope="col">已实现盈亏</th><th scope="col">市值</th></tr></thead><tbody>{holdings.map((holding) => <tr key={holding.symbol}><td>{holding.symbol}{holding.quantity === "0" ? <span className="ml-2 text-[11px] font-normal text-[var(--text-tertiary)]">已清仓</span> : null}</td><td>{formatInvestmentDecimal(holding.quantity)}</td><td>{holding.costBasis === null ? <span className={styles.missing}>成本未知</span> : formatInvestmentDecimal(holding.costBasis)}</td><td>{holding.realizedPnl === null ? <span className={styles.missing}>无法计算</span> : formatInvestmentDecimal(holding.realizedPnl)}</td><td><span className={styles.missing}>暂无估值</span></td></tr>)}</tbody></table></div>
    </> : <p className="border-y border-[var(--separator)] py-5 text-[13px] text-[var(--text-tertiary)]">账户已准备好，添加一笔期初持仓或成交记录。</p>}
    {entries.length ? <details className={styles.ledger}><summary>查看原始记录（{entries.length}）</summary><ol className={styles.ledgerList}>{entries.toSorted((a, b) => b.occurred_on.localeCompare(a.occurred_on) || b.created_at.localeCompare(a.created_at)).map((entry) => <li key={entry.id} className={styles.ledgerRow}>
      <div><p>{entry.occurred_on} · {kindLabel[entry.kind]} · <span className="text-[var(--text-primary)]">{entry.symbol}</span>{voidedIds.has(entry.id) ? <span className="ml-2 text-[var(--warning)]">已作废</span> : null}</p><p className="break-all">{entry.kind === "void" ? "作废原因" : "来源"}：{entry.source}</p></div>
      {entry.kind !== "void" ? <div className="text-right"><p>{formatInvestmentDecimal(entry.quantity)} × {entry.price === null ? "单位成本未知" : `${formatInvestmentDecimal(entry.price)} ${account.currency}`}</p><div className="flex items-center justify-end gap-3"><span>费用 {formatInvestmentDecimal(entry.fees)} {account.currency}</span>{!voidedIds.has(entry.id) ? <Button size="xs" variant="ghost" onClick={() => onVoid(entry)} aria-label={`作废 ${entry.occurred_on} ${entry.symbol} 记录`}>作废</Button> : null}</div></div> : null}
    </li>)}</ol></details> : null}
  </section>;
}

function StrategyDocument({ strategy, onRevise }: { strategy: StrategyVersion; onRevise: () => void }) {
  return <details className={styles.document}><summary><div className={styles.documentIdentity}><h2 className={styles.heading}>{strategy.title}</h2><p className={styles.documentMeta}><span className={styles.badge}>v{strategy.version}</span><span>记录于 {strategy.created_at.slice(0, 10)}</span><span>{strategy.strategy_key}</span></p></div><span className={styles.documentToggle}><span className={styles.closedHint}>查看内容 ↓</span><span className={styles.openHint}>收起内容 ↑</span></span></summary><div className={styles.documentBody}><div className={styles.rawBody}>{strategy.body_markdown}</div><div className={styles.documentFooter}><p className={styles.caption}>此版本已保留；修订将另存为新版本。</p><Button variant="secondary" size="sm" onClick={onRevise}>基于此版本修订</Button></div></div></details>;
}

function ResearchDocument({ research, strategies }: { research: ResearchRun; strategies: StrategyVersion[] }) {
  const linkedStrategy = strategies.find((strategy) => strategy.id === research.strategy_version_id);
  return <details className={styles.document}><summary><div className={styles.documentIdentity}><h2 className={styles.heading}>{research.title}</h2><div className={styles.documentMeta}><span className={styles.badge}>{research.kind === "backtest" ? "外部回测 · 未复现" : "研究观点"}</span><span>数据截至 {research.as_of}</span><span>{research.provenance.producer}</span></div></div><span className={styles.documentToggle}><span className={styles.closedHint}>查看内容 ↓</span><span className={styles.openHint}>收起内容 ↑</span></span></summary><div className={styles.documentBody}>
    <div className={styles.rawBody}>{research.body_markdown}</div>
    {research.kind === "backtest" && research.metrics ? <div className="mt-5 rounded-[var(--radius-md)] bg-[var(--surface-control)] p-4"><p className="text-[12px] text-[var(--text-tertiary)]">导入文件报告的历史模拟结果，未独立复现</p><dl className="mt-3 flex flex-wrap gap-6 text-[13px]"><div><dt className={styles.caption}>累计收益</dt><dd className="mt-1 tabular-nums">{research.metrics.total_return_pct}%</dd></div><div><dt className={styles.caption}>最大回撤</dt><dd className="mt-1 tabular-nums">{research.metrics.max_drawdown_pct}%</dd></div></dl></div> : null}
    <p className="mt-4 text-[13px] text-[var(--text-secondary)]">局限：{research.provenance.limitations}</p>
    {linkedStrategy ? <p className="mt-3 text-[12px] text-[var(--text-tertiary)]">关联策略：{linkedStrategy.title} · v{linkedStrategy.version}</p> : null}
    <div className={styles.sources}><h3 className="mb-2 text-[var(--text-tertiary)]">来源</h3><ul className="space-y-2">{research.source_urls.map((source, index) => { const href = safeResearchUrl(source); return <li key={`${source}-${index}`}>{href ? <a href={href} target="_blank" rel="noreferrer">{source}</a> : <span>{source}</span>}</li>; })}</ul></div>
    <details className={styles.provenance}><summary>查看方法与可追溯信息</summary><pre>{JSON.stringify(research.provenance, null, 2)}</pre></details>
  </div></details>;
}
