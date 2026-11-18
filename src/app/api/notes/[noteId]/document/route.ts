import { NextResponse } from "next/server";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { getNoteDocument } from "@/features/notes/queries";
import {
  applyWorkspaceLatencyHeaders,
  createWorkspaceLatencyProfiler,
} from "@/lib/performance/workspace-latency";

const headers = { "Cache-Control": "private, no-store, max-age=0" };
export async function GET(request: Request, { params }: { params: Promise<{ noteId: string }> }) {
  const profiler = createWorkspaceLatencyProfiler(
    "notes-document",
    "api",
    request.headers.get("x-personal-os-trace-id"),
  );
  try {
    const owner = await profiler.time("auth", () => requireOwnerApi());
    const { noteId } = await params;
    const data = await profiler.time("supabase", () => getNoteDocument(noteId, owner));
    const response = data
      ? NextResponse.json(data, { headers })
      : NextResponse.json({ error: "笔记不存在。" }, { status: 404, headers });
    profiler.finish(response.status);
    return applyWorkspaceLatencyHeaders(response, profiler);
  } catch (error) {
    const response = apiAuthenticationFailure(error) ?? NextResponse.json(
      { error: "笔记暂时无法读取，请重试。" },
      { status: 503, headers },
    );
    profiler.finish(response.status);
    return applyWorkspaceLatencyHeaders(response, profiler);
  }
}
