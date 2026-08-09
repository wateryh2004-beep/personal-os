"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth/require-owner";
import {
  codexMemoryImportSchema,
  decisionSchema,
  memorySchema,
  replaceMemorySchema,
  reverseDecisionSchema,
} from "./schemas";
import {
  createDecision,
  createPersonalMemory,
  replacePersonalMemory,
  reverseDecision,
} from "./service";

export async function createPersonalMemoryAction(input: unknown) {
  const value = memorySchema.parse(input);
  const owner = await requireOwner();
  await createPersonalMemory({ ...owner, value });
  revalidatePath("/memory");
}

export async function replacePersonalMemoryAction(input: unknown) {
  const value = replaceMemorySchema.parse(input);
  const owner = await requireOwner();
  await replacePersonalMemory({ ...owner, value });
  revalidatePath("/memory");
}

export async function reverseDecisionAction(input: unknown) {
  const value = reverseDecisionSchema.parse(input);
  const owner = await requireOwner();
  await reverseDecision({ ...owner, value });
  revalidatePath("/memory");
}

export async function createDecisionAction(input: unknown) {
  const value = decisionSchema.parse(input);
  const owner = await requireOwner();
  await createDecision({ ...owner, value });
  revalidatePath("/memory");
}

export async function importCodexMemoriesAction(input: unknown) {
  const value = codexMemoryImportSchema.parse(input);
  const { supabase } = await requireOwner();
  const contentHash = createHash("sha256")
    .update(JSON.stringify(value.items))
    .digest("hex");
  const { data, error } = await supabase.rpc("import_personal_memory_batch", {
    p_source_system: "codex",
    p_source_label: value.sourceLabel,
    p_source_exported_at: value.sourceExportedAt ?? new Date().toISOString(),
    p_content_hash: contentHash,
    p_items: value.items,
  });
  if (error) throw new Error("Codex 上下文导入失败，原有 Memory 未被覆盖。");
  const result = (data ?? {}) as Record<string, unknown>;
  revalidatePath("/memory");
  return {
    created: Number(result.created ?? 0),
    superseded: Number(result.superseded ?? 0),
    verified: Number(result.verified ?? 0),
  };
}
