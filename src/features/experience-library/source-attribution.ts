/** Only evidence actually sent to the model can be used as a verified citation. */
export type ExperienceAiSource = { type: "capture" | "image"; id: string; text: string; label: string };
export type IncludedAiSource = ExperienceAiSource & { index: number };

export function assembleExperienceSources(sources: ExperienceAiSource[], limit: number) {
  let text = "";
  const included: IncludedAiSource[] = [];
  for (const source of sources) {
    const index = included.length + 1;
    const prefix = `${text ? "\n\n" : ""}[片段 ${index} · ${source.label}]\n`;
    const remaining = limit - text.length - prefix.length;
    if (remaining <= 0) break;
    const sourceText = source.text.slice(0, remaining);
    if (!sourceText.trim()) continue;
    text += prefix + sourceText;
    included.push({ ...source, text: sourceText, index });
    if (sourceText.length < source.text.length) break;
  }
  return { text, included };
}

export function verifiedExperienceCitation(sourceIndex: number | null, quote: string | null, sources: IncludedAiSource[]) {
  const source = sources.find((item) => item.index === sourceIndex);
  const exactQuote = quote?.trim() || null;
  if (!source || !exactQuote || !source.text.includes(exactQuote)) {
    return { sourceCaptureId: null, sourceMediaId: null, sourceQuote: null };
  }
  return {
    sourceCaptureId: source.type === "capture" ? source.id : null,
    sourceMediaId: source.type === "image" ? source.id : null,
    sourceQuote: exactQuote,
  };
}
