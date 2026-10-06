"use client";

import { FilesWorkspace } from "@/components/files/files-workspace";
import type { FileRecord } from "@/features/files/queries";

const folders = Array.from({ length: 36 }, (_, index) => ({ id: `e2e-file-folder-${index}`, name: `示例文件夹 ${index + 1}`, parent_id: null }));
const fixtureTypes = [
  ["pdf", "application/pdf"], ["jpg", "image/jpeg"], ["csv", "text/csv"], ["mp4", "video/mp4"],
  ["zip", "application/zip"], ["heic", "image/heic"], ["mp3", "audio/mpeg"], ["pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
];
const files: FileRecord[] = Array.from({ length: 80 }, (_, index) => ({
  id: `e2e-file-${index}`, title: `示例资料 ${index + 1} · Synthetic fixture`, original_filename: `fixture-${index + 1}.${fixtureTypes[index % fixtureTypes.length][0]}`,
  mime_type: fixtureTypes[index % fixtureTypes.length][1], file_size: 1024 * (index + 1), folder_id: index % 2 === 0 ? folders[0].id : null,
  created_at: "2026-10-03T00:00:00Z", uploaded_at: "2026-10-03T00:00:00Z", archived_at: null,
  ai_visibility: "normal", text_extraction_status: "completed", extracted_character_count: 100,
}));

// Synthetic geometry and menu fixture; browser checks never submit account mutations.
export function FilesPolishFixture() {
  return <FilesWorkspace folders={folders} files={files} />;
}
