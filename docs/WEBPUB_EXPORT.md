# WebPub Export — Data Contract for Reader Authors

The WebPub export packages an ADT book as **reader-ready content**: the reading
app owns the UI (navigation, read-aloud, glossary, sign language, theming) and
the package ships only the book plus its data. There is no embedded viewer.

This document describes the shape a reader can rely on. It is a
[Readium Web Publication](https://readium.org/webpub-manifest/) with a few
ADT-specific sidecar files under `content/`.

## Package layout

```
webpub/
  manifest.json            Readium WebPub manifest — the entry point
  index.html               First reading-order page
  <sectionId>.html         Remaining content pages (e.g. pg002_sec001.html)
  qz*.html                 Activity/quiz pages
  cover.png                Cover image
  images/                  Page images referenced by the content HTML
  assets/
    config.json            ADT feature flags, languages, locked settings
    activities.bundle.local.js   Standalone quiz runtime (activity pages only)
    auto-fit.js            Fixed-layout text auto-fit helper
    fonts.css, fonts/, libs/     Fonts and vendored CSS/JS
  content/
    pages.json             Reading order source: [{ section_id, href, page_number }]
    toc.json               Table of contents: [{ href, title, level }]
    tailwind_output.css    Content stylesheet
    navigation/nav.html
    i18n/<lang>/           Per-language feature data (see below)
```

## `manifest.json`

A standard Readium manifest. Readers should treat this as the source of truth
for structure and navigation and build their own UI from it.

```jsonc
{
  "@context": "https://readium.org/webpub-manifest/context.jsonld",
  "metadata": {
    "@type": "http://schema.org/Book",
    "title": "Hyena and Raven",
    "language": ["en", "pt-BR"],       // default language first
    "modified": "2026-07-16T18:59:26.607Z",
    "author": "…",                      // present when known
    "publisher": "…",                   // present when known
    "presentation": { /* see below */ },
    "accessibility": {                   // schema.org, derived from feature flags
      "accessMode": ["textual", "visual"],
      "accessModeSufficient": [["textual", "visual"]],
      "feature": ["readingOrder", "alternativeText", "tableOfContents", "synchronizedAudioText", "signLanguage"],
      "hazard": ["none"],
      "summary": "…"
    }
  },
  "links": [
    { "rel": "self", "href": "manifest.json", "type": "application/webpub+json" },
    { "rel": "cover", "href": "cover.png", "type": "image/png" }
  ],
  "readingOrder": [
    { "href": "index.html", "type": "text/html", "title": "1" }
  ],
  "resources": [ { "href": "…", "type": "…" } ],   // every packaged file
  "toc":       [ { "href": "…", "title": "…", "children": [ … ] } ],  // present when non-empty
  "pageList":  [ { "href": "…", "title": "7" } ],                     // present when pages carry numbers
  "landmarks": [ { "rel": "cover", "href": "cover.png" },
                 { "rel": "bodymatter", "href": "index.html" } ]
}
```

`toc` is nested by heading `level`; `title` is the display label. Only present
when the book produced a table of contents.

### `metadata.presentation`

The manifest declares the Readium **EPUB profile** via `metadata.conformsTo`
(`["https://readium.org/webpub-manifest/profiles/epub"]`). This is required for
the profile's features — readers only apply fixed-layout handling (reading
`metadata.layout`) when the publication conforms to the EPUB profile.

`layout` is a top-level `metadata` property (Readium default context); `fit`,
`spread`, and `overflow` sit under `metadata.presentation`:

| Book type | Declared as |
|-----------|-------------|
| Reflowable | `presentation: { "overflow": "scrolled", "spread": "none" }` |
| Fixed-layout | `layout: "fixed"` + `presentation: { "fit": "contain", "spread": "none" }` |

For **fixed-layout** books:

- Each page HTML declares its pixel size with `<meta name="viewport" content="width=W, height=H">`. A fixed-layout reader should build a `W×H` viewport per page and scale it to fit (`fit: contain`).
- The page's visible content is absolutely positioned inside `<div id="content">`; it carries no flow height, so a reflowable layout would collapse it. Honor `layout: fixed`.
- As a fallback for readers that don't scale fixed-layout pages, each page also ships a small self-contained script that scales `#content` to the viewport. A reader that does its own scaling can ignore it — the script fits to `window.innerWidth/innerHeight`, so if the reader sizes the frame to the page it's a no-op.

## `assets/config.json`

ADT-specific metadata about the book. Feature flags tell a reader which
capabilities have data available to render.

```jsonc
{
  "title": "Hyena and Raven",
  "bundleVersion": "1",
  "languages": { "available": ["en", "pt-BR"], "default": "en" },
  "features": {
    "signLanguage": false,   // content/i18n/<lang>/videos.json + video/
    "glossary": true,        // content/i18n/<lang>/glossary.json
    "readAloud": false,      // content/i18n/<lang>/audios.json + audio/ + timecode/
    "easyRead": false,
    "eli5": false,
    "describeImages": true,
    "activities": true,      // quiz/activity pages
    "notepad": false,
    "highlight": false
    // …other UI toggles
  },
  "lockedSettings": ["dockLayout", "theme", "iconSize", "reduceMotion"],
  "fixedLayout": true
}
```

A `false` feature flag means no data was produced for it — the reader should
hide that affordance. `showNavigationControls` and `showTutorial` are forced
`false` in WebPub (the host reader owns navigation).

## `content/i18n/<lang>/` — feature data

One directory per language in `config.json.languages.available`. All keys are
**content node ids** (the `data-id` attributes in the page HTML), so a reader
resolves data by looking up the id of the element it's rendering.

| File | Shape | Purpose |
|------|-------|---------|
| `texts.json` | `{ [nodeId]: string }` | Translated text for each content node — swap into the matching `data-id` element to switch language. |
| `glossary.json` | `{ [word]: { word, definition, variations[], emoji } }` | Glossary terms; `variations` are inflected forms to match in the text. |
| `audios.json` | `{ [nodeId]: "file.mp3" }` | Read-aloud audio per node; files live in `audio/`. |
| `videos.json` | `{ ["video-N"]: "sl_….mp4" }` | Sign-language clips; files live in `video/`. |
| `images.json` | `{ [nodeId]: "nodeId_tr_<lang>.png" }` | Localized image variants; files live in `images/`. |
| `timecode/timecode_output.json` | word-timing map | Read-aloud text↔audio sync for highlighting. |

> There is no community standard for the ADT-specific features (sign language,
> glossary, easy-read, ELI5), so they are carried as these sidecar files rather
> than in the manifest. Generic Readium readers ignore them; an ADT-aware reader
> consumes them by node id.

## Interactivity → reader navigation

Activity pages load `assets/activities.bundle.local.js`, which renders a minimal
Submit/Next control and validates answers. On completion it advances the book by
navigating the iframe (`window.location.href`) to the next `readingOrder` entry.
There is **no `postMessage` channel** — a host reader tracks the change through
the iframe's location against `readingOrder`.

## Read-aloud in generic readers

Pre-recorded read-aloud is *not* exposed as Readium Guided Navigation in WebPub.
For playback in generic readers (e.g. Thorium), export **EPUB** instead — it
ships the same timing data as SMIL Media Overlays. In WebPub, an ADT-aware
reader uses `content/i18n/<lang>/timecode/` and `audios.json` directly.
