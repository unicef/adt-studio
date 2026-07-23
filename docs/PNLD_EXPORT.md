# PNLD Export — "Obra Digital" (.zip)

The PNLD export packages an ADT book as a **FNDE "Obra Digital"** — the format
of the *PNLD Anos Finais 2028–2031* edital (Anexo 03): **HTML5 content with
EPUB3 packaging** (`content.opf` + `toc.ncx`), fully self-contained, UTF-8. It's
validated by **VALIDE Desktop** (the official PNLD reader) and opens in the LIP
reader.

Built from the already-produced `adt/` web package (`packagePnld`), the same way
EPUB/WebPub are — strip the embedded runtime, reorganize into the FNDE tree, add
the structural documents. The caller zips the result into `<book>.zip`.

## Package layout

```
<book>.zip
├── content/                      HTML5 content pages only
│   ├── <pgNNN_secNNN>.html         one file per rendered section
│   └── qz*.html                    activity / quiz pages
├── content.opf                   EPUB3 OPF package (root)
├── cover.jpeg                    cover image (JPEG — see below)
├── index.html                    EPUB navigation document (root)
├── toc.ncx                       NCX navigation (root)
└── resources/
    ├── fonts/                    bundled webfonts + FontAwesome glyph fonts
    ├── images/                   page images
    ├── scripts/                  auto-fit.js (+ nothing else runtime)
    ├── styles/                   tailwind_output.css, fonts.css, fontawesome-all.min.css
    └── adt/                      ADT feature sidecar (see "Features")
```

Folder/file names are lowercase, ASCII, and never start with a digit. Core
folders (`content`, `resources` and its subfolders) are named in English exactly
as above. Empty resource subfolders are omitted.

## `content.opf` (OPF 3.0)

```xml
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
  <metadata xmlns:dc="…" xmlns:dcterms="…">
    <dc:identifier id="pub-id">urn:uuid:…</dc:identifier>
    <dc:title/> <dc:language/> <dc:publisher/> <dc:date/> <dc:description/> <dc:creator/>…
    <meta property="dcterms:modified">YYYY-MM-DDThh:mm:ssZ</meta>
    <!-- 3 mandatory accessibility metas -->
    <meta property="schema:accessibilityFeature">structuralNavigation</meta>
    <meta property="schema:accessibilityFeature">tableOfContents</meta>
    <meta property="schema:accessibilityAPI">ARIA</meta>
    <meta name="cover" content="cover-image"/>
  </metadata>
  <manifest> <!-- nav (index.html) + ncx + every packaged file; cover has properties="cover-image" --> </manifest>
  <spine toc="ncx"> <!-- itemrefs in reading order --> </spine>
  <guide> <reference type="cover" …/> </guide>
</package>
```

Reading order is **identical** across `index.html`, the OPF `<spine>`, and
`toc.ncx` navMap.

## `index.html` — navigation document

- `<meta charset>`, `<title>`, `<meta name="description">`, `<meta name="author">`,
  `<meta name="robots" content="noindex, nofollow">`, `<body lang="pt-BR">`.
- Contains `<nav role="doc-toc" id="toc" data-book="sumario">` with an `<h1>Sumário</h1>`
  and a nested `<ol>` (indented by heading level) linking into `content/*.html`.
- Declared in the OPF manifest as `<item id="nav" … properties="nav"/>`.

## `content/*.html`

- `<!DOCTYPE html>`, `<html lang>` **and** `<body lang>`, single `<main>`,
  `<meta name="robots" content="noindex, nofollow">`.
- **Self-contained**: asset references rewritten to `../resources/…`; Google-Fonts
  `<link>`s stripped (bundled `@font-face` covers the same families). No external URLs.
- **Pagination**: each page (one printed page) opens `<main>` with
  ```html
  <p role="doc-pagebreak"><span class="screen-reader-only">Página</span>
    <span class="page_number" data-book="pagina" aria-label="…">25</span></p>
  ```
  The `aria-label` is the number spelled out in pt-BR (numeral only for other languages).

`data-book` roles emitted today: **`sumario`** (index nav) and **`pagina`**
(page numbers). Other roles (glossary, unit/chapter titles, footnotes, credits…)
require semantic structures the ADT content model doesn't yet produce.

## Cover

The reader requires a JPEG cover at the root (`cover.jpg`/`cover.jpeg`). ADT
emits `cover.png`, so `packagePnld` converts it to `cover.jpeg` (decode via
`pngjs`, re-encode via `jpeg-js`). A cover already in JPEG is kept; a
non-decodable placeholder is left as-is rather than failing the export.

## Features — `resources/adt/`

ADT features are **carried, not dropped**. The runtime feature data and the
standalone activities bundle live under `resources/adt/`, mirroring the adt/web
layout so the reader (and the activities bundle) can consume every feature:

```
resources/adt/
├── assets/
│   ├── config.json                     feature flags, languages
│   ├── interface_translations/<lang>/  chrome strings
│   └── activities.bundle.local.js      standalone activities runtime
└── content/
    ├── pages.json  toc.json            navigation manifests
    └── i18n/<lang>/                    read-aloud audio, sign-language video,
                                        glossary/texts/timecode JSON
```

### Interactive activities

Activity pages (`data-section-type="activity_*"`) load the activities bundle so
quizzes work like the WebPub export — Submit/Next control, answer validation,
correct-answer confetti + toast, and advance to the next reading-order page.
Because PNLD pages sit in `content/` and the data lives under `resources/adt/`,
each activity page carries:

```html
<meta name="adt-base" content="../resources/adt/" />
<script src="../resources/adt/assets/activities.bundle.local.js"></script>
```

The shared `adt-runtime` loaders resolve `config.json` / manifests / i18n
relative to `adt-base` (default `./`, so the adt/web and WebPub outputs are
unchanged).

## Relation to the other exports

- **WebPub** (`docs/WEBPUB_EXPORT.md`) — Readium manifest, reader owns the UI.
- **EPUB** — EPUB-native SMIL media overlays + dictionary glossary.
- **PNLD** — FNDE tree + EPUB3 packaging, feature data carried as an ADT sidecar
  for a PNLD-aware reader (VALIDE / LIP).
