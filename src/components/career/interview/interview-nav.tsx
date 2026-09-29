import Link from "next/link";

const items = [
  ["目标岗位", "/career/interview"],
  ["题库", "/career/interview/questions"],
  ["模拟练习", "/career/interview/practice"],
  ["面试记录", "/career/interview/sessions"],
  ["复盘", "/career/interview/insights"],
] as const;

function active(current: string, href: string) {
  if (href === "/career/interview") return current === href || current.startsWith("/career/interview/targets/");
  if (href === "/career/interview/questions") return current === href || current.startsWith("/career/interview/questions/");
  return current === href || current.startsWith(`${href}/`);
}

export function InterviewNav({ current }: { current: string }) {
  return (
    <nav aria-label="面试准备导航" className="mb-9 flex gap-6 overflow-x-auto text-sm">
      {items.map(([label, href]) => {
        const isCurrent = active(current, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={isCurrent ? "page" : undefined}
            className={`shrink-0 pb-2 transition-colors ${isCurrent ? "border-b-2 border-zinc-900 font-medium text-zinc-950" : "text-zinc-500 hover:text-zinc-900"}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
