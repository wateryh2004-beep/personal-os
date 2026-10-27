"use server";

import { z } from "zod";
import { requireOwner } from "@/lib/auth/require-owner";
import { contentHash } from "./utils";
import { noteSourceLocatorSchema, sourceLocatorHref } from "@/features/links/source-locator";

const inputSchema = z.object({ noteId: z.uuid(), revision: z.number().int().min(0), body: z.string().max(200_000), from: z.number().int().min(0), to: z.number().int().max(200_000) }).strict().refine((value) => value.to > value.from && value.to <= value.body.length && value.to - value.from <= 10_000);

export async function captureNoteSource(input: unknown) {
  const value = inputSchema.parse(input);
  const { supabase } = await requireOwner();
  const result = await supabase.rpc("capture_note_source", { p_note_id: value.noteId, p_expected_revision: value.revision, p_expected_hash: contentHash(value.body) });
  if (result.error || typeof result.data !== "string") return { status: "conflict" as const, message: "原文尚未保存或已经变化，请保存后重新选择。" };
  const locator = noteSourceLocatorSchema.parse({ kind: "note", noteId: value.noteId, versionId: result.data, revision: value.revision, from: value.from, to: value.to, hash: contentHash(value.body.slice(value.from, value.to)) });
  return { status: "ready" as const, locator, href: sourceLocatorHref(locator) };
}
