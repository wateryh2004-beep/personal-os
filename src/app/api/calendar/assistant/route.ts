import { POST as assistantPost } from "@/app/api/assistant/route";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  return assistantPost(
    new Request(request.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: request.headers.get("cookie") || "",
      },
      body: JSON.stringify({
        ...(body && typeof body === "object" ? body : {}),
        surface: "calendar",
      }),
    }),
  );
}
