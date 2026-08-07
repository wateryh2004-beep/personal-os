import { requireOwner } from "@/lib/auth/require-owner";

export async function getInboxWorkspace() {
  const { supabase } = await requireOwner();
  const [items, lists] = await Promise.all([
    supabase
      .from("inbox_items")
      .select("id,content_markdown,created_at,processed_at,converted_task_id,converted_note_id")
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("microsoft_todo_lists")
      .select("id,display_name,is_default")
      .is("archived_at", null)
      .order("display_name"),
  ]);
  return {
    items: items.error ? [] : items.data ?? [],
    lists: lists.error ? [] : lists.data ?? [],
  };
}
