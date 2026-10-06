import type { FileRecord } from "./queries";

export const fileTypes = ["all", "photo", "document", "spreadsheet", "presentation", "audio", "video", "archive", "other"] as const;
export type FileType = typeof fileTypes[number];
export const fileTypeLabels: Record<FileType, string> = { all: "全部类型", photo: "照片", document: "文档", spreadsheet: "表格", presentation: "演示", audio: "音频", video: "视频", archive: "压缩包", other: "其他" };
export const fileSorts = ["uploaded-desc", "uploaded-asc", "name", "size-desc", "size-asc"] as const;
export type FileSort = typeof fileSorts[number];
export const fileSortLabels: Record<FileSort, string> = { "uploaded-desc": "上传时间：最新优先", "uploaded-asc": "上传时间：最早优先", name: "文件名称", "size-desc": "大小：从大到小", "size-asc": "大小：从小到大" };
export type FileBrowserState = { folderId: string | null; query: string; type: FileType; sort: FileSort; view: "list" | "grid"; page: number };
export const filesPerPage = 100;
export const defaultFileBrowserState: FileBrowserState = { folderId: null, query: "", type: "all", sort: "uploaded-desc", view: "list", page: 1 };
const extensions: Record<Exclude<FileType, "all" | "other">, Set<string>> = {
  photo: new Set(["jpg", "jpeg", "png", "webp", "avif", "gif", "heic", "heif", "tif", "tiff", "bmp", "svg"]),
  document: new Set(["pdf", "doc", "docx", "odt", "rtf", "txt", "md", "markdown", "epub"]),
  spreadsheet: new Set(["xls", "xlsx", "ods", "csv", "tsv"]), presentation: new Set(["ppt", "pptx", "odp", "key"]),
  audio: new Set(["mp3", "wav", "m4a", "aac", "flac", "ogg", "opus"]), video: new Set(["mp4", "mov", "m4v", "webm", "avi", "mkv"]), archive: new Set(["zip", "7z", "rar", "tar", "gz", "bz2", "xz"]),
};
export function classifyFile(file: Pick<FileRecord, "mime_type" | "original_filename">): Exclude<FileType, "all"> {
  const mime = file.mime_type.toLowerCase().split(";", 1)[0];
  if (mime.startsWith("image/")) return "photo";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  const extension = file.original_filename.split(".").pop()?.toLowerCase() ?? "";
  for (const [type, values] of Object.entries(extensions)) if (values.has(extension)) return type as Exclude<FileType, "all" | "other">;
  if (/spreadsheet|excel|csv/.test(mime)) return "spreadsheet";
  if (/presentation|powerpoint/.test(mime)) return "presentation";
  if (/zip|compressed|x-tar/.test(mime)) return "archive";
  if (mime.startsWith("text/") || /pdf|word|opendocument.text/.test(mime)) return "document";
  return "other";
}
export function canPreviewPhoto(file: Pick<FileRecord, "mime_type" | "file_size">) {
  return ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"].includes(file.mime_type.toLowerCase()) && file.file_size > 0 && file.file_size <= 12 * 1024 * 1024;
}
export function parseFileBrowserState(params: URLSearchParams | Record<string, string | string[] | undefined>): FileBrowserState {
  const get = (key: string) => { const value = params instanceof URLSearchParams ? params.get(key) : params[key]; return typeof value === "string" ? value : ""; };
  const type = fileTypes.includes(get("type") as FileType) ? get("type") as FileType : "all";
  return { page: /^[1-9]\d{0,2}$/.test(get("page")) ? Math.min(200, Number(get("page"))) : 1, folderId: get("folder").slice(0, 128) || null, query: get("q").trim().slice(0, 200), type,
    sort: fileSorts.includes(get("sort") as FileSort) ? get("sort") as FileSort : "uploaded-desc",
    view: get("view") === "grid" ? "grid" : get("view") === "list" ? "list" : type === "photo" ? "grid" : "list" };
}
export function fileBrowserUrl(url: string, state: FileBrowserState) {
  const value = new URL(url);
  value.searchParams.delete("file"); value.searchParams.delete("upload");
  for (const [key, item] of Object.entries({ page: state.page > 1 ? String(state.page) : null, folder: state.folderId, q: state.query, type: state.type === "all" ? null : state.type, sort: state.sort === "uploaded-desc" ? null : state.sort, view: state.view === "list" ? null : state.view })) {
    if (item) value.searchParams.set(key, item); else value.searchParams.delete(key);
  }
  // Keep an explicit list override for the photo category's default grid view.
  if (state.type === "photo" && state.view === "list") value.searchParams.set("view", "list");
  return `${value.pathname}${value.search}${value.hash}`;
}
function stamp(value: string) { const date = Date.parse(value); return Number.isFinite(date) ? date : 0; }
export function selectFiles(files: FileRecord[], state: FileBrowserState) {
  const query = state.query.trim().toLocaleLowerCase();
  const scope = files.filter(file => (state.folderId === null || file.folder_id === state.folderId) && (!query || `${file.title}\n${file.original_filename}`.toLocaleLowerCase().includes(query)));
  const counts = Object.fromEntries(fileTypes.map(type => [type, type === "all" ? scope.length : scope.filter(file => classifyFile(file) === type).length])) as Record<FileType, number>;
  const visible = scope.filter(file => state.type === "all" || classifyFile(file) === state.type);
  visible.sort((a, b) => {
    const primary = state.sort === "uploaded-desc" ? stamp(b.uploaded_at) - stamp(a.uploaded_at) : state.sort === "uploaded-asc" ? stamp(a.uploaded_at) - stamp(b.uploaded_at) : state.sort === "size-desc" ? b.file_size - a.file_size : state.sort === "size-asc" ? a.file_size - b.file_size : a.title.localeCompare(b.title, "zh-CN", { numeric: true });
    return primary || a.id.localeCompare(b.id);
  });
  return { visible, counts };
}


/** A direct file link wins over filters and lands on its actual sorted page. */
export function revealFileState(files: FileRecord[], state: FileBrowserState, id: string): FileBrowserState {
  const file = files.find(item => item.id === id);
  if (!file) return state;
  const next: FileBrowserState = { ...state, folderId: file.folder_id, query: "", type: "all", view: "list", page: 1 };
  next.page = Math.floor(selectFiles(files, next).visible.findIndex(item => item.id === id) / filesPerPage) + 1;
  return next;
}
