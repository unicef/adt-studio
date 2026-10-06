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
