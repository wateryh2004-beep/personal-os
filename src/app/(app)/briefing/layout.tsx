import { BriefingNav } from "@/components/briefing/briefing-nav";
import { PageHeader } from "@/components/shared/page-header";
export default function BriefingLayout({ children }: { children: React.ReactNode }) { return <div className="briefing-workspace mx-auto w-full max-w-[1180px] space-y-6"><PageHeader title="Briefing" description="每天一次、由你控制边界的个人情报系统。"/><BriefingNav />{children}</div>; }
