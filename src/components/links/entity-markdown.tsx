"use client";

import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { isInternalEntityHref } from "@/features/links/parser";

/**
 * 统一的只读 Markdown 渲染:跨实体内链([标题](/notes/…)、/tasks?task=…、
 * /calendar?event=…、/files?file=…)渲染为站内可点击链接,其余按外部链接处理。
 * 用于日历日程说明、任务说明等描述字段。
 */
export function EntityMarkdown({ body, className }: { body: string; className?: string }) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          h1: ({ children }) => <h1 className="mb-3 mt-1 text-2xl font-semibold tracking-tight text-zinc-900">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-2 mt-6 border-b pb-1 text-lg font-semibold text-zinc-900">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-2 mt-5 text-base font-semibold text-zinc-900">{children}</h3>,
          p: ({ children }) => <p className="mb-3 leading-6 text-zinc-700">{children}</p>,
          ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 text-zinc-700">{children}</ul>,
          ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 text-zinc-700">{children}</ol>,
          li: ({ children }) => <li className="pl-1 leading-6">{children}</li>,
          blockquote: ({ children }) => <blockquote className="mb-3 border-l-2 border-zinc-300 pl-3 italic text-zinc-600">{children}</blockquote>,
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
          pre: ({ children }) => <pre className="mb-3 overflow-x-auto bg-zinc-950 p-3 text-sm leading-6 text-zinc-100">{children}</pre>,
          code: ({ children, className }) => className ? <code className={className}>{children}</code> : <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[0.85em] text-zinc-800">{children}</code>,
          table: ({ children }) => <div className="mb-3 overflow-x-auto"><table className="w-full border-collapse text-left text-sm">{children}</table></div>,
          th: ({ children }) => <th className="border bg-zinc-50 px-3 py-2 font-medium">{children}</th>,
          td: ({ children }) => <td className="border px-3 py-2 align-top">{children}</td>,
          hr: () => <hr className="my-6 border-zinc-200" />,
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
