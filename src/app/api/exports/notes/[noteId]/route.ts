import { NextResponse } from "next/server";
import { z } from "zod";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { renderPortableNoteHtml } from "@/features/notes/export/html";
import { markdownFilename, noteFrontmatter } from "@/features/notes/utils";

const privateHeaders = { "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" };
const uuid = z.string().uuid();
const csp = "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' https: data:; " +
  "font-src 'self' data:; script-src 'none'; connect-src 'none'; base-uri 'none'; form-action 'none'";

export async function GET(request: Request, { params }: { params: Promise<{ noteId: string }> }) {
  try {
    const { supabase, userId } = await requireOwnerApi();
    const { noteId } = await params;
    const url = new URL(request.url);
    const format = url.searchParams.get("format") ?? "markdown";
    if (!uuid.safeParse(noteId).success || !["markdown", "html", "print"].includes(format))
      return NextResponse.json({ error: "不支持的导出格式。" }, { status: 400, headers: privateHeaders });
    const { data: note, error } = await supabase.from("notes")
      .select("id,title,body_markdown,created_at,updated_at,archived_at")
      .eq("id", noteId).eq("user_id", userId).maybeSingle();
    if (error) throw new Error("note_export_lookup_failed");
    if (!note) return NextResponse.json({ error: "未找到笔记。" }, { status: 404, headers: privateHeaders });
    const audit = await supabase.from("audit_logs").insert({
      user_id: userId, action: "export", entity_type: "note", entity_id: note.id,
      actor_type: "user", after_data: { format: format === "print" ? "html_print_preview" : format },
    });
    if (audit.error) throw new Error("note_export_audit_failed");
    const filename = markdownFilename(note.title);
    if (format === "markdown") {
      return new NextResponse(noteFrontmatter(note), { headers: {
        ...privateHeaders, "content-type": "text/markdown; charset=utf-8",
        "content-disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(filename),
      } });
    }
    const printable = format === "print";
    return new NextResponse(renderPortableNoteHtml(note.title, note.body_markdown, printable), { headers: {
      ...privateHeaders, "content-type": "text/html; charset=utf-8",
      "content-security-policy": csp,
      "referrer-policy": "no-referrer",
      "content-disposition": (printable ? "inline" : "attachment") +
        "; filename*=UTF-8''" + encodeURIComponent(filename.replace(/\.md$/i, ".html")),
    } });
  } catch (error) {
    return apiAuthenticationFailure(error) ?? NextResponse.json({ error: "无法导出笔记。" }, { status: 503, headers: privateHeaders });
  }
}
