import Link from "next/link";

const items = [
  ["岗位", "/career/interview"],
  ["题目", "/career/interview/questions"],
  ["练习", "/career/interview/practice"],
] as const;

function active(current: string, href: string) {
  if (href === "/career/interview") return current === href || current.startsWith("/career/interview/targets/");
  if (href === "/career/interview/questions") return current === href || current.startsWith("/career/interview/questions/");
  return current === href || current.startsWith(`${href}/`) || current.startsWith("/career/interview/sessions");
}

export function InterviewNav({ current }: { current: string }) {
  return (
    <nav aria-label="面试准备导航" className="mb-10 flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
      {items.map(([label, href]) => {
        const isCurrent = active(current, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={isCurrent ? "page" : undefined}
            className={`shrink-0 pb-1 transition-colors ${isCurrent ? "font-medium text-zinc-950" : "text-zinc-400 hover:text-zinc-700"}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
