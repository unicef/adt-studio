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
| API stage runner (`stage-runner.ts`) | Stage ordering, step groupings |
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

## Sectioning and Storyboard correspondence

The page detail GET returns `sectioningSynchronization`, a read-only projection of
the active semantic and rendering versions. It reads current version pointers and
the active section ownership graph in one database read snapshot. Stable section
IDs in stored HTML are matched exactly; rendering array indices are not identity.
The pure classifier lives in `packages/pipeline/src/sectioning-sync.ts`, its shared
Zod contracts in `packages/types/src/sectioning-sync.ts`, and its read adapter in
`apps/api/src/services/sectioning-sync.ts`. Studio shows persistent notices in the
Sectioning and Storyboard editors, including the fixed-layout semantic boundary.

Both Sectioning-only and paired Storyboard saves use the server-owned
`apps/api/src/services/storyboard-save.ts` transaction under shared book writer
admission. They validate expected source/render versions, classify trusted
historical per-section generation evidence, preserve unpatchable/manual/unknown
renderings, and return committed versions with synchronization results. Catalog
reconciliation uses the shared freshness model without rewriting unaffected HTML
or deleting downstream history/media. Matching text alone never proves authorship.

Targeted repair reuses task service, mode preflight, captured prompt inputs and
staged publication. Stable section IDs select the output; cancellation, stale
versions and rejected correspondence retain prior output. Custom/protected cases
use retention review and supported editing. GET is read-only; fixed positioned
pages retain the explicit semantic editing limitation. See
[full implementation evidence](verification/spec-0012-full-continuation.md).

---

### Explicit rerender cache policy

Explicit rerenders set the shared LLM model's `forceFresh` default, which applies
to render, answer-generation and review calls through the existing resolver.
It bypasses current and legacy cache reads without changing cache keys. Accepted
fresh output writes through; validation retries also update the original request
key for ordinary identical-input reuse. Provider failure, cancellation and
rejected fresh output retain prior cache entries. Ordinary pipeline calls retain
their existing caching behavior. This policy does not establish content provenance
or authorize replacing protected output; SPEC-0012 targeted repair separately
enforces shared protection, admission and scoped invalidation.

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

## Structured-output failures and decisions

`packages/llm/src/client.ts` owns the configured automatic retry budget. Each
HTTP structured-text adapter invocation makes one SDK request with SDK retries
disabled. Parse repair and semantic validation feed back through that same
budget. Valid cache entries are schema-validated and are recorded separately
from provider calls; invalid output is never published as a successful cache
entry. Terminal errors expose bounded classifications, not raw provider bodies.
Codex and Claude structured-output attempts use an ephemeral loopback forwarding
gate. It reserves one provider request before upstream egress, so executable tool,
token or transport continuations cannot multiply the facade budget. Authentication
headers remain owned by the executable; the gate preserves configured upstream
routing, proxy and Claude mTLS. Bounded diagnostic decoding preserves compressed
error classification and explicit provider no-retry guidance without changing
response bytes delivered to the CLI. Unsupported alternate Claude backend selectors
fail before spawn. Real installed-executable probes are opt-in and must be run
separately from the default suite; see [provider evidence](verification/spec-0013-provider-wire.md).

The page-error broker binds each pending decision and bulk policy to a live
book/run. The decision route validates ownership and resolves at most once;
polling and SSE share the pending state. Cancel/end clears the run, and missing
listeners stop unresolved decisions after a 30-second grace period. A connected
but unanswered decision stops after ten minutes. No decision database or
restart auto-resume is added.

Interactive Retry is restricted to Image Meaningfulness. One accepted decision
grants one bounded round for its captured page inputs; re-exhaustion creates a new
decision. Shared writer admission, captured prompt/input/protection evidence and
generation staging guard Retry preflight and page publication. Successful sibling
pages stay committed and are reused, including their segmentation/cropping proof.
Protected filtering is retained rather than recertified as generated output.

Skip retains source identities and committed filtering/history/media. Durable
step/page recovery records qualify generation and output catalog readiness; only
a successful committed recovery clears the corresponding warning. Missing or
invalid filtering blocks new dependent work. Stop/cancel cannot publish staged
work or admit dependent paid passes. Headless callers fail without a dialog;
process restart retains committed data and reports interruption without automatic
paid work. See the current [acceptance evidence](verification/spec-0013-full-continuation.md).
Human specification approval remains pending.

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
| API stage runners | `apps/api/src/services/stage-runner.ts` |
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

### Extraction admission and book writers

API mutations, background jobs, stage runs, the CLI DAG and direct extraction use
`@adt/storage.withBookWriter`. Admission validates a book-local `extraction.json`
and source/input/asset hashes before copying or clearing anything. Initial
extraction publishes an attempt first and completion last; reuse preserves the
existing graph. Until shared downstream freshness/preservation is available,
full reruns stop with `UNSAFE_RESUME_UNAVAILABLE`. See
[Safe extraction](SAFE_EXTRACTION.md) for recovery and compatibility constraints.
