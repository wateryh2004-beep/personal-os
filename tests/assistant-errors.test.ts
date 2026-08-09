import { describe, expect, it } from "vitest";
import { normalizeAssistantError } from "@/features/assistant/errors";

describe("assistant error normalization", () => {
  it("unwraps AI SDK retry errors without exposing provider bodies", () => {
    const error = {
      message: "Failed after 3 attempts",
      lastError: {
        statusCode: 401,
        responseBody: '{"error":{"message":"secret provider detail"}}',
      },
    };

    expect(normalizeAssistantError(error)).toEqual({
      code: "api_key_invalid",
      message: "DeepSeek API Key 无效或已失效。请在 Settings 重新保存。",
    });
  });

  it("maps invalid requests and overloads to safe actionable messages", () => {
    expect(normalizeAssistantError({ cause: { statusCode: 422 } }).code).toBe(
      "invalid_provider_request",
    );
    expect(normalizeAssistantError({ errors: [{ statusCode: 503 }] }).code).toBe(
      "provider_overloaded",
    );
  });
});
