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
  return <header className={cn("flex min-w-0 flex-wrap items-start justify-between gap-4", className)}>
    <div className="flex min-w-0 items-start gap-3">{back}<div className="min-w-0">{eyebrow ? <div className="mb-1 text-xs text-[var(--text-tertiary)]">{eyebrow}</div> : null}<h1 className="truncate text-2xl font-semibold tracking-[-0.02em] text-[var(--text-primary)] sm:text-[26px]">{title}</h1>{description ? <p className="mt-1 max-w-2xl text-sm leading-5 text-[var(--text-secondary)]">{description}</p> : null}</div></div>
    {action || secondaryActions ? <div className="flex shrink-0 items-center gap-2">{secondaryActions}{action}</div> : null}
  </header>;
}
