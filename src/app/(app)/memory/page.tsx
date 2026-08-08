import { PageHeader } from "@/components/shared/page-header";
import { MemoryWorkspace } from "@/components/memory/memory-workspace";
import { getMemoryWorkspace } from "@/features/memory/queries";
export default async function MemoryPage() {
  const data = await getMemoryWorkspace();
  return (
    <>
      <PageHeader
        title="Memory"
        description="只保存你确认过的长期事实、当前状态与重要决定。"
      />
      <MemoryWorkspace memories={data.memories} decisions={data.decisions} />
    </>
  );
}
