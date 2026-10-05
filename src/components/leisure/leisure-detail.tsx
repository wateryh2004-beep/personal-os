import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import type { LeisureExperience, LeisureFeedbackInput, LeisureFeedbackResult } from "@/features/leisure/types";
import { formatLeisureDuration, leisureKindLabels, ratingAvailability, sourceAvailability } from "@/features/leisure/presentation";
import { LeisureFeedbackControls } from "./leisure-feedback";
import { getLeisureArtwork } from "@/features/leisure/artwork";
import { LeisureArtwork } from "./leisure-artwork";
import styles from "./leisure.module.css";

function dateLabel(value: string) { return value.slice(0, 10); }

export function LeisureDetail({ experience: item, now, backHref = "/leisure", onSave }: { experience: LeisureExperience; now: number; backHref?: string; onSave?: (input: LeisureFeedbackInput) => Promise<LeisureFeedbackResult> }) {
  const metadata = [["留多少时间", formatLeisureDuration(item.duration_minutes)], ["平台", item.platform], ["地点", item.location], ["时间", item.starts_at ? item.starts_at.replace("T", " ").replace(/Z$/, " UTC") : null], ["花费", item.cost_text]].filter((entry) => entry[1]);
  const verifiedLinks = new Set(item.sources.filter((source) => sourceAvailability(source, now) === "verified").map((source) => source.url));
  const art = getLeisureArtwork(item);
  const official = item.sources.find((source) => source.kind === "official" && sourceAvailability(source, now) === "verified");
  return <article className={`${styles.page} ${styles.detail}`}>
    <nav aria-label="闲暇位置" className={styles.back}><Link href={backHref} className={styles.link}>← 回到闲暇</Link><span className={styles.eyebrow}>THE GOOD HOURS / 闲暇</span></nav>
    <header className={styles.detailHero} data-orientation={art && art.width > art.height ? "landscape" : "portrait"}>
      <div className={styles.detailCover} style={art ? { aspectRatio: `${art.width} / ${art.height}` } : undefined}><LeisureArtwork item={item} priority sizes={art && art.width > art.height ? "(max-width: 767px) 100vw, (max-width: 1200px) 80vw, 1052px" : "(max-width: 599px) 280px, 420px"} /></div>
      <div className={styles.detailHeroText}><div className={styles.kind}><span>{leisureKindLabels[item.kind]}</span></div><h1 className={styles.detailTitle}>{item.title}</h1>{item.why ? <p className={styles.why}>{item.why}</p> : null}
        {metadata.length ? <dl className={styles.metadata}>{metadata.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : null}
        <div className={styles.detailActions}>{official ? <a className={styles.primaryLink} href={official.url} target="_blank" rel="noreferrer noopener">{official.label} ↗</a> : null}<a className={styles.link} href="#leisure-my-page">留下我的感受 ↓</a></div>
        {official ? <p className={styles.caption}>可用地区、价格与场次请以官方页面为准</p> : null}
      </div>
    </header>
    <div className={styles.detailMain}>
    {item.how_to_start ? <p className={styles.start}><strong>从这里开始</strong>{item.how_to_start}</p> : null}
    {item.body_markdown ? <div className={styles.body}><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} components={{
      h1: ({ children }) => <h2>{children}</h2>,
      a: ({ children, href }) => verifiedLinks.has(href ?? "") ? <a href={href} target="_blank" rel="noreferrer noopener">{children}</a> : <span>{children}<span className={styles.caption}>（链接待核实）</span></span>,
      img: ({ alt }) => <span className={styles.caption}>{alt ? `图片说明：${alt}` : "图片未加载"}</span>,
      table: ({ children }) => <div className={styles.tableScroll}><table>{children}</table></div>,
    }}>{item.body_markdown}</ReactMarkdown></div> : null}
    <details className={styles.sources}><summary>出处、评分与图片来源</summary><div className={styles.sourceContent}><h2 id="leisure-sources" className={styles.srOnly}>出处与去处</h2>
      {item.ratings.length ? <div className="mb-5">{item.ratings.map((rating, index) => {
        const availability = ratingAvailability(rating, item.sources, now);
        return <p key={`${rating.platform}-${index}`} className={styles.sourceRow}><strong>{rating.platform} · {rating.value}{rating.scale ? ` / ${rating.scale}` : ""}</strong><span className={styles.caption}>平台原始评分 · 查于 {dateLabel(rating.checked_at)}{availability === "stale" ? " · 评分需重新核实" : availability === "unverified" ? " · 评分待核实" : ""}</span></p>;
      })}<p className={styles.caption}>平台评分供参考，与自己的感受分开记录。</p></div> : null}
      {item.sources.length ? <ul className={styles.list}>{item.sources.map((source, index) => {
        const availability = sourceAvailability(source, now);
        return <li key={`${source.url}-${index}`} className={styles.sourceRow}>{availability === "verified" ? <a className={styles.link} href={source.url} target="_blank" rel="noreferrer noopener">{source.label} ↗</a> : <span>{source.label}</span>}<span className={styles.caption}>{source.kind === "official" ? "官方入口" : source.kind === "rating" ? "评分出处" : "参考来源"} · {availability === "verified" ? `核实于 ${dateLabel(source.checked_at!)}` : availability === "stale" ? "需重新核实，暂不提供跳转" : "待核实，暂不提供跳转"}</span></li>;
      })}</ul> : <p className={styles.caption}>还没有核实过的资源入口。这里不会提供来源不明的观看、下载或购买链接。</p>}
      <p className={styles.caption}>可用地区、价格与场次可能变化，请以官方页面为准。</p>
      {art ? <p className={styles.caption}>{art.credit} · <a href={art.sourceUrl} target="_blank" rel="noreferrer noopener" className={styles.link}>图片来源 ↗</a>{art.editionNote ? <span> · {art.assetType === "official_promotional_still" ? "系列宣传剧照，不代表观看起点" : "作品宣传封面"}</span> : null}</p> : null}
    </div></details>
    <div id="leisure-my-page"><LeisureFeedbackControls key={item.id} experience={item} onSave={onSave} /></div>
    </div>
  </article>;
}
