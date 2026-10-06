import { describe, expect, it } from "vitest";
import { canPreviewPhoto, classifyFile, defaultFileBrowserState, fileBrowserUrl, parseFileBrowserState, selectFiles } from "@/features/files/browser-state";
import type { FileRecord } from "@/features/files/queries";
const file = (id: string, name: string, mime = "application/octet-stream", size = 100, date = "2026-10-01T00:00:00Z"): FileRecord => ({ id, title: name, original_filename: name, mime_type: mime, file_size: size, uploaded_at: date, created_at: date, folder_id: null, archived_at: null, ai_visibility: "normal", text_extraction_status: "unsupported", extracted_character_count: 0 });
describe("Files browser classification and state", () => {
  it("classifies common file families, retaining unsupported photos as photos", () => {
    for (const [name, mime, type] of [["PHOTO.HEIC", "application/octet-stream", "photo"], ["unnamed", "IMAGE/PNG", "photo"], ["a.csv", "text/csv", "spreadsheet"], ["a.docx", "application/octet-stream", "document"], ["a.key", "application/octet-stream", "presentation"], ["a.m4a", "audio/mp4", "audio"], ["a.mov", "video/quicktime", "video"], ["a.tar.gz", "application/gzip", "archive"], ["a.xyz", "application/octet-stream", "other"]]) expect(classifyFile(file(name, name, mime))).toBe(type);
  });
  it("uses explicit upload time, stable ties and nonmutating size/name ordering", () => {
    const files = [file("b", "项目10.pdf", "application/pdf", 10), file("a", "项目2.pdf", "application/pdf", 30), file("c", "new.pdf", "application/pdf", 20, "2026-10-03T00:00:00Z")];
    expect(selectFiles(files, defaultFileBrowserState).visible.map(f => f.id)).toEqual(["c", "a", "b"]);
    expect(selectFiles(files, { ...defaultFileBrowserState, sort: "uploaded-asc" }).visible.map(f => f.id)).toEqual(["a", "b", "c"]);
    expect(selectFiles(files, { ...defaultFileBrowserState, sort: "size-desc" }).visible.map(f => f.id)).toEqual(["a", "c", "b"]);
    expect(selectFiles(files.slice(0, 2), { ...defaultFileBrowserState, sort: "name" }).visible.map(f => f.id)).toEqual(["a", "b"]);
    expect(files.map(f => f.id)).toEqual(["b", "a", "c"]);
  });
  it("combines folder, name search and type while keeping scope counts honest", () => {
    const files = [{ ...file("a", "照片.JPG", "image/jpeg"), folder_id: "f" }, { ...file("b", "预算.pdf", "application/pdf"), folder_id: "f" }, file("c", "照片 elsewhere.JPG", "image/jpeg")];
    const selected = selectFiles(files, { ...defaultFileBrowserState, folderId: "f", type: "photo" });
    expect(selected.visible.map(f => f.id)).toEqual(["a"]); expect(selected.counts).toMatchObject({ all: 2, photo: 1, document: 1 });
    const renamed = { ...files[0], title: "旅行", original_filename: "original.JPG" };
    expect(selectFiles([renamed], { ...defaultFileBrowserState, query: " ORIGINAL " }).visible).toHaveLength(1);
  });
  it("roundtrips URL state and ignores unknown/repeated values", () => {
    const state = { ...defaultFileBrowserState, type: "photo" as const, view: "list" as const, folderId: "f", query: "旅行 2026", sort: "uploaded-asc" as const };
    const url = fileBrowserUrl("https://app.test/files?file=old&upload=1", state);
    expect(parseFileBrowserState(new URL(url, "https://app.test").searchParams)).toEqual(state);
    expect(url).not.toContain("file="); expect(url).not.toContain("upload=");
    expect(parseFileBrowserState({ type: "unknown", sort: ["name", "size-desc"], view: "invalid" })).toEqual(defaultFileBrowserState);
    expect(parseFileBrowserState({ type: "photo" }).view).toBe("grid");
  });
  it("requests only supported bounded thumbnails, never HEIC/SVG or oversized originals", () => {
    expect(canPreviewPhoto(file("a", "a.jpg", "image/jpeg", 12 * 1024 * 1024))).toBe(true);
    expect(canPreviewPhoto(file("a", "a.jpg", "image/jpeg", 12 * 1024 * 1024 + 1))).toBe(false);
    expect(canPreviewPhoto(file("a", "a.heic", "image/heic"))).toBe(false);
    expect(canPreviewPhoto(file("a", "a.svg", "image/svg+xml"))).toBe(false);
  });
});
