import { z } from "zod";
import { apiAuthenticationFailure } from "@/lib/auth/require-owner";
import { readVaultJson, requireVault, sameOrigin, sessionArgs, VaultError, vaultFailure, vaultHeaders } from "@/features/vault/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const hideSchema = z.object({ kind: z.enum(["note", "document", "note_folder", "file_folder"]), id: z.string().uuid(), hidden: z.boolean() });
const saveSchema = z.object({ id: z.string().uuid(), revision: z.number().int().min(0), title: z.string().max(240), body: z.string().max(200000) });

export async function GET(request: Request) {
  try {
    const owner = await requireVault(request);
    const id = new URL(request.url).searchParams.get("note");
    if (id) {
      if (!z.string().uuid().safeParse(id).success) throw new VaultError(400, "请求无效。");
      const note = await owner.admin.from("notes").select("id,title,body_markdown,revision,folder_id,vault_group_id")
        .eq("user_id", owner.userId).eq("id", id).not("vault_group_id", "is", null).maybeSingle();
      if (note.error) throw new VaultError(503, "读取失败。");
      if (!note.data) throw new VaultError(404, "内容不可用。");
      const versions = await owner.admin.from("note_versions").select("id,title,body_markdown,version_number,created_at")
        .eq("user_id", owner.userId).eq("note_id", id).order("version_number", { ascending: false }).limit(30);
      if (versions.error) throw new VaultError(503, "历史版本读取失败。");
      return Response.json({ note: note.data, versions: versions.data }, { headers: vaultHeaders });
    }
    // Paginate every source; a provider's row cap must not silently lose content.
    async function rows(table: string, select: string) {
      const values: Record<string, unknown>[] = [];
      let cursor: string | undefined;
      for (;;) {
        let query = owner.admin.from(table).select(select).eq("user_id", owner.userId).not("vault_group_id", "is", null).order("id").limit(250);
        if (cursor) query = query.gt("id", cursor);
        const result = await query;
        if (result.error) throw new VaultError(503, "读取失败。");
        if (!result.data.length) return values;
        values.push(...result.data as unknown as Record<string, unknown>[]);
        cursor = (result.data.at(-1) as unknown as { id: string }).id;
        if (values.length > 25000) throw new VaultError(503, "内容较多，请缩小范围。");
      }
    }
    const [notes, files, noteFolders, fileFolders] = await Promise.all([
      rows("notes", "id,title,updated_at,folder_id,vault_group_id"),
      rows("documents", "id,title,original_filename,mime_type,file_size,folder_id,vault_group_id,storage_state"),
      rows("note_folders", "id,name,parent_id,vault_group_id"),
      rows("file_folders", "id,name,parent_id,vault_group_id"),
    ]);
    return Response.json({ notes, files, noteFolders, fileFolders }, { headers: vaultHeaders });
  } catch (error) { return apiAuthenticationFailure(error) ?? vaultFailure(error); }
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const owner = await requireVault(request);
    const input = hideSchema.safeParse(await readVaultJson(request));
    if (!input.success) throw new VaultError(400, "请求无效。");
    const result = await owner.admin.rpc("vault_set_hidden", { ...sessionArgs(owner), p_kind: input.data.kind, p_id: input.data.id, p_hidden: input.data.hidden });
    if (result.error) {
      if (result.error.message.includes("vault_shared_reference")) throw new VaultError(409, "其他普通内容仍引用此项或它的附件，请先解除引用，或把相关笔记一起收入暗格。");
      if (result.error.message.includes("vault_locked")) throw new VaultError(423, "需要重新验证。");
      if (result.error.message.includes("vault_parent_hidden")) throw new VaultError(409, "请先把所在文件夹移回普通工作区。");
      if (result.error.message.includes("vault_file_pending")) throw new VaultError(409, "请等待附件上传完成后重试。");
      throw new VaultError(409, "内容状态已变化，操作未完成。");
    }
    return Response.json({ saved: true, ...result.data }, { headers: vaultHeaders });
  } catch (error) { return apiAuthenticationFailure(error) ?? vaultFailure(error); }
}

export async function PUT(request: Request) {
  try {
    sameOrigin(request);
    const owner = await requireVault(request);
    const input = saveSchema.safeParse(await readVaultJson(request));
    if (!input.success) throw new VaultError(400, "内容过长或格式无效。");
    const result = await owner.admin.rpc("vault_save_note", { ...sessionArgs(owner), p_id: input.data.id, p_revision: input.data.revision, p_title: input.data.title, p_body: input.data.body });
    if (result.error) {
      if (result.error.message.includes("vault_conflict")) throw new VaultError(409, "另一处已更新此笔记。草稿已保留，请重新打开并比较历史版本。");
      if (result.error.message.includes("vault_locked")) throw new VaultError(423, "需要重新验证。");
      throw new VaultError(503, "保存未完成，草稿已保留。");
    }
    return Response.json({ revision: result.data }, { headers: vaultHeaders });
  } catch (error) { return apiAuthenticationFailure(error) ?? vaultFailure(error); }
}
