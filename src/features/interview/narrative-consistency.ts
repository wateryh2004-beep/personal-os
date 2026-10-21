/**
 * Pure, deterministic structural audit. This DOES NOT verify whether a sentence
 * is true, and cannot infer a contradiction just because evidence is absent.
 * The UI must keep semantic verification separate from version drift.
 */
export type NarrativeBaseline = {
  id: string;
  title: string;
  master_preparation_id: string;
  selected_version_id: string;
  review_status: "draft" | "approved";
};

export type NarrativeAnswer = {
  id: string;
  preparation_id: string;
  language: string;
  answer_mode: string;
  target_seconds: number | null;
  status: string;
  source: string;
  version_number: number;
  created_at: string;
  updated_at: string;
};

export type NarrativePreparation = {
  id: string;
  question_id: string;
  context_id: string | null;
  target_language: string;
  target_title: string;
};

export type NarrativeLink = {
  id: string;
  narrative_id: string;
  answer_version_id: string;
  based_on_version_id: string;
  review_state: "unreviewed" | "reviewed";
};

export type NarrativeFactLink = {
  answer_version_id: string;
  fact_id: string;
  fact_version_id: string;
  review_state: "unreviewed" | "reviewed";
};

export type NarrativeFact = {
  id: string;
  verification_status: string;
};

export type NarrativeFactVersion = {
  id: string;
  fact_id: string;
  version_number: number;
};

export type ConsistencyFinding = {
  code: "no_spoken" | "no_baseline" | "unlinked" | "baseline_changed"
    | "lineage_unreviewed" | "fact_version_changed" | "fact_unverified"
    | "fact_reference_unreviewed" | "fact_missing";
  level: "action" | "review" | "information";
  label: string;
};

export type ConsistencyRow = {
  preparation: NarrativePreparation;
  answer: NarrativeAnswer | null;
  link: NarrativeLink | null;
  narrative: NarrativeBaseline | null;
  findings: ConsistencyFinding[];
  factReferenceCount: number;
  state: "stale" | "needs_link" | "needs_review" | "linked";
};

export type ConsistencySummary = {
  total: number;
  stale: number;
  needsLink: number;
  needsReview: number;
  linked: number;
  noFactReferences: number;
};

function languageRank(language: string, preferred: string) {
  if (language === preferred) return 0;
  if (language === "bilingual") return 1;
  return 2;
}

/** Preserve current-answer priority, even when a newer draft exists. */
export function preferredSpokenVersion(answers: NarrativeAnswer[], language: string) {
  return answers
    .filter((answer) => answer.answer_mode === "spoken" && (answer.status === "current" || answer.status === "draft"))
    .sort((a, b) =>
      Number(b.status === "current") - Number(a.status === "current")
      || languageRank(a.language, language) - languageRank(b.language, language)
      || b.updated_at.localeCompare(a.updated_at)
      || b.version_number - a.version_number
      || a.id.localeCompare(b.id)
    )[0] ?? null;
}

export function evaluateNarrativeConsistency(input: {
  narratives: NarrativeBaseline[];
  preparations: NarrativePreparation[];
  answers: NarrativeAnswer[];
  narrativeLinks: NarrativeLink[];
  factLinks: NarrativeFactLink[];
  facts: NarrativeFact[];
  factVersions: NarrativeFactVersion[];
}): { rows: ConsistencyRow[]; summary: ConsistencySummary } {
  const narrativeByQuestion = new Map<string, NarrativeBaseline>();
  const prepById = new Map(input.preparations.map((item) => [item.id, item]));
  for (const narrative of input.narratives) {
    const p = prepById.get(narrative.master_preparation_id);
    if (p) narrativeByQuestion.set(p.question_id, narrative);
  }
  const latestFactVersion = new Map<string, NarrativeFactVersion>();
  for (const version of input.factVersions) {
    const current = latestFactVersion.get(version.fact_id);
    if (!current || current.version_number < version.version_number) {
      latestFactVersion.set(version.fact_id, version);
    }
  }
  const factById = new Map(input.facts.map((fact) => [fact.id, fact]));
  const answersByPreparation = new Map<string, NarrativeAnswer[]>();
  for (const answer of input.answers) {
    const current = answersByPreparation.get(answer.preparation_id) ?? [];
    current.push(answer);
    answersByPreparation.set(answer.preparation_id, current);
  }
  const linkByAnswer = new Map(input.narrativeLinks.map((link) => [link.answer_version_id, link]));
  const factLinksByAnswer = new Map<string, NarrativeFactLink[]>();
  for (const factLink of input.factLinks) {
    const list = factLinksByAnswer.get(factLink.answer_version_id) ?? [];
    list.push(factLink);
    factLinksByAnswer.set(factLink.answer_version_id, list);
  }

  const rows: ConsistencyRow[] = input.preparations
    .filter((p) => p.context_id !== null)
    .map((preparation) => {
      const narrative = narrativeByQuestion.get(preparation.question_id) ?? null;
      const answer = preferredSpokenVersion(answersByPreparation.get(preparation.id) ?? [], preparation.target_language);
      const link = answer ? linkByAnswer.get(answer.id) ?? null : null;
      const factRefs = answer ? factLinksByAnswer.get(answer.id) ?? [] : [];
      const findings: ConsistencyFinding[] = [];
      if (!answer) {
        findings.push({ code: "no_spoken", level: "action", label: "尚无可口述答案" });
      } else if (!narrative) {
        findings.push({ code: "no_baseline", level: "action", label: "尚未配置对应母版" });
      } else if (!link || link.narrative_id !== narrative.id) {
        findings.push({ code: "unlinked", level: "action", label: "这份答案尚未登记母版版本引用" });
      } else {
        if (link.based_on_version_id !== narrative.selected_version_id) {
          findings.push({ code: "baseline_changed", level: "action", label: "引用的母版已不是当前选定版本，请逐段核对" });
        }
        if (link.review_state !== "reviewed") {
          findings.push({ code: "lineage_unreviewed", level: "review", label: "母版关联尚未经过人工核对" });
        }
      }
      if (answer) {
        if (!factRefs.length) {
          findings.push({ code: "fact_missing", level: "information", label: "尚未建立逐条事实版本引用；无法自动核验事实" });
        }
        for (const f of factRefs) {
          const latest = latestFactVersion.get(f.fact_id);
          if (latest && latest.id !== f.fact_version_id) {
            findings.push({ code: "fact_version_changed", level: "action", label: "已引用的经历事实存在新版本，需核对答案" });
          }
          const fact = factById.get(f.fact_id);
          if (!fact || fact.verification_status === "unverified") {
            findings.push({ code: "fact_unverified", level: "review", label: "关联的事实仍缺少核验状态" });
          }
          if (f.review_state !== "reviewed") {
            findings.push({ code: "fact_reference_unreviewed", level: "review", label: "事实与当前答案的对应关系尚未人工确认" });
          }
        }
      }

      const state: ConsistencyRow["state"] = findings.some((f) =>
        f.code === "baseline_changed" || f.code === "fact_version_changed"
      ) ? "stale" : findings.some((f) =>
        f.code === "no_spoken" || f.code === "no_baseline" || f.code === "unlinked"
      ) ? "needs_link" : findings.some((f) => f.level === "review")
        ? "needs_review" : "linked";
      return { preparation, answer, link, narrative, findings, factReferenceCount: factRefs.length, state };
    }).sort((a, b) => {
      const rank = { stale: 0, needs_link: 1, needs_review: 2, linked: 3 };
      return rank[a.state] - rank[b.state] || a.preparation.target_title.localeCompare(b.preparation.target_title, "zh");
    });
  return {
    rows,
    summary: {
      total: rows.length,
      stale: rows.filter((row) => row.state === "stale").length,
      needsLink: rows.filter((row) => row.state === "needs_link").length,
      needsReview: rows.filter((row) => row.state === "needs_review").length,
      linked: rows.filter((row) => row.state === "linked").length,
      noFactReferences: rows.filter((row) => row.answer && !row.factReferenceCount).length,
    },
  };
}
