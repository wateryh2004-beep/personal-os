export type NoteListItem = {
  id: string;
  title: string;
  /** Missing on pre-migration clients: metadata writes must require a fresh list. */
  mutation_revision?: number;
  /** Present only for search results / fallback listing; always null from the RPC listing. */
  excerpt: string | null;
  updated_at: string;
  pinned_at: string | null;
  folder_id: string | null;
  /** Null when the migration is not yet applied to the remote listing. */
  content_origin: string | null;
};
