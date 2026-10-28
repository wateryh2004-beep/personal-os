import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, ExternalLink, ImageIcon } from "lucide-react";
import { ExperienceTaskAction } from "@/components/experience-library/experience-task-action";
import { ExperiencePersonalNote } from "@/components/experience-library/experience-personal-note";
import { PageHeader } from "@/components/shared/page-header";
import {
  ExperienceAiAnalyzeButton,
  ExperienceMediaManager,
  ExperienceMediaProvider,
} from "@/components/experience-library/experience-entry-actions";
import {
  getExperienceAiConfig,
  getExperienceEntry,
} from "@/features/experience-library/queries";
import { matchingExperienceImages } from "@/features/experience-library/image-search";
import { experienceSegmentHighlights } from "@/features/experience-library/segment-highlights";
import { resolveExperienceCitation } from "@/features/experience-library/citation-display";
import type { ExperienceMedia, ExperienceSegment } from "@/features/experience-library/types";

export const dynamic = "force-dynamic";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function mediaInSegment(media: ExperienceMedia, segment: ExperienceSegment) {
  return media.selectionStart !== null
    && media.selectionStart >= segment.start
    && (media.selectionEnd ?? media.selectionStart) <= segment.end;
}

function SegmentText({ segment, linked, citations }: { segment: ExperienceSegment; linked: ExperienceMedia | undefined; citations: string[] }) {
  const ranges = experienceSegmentHighlights(segment, linked, citations);
  const pieces = ranges.map((range, index) => {
    const before = segment.text.slice(index ? ranges[index - 1].end : 0, range.start);
    const highlighted = segment.text.slice(range.start, range.end);
    return <span key={`${range.start}-${range.end}`}>{before}<mark>{highlighted}</mark></span>;
  });
  return <p className="experience-segment-text">{pieces}{segment.text.slice(ranges.at(-1)?.end ?? 0)}</p>;
}

export default async function ExperienceEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ entryId: string }>;
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const [{ entryId }, queryParams] = await Promise.all([params, searchParams]);
  const searchQuery = typeof queryParams.q === "string" ? queryParams.q.trim().slice(0, 120) : "";
  const [detail, aiConfig] = await Promise.all([
    getExperienceEntry(entryId),
    getExperienceAiConfig(),
  ]);
  if (!detail) notFound();

  const linkedSelectionIds = new Set<string>();
  for (const capture of detail.captures) {
    for (const segment of capture.segments) {
      for (const item of detail.media) {
        if (item.captureId === capture.id && mediaInSegment(item, segment)) linkedSelectionIds.add(item.id);
      }
    }
  }
  const captureIds = new Set(detail.captures.map((capture) => capture.id));
  const wholeCaptureIds = new Set(
    detail.media
      .filter((item) => item.captureId && captureIds.has(item.captureId) && item.selectionStart === null)
      .map((item) => item.id),
  );
  const otherMedia = detail.media.filter((item) => !linkedSelectionIds.has(item.id) && !wholeCaptureIds.has(item.id));
  const kindLabels = {
    reported: "网友自述",
    opinion: "主观评价或建议",
    inference: "AI 推断",
  } as const;
  const imageMatches = matchingExperienceImages(detail.media, searchQuery);
  const citations = detail.aiKeyPoints.map((point) => ({ point, citation: resolveExperienceCitation(point, detail.captures, detail.media) }));
  const located = citations.filter((item) => item.citation !== null);
  const unlocated = citations.filter((item) => item.citation === null);

  return (
    <div className="experience-detail">
      <PageHeader
        title={detail.entry.title}
        eyebrow={(
          <span className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5"><CalendarDays aria-hidden="true" size={14} />{formatDate(detail.entry.createdAt)}</span>
            <span className="inline-flex items-center gap-1.5"><ImageIcon aria-hidden="true" size={14} />{detail.entry.mediaCount} 张图片</span>
          </span>
        )}
        back={(
          <Link href={searchQuery ? `/experience-library?q=${encodeURIComponent(searchQuery)}` : "/experience-library"} className="experience-back" aria-label="返回经验资料库">
            <ArrowLeft aria-hidden="true" />
          </Link>
        )}
        action={<ExperienceAiAnalyzeButton
          entryId={detail.entry.id}
          configured={aiConfig.configured}
          previouslyFailed={detail.entry.aiStatus === "failed"}
        />}
      />

      <div className="experience-detail-meta">
        <div className="experience-detail-tags">
          {detail.entry.tags.map((tag) => <span key={tag}>#{tag}</span>)}
        </div>
        {detail.entry.sourceUrl ? (
          <a href={detail.entry.sourceUrl} target="_blank" rel="noreferrer" className="ui-link inline-flex items-center gap-1.5">
            查看原帖<ExternalLink aria-hidden="true" size={14} />
          </a>
        ) : null}
        <Link href={`/experience-library?entry=${detail.entry.id}`} className="ui-action-secondary">补充内容</Link>
      </div>

      {imageMatches.length ? <section className="experience-search-matches" aria-labelledby="experience-image-search-title">
        <p className="experience-kicker">图片文字搜索</p>
        <h2 id="experience-image-search-title">“{searchQuery}”出现在 {imageMatches.length} 张图片中</h2>
        <ul>{imageMatches.map((match) => <li key={match.id}><a className="ui-link" href={`#experience-media-${match.id}`}>查看图片 {match.order}</a><span>{match.excerpt}</span></li>)}</ul>
      </section> : null}

      <ExperiencePersonalNote entryId={detail.entry.id} initialNote={detail.entry.personalNote ?? ""} initialStatus={detail.entry.reviewStatus ?? "unmarked"} />
      <ExperienceTaskAction entryId={detail.entry.id} entryTitle={detail.entry.title} tasks={detail.tasks ?? []} unavailable={detail.tasksUnavailable} />

      {detail.entry.summary ? (
        <section className="experience-analysis" aria-labelledby="experience-analysis-title">
          <p className="experience-kicker">AI 整理 · 可在原文旁核对</p>
          <h2 id="experience-analysis-title">摘要</h2>
          <p>{detail.entry.summary}</p>
          <p className="experience-summary-disclaimer">摘要未逐句标注来源；下方可定位的引用也需要结合原文判断。</p>
          {located.length ? (
            <div className="experience-key-points">
              {located.map(({ point, citation }, index) => (
                <article key={`${point.kind}-${index}`}>
                  <div className="experience-key-point-labels">
                    <span data-kind={point.kind}>{kindLabels[point.kind]}</span>
                    <a className="ui-link" href={citation!.href}>{citation!.label}</a>
                  </div>
                  <p>{point.text}</p>
                  <blockquote>{citation!.kind === "image" ? "图片识别文字" : "原文"}：{point.sourceQuote}</blockquote>
                </article>
              ))}
            </div>
          ) : null}
          {unlocated.length ? <details className="experience-unlocated-points">
            <summary>{unlocated.length} 条暂时无法定位来源的 AI 候选</summary>
            <p>这些内容缺少可核对的原文位置，请自行核实。</p>
            {unlocated.map(({ point }, index) => <article key={`${point.kind}-${index}`}><span>{kindLabels[point.kind]}</span><p>{point.text}</p></article>)}
          </details> : null}
        </section>
      ) : null}

      <ExperienceMediaProvider media={detail.media}>
      <section className="experience-transcript" aria-labelledby="experience-transcript-title">
        <div className="experience-section-heading">
          <div>
            <p className="experience-kicker">原始记录</p>
            <h2 id="experience-transcript-title">正文与评论</h2>
          </div>
          <span>{detail.captures.length} 次追加</span>
        </div>
        {detail.captures.length ? detail.captures.map((capture, captureIndex) => (
          <article id={`experience-capture-${capture.id}`} key={capture.id} className="experience-capture-read" data-kind={capture.captureType}>
            <header>
              <span>{capture.captureType === "comment" ? "评论" : capture.captureType === "mixed" ? "图文混合" : capture.captureType === "post" ? "正文" : "原文"}</span>
              <span>第 {captureIndex + 1} 次粘贴 · {formatDate(capture.createdAt)}</span>
            </header>
            {capture.segments.map((segment) => {
              const segmentMedia = detail.media.filter((item) => item.captureId === capture.id && mediaInSegment(item, segment));
              return (
                <section id={`experience-segment-${capture.id}-${segment.start}`} key={`${capture.id}-${segment.start}`} className="experience-segment" data-kind={segment.kind}>
                  {segment.kind === "comment" ? (
                    <div className="experience-comment-label">{segment.label ?? "评论"}</div>
                  ) : null}
                  <SegmentText
                    segment={segment}
                    linked={segmentMedia[0]}
                    citations={detail.aiKeyPoints.flatMap((point) => point.sourceCaptureId === capture.id && point.sourceQuote ? [point.sourceQuote] : [])}
                  />
                  {segmentMedia.length ? (
                    <div className="experience-media-strip">
                      {segmentMedia.map((item) => (
                        <ExperienceMediaManager
                          key={item.id}
                          media={item}
                          captures={detail.captures}
                          order={detail.media.findIndex((row) => row.id === item.id) + 1}
                        />
                      ))}
                    </div>
                  ) : null}
                </section>
              );
            })}
            {(() => {
              const whole = detail.media.filter((item) => item.captureId === capture.id && item.selectionStart === null);
              return whole.length ? (
                <div className="experience-whole-media">
                  <p>此段原文关联图片</p>
                  <div className="experience-media-strip">
                    {whole.map((item) => (
                      <ExperienceMediaManager
                        key={item.id}
                        media={item}
                        captures={detail.captures}
                        order={detail.media.findIndex((row) => row.id === item.id) + 1}
                      />
                    ))}
                  </div>
                </div>
              ) : null;
            })()}
          </article>
        )) : (
          <p className="experience-empty">这篇经验目前只有图片。</p>
        )}
      </section>

      {otherMedia.length ? (
        <section className="experience-other-media" aria-labelledby="experience-other-media-title">
          <div className="experience-section-heading">
            <div>
              <p className="experience-kicker">未绑定具体原文</p>
              <h2 id="experience-other-media-title">其他图片</h2>
            </div>
          </div>
          <div className="experience-media-strip">
            {otherMedia.map((item) => (
              <ExperienceMediaManager
                key={item.id}
                media={item}
                captures={detail.captures}
                order={detail.media.findIndex((row) => row.id === item.id) + 1}
              />
            ))}
          </div>
        </section>
      ) : null}
      </ExperienceMediaProvider>
    </div>
  );
}
