import { InboxWorkspace } from "@/components/inbox/inbox-workspace";
import { PageHeader } from "@/components/shared/page-header";
import { getInboxWorkspace } from "@/features/inbox/queries";

export default async function Inbox() {
  const workspace = await getInboxWorkspace();
  return <div className="space-y-7"><PageHeader title="收集箱" description="查看待确认的整理结果，处理识别失败；需要时再补充或手动更正。" /><InboxWorkspace {...workspace} /></div>;
}
