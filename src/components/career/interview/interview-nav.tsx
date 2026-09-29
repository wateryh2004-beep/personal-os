import Link from "next/link";

const items = [
  ["题库", "/career/interview"],
  ["模拟练习", "/career/interview/practice"],
  ["面试记录", "/career/interview/sessions"],
  ["复盘", "/career/interview/insights"],
] as const;

function active(current: string, href: string) {
  if (href === "/career/interview") return current === href || current.startsWith("/career/interview/questions");
  return current === href || current.startsWith(`${href}/`);
}

export function InterviewNav({ current }: { current: string }) {
  return (
    <nav aria-label="面试准备导航" className="mb-8 flex gap-1 overflow-x-auto border-b pb-2 text-sm">
      {items.map(([label, href]) => {
        const isCurrent = active(current, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={isCurrent ? "page" : undefined}
            className={`shrink-0 rounded-md px-3 py-1.5 transition-colors ${isCurrent ? "bg-zinc-900 font-medium text-white" : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
