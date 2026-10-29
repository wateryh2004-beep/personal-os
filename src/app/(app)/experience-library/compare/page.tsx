import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { PageHeader } from "@/components/shared/page-header";
import { getExperienceEntry } from "@/features/experience-library/queries";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export default async function ExperienceComparePage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const params = await searchParams;
  const ids = [...new Set((params.ids ?? "").split(","))];
  if (ids.length < 2 || ids.length > 3 || ids.some((id) => !uuid.test(id))) return <section><PageHeader title="经验对照" /><p>请选择两至三篇经验。</p><Link className="ui-link" href="/experience-library">返回资料库</Link></section>;
  const details = await Promise.all(ids.map((id) => getExperienceEntry(id)));
  if (details.some((detail) => !detail)) return <section><PageHeader title="经验对照" /><p>有资料暂时无法读取，请核对选择后重试。</p><Link className="ui-link" href="/experience-library">返回资料库</Link></section>;
  const entries = details.flatMap((detail) => detail ? [detail] : []);
  const commonTags = entries[0].entry.tags.filter((tag) => entries.every((item) => item.entry.tags.includes(tag)));
  return <div className="experience-compare-page"><PageHeader title="经验对照" description="并排核对同一主题的不同记录；原文和个人判断分别呈现。" back={<Link className="ui-link" href="/experience-library">返回资料库</Link>} />
    {commonTags.length ? <p className="experience-compare-common">共同标签：{commonTags.map((tag) => `#${tag}`).join(" ")}</p> : null}
    <div className="experience-compare-grid">{entries.map((detail) => <article key={detail.entry.id}>
      <h2><Link className="ui-link" href={`/experience-library/${detail.entry.id}`}>{detail.entry.title}</Link></h2>
      <p>收录于 {new Date(detail.entry.createdAt).toLocaleDateString("zh-CN")} · {detail.entry.captureCount} 次原文 · {detail.entry.mediaCount} 张图片</p>
      {detail.entry.sourceUrl ? <a className="ui-link" href={detail.entry.sourceUrl} target="_blank" rel="noreferrer">查看原帖</a> : null}
      <p>标签：{detail.entry.tags.length ? detail.entry.tags.map((tag) => `#${tag}`).join(" ") : "未标记"}</p>
      {detail.entry.personalNote ? <section><h3>我的判断</h3><p>{detail.entry.personalNote}</p></section> : null}
      {detail.entry.summary ? <section><h3>AI 摘要 · 请核对原文</h3><p>{detail.entry.summary}</p></section> : null}
      {detail.readingDocuments?.length ? <section><h3>阅读要点</h3>{detail.readingDocuments.filter((doc) => doc.qualityStatus === "keep").map((doc) => <div key={doc.captureId} className="experience-reading-body"><strong>{doc.title}</strong><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} skipHtml components={{ img: () => null, a: ({ children }) => <span>{children}</span> }}>{doc.bodyMarkdown}</ReactMarkdown></div>)}</section> : null}
      <details><summary>查看原始文字</summary><section>{detail.captures.length ? detail.captures.map((capture) => <p key={capture.id} className="experience-compare-original">{capture.rawContent}</p>) : <p>此篇只有图片。</p>}</section></details>
      {detail.media.length ? <section><h3>图片与识别文字</h3>{detail.media.map((media, index) => <p key={media.id}><Link className="ui-link" href={`/experience-library/${detail.entry.id}#experience-media-${media.id}`}>图片 {index + 1}</Link>{media.ocrText ? ` · ${media.ocrText.slice(0, 200)}` : ""}</p>)}</section> : null}
    </article>)}</div>
    <p className="experience-compare-footnote">不同帖子的时间、岗位和个人处境可能不同；矛盾之处请回到原文核对。</p>
  </div>;
}
