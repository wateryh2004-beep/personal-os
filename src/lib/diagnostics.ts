/** Logs may describe an operation's failure category, never its private payload
 * or a provider's free-form message (which can echo text, URLs or credentials). */
export function diagnosticErrorKind(error: unknown) {
  if (error instanceof SyntaxError) return "invalid_response";
  if (error instanceof TypeError) return "network_or_type_error";
  if (error instanceof Error && error.name === "AbortError") return "operation_aborted";
  return "operation_failed";
}
