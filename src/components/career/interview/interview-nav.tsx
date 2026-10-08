import Link from "next/link";

const items = [
  ["学习库", "/career/interview"],
  ["练习", "/career/interview/practice"],
  ["复盘", "/career/interview/insights"],
] as const;

function active(current: string, href: string) {
  if (href === "/career/interview") return current === href || current.startsWith("/career/interview/targets/");
  if (href === "/career/interview/questions") return current === href || current.startsWith("/career/interview/questions/");
  return current === href || current.startsWith(`${href}/`);
}

export function InterviewNav({ current, context }: { current: string; context?: string }) {
  const secondaryLabel = current.startsWith("/career/interview/questions") ? "题目管理" : current.startsWith("/career/interview/sessions") ? "面试记录" : null;
  return (
    <nav aria-label="面试准备导航" className="mb-9 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] leading-5">
      {items.map(([label, href]) => {
        const isCurrent = active(current, href);
        return (
          <Link
            key={href}
            href={context && !(context === "general" && href === "/career/interview") ? `${href}?context=${encodeURIComponent(context)}` : href}
            aria-current={isCurrent ? "page" : undefined}
            className="ui-navigation-item"
          >
            {label}
          </Link>
        );
      })}
      <details className="relative">
        <summary className="ui-navigation-item inline-flex min-h-11 cursor-pointer items-center">{secondaryLabel ?? "更多 · 资料管理"}</summary>
        <div className="absolute right-0 top-full z-20 w-44 rounded-xl border border-[var(--separator)] bg-[var(--surface-canvas)] p-2 shadow-[var(--shadow-popover)]">
          {[["题目管理", "/career/interview/questions"], ["面试记录", "/career/interview/sessions"]].map(([label, href]) => <Link key={href} href={href} aria-current={current === href || current.startsWith(`${href}/`) ? "page" : undefined} className="ui-navigation-item flex min-h-11 items-center rounded-lg px-3 text-[13px] hover:bg-[var(--surface-hover)]">{label}</Link>)}
        </div>
      </details>
    </nav>
  );
}
