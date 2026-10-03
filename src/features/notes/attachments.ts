export type NoteAttachment = {
  id: string;
  title: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  role: string;
};

export function notePdfAttachments(attachments: NoteAttachment[]) {
  return attachments.filter((file) => file.mime_type === "application/pdf")
    .sort((a, b) => Number(b.role === "primary_pdf") - Number(a.role === "primary_pdf")
      || Number(b.role === "pdf_snapshot") - Number(a.role === "pdf_snapshot")
      || a.title.localeCompare(b.title, "zh-CN"));
}

export function attachmentRole(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || !("document_role" in metadata)) return "attachment";
  return typeof metadata.document_role === "string" ? metadata.document_role : "attachment";
}

export function noteAttachmentUrl(id: string, inline = false) {
  return `/api/files/${id}/download${inline ? "?inline=1" : ""}`;
}
