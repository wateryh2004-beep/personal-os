import { InboxWorkspace } from "@/components/inbox/inbox-workspace";
import { getInboxWorkspace } from "@/features/inbox/queries";

export default async function Inbox() {
  const workspace = await getInboxWorkspace();
  return <div className="space-y-7"><header className="border-b border-[#e7e5e4] pb-5"><h1 className="text-3xl font-semibold tracking-tight text-zinc-900">Inbox</h1><p className="mt-1 text-sm text-zinc-500">写入即识别，点同意即可。</p></header><InboxWorkspace {...workspace} /></div>;
}
