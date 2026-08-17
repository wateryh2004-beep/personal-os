import { InboxWorkspace } from "@/components/inbox/inbox-workspace";
import { PageHeader } from "@/components/shared/page-header";
import { getInboxWorkspace } from "@/features/inbox/queries";

export default async function Inbox() {
  const workspace = await getInboxWorkspace();
  return <div className="space-y-7"><PageHeader title="Inbox" description="先记录，再决定。" /><InboxWorkspace {...workspace} /></div>;
}
