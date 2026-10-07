# Synthetic PDF cover fixtures

No real user documents or data are used. `chinese-embedded.pdf` contains only
test labels (Chinese test / synthetic sample / no personal data / education,
internships and skills) and a blue divider. It was generated with ReportLab and a
fontTools subset of Noto Sans CJK SC, embedded in the PDF. The font's OFL notice
is retained in `FONT-LICENSE.txt`. No host font is needed when running the tests.
`chinese-reference.png` was independently rasterized with MuPDF and visually
checked; tests compare the glyph ink so blank text or tofu cannot pass.
`chinese-unembedded.pdf` uses an unembedded STSong-Light font and intentionally
must fail quietly because there is no portable CJK substitute in standard_fonts.

Other PDFs are constructed in the renderer tests with the existing jsPDF
dependency or a small synthetic PDF writer: scanned image, rotation, encryption,
501 pages, malformed input, oversized source and oversized embedded image.
`blocked-worker.mjs` intentionally loops forever; the isolation test must kill it.
