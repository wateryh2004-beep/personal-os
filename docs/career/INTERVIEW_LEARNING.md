# Interview learning workspace

The Interview entry point is a read-only question library for AI-authored material. General preparation is the default; target-specific questions remain explicitly scoped by the target selector. There are no manual add-context, add-question, edit-mode or autosave controls in this primary workspace.

## Independent dimensions

- Question type uses the normalized question-type taxonomy.
- Learning module uses the existing subcategory. Historical `通用 ·`, `技术面 ·`, and `Case面 ·` prefixes are removed for display/filter matching only; stored values are unchanged. Unknown module labels remain discoverable.
- Pressure is a question style and can be combined with any type or module.
- Competencies, interview formats, personal evidence, and target contexts retain their existing meanings and storage.

Search matches the title, prompt, original concepts/notes, reasoning, pitfalls, reference-answer body, and competency labels within the selected context. Folded source text remains searchable. Multiple whitespace-separated terms must all match. Preparations, answers, and competency relations are paged before search to avoid the server row cap silently hiding questions.

## Read and practice

The reference expression comes first, followed by useful reasoning as flowing sanitized Markdown, then self-test prompts and related questions. Existing bilingual answers and follow-up explanations remain readable. Reading never saves, confirms a version, marks mastery, or creates practice evidence.

The reader recognizes only the observed exact level-two Markdown headings `来源与目标岗位`, `来源核验记录`, `来源与适用边界`, `参考资料`, and `使用边界`. Whole sections under these headings appear in a collapsed source/version panel after the learning content. No individual sentence, disclaimer, number or source label is deleted. The original strings remain untouched and can be viewed verbatim. Unknown headings and prose remain in place; fenced-code examples do not become reference sections. Complex global link definitions, HTML and setext-heading documents conservatively use the unchanged Markdown rendering path.

JSON is not a documented authoring schema. Unknown object/array JSON is explicitly identified as structured original content and remains available verbatim, rather than guessing semantic keys or turning provenance metadata into a factual answer. Malformed JSON remains in the unchanged rendering path.

Draft status remains visible beside the reference answer; language and version remain visible beside the practice action. The source/version panel includes provenance and a link to the exact legacy answer version. Source labels are for traceability, not truth verification. Current-version selection does not establish that an answer or personal experience is factually verified.

Each question links to its own preparation's practice route. The general or target scope carries into practice and insights, with a return route to the learning question. Existing question-management, manual server actions and append-only answer-version screens remain unchanged for compatibility; they are no longer the primary reading flow.

## Navigation and reliability

Search, module, type, style, target, question, and selected answer version are encoded in the URL. An exact question deep link wins over conflicting filters. Mobile Back returns to the filtered list and its scroll position, Forward restores the question, and section navigation does not add history entries. Desktop retains a list/detail split.

Partial-load failures remain distinct from a legitimately empty library and expose a refresh action. Refreshed server snapshots are remounted by the page's existing snapshot key. Returning through history to a different pinned version requests a new authenticated server snapshot; no client-side answer is invented.

## Verification

- Unit and React/jsdom suites cover search, filters, query pagination, repeated URL parameters, history, pinned versions, no authoring controls, original-source preservation, numeric counterexamples, fenced-code safety, unknown-format fallback, and rendered XSS safety.
- Server-action tests continue to cover legacy versioned save behavior independently of the read-only primary view.
- `scripts/mobile-native-e2e.cjs` exercises 360, 390, 412, and 430 px mobile layouts plus a 1440 px desktop view in the existing fixture-only CI harness. Interview assertions now require read-only controls and working practice/version links.
- The harness remains behind `E2E_MOBILE_HARNESS=1`; production authentication and data access are unchanged.
