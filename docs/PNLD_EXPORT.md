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
    ├── audios/  videos/          ADT media (see "Features")
    ├── scripts/                  auto-fit.js, activities-bundle-local.js
    ├── styles/                   tailwind_output.css, fonts.css, fontawesome-all-min.css
    └── adt/                      ADT data sidecar — JSON, mirrors the adt layout (see "Features")
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

## Features — JSON data in `resources/data/` + media in `resources/{audios,videos}/`

ADT features are **carried, not dropped**. The ADT data layer ships as plain
`.json` (VALIDE permits it) in a `resources/data/` sidecar that **mirrors the adt
layout** — same `assets/` + `content/` structure adt/web uses at its root:

```
resources/data/
├── assets/
│   ├── config.json                     feature flags, languages
│   └── interface_translations/<lang>/  chrome strings
└── content/
    ├── pages.json  toc.json            navigation manifests
    └── i18n/<lang>/                    texts, glossary, timecode, and the
                                        audios/videos/images maps
```

Because the structure matches adt exactly, the shared `adt-runtime` loaders reach
it with the **same code** — only the base differs: adt/web fetch under `./`, PNLD
fetches under `resources/data/` (via the `adt-base` meta / `runtimeBase()`). So the
reader shares one data-loading path across adt/web, WebPub, and PNLD.

**Media is the one divergence.** The edital mandates a flat folder per media type
(`resources/audios/`, `resources/videos/`, `resources/images/`), so `.mp3`/`.mp4`/
images are moved out of `content/i18n/<lang>/{audio,video}/` into those folders.
The same filename can exist per language (sign-language video differs pt-br vs
en-us), so files are renamed `<lang>__<original>` to avoid collisions, and the
`audios.json`/`videos.json` maps in `resources/data/` are rewritten so the reader
resolves `resources/<type>/<value>`.

Locale folders/keys are lowercased (`pt-BR` → `pt-br`), and `config.languages`
is lowercased in lockstep so the runtime derives the same key; each page's
`<html lang>` keeps the semantic locale.

### Interactive activities

Activity pages (`data-section-type="activity_*"`) load the activities runtime so
quizzes work like the WebPub export — inline answer validation, correct-answer
confetti + toast, and advance to the next reading-order page. Each activity page
carries:

```html
<meta name="adt-base" content="../resources/data/" />
<script src="../resources/scripts/activities-bundle-local.js"></script>
```

`adt-base` points the runtime loaders at the `resources/data/` data sidecar; the
bundle fetches config / manifests / translations there just like adt/web fetch
under `./`. (A host reader — served over http — is required; the bundle fetches
its data.)

## Relation to the other exports

- **WebPub** (`docs/WEBPUB_EXPORT.md`) — Readium manifest, reader owns the UI.
- **EPUB** — EPUB-native SMIL media overlays + dictionary glossary.
- **PNLD** — FNDE tree + EPUB3 packaging, feature data carried as JSON in a
  `resources/data/` sidecar that mirrors the adt layout, media in
  `resources/{audios,videos,images}/`, for a PNLD-aware reader (VALIDE / LIP).
