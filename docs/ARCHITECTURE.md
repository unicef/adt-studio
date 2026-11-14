# ADT Studio — Architecture

This document describes the system architecture of ADT Studio: how it is structured, how data flows through it, and where the key components live.

---

## System Overview

ADT Studio is a book production pipeline. It takes a PDF as input and produces structured, accessible digital content — HTML storyboards, quizzes, glossaries, captions, translated text, and packaged export bundles. Processing is driven by LLM calls through the provider registry and controlled by a configuration file that defines text classification schemes, rendering strategies, and per-step model settings. Storyboard rendering can run an optional screenshot-based visual refinement loop using headless Chromium (Playwright).

The system is designed for a single operator (or a single shared team) running against a local or hosted instance. All book data is stored on disk in self-contained directories — no external database, no cloud storage.

### Image models

Image generation and editing use the provider registry's `ImageBackend` through
`generateImageWithCache`, retaining book-local caching and inspectable call logs.
The `google` provider supports the Nano Banana family through the native Gemini
Interactions API, using the existing Google API key. Nano Banana 2 is
`google:gemini-3.1-flash-image`; Lite, Pro and 2.5 Flash Image are also listed in
`packages/types/src/google-image.ts`. See [Google's image API guide](https://ai.google.dev/gemini-api/docs/image-generation).

Select the global default in Settings → Models → Image generation and editing.
Book overrides retain precedence. Image translation uses
`image_translation.image_model` when set, otherwise the effective
`default_image_generation_model`, and authenticates with that model's provider.
Generation passes the target aspect ratio to the adapter: Google chooses the
nearest model-supported ratio, GPT Image 2 selects valid custom dimensions, and
other models retain the existing size fallback. Source edits omit forced sizing.
Storyboard swaps contain the returned image in the original layout box instead of
stretching it. PNG/JPEG output is fully decoded before caching/saving; invalid cache
entries are ignored and metadata uses validated dimensions. A shared
`imageFileExtension` helper retains the legacy PNG naming fallback, independently
of output validation. The
Interactions API emits JPEG (it rejects a PNG `response_format`), so Google
variants are stored with a `.jpg` extension. The `gemini` speech provider retains
its separate identity and credential settings.

---

## Monorepo Layout

```
adt-studio/
├── packages/                    # Shared libraries (@adt/* workspace packages)
│   ├── types/                   # Zod schemas — ALL types defined here. No business logic.
│   ├── pipeline/                # Extraction & generation — pure functions, one file per step
│   ├── llm/                     # LLM client, Liquid prompt engine, SHA-256 caching
│   ├── pdf/                     # PDF extraction (mupdf + resvg-wasm + pngjs)
│   ├── storage/                 # SQLite WASM book storage, entity versioning
│   └── output/                  # Bundle packaging & export
│
├── apps/                        # Application tier
│   ├── api/                     # Hono HTTP server (Node.js backend)
│   ├── studio/                  # React SPA (Vite + TanStack)
│   └── desktop/                 # Electron desktop wrapper (optional)
│
├── prompts/                     # Liquid (.liquid) templates for all LLM calls
├── templates/                   # HTML layout templates for rendering steps
├── config/                      # Runtime configuration (voice configs, styleguides)
├── docs/                        # Architecture and developer documentation
├── config.yaml                  # Global pipeline configuration
└── docker-compose.yml           # Docker orchestration
```

---

## Layer Architecture

Data and dependencies flow in one direction only:

```
┌─────────────────────────────────────────────────────┐
│  apps/studio (React SPA)  │  apps/desktop (Electron)│
└───────────────────┬─────────────────────────────────┘
                    │  HTTP only — never direct imports
                    ▼
┌─────────────────────────────────────────────────────┐
│                   apps/api (Hono)                    │
│          Routes · Services · Stage Runner            │
└───────────────────┬─────────────────────────────────┘
                    │  Direct imports
                    ▼
┌────────────────────────────────────────────────────────────┐
│  packages/pipeline  │  packages/llm  │  packages/output    │
└───────────────────┬────────────────────────────────────────┘
                    │  Direct imports
                    ▼
┌─────────────────────────────────────────────────────┐
│     packages/types  │  packages/pdf                  │
│     packages/storage                                 │
└─────────────────────────────────────────────────────┘
```

**Rule**: Frontend apps communicate with the API over HTTP only. They never import from `packages/` directly.

**Exception**: `@adt/types` may be imported by `apps/studio` for the shared `PIPELINE` constant and derived lookups (stage/step names, ordering). No business logic — type-level constants only.

---

## Package Dependency Graph

```
@adt/types          ← Zod schemas, PIPELINE constant (leaf — no internal deps)
       ↑
@adt/pdf            ← PDF extraction using mupdf / resvg-wasm (leaf)
       ↑
@adt/storage        ← SQLite WASM book storage (depends on @adt/types)
       ↑
@adt/llm            ← LLM client, prompt engine, caching (no internal deps)
       ↑
@adt/pipeline       ← Pipeline orchestrator (depends on types, pdf, storage, llm)
       ↑
@adt/output         ← Bundle packaging & export
```

---

## Pipeline: Two-Level DAG Model

The pipeline is organized as a two-level directed acyclic graph (DAG) defined in a single source of truth: [`packages/types/src/pipeline.ts`](../packages/types/src/pipeline.ts).

### Stages and Steps

- **Stage** — A high-level grouping visible in the UI. Stages have inter-stage dependencies (e.g., Storyboard requires Extract to complete first).
- **Step** — An atomic processing operation within a stage. Steps have intra-stage dependencies and can execute in parallel when their dependencies are met.

```
extract ──────────────────────────────────────────────────────────┐
  ├── extract (PDF Extraction)                                     │
  ├── metadata              (after: extract)                       │
  ├── image-filtering       (after: extract)                       │
  ├── image-segmentation    (after: image-filtering)               │
  ├── image-cropping        (after: image-segmentation)            │
  └── image-meaningfulness  (after: image-segmentation)  [parallel]│
                                                                   │
storyboard ────────────────────────────────────────────────────────┤ (after: extract)
  ├── page-sectioning       (tree-producing LLM step)              │
  ├── book-summary          (after: page-sectioning)               │
  ├── translation           (after: page-sectioning)  [parallel]   │
  └── web-rendering         (after: page-sectioning)               │
                                                                   │
quizzes   ─────────────────────────────────────────────────────────┤ (after: storyboard)
captions  ─────────────────────────────────────────────────────────┤ (after: storyboard)
glossary  ─────────────────────────────────────────────────────────┘ (after: storyboard)
  (all three run in parallel)
                            │
translate ──────────────────┘  (after: quizzes, captions, glossary)
  ├── text-catalog
  └── catalog-translation    (after: text-catalog)
                            │
speech ────────────────────┘  (after: translate)
  └── tts
                            │
package ────────────────────┘  (after: speech)
  └── package-web
```

### Single Source of Truth

Every consumer derives from the `PIPELINE` constant:

| Consumer | What it derives |
|----------|----------------|
| API stage runner (`step-runner.ts`) | Stage ordering, step groupings |
| DAG executor (`pipeline-dag.ts`) | Execution graph, parallelism |
| UI sidebar (`StageSidebar.tsx`) | Stage list and navigation |
| UI run cards (`StageRunCard.tsx`) | Sub-step list per stage |
| CLI (`cli.ts`) | Progress bars grouped by stage |

Never hardcode stage/step ordering, names, or groupings anywhere else. Add new derived lookups to `packages/types/src/pipeline.ts` alongside the existing ones (`STAGE_ORDER`, `STEP_TO_STAGE`, `STAGE_BY_NAME`, `ALL_STEP_NAMES`).

---

## Data Flow

```
PDF file
   │
   ▼
[extract step]  ─── mupdf renders pages → PNG files
                ─── extracts text per page
                ─── extracts raster + vector images
                     │
                     ▼  stored in books/{label}/{label}.db + images/
                     │
   [image-filtering / segmentation / cropping / meaningfulness]
                     │
                [page-sectioning]  ─── LLM produces a tree of content nodes
                                   ─── partitions nodes into typed sections
                     │
                [web-rendering]    ─── LLM or template produces HTML per section
                                  ─── optional visual refinement loop (render screenshot → review → revise)
                     │
                  (stored as node_data rows, versioned)
                     │
        ┌────────────┼────────────┐
        │            │            │
  [quiz-generation] [captioning] [glossary]
        │            │            │
        └────────────┼────────────┘
                     │
              [text-catalog]    ─── collects all translatable text
              [catalog-translation]  ─── translates per language
              [tts]             ─── generates audio
                     │
              [package-web]     ─── bundles HTML + assets + audio → export
```

---

## Screenshot Capture

HTML screenshots come from `createScreenshotRenderer()` (`packages/pipeline/src/screenshot.ts`). It is used by the Storyboard visual-refinement loop, the page-list section thumbnails, and AI page edits. The backend depends on where the API runs:

- **Web / Docker / CLI** — headless Chromium via Playwright. Each renderer launches its own browser: a stage run creates one for the run, the thumbnail route keeps one shared browser for the API process lifetime, and a page edit launches one per call. Every capture opens its own browser context.
- **Desktop** — the API runs in an Electron utility process, which has no Electron APIs. It asks the main process over IPC, and the main process captures with an offscreen `BrowserWindow` (`apps/desktop/src/main/services/screenshot.ts`).

**Timeout budget.** `timeoutMs` (default `DEFAULT_SCREENSHOT_TIMEOUT_MS`, 30s; visual review passes 60s) is one deadline for the whole capture — context creation, page load, fonts, the screenshot and cleanup share it. On desktop the main process enforces the same budget, and the utility process adds a short reply backstop on top.

**Concurrency cap.** Visual refinement runs up to `config.concurrency` pages at once (default 32), each capturing the three `SCREENSHOT_VIEWPORTS` — about 96 captures in flight. Uncapped, they contend for CPU and each one slows to roughly the 30s budget. So `createScreenshotRenderer()` wraps every renderer in one process-wide FIFO semaphore: at most `ADT_SCREENSHOT_CONCURRENCY` captures run at once (default `min(8, max(2, cores − 1))`), and the rest wait in line. The cap is shared across renderer instances on purpose, because the contention is for the machine, not for one browser — a stage run, thumbnails and page edits all queue together. A queued capture whose `signal` aborts leaves the queue immediately.

The capture's deadline starts only once it holds a slot, so queue time is never charged against `timeoutMs`. Keep it that way: an outer timeout added around a capture belongs **inside** the semaphore, since wrapping the whole `screenshot()` call would count the wait in line.

Set `ADT_SCREENSHOT_DEBUG=1` to log each capture's queue wait, capture duration and semaphore occupancy when tuning the limit for a machine.

---

## Text Direction

Books in a right-to-left language (Urdu, Arabic, Hebrew, Persian, Pashto, …) are laid out right to left. One lookup decides the direction — `getTextDirection()` in `packages/types/src/text-direction.ts`, a static table keyed by language code — and every surface that renders book HTML applies it as `dir="rtl"` on the document root, so alignment, punctuation, lists, tables and side-by-side blocks all mirror from that single attribute. Left-to-right documents carry no `dir` and are emitted unchanged.

- **Packaged pages** — `renderPageHtml()` (`packages/pipeline/src/packaging/web.ts`) writes `<html lang="…" dir="rtl">` from the book's source language.
- **Reader** — `applyDocumentLanguage()` (`apps/adt-runtime/src/app/lifecycle.ts`) re-applies `lang` and `dir` at boot and on every language switch, because the language a reader picks can differ from the one the page shipped with. The chrome mirrors with the document; the dock's prev/next buttons and the arrow keys read `textDirectionAtom` so "next" always points the way the page turns.
- **Storyboard preview** — `BookPreviewFrame` sets `dir` on its iframe document from `useBookTextDirection()`.
- **Screenshots** — `buildScreenshotHtml()` takes the book language, so visual review, section thumbnails and AI page edits see the layout the reader shows.

Exports are only partly covered. WebPub and PNLD reuse the packaged pages, so their content pages keep `dir`; EPUB rebuilds each page's root element (`convertPageToXhtml()`) and drops it. No export declares a right-to-left page progression yet (EPUB `page-progression-direction`, WebPub `readingProgression`), and the navigation documents the packagers generate themselves carry no `dir`.

---

## Watermark Removal

With `remove_watermarks` on, PDF extraction (`packages/pdf`) looks for a watermark repeated across the document and removes it before anything downstream sees the page. It is off unless set, and the book wizard sets it on for new books, so by default every new book whose pages are images goes through the learning described below. Two encodings are covered, and both are detected from pages sampled across the **whole** document, so a partial extraction agrees with a full one.

| Encoding | How it is found | How it is removed | Code |
|----------|-----------------|-------------------|------|
| **Text stamp** — the watermark is a text object | Same text at the same position on most sampled pages, and either diagonal or spanning a large share of the page | The text op is dropped from the page render; matching lines are dropped from the book text and positioned text | `watermarks.ts` |
| **Baked into page images** — a flattened ("printed to PDF") or scanned document, where each page is a picture and the stamp is part of its pixels | Median darkness, at each pixel, over the pages where that pixel would otherwise be blank paper: page content differs from page to page, the stamp does not | The darkening is divided back out of each affected image, on that image's own pixel grid | `raster-watermarks.ts` |

**Image stamps: what is cleaned.** The cleaned image is used twice — swapped into the page render (`<pageId>_page`), and emitted in place of the stamped embedded image (`<pageId>_imNNN`, same id, size and format). So Image Segmentation and Cropping work from clean pixels, and the page image a user re-crops from is clean too. An image the stamp does not touch, and a page where the stamp is absent (a cover, for example), are left byte-identical.

**Image stamps: learning.** The stamp is learned on the page images' own pixel grid, because any other grid resamples it and leaves an outline behind. Whole pages at that resolution may not fit the memory budget, so the stamp is first located on a coarser whole-page grid and then learned at full resolution inside the box that was found. The finer result is kept only if it is about as complete as the coarser one, since it is learned from fewer pages. How many pages are read is capped by pixels decoded, not by time, so the result does not depend on the machine. A pixel is "ink" only below brightness 100, so stamps up to about 60% grey are sampled as stamp. Where a stamp is hidden on some pages (under a white box, say), those pages vote "no stamp here" and can outvote the rest. The stamp is then recognised as the consistent darker group among that pixel's samples, provided it still shows on at least a fifth of them. This is a small help, not a guarantee: on the real books tested it accounts for 0–3% of the learned stamp, and where a stamp is hidden on most pages it is learned only in part or not at all.

**Image stamps: where the stamp shows.** A stamp is not always on top of the page. Removal therefore decides, pixel by pixel, what the stamp did there, by comparing each stamp pixel with the unstamped pixels of its own kind (paper, grey, coloured) around it:

| What is found | Meaning | What is done |
|---------------|---------|--------------|
| Darker than its surroundings by the stamp's share | The stamp shows | The darkening is divided out |
| Same as its surroundings | The stamp is hidden under a picture or a filled box | Left alone — dividing would leave a bright ghost of the letters |
| Darker by part of the share | The stamp shows through a translucent panel | Divided out by the measured share |
| Neutral grey at exactly the stamp's own brightness, among coloured content | The stamp is an opaque grey that replaced the content | Filled in from its edges inward with the surrounding colour; text printed over it is kept |

Where a neighbourhood is too busy to tell (a photograph), the answer comes from the rest of the image and then from the document: `overContent` (does the stamp show over coloured content, or sit under it?) and `replacesContent` (is it an opaque grey over colour?) are measured across sampled pages when the stamp is learned. Filling in is only switched on for a document whose `replacesContent` is high, because the white gaps of a picture drawn over a hidden stamp look much the same on a single page. On paper the fallback is "it shows": undoing a stamp that is hidden under white changes nothing, while leaving one that shows keeps the watermark.

**Image stamps: guards.** The detector only runs on documents with page images (pictures of at least 48 DPI covering most of the page, on at least 8 sampled pages of the most common page size). A document with fewer than two such pages among 16 sampled pages is ruled out at once; one that has them spends several seconds learning, whether or not a stamp is found. Learning yields to the event loop between pages, so the API process keeps answering other requests meanwhile. An image is only touched if enough of its pixels say plainly that the stamp shows, or failing that if the image as a whole does, so an unstamped cover is never altered on the document's say-so. The result is remembered per PDF, so re-extracting a page or two (a spread merge or split) does not repeat it. It accepts one large, grey or black mark at a fixed page position, and passes over marks made of long straight runs (rules, page frames, table grids) and the grey fringe of a coloured stamp, so repeated page furniture is not taken for a watermark. Colour is handled by measurement, not assumption: a true multiply fades colour along with brightness, while flattened pages usually keep the colour, and guessing wrong leaves a tinted ghost on coloured backgrounds.

**Limits.** A stamp that is coloured, tiled, or placed differently on each page is not removed. Neither is one fainter than about 8% or darker than about 60% grey, or one in a document with too few image pages or too little blank paper under the mark. A stamp whose box is larger than about 3 million pixels at the scans' resolution is learned on a coarser grid, which can leave a faint outline, and an image more than twice as sharp as that is left alone. Where an opaque stamp covered text or a detailed picture, what was under it is gone: the fill is a smooth continuation of the surroundings, and within a few pixels of a box's edge a stroke may be left or only partly filled. CMYK page images and images with transparency are skipped. Paper is measured rather than assumed white, but it must be light (about 246 of 255 or brighter) for blank areas to be recognised. A faint grey decoration repeated at one position on about half the pages or more (on every left-hand page, say) has the same signature as a stamp hidden on the other pages, and is removed as a watermark.

**Inspecting it.** Each page's `extraction-debug` node data records what was detected: `watermarks` (text signatures) and `rasterWatermark` (stamp box in points, peak opacity, `colourFade`, `overContent`, `replacesContent`, pages it was learned from, and the measured strength for every image cleaned on that page).

---

## Book Directory Structure

All data for a book lives in a single directory. No book data is stored outside it.

```
books/
└── {label}/
    ├── {label}.db          SQLite database (pages, images, node_data, llm_log)
    ├── config.yaml         Per-book config overrides (merges onto global config.yaml)
    ├── .debug-images/      Hash-named PNG screenshots used by visual-review logs
    └── images/
        ├── pg001_page.png  Full-page render (2x scale, ~144 DPI)
        ├── pg001_img001.png Extracted image
        └── ...
```

The `.db` file uses entity versioning — `node_data` rows are never overwritten. Each `putNodeData()` call inserts a new row with `version = MAX(version) + 1`. Full rollback history is preserved.

---

## Real-Time Progress: SSE

Pipeline progress streams from the API to the frontend via Server-Sent Events (SSE). The connection opens when a book view mounts and stays open until unmount — no toggle, no manual reconnect. `EventSource` handles reconnection natively.

SSE events patch the TanStack Query cache directly (`setQueryData`), keeping the UI in sync without a separate local state machine:

```
API ──── step-start ────► mark step + stage as "running"
     ──── step-progress ─► update page X/Y counter
     ──── step-complete ─► mark step "done", recompute parent stage
     ──── step-error ───► mark stage "error"
     ──── queue-next ───► full refetch (new queued run began)
     ──── complete ─────► full refetch (run finished)
```

---

## Key File Reference

| Purpose | File |
|---------|------|
| Pipeline definition (stages, steps, DAG) | `packages/types/src/pipeline.ts` |
| All Zod type schemas | `packages/types/src/` |
| PDF extraction | `packages/pdf/src/extract.ts` |
| LLM client + caching + prompt engine | `packages/llm/src/client.ts`, `prompt.ts` |
| Book storage (DB schema, migrations) | `packages/storage/src/db.ts` |
| Storage interface | `packages/storage/src/storage.ts` |
| Pipeline step implementations | `packages/pipeline/src/` |
| DAG runner | `packages/pipeline/src/dag.ts` |
| Screenshot renderer + capture cap | `packages/pipeline/src/screenshot.ts` |
| API entry point (Hono app) | `apps/api/src/app.ts` |
| API routes | `apps/api/src/routes/` |
| API stage runners | `apps/api/src/services/step-runner.ts` |
| Stage queue + SSE service | `apps/api/src/services/stage-service.ts` |
| API client (frontend) | `apps/studio/src/api/client.ts` |
| Book layout + run context | `apps/studio/src/routes/books.$label.tsx` |
| Unified stage/step status hook | `apps/studio/src/hooks/use-book-run.ts` |
| Stage sidebar | `apps/studio/src/components/pipeline/StageSidebar.tsx` |
| Stage color + icon config | `apps/studio/src/components/pipeline/stage-config.ts` |
| Stage view components | `apps/studio/src/components/pipeline/stages/` |
| Global pipeline config | `config.yaml` |
| LLM prompt templates | `prompts/*.liquid` |
| HTML rendering templates | `templates/` |
| Coding standards | `docs/GUIDELINES.md` |
| Architecture decision records | `docs/DECISIONS.md` |
