/**
 * Standalone HTML/print documents cannot load private app stylesheets.
 * This is the self-contained light palette matching notes-colors.css.
 * The palette parity test prevents future CSS/export drift.
 */
export const notePortableColorCss = [
  ["info", "#EDF3F8", "#31556E", "#587A92", "#DCEAF6"],
  ["warning", "#FFF2E6", "#865021", "#AB713F", "#FCE3C8"],
  ["important", "#FBEDEC", "#883F3D", "#B26864", "#F6DAD7"],
  ["idea", "#EDF3ED", "#365A45", "#668E6D", "#DCECDD"],
  ["quote", "#F4F1ED", "#525A55", "#838B83", "#E8E3DC"],
].map(([id, surface, ink, edge, mark]) =>
  '[data-note-tone="' + id + '"]{' +
  '--note-tone-surface:' + surface + ';--note-tone-ink:' + ink +
  ';--note-tone-edge:' + edge + ';--note-tone-mark:' + mark + '}'
).join("\n") + [
  '.note-color-callout{margin:18px 0;padding:14px 18px;border:1px solid var(--note-tone-edge);' +
    'border-left:3px solid var(--note-tone-edge);border-radius:0 12px 12px 0;' +
    'background:var(--note-tone-surface);color:var(--note-tone-ink);overflow-wrap:anywhere;font-style:normal}',
  '.note-color-callout > :first-child{margin-top:0}',
  '.note-color-callout > :last-child{margin-bottom:0}',
  '.note-color-callout [data-note-callout-heading]{margin:0 0 8px;font-size:13px;font-weight:650;' +
    'color:var(--note-tone-ink)}',
  '.note-color-callout :is(p,li){color:var(--note-tone-ink)}',
  '.note-color-text{color:var(--note-tone-ink)}',
  '.note-color-highlight{background:var(--note-tone-mark);color:#252C29;padding:0 .12em;' +
    'border-radius:.22em;box-decoration-break:clone;-webkit-box-decoration-break:clone}',
  '@media print{.note-color-callout{break-inside:avoid-page;print-color-adjust:exact;-webkit-print-color-adjust:exact}' +
    '.note-color-highlight{print-color-adjust:exact;-webkit-print-color-adjust:exact}}',
].join("\n");
