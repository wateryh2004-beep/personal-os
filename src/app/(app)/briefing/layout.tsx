import { BriefingNav } from "@/components/briefing/briefing-nav";
import { PageHeader } from "@/components/shared/page-header";
export default function BriefingLayout({ children }: { children: React.ReactNode }) { return <div className="briefing-workspace mx-auto w-full max-w-[1112px] space-y-5"><PageHeader title="简报" description="每天一次，只保留真正值得你注意的信息。"/><BriefingNav />{children}</div>; }
