import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function TodaySectionHeader({
  children,
  href,
  label = "查看全部",
}: {
  children: React.ReactNode;
  href?: string;
  label?: string;
}) {
  return (
    <div className="flex items-center justify-between border-b pb-2.5">
      <h2 className="text-sm font-semibold">{children}</h2>
      {href ? (
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-xs text-[var(--text-secondary)] hover:text-[var(--accent)]"
        >
          {label}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}
