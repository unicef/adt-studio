# ADT Studio — Architecture

This document describes the system architecture of ADT Studio: how it is structured, how data flows through it, and where the key components live.

---

## System Overview

ADT Studio is a book production pipeline. It takes a PDF as input and produces structured, accessible digital content — HTML storyboards, quizzes, glossaries, captions, translated text, and packaged export bundles. Processing is driven by LLM calls (OpenAI) and controlled by a configuration file that defines text classification schemes, rendering strategies, and per-step model settings. Storyboard rendering can run an optional screenshot-based visual refinement loop using headless Chromium (Playwright).

The system is designed for a single operator (or a single shared team) running against a local or hosted instance. All book data is stored on disk in self-contained directories — no external database, no cloud storage.

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
│   └── desktop/                 # Tauri v2 desktop wrapper (optional)
│
├── prompts/                     # Liquid (.liquid) templates for all LLM calls
├── templates/                   # HTML layout templates for rendering steps
├── config/                      # Runtime configuration presets and voice configs
├── docs/                        # Architecture and developer documentation
├── config.yaml                  # Global pipeline configuration
└── docker-compose.yml           # Docker orchestration
```

---

## Layer Architecture

Data and dependencies flow in one direction only:

```
┌─────────────────────────────────────────────────────┐
│  apps/studio (React SPA)  │  apps/desktop (Tauri)   │
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
  ├── image-meaningfulness  (after: image-segmentation)  [parallel]│
  ├── text-classification   (after: extract)                       │
  ├── book-summary          (after: text-classification)           │
  └── translation           (after: text-classification)  [parallel]
                                                                   │
storyboard ────────────────────────────────────────────────────────┤ (after: extract)
  ├── page-sectioning                                               │
  └── web-rendering         (after: page-sectioning)               │
                                                                   │
quizzes   ─────────────────────────────────────────────────────────┤ (after: storyboard)
captions  ─────────────────────────────────────────────────────────┤ (after: storyboard)
glossary  ─────────────────────────────────────────────────────────┘ (after: storyboard)
  (all three run in parallel)
                            │
text-and-speech ────────────┘  (after: quizzes, captions, glossary)
  ├── text-catalog
  ├── catalog-translation    (after: text-catalog)
  └── tts                    (after: catalog-translation)
                            │
package ────────────────────┘  (after: text-and-speech)
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
            ┌────────┴────────┐
            │                 │
   [text-classification]  [image-filtering / segmentation / cropping / meaningfulness]
            │                 │
            └────────┬────────┘
                     │
                [page-sectioning]  ─── LLM assigns section type to each page
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
