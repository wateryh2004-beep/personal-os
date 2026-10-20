import Link from "next/link";

const items = [
  ["学习库", "/career/interview"],
  ["准备情境", "/career/interview/targets"],
  ["题目管理", "/career/interview/questions"],
  ["故事库", "/career/interview/stories"],
  ["练习", "/career/interview/practice"],
  ["复盘", "/career/interview/insights"],
] as const;

function active(current: string, href: string) {
  if (href === "/career/interview") return current === href;
  if (href === "/career/interview/questions") return current === href || current.startsWith("/career/interview/questions/");
  return current === href || current.startsWith(`${href}/`) || (href === "/career/interview/practice" && current.startsWith("/career/interview/sessions"));
}

export function InterviewNav({ current, context }: { current: string; context?: string }) {
  return (
    <nav aria-label="面试准备导航" className="mb-9 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] leading-5">
      {items.map(([label, href]) => {
        const isCurrent = active(current, href);
        return (
          <Link
            key={href}
            href={context && href !== "/career/interview/questions" && href !== "/career/interview/stories" && !(context === "general" && href === "/career/interview") ? `${href}?context=${encodeURIComponent(context)}` : href}
            aria-current={isCurrent ? "page" : undefined}
            className="ui-navigation-item"
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
