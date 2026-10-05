"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, MoveUpRight, Shuffle, Sparkles } from "lucide-react";
import type { LeisureKind, LeisureSummary } from "@/features/leisure/types";
import { emptyLeisureContext, formatLeisureDuration, hasLeisureMemory, leisureKindLabels, leisureStatusLabels, matchesLeisureContext, type LeisureContext } from "@/features/leisure/presentation";
import { getLeisureArtwork } from "@/features/leisure/artwork";
import { LeisureArtwork } from "./leisure-artwork";
import styles from "./leisure.module.css";

function Poster({ item, href, index }: { item: LeisureSummary; href: string; index: number }) {
  const art = getLeisureArtwork(item);
  return <li className={styles.posterCard}>
    <Link href={href} className={styles.posterLink}>
      <div className={styles.posterFrame} style={{ aspectRatio: art ? `${art.width} / ${art.height}` : "3 / 4" }}>
        <LeisureArtwork item={item} sizes="(max-width: 599px) 46vw, (max-width: 767px) 30vw, (max-width: 1200px) 27vw, 365px" />
        <span className={styles.posterNumber} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
        <span className={styles.posterOpen} aria-hidden="true"><ArrowUpRight size={21} /></span>
      </div>
      <div className={styles.posterText}><span className={styles.kind}>{leisureKindLabels[item.kind]}{item.duration_minutes ? ` · ${formatLeisureDuration(item.duration_minutes)}` : ""}</span><h3>{item.title}</h3>{item.feedback?.status || item.feedback?.reaction !== undefined && item.feedback.reaction !== "none" ? <span className={styles.posterPersonal}>{item.feedback?.status ? <span>{leisureStatusLabels[item.feedback.status]}</span> : null}{item.feedback?.reaction === "liked" ? <span>♡ 喜欢</span> : item.feedback?.reaction === "not_for_me" ? <span>不太适合我</span> : null}</span> : null}{item.why ? <p>{item.why}</p> : null}</div>
    </Link>
  </li>;
}

export function LeisureHome({ experiences, unavailable = false, hasMore = false, detailBase = "/leisure/" }: { experiences: LeisureSummary[]; unavailable?: boolean; hasMore?: boolean; detailBase?: string }) {
  const router = useRouter();
  const [context, setContext] = useState<LeisureContext>(emptyLeisureContext);
  const [kind, setKind] = useState<LeisureKind | "all">("all");
  const [featureIndex, setFeatureIndex] = useState(0);
  const [browseRevision, setBrowseRevision] = useState(0);
  const activeContext = Object.values(context).some(Boolean);
  const eligible = experiences.filter((item) => item.feedback?.reaction !== "not_for_me" && item.feedback?.status !== "completed" && matchesLeisureContext(item, context));
  const feature = eligible.length ? eligible[featureIndex % eligible.length] : null;
  const gallery = experiences.filter((item) => (kind === "all" || item.kind === kind) && matchesLeisureContext(item, context));
  const kinds = [...new Set(experiences.map((item) => item.kind))];
  const remembered = experiences.filter((item) => item.feedback?.status && ["interested", "planned", "current"].includes(item.feedback.status) && item.feedback.reaction !== "not_for_me");
  const memories = experiences.filter(hasLeisureMemory);
  const updateContext = (name: keyof LeisureContext, value: string) => { setContext((previous) => ({ ...previous, [name]: value })); setFeatureIndex(0); setBrowseRevision((value) => value + 1); };
  const resetContext = () => { setContext(emptyLeisureContext); setFeatureIndex(0); setBrowseRevision((value) => value + 1); };
  return <div className={styles.page}>
    <header className={styles.homeHeader}>
      <div className={styles.masthead}><span className={styles.wordmark}>闲暇<span aria-hidden="true">/</span></span><span className={styles.eyebrow}>THE GOOD HOURS</span><span className={styles.mastheadNote}>没有待办，只有喜欢</span></div>
      <div className={styles.introRow}><h1>留一点时间，<br /><em>给喜欢的事。</em></h1><div className={styles.introAside}><span className={styles.littleStar} aria-hidden="true">✳</span><p>看一点、玩一会儿，<br />或出门走走。</p><a className={styles.browseAnchor} href="#leisure-collection">慢慢逛 <ArrowDown size={15} aria-hidden="true" /></a></div></div>
    </header>
    {unavailable ? <section className={styles.empty} role="status"><h2>这页暂时没能打开</h2><p>闲暇数据目前无法读取。已保存的内容不会因此被改动，请稍后重试。</p><button type="button" className={styles.quietButton} onClick={() => router.refresh()}>重新打开闲暇</button></section> : experiences.length === 0 ? <section className={styles.empty}>
      <span className={styles.emptyMark} aria-hidden="true">✳</span><h2>下次有空，<br />想做一点什么？</h2><p>这里会放下想看的作品、想玩的游戏，以及值得出门的地方。</p><p className={styles.caption}>还没有添加体验。先把想法留在笔记里，等内容整理好后再来慢慢选。</p><Link href="/notes" className={styles.link}>去笔记里记下来 <ArrowUpRight size={15} aria-hidden="true" /></Link>
    </section> : <>
      <section className={styles.featureSection} aria-labelledby="leisure-now">
        <div className={styles.sectionHeading}><h2 id="leisure-now"><span className={styles.sectionNumber} aria-hidden="true">01 /</span>此刻可选</h2><span className={styles.caption}>不急着选完，挑一个就好</span></div>
        {feature ? <div className={styles.featureStage}>
          <article className={styles.feature} key={feature.id}>
            <div className={styles.featureImage}><LeisureArtwork item={feature} cinematic priority sizes="(max-width: 767px) 100vw, 1000px" /></div>
            <div className={styles.featureShade} aria-hidden="true" />
            <div className={styles.featureContent}><span className={styles.featureKicker}><span className={styles.featureDot} />A MOMENT FOR YOU</span><div className={styles.featureText}><div className={styles.featureMeta}>{leisureKindLabels[feature.kind]}{feature.duration_minutes ? ` / ${formatLeisureDuration(feature.duration_minutes)}` : ""}</div><h3><Link href={`${detailBase}${feature.id}`}>{feature.title}</Link></h3>{feature.why ? <p>{feature.why}</p> : null}<Link href={`${detailBase}${feature.id}`} className={styles.featureCta}>走进这个世界 <ArrowUpRight size={18} aria-hidden="true" /></Link></div></div>
          </article>
          <div className={styles.featureControls}><span aria-hidden="true">{String(featureIndex % eligible.length + 1).padStart(2, "0")} <span>/ {String(eligible.length).padStart(2, "0")}</span></span>{eligible.length > 1 ? <button type="button" onClick={() => setFeatureIndex((index) => index + 1)}><Shuffle size={16} aria-hidden="true" />换个灵感</button> : null}</div>
          <span className={styles.srOnly} role="status" aria-live="polite">此刻可选：{feature.title}</span>
        </div> : <div className={styles.noChoices} role="status"><Sparkles size={24} aria-hidden="true" /><p>{activeContext ? "暂时没有符合这个情境的选项。试试放宽一点条件。" : "这一轮暂时没有新的选项。还可以翻翻之前留下的体验。"}</p>{activeContext ? <button type="button" className={styles.quietButton} onClick={resetContext}>看看所有情境</button> : null}</div>}
      </section>
      <section className={styles.collection} aria-labelledby="leisure-collection-heading" id="leisure-collection">
        <div className={styles.collectionHeading}><div><span className={styles.eyebrow}>THE COLLECTION</span><h2 id="leisure-collection-heading">慢慢挑，<em>都在这里。</em></h2></div><span className={styles.collectionCount}>{experiences.length}<span>{hasMore ? "+" : ""} 个念头</span></span></div>
        <div className={styles.browseToolbar}><div className={styles.categoryTabs} role="group" aria-label="按体验类型浏览"><button type="button" aria-pressed={kind === "all"} onClick={() => { setKind("all"); setBrowseRevision((value) => value + 1); }}>全部</button>{kinds.map((value) => <button type="button" key={value} aria-pressed={kind === value} onClick={() => { setKind(value); setBrowseRevision((value) => value + 1); }}>{leisureKindLabels[value]}</button>)}</div>
          <details className={styles.context}><summary>换个情境{activeContext ? " · 已选择" : ""}</summary><div className={styles.contextPanel}><div className={styles.contextFields}>
            <label>有多少时间<select value={context.minutes} onChange={(event) => updateContext("minutes", event.target.value)}><option value="">都可以</option><option value="30">半小时以内</option><option value="60">一小时以内</option><option value="120">两小时以内</option><option value="240">一个下午</option></select></label>
            <label>在哪里<select value={context.setting} onChange={(event) => updateContext("setting", event.target.value)}><option value="">都可以</option><option value="home">在家</option><option value="out">出门</option></select></label>
            <label>和谁一起<select value={context.company} onChange={(event) => updateContext("company", event.target.value)}><option value="">都可以</option><option value="solo">自己</option><option value="together">和别人一起</option></select></label>
            <label>花费<select value={context.budget} onChange={(event) => updateContext("budget", event.target.value)}><option value="">不限</option><option value="free">免费</option><option value="paid">付费体验</option></select></label>
          </div><p className={styles.caption}>只影响这次浏览。条件不明的体验不会被当成符合条件。</p>{activeContext ? <button type="button" className={styles.quietButton} onClick={resetContext}>清除选择</button> : null}</div></details>
        </div>
        <p className={styles.srOnly} role="status" aria-live="polite">显示 {gallery.length} 个体验</p>
        {gallery.length ? <ul className={styles.posterGrid} key={browseRevision}>{gallery.map((item, index) => <Poster key={item.id} item={item} href={`${detailBase}${item.id}`} index={index} />)}</ul> : <div className={styles.noChoices}><p>这个角落还没有符合条件的体验。</p><button type="button" className={styles.quietButton} onClick={() => { setKind("all"); resetContext(); }}>重新看看全部</button></div>}
        {hasMore ? <p className={styles.caption}>这里只显示最近更新的 100 条；更早的体验仍然保留，可通过原有详情链接打开。</p> : null}
      </section>
      {remembered.length || memories.length ? <div className={styles.split}>
        {remembered.length ? <section className={styles.section} aria-labelledby="leisure-remembered"><div className={styles.sectionHeading}><h2 id="leisure-remembered"><span className={styles.sectionNumber} aria-hidden="true">02 /</span>还惦记着</h2><span aria-hidden="true">↗</span></div><ul className={styles.list}>{remembered.slice(0, 6).map((item) => <li key={item.id} className={styles.keepsake}><Link href={`${detailBase}${item.id}`} className={styles.keepsakeLink}><div className={styles.keepsakeArt}><LeisureArtwork item={item} sizes="64px" /></div><div><span className={styles.kind}>{leisureStatusLabels[item.feedback!.status!]}</span><h3>{item.title}</h3></div><MoveUpRight size={16} aria-hidden="true" /></Link></li>)}</ul></section> : null}
        {memories.length ? <section className={styles.section} aria-labelledby="leisure-memories"><div className={styles.sectionHeading}><h2 id="leisure-memories"><span className={styles.sectionNumber} aria-hidden="true">03 /</span>留下来的</h2><span className={styles.caption}>自己的感受</span></div><ul className={styles.list}>{memories.slice(0, 4).map((item) => <li key={item.id} className={styles.memory}><span className={styles.memoryQuote} aria-hidden="true">“</span><h3><Link href={`${detailBase}${item.id}`}>{item.title}</Link></h3>{item.feedback?.personal_note ? <p>{item.feedback.personal_note.length > 160 ? `${item.feedback.personal_note.slice(0, 160)}…` : item.feedback.personal_note}</p> : item.feedback?.reaction === "liked" ? <p>喜欢，想留在这里</p> : null}{item.feedback?.linked_note_id && item.feedback.linked_note_available ? <Link className={styles.link} href={`/notes/${item.feedback.linked_note_id}`}>读那篇笔记 <ArrowRight size={14} aria-hidden="true" /></Link> : null}</li>)}</ul></section> : null}
      </div> : null}
    </>}
    <footer className={styles.footer}><span className={styles.footerSignature}>Enjoy the little things.</span><div><Link href="/travel" className={styles.link}>旅行计划 <ArrowUpRight size={13} aria-hidden="true" /></Link><Link href="/shopping" className={styles.link}>购物清单 <ArrowUpRight size={13} aria-hidden="true" /></Link><Link href="/notes" className={styles.link}>回到笔记 <ArrowUpRight size={13} aria-hidden="true" /></Link></div></footer>
  </div>;
}
