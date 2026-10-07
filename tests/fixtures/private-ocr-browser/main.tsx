import { createRoot } from "react-dom/client";
import { FileOcrControl } from "@/components/files/file-ocr-control";
import type { FileRecord } from "@/features/files/queries";
const file: FileRecord = {
  id: "22222222-2222-4222-8222-222222222222", title: "Synthetic OCR scan", original_filename: "scan.png", mime_type: "image/png",
  file_size: Number(document.body.dataset.size), folder_id: null, uploaded_at: "2026-10-07T00:00:00Z", created_at: "2026-10-07T00:00:00Z", archived_at: null,
  ai_visibility: "normal", text_extraction_status: "unsupported", extracted_character_count: 0,
};
createRoot(document.getElementById("root")!).render(<FileOcrControl file={file} onComplete={count => { document.getElementById("saved")!.textContent = `Saved ${count}`; }} />);
