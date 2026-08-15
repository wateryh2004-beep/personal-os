export type NoteListItem = {
  id: string;
  title: string;
  /** Present only for search results / fallback listing; always null from the RPC listing. */
  excerpt: string | null;
  updated_at: string;
  pinned_at: string | null;
  folder_id: string | null;
};
