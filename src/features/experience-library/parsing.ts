import type {
  ExperienceCaptureChoice,
  ExperienceCaptureType,
  ExperienceSegment,
} from "./types";

const commentStartPattern = /^\s*(?:评论|回复|留言|网友|comment)(?:\s*\d+)?(?:\s+[^：:\n]{1,30})?\s*[：:]?/i;
const tagPattern = /#([\p{L}\p{N}_-]{1,40})/gu;

export function normalizeExperienceSourceUrl(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  // Platforms often copy a title and emoji around the actual share URL.
  // Keep its query string (including share tokens) intact and never fetch it.
  const candidate = trimmed.match(/https?:\/\/[^\s<>"'，。！？、】）「」]+/i)?.[0];
  if (!candidate) throw new Error("来源链接格式不正确，请粘贴以 http:// 或 https:// 开头的完整链接。");
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error("来源链接格式不正确，请粘贴以 http:// 或 https:// 开头的完整链接。");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("来源链接只支持 http:// 或 https://。");
  }
  if (url.username || url.password) throw new Error("来源链接不能包含用户名或密码。");
  url.hash = "";
  return url.toString();
}

function commentLabel(line: string) {
  const match = line.match(commentStartPattern);
  const label = match?.[0]?.replace(/[：:\s]+$/, "").trim();
  return label || "评论";
}

export function splitExperienceSegments(
  rawContent: string,
  choice: ExperienceCaptureChoice,
): { captureType: ExperienceCaptureType; segments: ExperienceSegment[] } {
  if (!rawContent.trim()) return { captureType: "unknown", segments: [] };
  if (choice !== "auto") {
    const kind = choice === "comment" ? "comment" : choice === "post" ? "post" : "unknown";
    return {
      captureType: choice === "document" ? "unknown" : choice,
      segments: [{ kind, text: rawContent, start: 0, end: rawContent.length, label: null }],
    };
  }

  const lines = rawContent.match(/[^\n]*(?:\n|$)/g)?.filter(Boolean) ?? [rawContent];
  const starts: { start: number; label: string }[] = [];
  let offset = 0;
  for (const line of lines) {
    if (commentStartPattern.test(line)) starts.push({ start: offset, label: commentLabel(line) });
    offset += line.length;
  }
  if (starts.length === 0) {
    return {
      captureType: "post",
      segments: [{ kind: "post", text: rawContent, start: 0, end: rawContent.length, label: null }],
    };
  }

  const segments: ExperienceSegment[] = [];
  if (starts[0].start > 0) {
    const text = rawContent.slice(0, starts[0].start);
    if (text.trim()) segments.push({ kind: "post", text, start: 0, end: starts[0].start, label: null });
  }
  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index].start;
    const end = starts[index + 1]?.start ?? rawContent.length;
    const text = rawContent.slice(start, end);
    if (text.trim()) segments.push({ kind: "comment", text, start, end, label: starts[index].label });
  }
  return {
    captureType: segments.some((segment) => segment.kind === "post") ? "mixed" : "comment",
    segments,
  };
}

export function extractExperienceTags(rawContent: string) {
  const tags = new Set<string>();
  for (const match of rawContent.matchAll(tagPattern)) {
    const value = match[1]?.trim();
    if (value) tags.add(value.slice(0, 40));
    if (tags.size >= 20) break;
  }
  return [...tags];
}

export function suggestExperienceTitle(rawContent: string) {
  const lines = rawContent
    .split(/\r?\n/)
    .map((line) => line.replace(/^[#>*\-\s]+/, "").trim())
    .filter((line) => line && !/^#[\p{L}\p{N}_-]+(?:\s+#[\p{L}\p{N}_-]+)*$/u.test(line));
  const first = lines[0]?.replace(/\s+/g, " ") ?? "";
  return (first || "未命名经验").slice(0, 120);
}

export function experienceSelection(
  rawContent: string,
  start: number | null,
  end: number | null,
) {
  if (start === null || end === null) {
    return { selectionStart: null, selectionEnd: null, selectionQuote: null };
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > rawContent.length) {
    throw new Error("图片关联的原文选区已失效，请重新选择文字后再关联。");
  }
  const selectionQuote = rawContent.slice(start, end);
  if (!selectionQuote.trim()) throw new Error("请选择一段非空原文后再关联图片。");
  return { selectionStart: start, selectionEnd: end, selectionQuote };
}

export function excerpt(value: string, limit = 180) {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > limit ? `${compact.slice(0, limit - 1)}…` : compact;
}
