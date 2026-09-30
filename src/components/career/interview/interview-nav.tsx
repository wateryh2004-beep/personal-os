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
            className={`relative shrink-0 pb-1.5 transition-colors ui-transition after:absolute after:inset-x-0 after:-bottom-px after:h-px after:rounded-full after:transition-opacity after:duration-[var(--motion-fast)] ${isCurrent ? "font-medium text-[var(--text-primary)] after:bg-[var(--accent)] after:opacity-100" : "text-[var(--text-tertiary)] after:opacity-0 hover:text-[var(--text-primary)]"}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
