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

### Sectioning admission and publication

Sectioning's book-level policies live in focused `packages/pipeline/src/` modules:

- `sectioning-window.ts` resolves whole-book and mandatory part page windows.
- `sectioning-replacement-signature.ts` binds replacement consent to current configuration, source selections and prompts.
- `sectioning-admission.ts` orchestrates effective inputs, source prerequisites and execution admission. HTTP admission, queued execution, the direct runner and the worker each call it independently; a returned snapshot does not authorize later work.
- `authored-output.ts` validates replacement consent/versions, selects missing or explicitly named pages, checks identity history and performs the scoped Storyboard reset. It derives affected stages from `getStageClearOrder("sectioning")`.
- `generation-config.ts` projects settings relevant to Sectioning or Storyboard. Unrelated downstream or scheduling preferences do not invalidate generation; page/window/prompt/identity guards remain separate.
- `sectioning-lifecycle.ts` retains extraction admission and informational lifecycle bookkeeping, with compatibility exports for existing callers.
- `storyboard-publication.ts` prepares guarded publication. Ordinary same-layout runs publish successful page pairs incrementally; actual layout switches retain the previous layout until the active window can publish atomically.

The shared admission helper does not replace the book writer, reset-transaction checks or publication-time input/version checks. Those boundaries remain responsible for revalidation immediately before their mutations. `sectioning-errors.ts` owns the shared error class so callers and middleware preserve error identity without a lifecycle/publication import cycle.

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

**Direction-neutral pages (SPEC-0024).** A book has one page layout for all of its languages: a translation is swapped into the same HTML. So for a book where any language, source or translation, is right-to-left, `renderPageHtml()` rewrites the page as it is packaged or previewed (`neutralizeDirectionMarkup()`, `packages/pipeline/src/direction-neutral-html.ts`): `text-left`/`text-right` become `text-start`/`text-end`, mapped for the direction the page was written in; a floated box gets the same treatment (`float-left`/`float-right` and `clear-*` become `float-start`/`float-end`, and the `ml-*`/`mr-*` gap on the floated element becomes `ms-*`/`me-*`); and a `dir` that only repeats the element's inherited direction is removed. A `dir` that changes the direction is kept, and the classes on and inside that element are mapped for its direction rather than the page's, because `start` and `end` are resolved against the element they are on. The page looks the same in its own language and mirrors correctly in the other. Stored pages are not changed, and `resolvePageDirection()` returns `undefined` for a book with no right-to-left language, which leaves its output byte-identical. The Studio preview stylesheet (`generateTailwindCss()` in `apps/api/src/routes/adt-preview.ts`) is built from the stored HTML *and* its rewritten form, because the rewrite introduces classes the stored HTML does not contain.

A book whose pages are written right to left gets two more things at generation time. The render, review and edit prompts include `prompts/_text_direction.liquid`, which tells the model the page is right-to-left; it renders nothing unless the page direction is `rtl`, so other books' prompts and cache keys do not change. And `validateWebRendering()` applies the same rewrite to HTML that has passed validation, so new right-to-left pages are stored direction-neutral; `renderSectionLlm()` applies it once more after its last repairs, because the table-of-contents repair runs there and writes `text-right` on each page number. There it also corrects three things rather than preserving them: right-to-left text the model pushed to the left is aligned to the start, a table-of-contents page number is aligned to the end of its cell, and a floated box whose only side margin is on its outer side gets that gap on the text side. It repairs instead of rejecting, so it cannot cost a retry or fail a page.

A left-to-right page is stored as the model wrote it, even when the book has a right-to-left translation. The stored page goes into the messages of the calls that follow the render (the visual review, the activity answers), and the LLM cache key hashes those messages: rewriting it would make a book that gains or loses a translation run those calls again, for a page that looks the same in its own language. Such a page is made neutral only where it is read in the translation, by the packaging rewrite above.

Sectioning is told too, because it saves the order a page is read in. The two sectioning prompts include `prompts/_reading_direction.liquid`, which renders only for a right-to-left page and says that reading starts at the right: the rightmost column, block or table cell comes first. Without it a right-to-left table is saved left to right and renders mirrored, and read-aloud follows the wrong order. `sectionPage()` receives the direction as `pageDirection` from the same `resolvePageDirection()` gate.

Exports are only partly covered. WebPub and PNLD reuse the packaged pages, so their content pages keep `dir`; EPUB rebuilds each page's root element (`convertPageToXhtml()`) and carries `dir` over, which a direction-neutral page depends on because it no longer sets a direction of its own. No export declares a right-to-left page progression yet (EPUB `page-progression-direction`, WebPub `readingProgression`), and the navigation documents the packagers generate themselves carry no `dir`.

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

**Image stamps: guards.** The detector only runs on documents with page images (pictures of at least 48 DPI covering most of the page, on at least 8 sampled pages of the most common page size). A document with fewer than two such pages among 16 sampled pages is ruled out at once. One that has them spends 4–8 seconds learning when no stamp is found. When one is found it takes longer, and longer the sharper the scans: about 10 seconds at 100 DPI and 20–35 seconds at 150 DPI on the books tested, and about 45 seconds on a 300 DPI test book. Learning yields to the event loop between pages, so the API process keeps answering other requests meanwhile, but each page it reads, and each page cleaned afterwards, is still one uninterrupted piece of work: about half a second at 100 DPI, up to a second and a half at 150 DPI, and about three seconds at 300 DPI. An image is only touched if enough of its pixels say plainly that the stamp shows, or failing that if the image as a whole does, so an unstamped cover is never altered on the document's say-so. The result is remembered per PDF while the API process runs (for the four most recent documents), so re-extracting a page or two (a spread merge or split) does not repeat it, and two extractions of the same PDF at once share one learning. It accepts one large, grey or black mark at a fixed page position, and passes over marks made of long straight runs (rules, page frames, table grids) and the grey fringe of a coloured stamp, so repeated page furniture is not taken for a watermark. Colour is handled by measurement, not assumption: a true multiply fades colour along with brightness, while flattened pages usually keep the colour, and guessing wrong leaves a tinted ghost on coloured backgrounds.

**Limits.** A stamp that is coloured, tiled, or placed differently on each page is not removed. Neither is one fainter than about 8% or darker than about 60% grey, or one in a document with too few image pages or too little blank paper under the mark. A stamp whose box is larger than about 3 million pixels at the scans' resolution is learned on a coarser grid, which can leave a faint outline, and an image more than twice as sharp as that is left alone. Where an opaque stamp covered text or a detailed picture, what was under it is gone: the fill is a smooth continuation of the surroundings, and within a few pixels of a box's edge a stroke may be left or only partly filled. CMYK page images and images with transparency are skipped. Paper is measured rather than assumed white, but it must be light (about 246 of 255 or brighter) for blank areas to be recognised. A faint grey decoration repeated at one position on about a fifth of the pages or more (on every left-hand page, say, or on the opening page of each short chapter) has the same signature as a stamp hidden on the other pages, and is removed as a watermark.

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

The `.db` file uses entity versioning: `putNodeData()` inserts a new row with `version = MAX(version) + 1`. The sole physical-recovery exception is explicitly confirmed restoration of a damaged historical tuple to proven exact bytes with an immutable damage audit; the selected repaired entity also receives a fresh version. Arbitrary historical edits remain forbidden.

Additional book-local persistence used by SPEC-0003:

| Record | Purpose and ownership |
|---|---|
| `.sectioning-lifecycle.json`, `.sectioning-transition.json` | Informational readiness and configuration publication recovery. Reset rolls back its SQLite changes on failure; lifecycle invalidation can conservatively remain stale. It is not an output-currentness proof. |
| `.book-writer.json`, its preparing/recovery/successor artifacts, `<label>.db.lock` | Shared admission and SQLite mutex evidence. Only proven ownership authorizes cleanup; never delete locks by age. |
| `extraction.json`, `part.json` | Extraction fingerprint/assets and mandatory part scope; existing-book CLI resume remains outside SPEC-0003. |
| `.adt-package-work/format`, owned staging directories | Recoverable package publication workspace. Empty unmarked workspaces may be initialized under writer admission; unknown contents remain protected. |
| `adt/.build-hash`, `.build-version`, `.build-warnings`, `.build-owners` | Cached package input, warnings and origin/ownership receipts. Content tolerance never relaxes origin proof. |
| `.config-recovery-<sha256>.yaml` | Exact invalid prior overrides retained before an explicit valid repair; hash-checked when allowing initial extraction. |
| `.book-recovery-pending.json`, `.book-recovery-<uuid>/` | A separate recovery copy stays hidden/refused until validated; its audit and quarantined lock evidence are retained. The original is untouched. |
| `history_identity`, `history_slots`, `history_witnesses` | Persistent book identity, tuple incarnations/presence and compressed exact-byte witnesses/retired identity reservations. |
| `schema_version.history_evidence_version`, `.history_evidence_gap`, `.history_legacy_capture` | Durable continuity-loss and one-time readable legacy capture markers. |
| `history_repair_permits`, `history_recovery_audit`, `history_recovery_requests` | Transaction-scoped exact repairs, immutable damaged-byte audit and idempotent request receipts. |

`book-recovery-copy.ts` handles the explicit separate-copy operation. Known-live
owners are refused; unknown/legacy owners are never silently unlocked. Readable
legacy history is captured once on first open; later checkpoints, repairs and
regeneration remain explicit. Missing tracking/schema evidence is not recreated
as proof of continuity. Project ZIP admission lasts through source reading and
compression, not through consumer download; queued archive bytes are independent
of later edits.

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

### Recovery-copy operational limits

Copy recovery is offered for lock admission failures, not invalid configuration or
corrupt content. The original remains unchanged and may still be unavailable.
Interrupted copies retain `.book-recovery-pending.json` and remain hidden/refused;
start a new copy from the preserved original. After all ADT instances are closed,
an operator may move an unwanted **whole** original or incomplete-copy directory
out of `BOOKS_DIR` into a backup location using the filesystem. Do not delete lock
files to force admission. Verify the successful copy and retain the original
before deciding on any permanent cleanup.

Same-process Library/open attempts are refused without writing source admission
artifacts while copying. Other-process changes cause validation refusal. SQLite
integrity validation is synchronous; it can temporarily occupy the API event
loop on large databases. File permission bits are preserved, but the copy and
atomic replacement files belong to the creating process, not necessarily the
original group. These are operational limits, not OS-reboot or release certification.

Without verifiable process-incarnation evidence, a same-host lease whose PID is
currently alive remains refused. This includes current macOS/Windows leases as
well as legacy leases. An unrelated process reusing that PID
can therefore also prevent copy recovery. File age alone is not proof that the
recorded owner is dead; timestamps do not override this refusal.
The owner explicitly accepted this narrow recovery limitation on November 17,
2026 and @gbergengruen [approved the amended contract on November 18](https://github.com/unicef/adt-studio/pull/884#pullrequestreview-5957765294).
This does not promise recovery of every stranded book after reboot, or grant
PR/release approval.

A recovery copy is an intentional continuation of the same saved project, not a
new authored fork. It keeps `.adt-project.json`'s `projectId`, the persistent
history book UUID, historical entities and original export `originProjectId`.
Its directory label is new. If a later ADT import finds that origin project ID
already present, the existing import policy allocates a fresh project ID and
records `derivedFromProjectId`; recovery does not bypass that policy.

The quarantined `.book-recovery-<uuid>/locks/` and audit directory remain part of
a project ZIP backup. Lock records may contain the original hostname and process
ID. Consider that evidence when sharing the project archive; these retained
records are evidence, not active locks on import. Recovery does not silently
strip them or rewrite identity/history to hide them. File access, insufficient
space and an occupied destination label have distinct recovery errors. A refused
incomplete copy is checked before creating identity, media directories or locks.

Library listings do not build cold Storyboard HTML/ownership read models. A
current in-memory result can be reused. Otherwise, completed run telemetry or a
saved package results in an explicitly unverified summary, withholding
Storyboard/package/Preview completion; extracted-only books keep their next-step
guidance. Full
book/Preview/export validation is still required at the existing entrypoints.
