/** Validate the actual sealed bytes, not only a browser-provided MIME or filename. */
export function matchesExperienceImageSignature(bytes: Uint8Array, mimeType: string) {
  const starts = (signature: number[], offset = 0) => signature.every((value, index) => bytes[offset + index] === value);
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  switch (mimeType) {
    case "image/png": return starts([137, 80, 78, 71, 13, 10, 26, 10]);
    case "image/jpeg": return starts([255, 216, 255]);
    case "image/gif": return ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a";
    case "image/webp": return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
    case "image/avif": {
      if (ascii(4, 8) !== "ftyp" || bytes.length < 16) return false;
      for (let offset = 8; offset + 4 <= bytes.length; offset += 4) {
        if (["avif", "avis"].includes(ascii(offset, offset + 4))) return true;
      }
      return false;
    }
    default: return false;
  }
}
