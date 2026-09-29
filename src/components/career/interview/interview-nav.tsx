import Link from "next/link";

const items = [
  ["Questions", "/career/interview"],
  ["Practice", "/career/interview/practice"],
  ["Sessions", "/career/interview/sessions"],
  ["Insights", "/career/interview/insights"],
] as const;

function active(current: string, href: string) {
  if (href === "/career/interview") return current === href || current.startsWith("/career/interview/questions");
  return current === href || current.startsWith(`${href}/`);
}

export function InterviewNav({ current }: { current: string }) {
  return (
    <nav aria-label="Interview Lab 导航" className="mb-7 flex gap-2 overflow-x-auto border-b pb-2 text-sm">
      {items.map(([label, href]) => (
        <Link
          key={href}
          href={href}
          aria-current={active(current, href) ? "page" : undefined}
          className={`shrink-0 rounded-md px-3 py-1.5 ${
            active(current, href)
              ? "bg-[#365F78] text-white"
              : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
