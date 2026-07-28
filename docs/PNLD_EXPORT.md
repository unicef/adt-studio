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
    ├── scripts/                  auto-fit.js, activities-bundle-local.js, adt-data.js
    ├── styles/                   tailwind_output.css, fonts.css, fontawesome-all-min.css
    └── adt/                      ADT media only — audio/video/image assets (see "Features")
```

Folder/file names are lowercase, ASCII, never start with a digit, and carry no
dot other than the extension separator (so `all.min.css` ships as
`fontawesome-all-min.css`). Core folders (`content`, `resources` and its
subfolders) are named in English exactly as above. Empty resource subfolders are
omitted.

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
- `<body>` opens with the `<div itemscope itemtype="https://schema.org/Book">`
  wrapper (like every content page), enclosing the nav.
- Contains `<nav role="doc-toc" id="toc" data-book="sumario">` with an `<h1>Sumário</h1>`
  and a nested `<ol>` (indented by heading level) linking into `content/*.html`.
- Declared in the OPF manifest as `<item id="nav" … properties="nav"/>`.

## `content/*.html`

- `<!DOCTYPE html>`, `<html lang>` **and** `<body lang>`, single `<main>`,
  `<meta name="robots" content="noindex, nofollow">`.
- The `<body>` opens with a `<div itemscope itemtype="https://schema.org/Book">`
  wrapper (first child) enclosing all content — the spec's structural marker.
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

The reader requires a JPEG cover at the root, sized exactly **2560×1600**
(landscape) or **1600×2560** (portrait, matching the source orientation). ADT
emits `cover.png`, so `packagePnld` decodes it (`pngjs`, or `jpeg-js` for a JPEG
source), scales it to fit the spec size preserving aspect ratio, letterboxes the
remainder on white, and re-encodes to `cover.jpeg` (`jpeg-js`). A non-decodable
placeholder is left as-is rather than failing the export.

## Features — data as `resources/scripts/adt-data.js`

ADT features are **carried, not dropped** — but VALIDE forbids `.json` files
(and treats any `.js` as an executable script that must live in
`resources/scripts/`). So the whole ADT data layer is **consolidated into one
VALIDE-legal JS module**, `resources/scripts/adt-data.js`, that assigns a global
keyed by each file's original adt-relative path:

```js
window.__ADT_DATA__ = {
  "assets/config.json": { … },                       // feature flags, languages
  "content/pages.json": [ … ], "content/toc.json": [ … ],   // navigation manifests
  "assets/interface_translations/<lang>/interface_translations.json": { … },  // chrome strings
  "content/i18n/<lang>/texts.json":  { … },           // per-language content
  "content/i18n/<lang>/audios.json": { … }, /* videos, images, glossary, timecode … */
};
```

Media assets (audio `.mp3`, video `.mp4`, images) are already permitted formats,
so they stay under `resources/adt/`; the data maps in `adt-data.js` point at
them. If a book has no media, `resources/adt/` is dropped entirely.

The shared `adt-runtime` loaders resolve each resource by its relative key: when
`window.__ADT_DATA__` is present they read from the global (works offline / over
`file://`, no fetch); otherwise they fetch the `.json` as before, so the adt/web,
WebPub, and preview outputs are unchanged.

Locale keys inside `content/i18n/<lang>/…` are lowercased (`pt-BR` → `pt-br`) to
match the on-disk folder-naming rule for any media dirs, and `config.languages`
is lowercased in lockstep so the runtime derives the same key; each page's
`<html lang>` keeps the semantic locale.

### Interactive activities

Activity pages (`data-section-type="activity_*"`) load the activities runtime so
quizzes work like the WebPub export — inline answer validation, correct-answer
confetti + toast, and advance to the next reading-order page. Each activity page
carries, in order:

```html
<meta name="adt-base" content="../resources/adt/" />
<script src="../resources/scripts/adt-data.js"></script>
<script src="../resources/scripts/activities-bundle-local.js"></script>
```

`adt-data.js` loads first so `window.__ADT_DATA__` is populated before the bundle
boots; `adt-base` still points media-path resolution at `resources/adt/`.

## Relation to the other exports

- **WebPub** (`docs/WEBPUB_EXPORT.md`) — Readium manifest, reader owns the UI.
- **EPUB** — EPUB-native SMIL media overlays + dictionary glossary.
- **PNLD** — FNDE tree + EPUB3 packaging, feature data carried as a single
  `resources/scripts/adt-data.js` global for a PNLD-aware reader (VALIDE / LIP).
