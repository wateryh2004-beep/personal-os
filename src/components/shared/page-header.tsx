import { cn } from "@/lib/utils";

export function PageHeader({ title, description, eyebrow, back, action, secondaryActions, className }: {
  title: string;
  description?: string;
  eyebrow?: React.ReactNode;
  back?: React.ReactNode;
  action?: React.ReactNode;
  secondaryActions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex min-w-0 flex-wrap items-start justify-between gap-5", className)}>
      <div className="flex min-w-0 items-start gap-3.5">
        {back}
        <div className="min-w-0">
          {eyebrow ? <div className="mb-1.5 text-[10.5px] font-semibold tracking-[.015em] text-[var(--text-tertiary)]">{eyebrow}</div> : null}
          <h1 className="truncate text-[30px] font-semibold leading-[1.06] tracking-[-0.042em] text-[var(--text-primary)]">{title}</h1>
          {description ? <p className="mt-2 max-w-2xl text-[13px] leading-[1.6] text-[var(--text-secondary)]">{description}</p> : null}
        </div>
      </div>
      {action || secondaryActions ? <div className="flex shrink-0 items-center gap-1.5 pt-0.5">{secondaryActions}{action}</div> : null}
    </header>
  );
}
