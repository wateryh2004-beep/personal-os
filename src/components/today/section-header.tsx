import Link from "next/link";
import { ChevronRight } from "lucide-react";

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
    <div className="flex items-center justify-between gap-4">
      <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-[var(--text-primary)]">
        {children}
      </h2>
      {href ? (
        <Link
          href={href}
          className="pressable -mr-1 inline-flex shrink-0 items-center gap-0.5 rounded-[8px] px-1 py-0.5 text-[11px] font-medium text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent)]"
        >
          {label}
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}
