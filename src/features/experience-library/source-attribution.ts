/** Only evidence actually sent to the model can be used as a verified citation. */
export type ExperienceAiSource = { type: "capture" | "image"; id: string; text: string; label: string };
export type IncludedAiSource = ExperienceAiSource & { index: number };

export function assembleExperienceSources(sources: ExperienceAiSource[], limit: number) {
  const usable = sources.map((source) => ({ ...source, text: source.text.trimStart() })).filter((source) => source.text.trim());
  const captures = usable.filter((source) => source.type === "capture");
  const images = usable.filter((source) => source.type === "image");
  const ordered: ExperienceAiSource[] = [];
  for (let i = 0; i < Math.max(captures.length, images.length); i += 1) {
    if (captures[i]) ordered.push(captures[i]);
    if (images[i]) ordered.push(images[i]);
  }
  const chosen: { source: ExperienceAiSource; prefix: string }[] = [];
  let headers = 0;
  // Reserve at least one character per selected source, including later images.
  for (const source of ordered) {
    const prefix = `${chosen.length ? "\n\n" : ""}[片段 ${chosen.length + 1} · ${source.label}]\n`;
    if (headers + prefix.length + chosen.length + 1 > limit) break;
    headers += prefix.length;
    chosen.push({ source, prefix });
  }
  let available = Math.max(0, limit - headers);
  let text = "";
  const included: IncludedAiSource[] = [];
  for (const [position, { source, prefix }] of chosen.entries()) {
    const share = Math.max(1, Math.floor(available / (chosen.length - position)));
    const sourceText = source.text.slice(0, share);
    available -= sourceText.length;
    text += prefix + sourceText;
    included.push({ ...source, text: sourceText, index: position + 1 });
  }
  const truncated = chosen.length < usable.length || included.some((item, index) => item.text.length < chosen[index].source.text.length);
  return { text, included, truncated };
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
