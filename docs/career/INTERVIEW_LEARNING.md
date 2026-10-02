# Interview learning workspace

The Interview entry point is a read-first question library. General preparation is the default; target-specific questions remain explicitly scoped by the target selector.

## Independent dimensions

- Question type uses the normalized question-type taxonomy.
- Learning module uses the existing subcategory. Historical `通用 ·`, `技术面 ·`, and `Case面 ·` prefixes are removed for display/filter matching only; stored values are unchanged. Unknown module labels remain discoverable.
- Pressure is a question style and can be combined with any type or module.
- Competencies, interview formats, personal evidence, and target contexts retain their existing meanings and storage.

Search matches the title, prompt, concepts/notes, reasoning, pitfalls, reference-answer body, and competency labels within the selected context. Multiple whitespace-separated terms must all match. Preparations, answers, and competency relations are paged before search to avoid the server row cap silently hiding questions.

## Read, personalize, practice

Reading renders sanitized Markdown without saving or confirming anything. Existing learning fields appear as concepts/notes, key judgment, reasoning, pitfalls, and next-practice guidance. Full reference answers and embedded follow-up explanations remain readable, including bilingual answers.

Editing is explicit and preserves the existing append-only answer-version workflow. AI provenance, draft/current status, language, and version are visible. Adoption remains a separate explicit action in the full question page. Reading is never counted as mastery or practice.

Each question links to its own preparation's practice route. The general or target scope carries into practice and insights, with a return route to the learning question. The existing question-management and version screens remain available.

## Navigation and reliability

Search, module, type, style, target, question, and selected answer version are encoded in the URL. An exact question deep link wins over conflicting filters. Mobile Back returns to the filtered list, Forward restores the question, and section navigation does not add history entries. Desktop retains a list/detail split.

Saves are serialized. Errors remain visible across question switches; navigation waits for pending saves and will not leave failed edits behind. Browser unload warns about dirty or in-flight drafts. Retrying a partial load waits for edits to save and disables editing during the refresh transition. Empty, partial-error, and route-loading states are distinct.

## Verification

- Unit and React/jsdom suites cover search, dimension combinations, query pagination, repeated URL parameters, history, read-only behavior, and queued-save provenance/recovery.
- `scripts/mobile-native-e2e.cjs` exercises 360, 390, 412, and 430 px mobile layouts plus a 1440 px desktop view in the existing fixture-only CI harness.
- The harness remains behind `E2E_MOBILE_HARNESS=1`; production authentication and data access are unchanged.
