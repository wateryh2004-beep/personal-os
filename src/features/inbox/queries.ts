import { requireOwner } from "@/lib/auth/require-owner";

export async function getInboxWorkspace() {
  const { supabase } = await requireOwner();
  const [items, processedItems, archivedItems, lists] = await Promise.all([
    supabase
      .from("inbox_items")
      .select("id,content_markdown,created_at,processed_at,converted_task_id,converted_todo_task_id,converted_note_id,ai_proposal,ai_status,ai_error", { count: "exact" })
      .is("archived_at", null)
      .is("processed_at", null)
      .order("created_at", { ascending: true })
      .limit(100),
    supabase.from("inbox_items")
      .select("id,content_markdown,created_at,processed_at,converted_task_id,converted_todo_task_id,converted_note_id,ai_proposal,ai_status,ai_error")
      .is("archived_at", null)
      .not("processed_at", "is", null)
      .order("processed_at", { ascending: false })
      .limit(20),
    supabase
      .from("inbox_items")
      .select("id,content_markdown,created_at,processed_at,converted_task_id,converted_todo_task_id,converted_note_id,archived_at,ai_proposal,ai_status,ai_error")
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false })
      .limit(20),
    supabase
      .from("microsoft_todo_lists")
      .select("id,display_name,is_default")
      .is("archived_at", null)
      .order("display_name"),
  ]);
  return {
    items: [...(items.error ? [] : items.data ?? []), ...(processedItems.error ? [] : processedItems.data ?? [])],
    pendingCount: items.error ? null : items.count,
    unavailable: Boolean(items.error || processedItems.error || archivedItems.error || lists.error),
    archivedItems: archivedItems.error ? [] : archivedItems.data ?? [],
    lists: lists.error ? [] : lists.data ?? [],
  };
}
