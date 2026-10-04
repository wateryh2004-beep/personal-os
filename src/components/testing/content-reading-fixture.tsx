import { NoteReader } from "@/components/notes/note-reader";

/** Synthetic-only fixture; mounted solely by the gated E2E harness. */
export function ContentReadingFixture() {
  return <div className="h-dvh" data-testid="content-reading-fixture"><NoteReader note={{
    id: "10000000-0000-4000-8000-000000000001", title: "选择保存的对话 / Selected conversation", revision: 2,
    bodyMarkdown: "# 阅读记录\n\n这是合成测试内容，不是个人资料。\n\n100−20−15=65，与 90 的分派应区分。\n\n## 原始选择\n\n保留选中的文字与来源。\n\n<script>window.__contentInjected=true</script>\n\n[unsafe](javascript:alert(1))\n\n" + "阅读段落用于验证窄屏、换行和文档滚动。\n\n".repeat(15),
    sources: [{ source: "codex", sourceUrl: "https://example.test/chosen-conversation", savedAt: "2026-10-04T00:00:00Z" }],
    versions: [{ id: "20000000-0000-4000-8000-000000000001", versionNumber: 1, title: "原始标题", bodyMarkdown: "先前保存的合成内容。" }],
  }} /></div>;
}
