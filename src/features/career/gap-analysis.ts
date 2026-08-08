export type GapEvidence = { entityType: "experience_fact" | "experience_bullet" | "skill" | "certification" | "experience_output"; entityId: string; text: string };
export type GapAssessment = { assessment: "strong" | "partial" | "missing" | "unknown"; explanation: string; evidence: GapEvidence[] };

const englishStopWords = new Set(["and", "the", "with", "for", "from", "that", "this", "you", "your", "have", "has", "are", "our", "will", "preferred", "required", "ability", "experience"]);

export function meaningfulTerms(value: string) {
  const normalized = value.toLocaleLowerCase().normalize("NFKC");
  const english = normalized.match(/[a-z][a-z0-9+#.-]{1,}/g)?.filter((term) => !englishStopWords.has(term)) ?? [];
  const chinese = normalized.match(/[\p{Script=Han}]{2,}/gu)?.flatMap((phrase) => phrase.length <= 4 ? [phrase] : Array.from({ length: phrase.length - 1 }, (_, index) => phrase.slice(index, index + 2))) ?? [];
  return [...new Set([...english, ...chinese])].slice(0, 40);
}

export function assessRequirement(requirementText: string, evidence: GapEvidence[]): GapAssessment {
  const terms = meaningfulTerms(requirementText);
  if (!terms.length) return { assessment: "unknown", explanation: "这条要求缺少足够明确的关键词，需要人工判断。", evidence: [] };
  const ranked = evidence.map((item) => {
    const value = item.text.toLocaleLowerCase().normalize("NFKC");
    const matches = terms.filter((term) => value.includes(term));
    return { item, matches };
  }).filter((entry) => entry.matches.length).sort((a, b) => b.matches.length - a.matches.length);
  const matchedTerms = new Set(ranked.flatMap((entry) => entry.matches));
  const coverage = matchedTerms.size / terms.length;
  const selected = ranked.slice(0, 4).map((entry) => entry.item);
  if (coverage >= 0.5 && selected.length >= 1) return { assessment: "strong", explanation: `现有职业事实覆盖了 ${matchedTerms.size} 个关键表述；仍需人工确认强度和真实性。`, evidence: selected };
  if (coverage >= 0.2 && selected.length >= 1) return { assessment: "partial", explanation: "存在可追溯的相关事实，但对这条要求的覆盖不完整。", evidence: selected };
  return { assessment: "missing", explanation: "现有 Career 事实中未找到可追溯证据；这不代表你一定不具备，只表示尚未记录。", evidence: [] };
}
