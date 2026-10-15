import { expect, it } from "vitest";
import { diagnosticErrorKind } from "@/lib/diagnostics";

it("never carries provider text, URLs, draft content or credentials into diagnostic output", () => {
  const privateText = "Synthetic private draft / synthetic-secret https://example.com/?token=synthetic-secret";
  for (const error of [new Error(privateText), new TypeError(privateText), new SyntaxError(privateText), { message: privateText, code: privateText }]) {
    const diagnostic = diagnosticErrorKind(error);
    expect(diagnostic).not.toContain("synthetic-secret");
    expect(diagnostic).not.toContain("draft");
    expect(diagnostic).not.toContain("https:");
  }
});
