export type NoteLinkSuggestion = {
  id: string;
  title: string;
  folderName: string | null;
  updatedAt: string | null;
};

export type InternalNoteLink = {
  noteId: string;
  label: string;
  from: number;
  to: number;
};

export type NoteLinkPreview = NoteLinkSuggestion & {
  excerpt: string;
};
