import { timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

const connectionIdSchema = z.string().uuid();

export function bridgeAuthorized(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const expected = env.calendarCompanionBridgeToken || "";
  if (!token || !expected || token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

export async function bridgeConnection(request: NextRequest) {
  const parsed = connectionIdSchema.safeParse(request.headers.get("x-calendar-connection"));
  if (!parsed.success) return null;
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("calendar_connections").select("id,user_id,status").eq("id", parsed.data).is("archived_at", null).maybeSingle();
  if (error || !data || data.status !== "enabled") return null;
  return { supabase, connection: data };
}

export function unauthorized() { return Response.json({ error: "Unauthorized" }, { status: 401 }); }
