"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import type { LeisureSummary } from "@/features/leisure/types";
import { emptyLeisureContext, formatLeisureDuration, hasLeisureMemory, leisureKindLabels, leisureStatusLabels, selectLeisureChoices, type LeisureContext } from "@/features/leisure/presentation";
import styles from "./leisure.module.css";

function ExperienceChoice({ item, featured = false, href }: { item: LeisureSummary; featured?: boolean; href: string }) {
  return <article className={featured ? styles.hero : styles.row}>
    <div className={styles.kind}><span>{leisureKindLabels[item.kind]}</span>{item.duration_minutes ? <span>{formatLeisureDuration(item.duration_minutes)}</span> : null}{item.platform ? <span>{item.platform}</span> : null}</div>
    <h3><Link className={styles.titleLink} href={href}>{item.title}</Link></h3>
    {item.why ? <p className={styles.why}>{item.why}</p> : null}
    {item.how_to_start ? <p className={styles.start}><strong>从这里开始</strong>{item.how_to_start}</p> : null}
    <Link href={href} className={styles.link}>看看详情 <ArrowUpRight size={14} aria-hidden /></Link>
  </article>;
}

export function LeisureHome({ experiences, unavailable = false, hasMore = false, detailBase = "/leisure/" }: { experiences: LeisureSummary[]; unavailable?: boolean; hasMore?: boolean; detailBase?: string }) {
  const router = useRouter();
  const [context, setContext] = useState<LeisureContext>(emptyLeisureContext);
  const choices = selectLeisureChoices(experiences, context);
  const activeContext = Object.values(context).some(Boolean);
  const remembered = experiences.filter((item) => item.feedback?.status && ["interested", "planned", "current"].includes(item.feedback.status) && item.feedback.reaction !== "not_for_me");
  const memories = experiences.filter(hasLeisureMemory);
  const updateContext = (name: keyof LeisureContext, value: string) => setContext((previous) => ({ ...previous, [name]: value }));
  return <div className={styles.page}>
    <div className={styles.header}><PageHeader title="闲暇" eyebrow={<span className={styles.eyebrow}>PERSONAL · 留一点时间给喜欢的事</span>} description="看一点、玩一会儿，或出门走走。" /></div>
    {unavailable ? <section className={styles.empty} role="status"><h2>这页暂时没能打开</h2><p>闲暇数据目前无法读取。已保存的内容不会因此被改动，请稍后重试。</p><button type="button" className={styles.quietButton} onClick={() => router.refresh()}>重新打开闲暇</button></section> : experiences.length === 0 ? <section className={styles.empty}>
      <h2>下次有空，<br />想做一点什么？</h2>
      <p>这里会放下想看的作品、想玩的游戏，以及值得出门的地方。选项的理由、时长和可靠出处，会和它们放在一起。</p>
      <blockquote>可以先记一个念头：<br />“周末想看一部电影，大约两小时，在家就好。”</blockquote>
      <p className={styles.caption}>还没有添加体验。先把想法留在笔记里，等内容整理好后再来慢慢选。</p>
      <Link href="/notes" className={styles.link}>去笔记里记下来 <ArrowUpRight size={14} aria-hidden /></Link>
    </section> : <>
      <details className={styles.context}><summary>换个情境{activeContext ? " · 已选择" : ""}</summary>
        <div className={styles.contextFields}>
          <label>有多少时间<select value={context.minutes} onChange={(event) => updateContext("minutes", event.target.value)}><option value="">都可以</option><option value="30">半小时以内</option><option value="60">一小时以内</option><option value="120">两小时以内</option><option value="240">一个下午</option></select></label>
          <label>在哪里<select value={context.setting} onChange={(event) => updateContext("setting", event.target.value)}><option value="">都可以</option><option value="home">在家</option><option value="out">出门</option></select></label>
          <label>和谁一起<select value={context.company} onChange={(event) => updateContext("company", event.target.value)}><option value="">都可以</option><option value="solo">自己</option><option value="together">和别人一起</option></select></label>
          <label>花费<select value={context.budget} onChange={(event) => updateContext("budget", event.target.value)}><option value="">不限</option><option value="free">免费</option><option value="paid">付费体验</option></select></label>
        </div><p className={styles.caption}>只影响这次浏览。条件不明的体验不会被当成符合条件。</p>{activeContext ? <button type="button" className={styles.quietButton} onClick={() => setContext(emptyLeisureContext)}>清除选择</button> : null}
      </details>
      <section className={styles.section} aria-labelledby="leisure-now"><div className={styles.sectionHeading}><h2 id="leisure-now">此刻可选</h2><p className={styles.caption}>不急着选完，挑一个就好</p></div>
        {choices.length ? <div className={styles.choiceGrid}><ExperienceChoice item={choices[0]} featured href={`${detailBase}${choices[0].id}`} /><div className={styles.alternatives}>{choices.slice(1).map((item) => <ExperienceChoice key={item.id} item={item} href={`${detailBase}${item.id}`} />)}</div></div> : <div role="status"><p className={styles.why}>{activeContext ? "暂时没有符合这个情境的选项。试试放宽一点条件。" : "这一轮暂时没有新的选项。还可以翻翻之前留下的体验。"}</p>{activeContext ? <button className={styles.quietButton} onClick={() => setContext(emptyLeisureContext)}>看看所有情境</button> : null}</div>}
      </section>
      {remembered.length || memories.length ? <div className={styles.split}>
        {remembered.length ? <section className={styles.section} aria-labelledby="leisure-remembered"><div className={styles.sectionHeading}><h2 id="leisure-remembered">还惦记着</h2></div><ul className={styles.list}>{remembered.slice(0, 6).map((item) => <li key={item.id} className={styles.keepRow}><div className={styles.kind}><span>{leisureKindLabels[item.kind]}</span><span>{leisureStatusLabels[item.feedback!.status!]}</span></div><h3><Link className={styles.titleLink} href={`${detailBase}${item.id}`}>{item.title}</Link></h3></li>)}</ul></section> : null}
        {memories.length ? <section className={styles.section} aria-labelledby="leisure-memories"><div className={styles.sectionHeading}><h2 id="leisure-memories">留下来的</h2><span className={styles.caption}>自己的感受</span></div><ul className={styles.list}>{memories.slice(0, 4).map((item) => <li key={item.id} className={styles.keepRow}><h3><Link className={styles.titleLink} href={`${detailBase}${item.id}`}>{item.title}</Link></h3>{item.feedback?.personal_note ? <p>{item.feedback.personal_note.length > 160 ? `${item.feedback.personal_note.slice(0, 160)}…` : item.feedback.personal_note}</p> : item.feedback?.reaction === "liked" ? <p>喜欢，想留在这里</p> : null}{item.feedback?.linked_note_id && item.feedback.linked_note_available ? <Link className={styles.link} href={`/notes/${item.feedback.linked_note_id}`}>读那篇笔记</Link> : null}</li>)}</ul></section> : null}
      </div> : null}
      <details className={styles.all}><summary>最近收录 · {experiences.length}{hasMore ? "+" : ""}</summary><p className={styles.caption}>{hasMore ? "这里只显示最近更新的 100 条；更早的体验仍然保留，可通过原有详情链接打开。" : "按最近更新排序。"}</p><ul className={styles.list}>{experiences.map((item) => <li key={item.id} className={styles.keepRow}><div className={styles.kind}><span>{leisureKindLabels[item.kind]}</span>{item.feedback?.reaction === "not_for_me" ? <span>不太适合我</span> : item.feedback?.status ? <span>{leisureStatusLabels[item.feedback.status]}</span> : null}</div><h3><Link className={styles.link} href={`${detailBase}${item.id}`}>{item.title}</Link></h3></li>)}</ul></details>
    </>}
    <footer className={styles.footer}><Link href="/travel" className={styles.link}>旅行计划 <ArrowUpRight size={13} aria-hidden /></Link><Link href="/shopping" className={styles.link}>购物清单 <ArrowUpRight size={13} aria-hidden /></Link><Link href="/notes" className={styles.link}>回到笔记 <ArrowUpRight size={13} aria-hidden /></Link></footer>
  </div>;
}
