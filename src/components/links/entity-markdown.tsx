"use client";

import Link from "next/link";
import { createElement } from "react";
import ReactMarkdown, { type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { isInternalEntityHref } from "@/features/links/parser";

/**
 * 统一的只读 Markdown 渲染:跨实体内链([标题](/notes/…)、/tasks?task=…、
 * /calendar?event=…、/files?file=…)渲染为站内可点击链接,其余按外部链接处理。
 * 用于日历日程说明、任务说明等描述字段。
 */
export function EntityMarkdown({ body, className, headingOffset = 0, sourcePositions = false }: { sourcePositions?: boolean; body: string; className?: string; headingOffset?: 0 | 1 | 2 }) {
  const source = (node?: ExtraProps["node"]) => ({ "data-source-line": sourcePositions ? node?.position?.start.line : undefined });
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          h1: ({ children, node }) => createElement(`h${Math.min(6, 1 + headingOffset)}`, { ...source(node), className: "mb-3 mt-1 text-2xl font-semibold tracking-tight text-[var(--text-primary)]" }, children),
          h2: ({ children, node }) => createElement(`h${Math.min(6, 2 + headingOffset)}`, { ...source(node), className: "mb-2 mt-6 border-b pb-1 text-lg font-semibold text-[var(--text-primary)]" }, children),
          h3: ({ children, node }) => createElement(`h${Math.min(6, 3 + headingOffset)}`, { ...source(node), className: "mb-2 mt-5 text-base font-semibold text-[var(--text-primary)]" }, children),
          h4: ({ children, node }) => createElement(`h${Math.min(6, 4 + headingOffset)}`, source(node), children),
          h5: ({ children, node }) => createElement(`h${Math.min(6, 5 + headingOffset)}`, source(node), children),
          h6: ({ children, node }) => createElement(`h${Math.min(6, 6 + headingOffset)}`, source(node), children),
          p: ({ children, node }) => <p {...source(node)} className="mb-3 leading-6 text-[var(--text-secondary)]">{children}</p>,
          ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 text-[var(--text-secondary)]">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 text-[var(--text-secondary)]">{children}</ol>,
          li: ({ children, node }) => <li {...source(node)} className="pl-1 leading-6">{children}</li>,
          blockquote: ({ children, node }) => <blockquote {...source(node)} className="mb-3 border-l-2 border-[var(--control-border)] pl-3 italic text-[var(--text-secondary)]">{children}</blockquote>,
          a: ({ children, href }) => {
            if (isInternalEntityHref(href)) {
              return (
                <Link href={href!} className="text-[var(--accent)] underline underline-offset-2 hover:bg-[var(--accent-soft)]">
                  {children}
                </Link>
              );
            }
            return <a href={href} target="_blank" rel="noreferrer" className="text-[var(--accent)] underline underline-offset-2">{children}</a>;
          },
          pre: ({ children, node }) => <pre {...source(node)} className="mb-3 overflow-x-auto bg-[var(--accent)] p-3 text-sm leading-6 text-[var(--text-tertiary)]">{children}</pre>,
          code: ({ children, className }) => className ? <code className={className}>{children}</code> : <code className="rounded bg-[var(--surface-control)] px-1 py-0.5 font-mono text-[0.85em] text-[var(--text-primary)]">{children}</code>,
          table: ({ children, node }) => <div {...source(node)} className="mb-3 overflow-x-auto"><table className="w-full border-collapse text-left text-sm">{children}</table></div>,
          th: ({ children }) => <th className="border bg-[var(--surface-canvas)] px-3 py-2 font-medium">{children}</th>,
          td: ({ children }) => <td className="border px-3 py-2 align-top">{children}</td>,
          hr: ({ node }) => <hr {...source(node)} className="my-6 border-[var(--separator)]" />,
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
