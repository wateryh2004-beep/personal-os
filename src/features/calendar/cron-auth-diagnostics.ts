/** Diagnostic facts only. Never return values, fragments, hashes, or lengths
 * of either credential. This helper does not make authorization decisions. */
export function cronAuthDiagnostics(secret: string | undefined, authorization: string | null) {
  return {
    secretPresent: Boolean(secret),
    headerPresent: Boolean(authorization),
    bearerScheme: authorization?.startsWith("Bearer ") ?? false,
    secretHasSurroundingWhitespace: Boolean(secret && secret.trim() !== secret),
    secretHasNonAsciiOrControlCharacters: Boolean(secret && /[^\x20-\x7e]/.test(secret)),
  };
}
