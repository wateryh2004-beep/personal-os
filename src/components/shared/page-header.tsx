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
    <header className={cn("flex min-w-0 flex-wrap items-start justify-between gap-4", className)}>
      <div className="flex min-w-0 items-start gap-3">
        {back}
        <div className="min-w-0">
          {eyebrow ? <div className="mb-2 text-[12px] font-medium leading-5 text-[var(--text-tertiary)]">{eyebrow}</div> : null}
          <h1 className="page-title break-words">{title}</h1>
          {description ? <p className="mt-2 max-w-2xl text-[14px] leading-[1.6] text-[var(--text-secondary)]">{description}</p> : null}
        </div>
      </div>
      {action || secondaryActions ? <div className="flex min-w-0 flex-wrap items-center gap-2 pt-0.5">{secondaryActions}{action}</div> : null}
    </header>
  );
}
