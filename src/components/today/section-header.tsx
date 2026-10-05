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
    <div className="flex min-h-6 items-center justify-between gap-3">
      <h2 className="text-[16px] font-semibold leading-6 text-[var(--text-primary)]">
        {children}
      </h2>
      {href ? (
        <Link
          href={href}
          className="pressable -mr-1 inline-flex shrink-0 items-center gap-0.5 rounded-[7px] min-h-11 px-1 py-1 text-[13px] font-medium text-[var(--text-tertiary)] hover:bg-[var(--surface-hover)] hover:text-[var(--accent)]"
        >
          {label}
          <ChevronRight className="size-3.5" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}
