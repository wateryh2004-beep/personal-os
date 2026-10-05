import { LeisureDetailLink as Link } from "./leisure-detail-link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import type { LeisureExperience, LeisureFeedbackInput, LeisureFeedbackResult, LeisureSummary } from "@/features/leisure/types";
import { formatLeisureDuration, leisureKindLabels, ratingAvailability, sourceAvailability } from "@/features/leisure/presentation";
import { LeisureFeedbackControls } from "./leisure-feedback";
import { getLeisureArtwork } from "@/features/leisure/artwork";
import { LeisureArtwork } from "./leisure-artwork";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { leisureNeighbors, leisureDetailHref, readLeisureBrowse } from "@/features/leisure/browse";
import styles from "./leisure.module.css";

function dateLabel(value: string) { return value.slice(0, 10); }
const editions = {
  film: { label: "SCREENING ROOM", mark: "01", invitation: "把这一段时间，留给一个故事。" },
  series: { label: "ONE MORE EPISODE", mark: "02", invitation: "一个世界，可以慢慢走进去。" },
  game: { label: "PRESS START", mark: "03", invitation: "这次，换你来探索。" },
  music: { label: "SIDE A / LISTEN CLOSELY", mark: "04", invitation: "留一点空白，让声音进来。" },
  book: { label: "BETWEEN THE PAGES", mark: "05", invitation: "翻开一页，时间就慢了下来。" },
  outing: { label: "OUT OF THE ORDINARY", mark: "06", invitation: "出门走走，换一个视角。" },
  other: { label: "A LITTLE DISCOVERY", mark: "07", invitation: "给日常，留一点意外。" },
} as const;

export function LeisureDetail({ experience: item, now, backHref = "/leisure", neighbors = [], from, detailBase = "/leisure/", onSave }: { experience: LeisureExperience; now: number; backHref?: string; neighbors?: LeisureSummary[]; from?: string; detailBase?: string; onSave?: (input: LeisureFeedbackInput) => Promise<LeisureFeedbackResult> }) {
  const metadata = [["留多少时间", formatLeisureDuration(item.duration_minutes)], ["平台", item.platform], ["地点", item.location], ["时间", item.starts_at ? item.starts_at.replace("T", " ").replace(/Z$/, " UTC") : null], ["花费", item.cost_text]].filter((entry) => entry[1]);
  const verifiedLinks = new Set(item.sources.filter((source) => sourceAvailability(source, now) === "verified").map((source) => source.url));
  const art = getLeisureArtwork(item);
  const edition = editions[item.kind];
  const adjacent = leisureNeighbors(neighbors, item.id, readLeisureBrowse(new URLSearchParams(from)));
  const hasStory = Boolean(item.body_markdown.trim());
  const official = item.sources.find((source) => source.kind === "official" && sourceAvailability(source, now) === "verified");
  return <article className={`${styles.page} ${styles.detail}`} data-edition={item.kind}>
    <nav aria-label="闲暇位置" className={styles.back}><Link href={backHref} className={styles.link}>← 回到闲暇</Link><span className={styles.eyebrow}>THE GOOD HOURS / 闲暇</span></nav>
    <header className={styles.detailHero} data-orientation={art && art.width > art.height ? "landscape" : art && art.width === art.height ? "square" : "portrait"}>
      <div className={styles.detailVisual}>
        <div className={styles.detailImprint} aria-hidden="true"><span>{edition.label}</span><span>闲暇 / {edition.mark}</span></div>
        <div className={styles.detailCover} style={art ? { aspectRatio: `${art.width} / ${art.height}` } : undefined}><LeisureArtwork item={item} priority sizes="(max-width: 599px) 82vw, (max-width: 1000px) 76vw, 560px" /></div>
        <div className={styles.coverFoot}><span>{art ? "官方宣传图" : "A LITTLE TIME, WELL SPENT"}</span><span aria-hidden="true">✳</span></div>
      </div>
      <div className={styles.detailHeroText}>
        <div className={styles.detailKicker}><span>{leisureKindLabels[item.kind]}</span><span aria-hidden="true">/</span><span>{edition.label}</span></div>
        <h1 className={styles.detailTitle}>{item.title}</h1>
        {item.why ? <p className={styles.why}>{item.why}</p> : null}
        <div className={styles.detailActions}>{official ? <a className={styles.primaryLink} href={official.url} target="_blank" rel="noreferrer noopener"><span>{official.label}</span><ArrowUpRight size={18} aria-hidden="true" /></a> : null}<a className={styles.link} href={item.how_to_start ? "#leisure-start" : hasStory ? "#leisure-story" : "#leisure-my-page"}>{item.how_to_start ? "怎么开始" : hasStory ? "再了解一点" : "留下我的感受"}<ArrowDown size={14} aria-hidden="true" /></a></div>
        <p className={styles.caption}>{official ? "可用地区、价格与场次请以官方页面为准" : "官方入口尚待核实，可先读读介绍"}</p>
      </div>
    </header>
    {metadata.length ? <dl className={styles.detailTicket}>{metadata.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl> : null}
    <div className={styles.detailReading}>
      <nav className={styles.readingIndex} aria-label="这一页"><span className={styles.eyebrow}>ON THIS PAGE</span>{hasStory ? <a href="#leisure-story"><span aria-hidden="true">01</span>作品手记</a> : null}{item.how_to_start ? <a href="#leisure-start"><span aria-hidden="true">↘</span>从这里开始</a> : null}<a href="#leisure-my-page"><span aria-hidden="true">♡</span>我的这一页</a><span className={styles.readingFlower} aria-hidden="true">✳</span></nav>
      <div className={styles.detailMain}>
    {item.how_to_start ? <section id="leisure-start" className={styles.start}><span className={styles.startMark} aria-hidden="true">↗</span><div><h2>从这里开始</h2><p>{item.how_to_start}</p></div></section> : null}
    {hasStory ? <section id="leisure-story" className={styles.story}><div className={styles.storyHeading}><span className={styles.eyebrow}>THE STORY & THE DETAILS</span><span aria-hidden="true">/</span></div><div className={styles.body}><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} components={{
      h1: ({ children }) => <h2>{children}</h2>,
      a: ({ children, href }) => verifiedLinks.has(href ?? "") ? <a href={href} target="_blank" rel="noreferrer noopener">{children}</a> : <span>{children}<span className={styles.caption}>（链接待核实）</span></span>,
      img: ({ alt }) => <span className={styles.caption}>{alt ? `图片说明：${alt}` : "图片未加载"}</span>,
      table: ({ children }) => <div className={styles.tableScroll}><table>{children}</table></div>,
    }}>{item.body_markdown}</ReactMarkdown></div></section> : null}
    <div id="leisure-my-page"><LeisureFeedbackControls key={item.id} experience={item} onSave={onSave} /></div>
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
      {art ? <p className={styles.caption}>{art.credit} · <a href={art.sourceUrl} target="_blank" rel="noreferrer noopener" className={styles.link}>图片来源 ↗</a>{art.editionNote ? <span> · {art.editionNote}</span> : null}</p> : null}
    </div></details>
      </div>
    </div>
    <footer className={styles.detailEnd}>
      <div className={styles.detailEndHeading}><div><span className={styles.eyebrow}>STAY A LITTLE LONGER</span><p>{edition.invitation}</p></div><Link href={backHref} className={styles.link}>回到收藏集 <ArrowUpRight size={15} aria-hidden="true" /></Link></div>
      {adjacent.length ? <nav className={styles.adjacent} aria-label="继续逛逛">{adjacent.map(({ item: neighbor, direction }) => <Link key={neighbor.id} className={styles.adjacentLink} href={leisureDetailHref(detailBase, neighbor.id, readLeisureBrowse(new URLSearchParams(from)))}><div className={styles.adjacentArt}><LeisureArtwork item={neighbor} sizes="100px" /></div><div><span className={styles.kind}>{direction === "previous" ? "上一份灵感" : "下一份灵感"} · {leisureKindLabels[neighbor.kind]}</span><h2>{neighbor.title}</h2></div>{direction === "previous" ? <ArrowLeft size={18} aria-hidden="true" /> : <ArrowRight size={18} aria-hidden="true" />}</Link>)}</nav> : null}
      <span className={styles.footerSignature}>Enjoy the little things.</span>
    </footer>
  </article>;
}
