export type NoteListItem = {
  id: string;
  title: string;
  /** Present only for search results / fallback listing; always null from the RPC listing. */
  excerpt: string | null;
  updated_at: string;
  pinned_at: string | null;
  folder_id: string | null;
  /** Null when the migration is not yet applied to the remote listing. */
  content_origin: string | null;
};
