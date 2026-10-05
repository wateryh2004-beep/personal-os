import type { ComponentProps, ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** A disclosure is never represented by the same plus sign as an add action. */
export function DisclosureIndicator({ expanded }: { expanded?: boolean }) {
  return <span className="ui-disclosure-indicator" aria-hidden="true" data-expanded={expanded}>
    {expanded === undefined ? <><span className="ui-disclosure-open-label">展开</span><span className="ui-disclosure-close-label">收起</span></> : <span>{expanded ? "收起" : "展开"}</span>}
    <ChevronDown className="ui-disclosure-chevron" />
  </span>;
}

/** Controlled disclosure: caller owns the panel and preserves its mounted state. */
export function DisclosureTrigger({ expanded, children, className, ...props }: Omit<ComponentProps<"button">, "aria-expanded"> & { expanded: boolean; children: ReactNode }) {
  return <button {...props} type="button" aria-expanded={expanded} className={cn("ui-disclosure-trigger", className)}>
    <span className="ui-disclosure-label">{children}</span>
    <DisclosureIndicator expanded={expanded} />
  </button>;
}

/** Native details keeps keyboard behavior and remains useful before hydration. */
export function DisclosureSummary({ children, className, expanded, ...props }: ComponentProps<"summary"> & { expanded?: boolean }) {
  return <summary {...props} className={cn("ui-disclosure-trigger", className)}>
    <span className="ui-disclosure-label">{children}</span>
    <DisclosureIndicator expanded={expanded} />
  </summary>;
}
