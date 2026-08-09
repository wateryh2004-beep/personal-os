import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiAuthenticationFailure, requireOwnerApi } from "@/lib/auth/require-owner";
import {
  decryptMicrosoftRefreshToken,
  encryptMicrosoftRefreshToken,
  exchangeMicrosoftDeviceCode,
  MicrosoftGraphError,
  startMicrosoftDeviceAuthorization,
  microsoftScopeVersionForGrantedScopes,
} from "@/lib/adapters/microsoft-graph/calendar";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const cookieName = "personal_os_microsoft_device";
const deviceCookieSchema = z.object({ deviceCode: z.string().min(20), expiresAt: z.number().int().positive() });

function failure(status: number, code: string) {
  return NextResponse.json({ error: code }, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}

function clearDeviceCookie(response: NextResponse) {
  response.cookies.set(cookieName, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  return response;
}

export async function POST() {
  try {
    await requireOwnerApi();
    const authorization = await startMicrosoftDeviceAuthorization();
    const expiresAt = Date.now() + authorization.expiresIn * 1000;
    const response = NextResponse.json({
      userCode: authorization.userCode,
      verificationUri: authorization.verificationUri,
      expiresIn: authorization.expiresIn,
    }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
    response.cookies.set(cookieName, encryptMicrosoftRefreshToken(JSON.stringify({ deviceCode: authorization.deviceCode, expiresAt })), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: authorization.expiresIn,
    });
    return response;
  } catch (error) {
    const authFailure = apiAuthenticationFailure(error);
    if (authFailure) return authFailure;
    return failure(500, error instanceof MicrosoftGraphError ? error.code : "authorization_start_failed");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await requireOwnerApi();
    const sealed = request.cookies.get(cookieName)?.value;
    if (!sealed) return failure(400, "authorization_not_started");
    const decoded = deviceCookieSchema.safeParse(JSON.parse(decryptMicrosoftRefreshToken(sealed)));
    if (!decoded.success || decoded.data.expiresAt < Date.now()) return clearDeviceCookie(failure(400, "authorization_expired"));
    let token: Record<string, unknown>;
    try {
      token = await exchangeMicrosoftDeviceCode(decoded.data.deviceCode);
    } catch (error) {
      if (error instanceof MicrosoftGraphError && ["authorization_pending", "slow_down"].includes(error.code)) {
        return NextResponse.json({ status: "pending" }, { status: 202, headers: { "Cache-Control": "private, no-store, max-age=0" } });
      }
      return clearDeviceCookie(failure(400, error instanceof MicrosoftGraphError ? error.code : "authorization_failed"));
    }
    const refreshToken = typeof token.refresh_token === "string" ? token.refresh_token : "";
    const expiresIn = typeof token.expires_in === "number" ? token.expires_in : 3600;
    const grantedScopes = typeof token.scope === "string" ? token.scope.split(/\s+/).filter(Boolean) : [];
    const grantedScopeVersion = microsoftScopeVersionForGrantedScopes(grantedScopes);
    if (!refreshToken) return clearDeviceCookie(failure(400, "authorization_failed"));
    const admin = createAdminClient();
    const { data: connection, error: connectionError } = await admin.from("calendar_connections").upsert({
      user_id: userId,
      label: "Microsoft Outlook",
      provider: "microsoft_graph_public_client",
      status: "enabled",
      oauth_connected_at: new Date().toISOString(),
      oauth_refresh_token_ciphertext: encryptMicrosoftRefreshToken(refreshToken),
      oauth_token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      granted_scopes: grantedScopes,
      oauth_scope_version: grantedScopeVersion,
      archived_at: null,
      last_error_code: null,
    }, { onConflict: "user_id" }).select("id").single();
    if (connectionError || !connection) return clearDeviceCookie(failure(500, "connection_save_failed"));
    await admin.from("audit_logs").insert({ user_id: userId, action: "connect", entity_type: "calendar_connection", entity_id: connection.id, after_data: { provider: "microsoft_graph_public_client", oauth_scope_version: grantedScopeVersion }, actor_type: "user" });
    return clearDeviceCookie(NextResponse.json({ status: "connected" }, { headers: { "Cache-Control": "private, no-store, max-age=0" } }));
  } catch (error) {
    const authFailure = apiAuthenticationFailure(error);
    if (authFailure) return authFailure;
    return failure(500, error instanceof MicrosoftGraphError ? error.code : "authorization_check_failed");
  }
}
