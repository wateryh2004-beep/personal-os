import { SourceManager } from "@/components/briefing/source-manager";
import { getBriefingSources } from "@/features/briefing/queries";
export default async function BriefingSourcesPage(){const data=await getBriefingSources();return <main><h2 className="mb-4 font-medium">信源</h2><SourceManager sources={data.sources} items={data.items}/></main>}
