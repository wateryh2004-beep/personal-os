export type NoteListItem = {
  id: string;
  title: string;
  excerpt: string;
  updated_at: string;
  pinned_at: string | null;
  folder_id: string | null;
};
