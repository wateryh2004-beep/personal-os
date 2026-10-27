"use server";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
export async function readPurchaseAftercare(id: string) {
  const itemId = z.string().uuid().parse(id),
    { supabase, userId } = await requireOwner();
  const [item, links, documents, profile] = await Promise.all([
    supabase
      .from("purchase_items")
      .select(
        "id,status,mutation_revision,purchased_on,return_until,warranty_until,order_reference,aftercare_note",
      )
      .eq("id", itemId)
      .eq("user_id", userId)
      .is("archived_at", null)
      .maybeSingle(),
    supabase
      .from("purchase_item_documents")
      .select("id,document_id,kind,label")
      .eq("item_id", itemId)
      .eq("user_id", userId)
      .is("archived_at", null)
      .limit(201),
    supabase
      .from("documents")
      .select("id,title,storage_state")
      .eq("user_id", userId)
      .is("vault_group_id", null)
      .is("archived_at", null)
      .order("uploaded_at", { ascending: false })
      .limit(200),
    supabase
      .from("profiles")
      .select("timezone")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);
  if (
    item.error ||
    !item.data ||
    links.error ||
    documents.error ||
    profile.error
  )
    throw new Error("购后档案暂时无法完整读取");
  return {
    item: item.data,
    links: links.data?.slice(0, 200) ?? [],
    documents: documents.data ?? [],
    truncated: (links.data?.length ?? 0) > 200,
    timezone: profile.data?.timezone || "Asia/Shanghai",
  };
}
const schema = z
  .object({
    id: z.string().uuid(),
    revision: z.number().int().min(1),
    purchasedOn: z.string().date().nullable(),
    returnUntil: z.string().date().nullable(),
    warrantyUntil: z.string().date().nullable(),
    orderReference: z.string().max(500),
    note: z.string().max(8000),
    documentId: z.string().uuid().nullable(),
    documentKind: z.enum(["receipt", "invoice", "warranty", "other"]),
  })
  .strict();
export async function savePurchaseAftercare(input: unknown) {
  const value = schema.parse(input),
    { supabase } = await requireOwner();
  const { data, error } = await supabase.rpc("save_purchase_aftercare", {
    p_item_id: value.id,
    p_expected_revision: value.revision,
    p_purchased_on: value.purchasedOn,
    p_return_until: value.returnUntil,
    p_warranty_until: value.warrantyUntil,
    p_order_reference: value.orderReference,
    p_note: value.note,
    p_document_id: value.documentId,
    p_document_kind: value.documentKind,
  });
  if (error || !data)
    throw new Error("购后档案未能保存，请核对日期与最新版本。输入已保留。");
  return data;
}
