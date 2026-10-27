import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import { projectOwnerWorkspaceScenes } from "@/features/workbench/scene-read-contracts";
const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" };
export async function GET() {
  try {
    const { supabase, userId } = await requireOwnerApi();
    const { data, error } = await supabase.from("workspace_scenes").select("id,user_id,name,snapshot,revision,created_at,updated_at,archived_at").eq("user_id", userId).is("archived_at", null).order("updated_at", { ascending: false }).limit(20);
    if (error) return Response.json({ error: "现场暂时无法读取。" }, { status: 503, headers });
    return Response.json(projectOwnerWorkspaceScenes(data, userId), { headers });
  } catch (error) { return apiAuthenticationFailure(error) ?? Response.json({ error: "现场暂时无法读取。" }, { status: 503, headers }); }
}
