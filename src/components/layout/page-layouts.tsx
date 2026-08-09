import { cn } from "@/lib/utils";

type LayoutProps = React.ComponentProps<"div">;

export function DashboardLayout({ className, ...props }: LayoutProps) {
  return <div className={cn("mx-auto w-full max-w-[var(--content-dashboard-width)] px-4 py-6 sm:px-6 lg:px-8", className)} {...props} />;
}

export function CollectionLayout({ className, ...props }: LayoutProps) {
  return <div className={cn("mx-auto grid w-full max-w-[1440px] grid-cols-1 md:grid-cols-[var(--context-sidebar-width)_minmax(0,1fr)]", className)} {...props} />;
}

export function WorkspaceLayout({ className, ...props }: LayoutProps) {
  return <div className={cn("h-[calc(var(--app-viewport-height)-var(--toolbar-height))] min-h-0 w-full overflow-hidden p-3 sm:p-4 md:min-h-[560px]", className)} {...props} />;
}

export function DocumentLayout({ className, ...props }: LayoutProps) {
  return <div className={cn("mx-auto w-full max-w-[1500px] px-4 py-5 sm:px-6", className)} {...props} />;
}

export function ContextSidebar({ className, ...props }: React.ComponentProps<"aside">) {
  return <aside className={cn("border-b bg-[var(--surface-sidebar)] p-4 md:sticky md:top-[var(--toolbar-height)] md:h-[calc(var(--app-viewport-height)-var(--toolbar-height))] md:overflow-y-auto md:border-r md:border-b-0", className)} {...props} />;
}
