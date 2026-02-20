# ADT Studio — Architecture Decision Records

This document records all significant technology and architecture decisions made for the project, including the reasoning and alternatives considered.

---

## Table of Contents

1. [Guiding Principle: Pure JS/TS Over Native](#001-pure-jsts-over-native-bindings)
2. [Package Manager: pnpm](#002-pnpm-over-npm-and-yarn)
3. [HTTP Server: Hono](#003-hono-over-express-and-fastify)
4. [Frontend Framework: React + Vite (not Next.js)](#004-react--vite-over-nextjs)
5. [Frontend Ecosystem: TanStack (Router, Query, Table, Form)](#005-tanstack-ecosystem-over-mixed-libraries)
6. [Desktop Runtime: Tauri v2](#006-desktop-runtime-tauri-v2)
7. [Styling: Tailwind CSS](#007-tailwind-css-over-css-modules-and-css-in-js)
8. [Validation: Zod](#008-zod-over-io-ts-yup-and-joi)
9. [Database: node-sqlite3-wasm](#009-node-sqlite3-wasm-over-better-sqlite3)
10. [Testing: Vitest](#010-vitest-over-jest)
11. [Conditional Classes: clsx](#011-clsx-over-classnames)
12. [UI Components: shadcn/ui](#012-shadcnui-for-ui-components)
13. [Progress Streaming: SSE](#013-sse-for-pipeline-progress)
14. [Developer Debug Panel](#014-developer-debug-panel-for-pipeline-observability)
15. [Breadcrumb Navigation](#015-breadcrumb-navigation-over-global-header)
16. [Home Page Split Layout](#016-home-page-split-layout)
17. [Two-Level DAG Pipeline (Stage / Step Model)](#017-two-level-dag-pipeline-stage--step-model)
18. [Per-Book Step Run Queue](#018-per-book-step-run-queue)

---

## 001: Pure JS/TS Over Native Bindings

**Status**: Decided
**Date**: 2026-02-09

### Decision

Always prefer pure JavaScript/TypeScript or WASM-compiled libraries over native C/C++ bindings.

### Context

ADT Studio is a desktop app that needs to run on Windows, macOS, and Linux. Native Node.js bindings (packages using `node-gyp`, `prebuild`, or N-API with compiled C/C++) create significant problems:

- **Cross-platform build failures**: Native modules must be compiled per-platform and per-Node-version. `node-gyp` requires Python, C++ compilers, and platform-specific toolchains — a constant source of CI/CD failures.
- **Desktop packaging**: Whether using Tauri or Electron, native bindings add complexity to the build pipeline and increase binary size.
- **Contributor friction**: New developers must install platform-specific build tools before they can `pnpm install`.
- **WASM has matured**: WebAssembly alternatives for performance-critical libraries (SQLite, image processing) now match or exceed the DX of native bindings, with zero compilation step.

### Alternatives Considered

| Approach | Verdict |
|----------|---------|
| Allow native bindings case-by-case | Rejected — creates inconsistency, each native dep is a ticking time bomb for build issues |
| Pure JS only (no WASM) | Too restrictive — some functionality (SQLite, PDF parsing) genuinely benefits from compiled code |
| **Pure JS/TS + WASM** | **Chosen** — best of both worlds: performance via WASM, portability via JS |

---

## 002: pnpm Over npm and yarn

**Status**: Decided
**Date**: 2026-02-09

### Decision

Use pnpm as the package manager for the monorepo.

### Reasoning

- **Disk efficiency**: Content-addressable storage with symlinks means packages are stored once globally, not duplicated across projects.
- **Strict by default**: Prevents phantom dependencies — if a package isn't in your `package.json`, you can't import it. This catches real bugs.
- **First-class workspaces**: `pnpm --filter`, `workspace:*` protocol, topology-aware task execution.
- **Speed**: Faster installs than npm/yarn in monorepo scenarios due to hardlinks and parallel operations.

### Alternatives Considered

| Tool | Why Not |
|------|---------|
| npm | No content-addressable store, slower installs, weaker workspace support |
| yarn (classic) | Hoisting issues, less strict dependency resolution |
| yarn (berry/PnP) | Plug'n'Play is invasive, breaks many packages, steep learning curve |

---

## 003: Hono Over Express and Fastify

**Status**: Decided
**Date**: 2026-02-09

### Decision

Use Hono as the HTTP server framework for the API.

### Reasoning

- **Tiny footprint (~14KB)**: Critical for desktop sidecar — we want the API process to be lightweight.
- **TypeScript-first**: Typed routes, typed middleware, typed context — no `@types/express` needed.
- **Faster benchmarks**: Outperforms Express on request throughput.
- **Edge-portable**: Runs on Node.js, Deno, Bun, Cloudflare Workers — future-proof if we ever move the API.
- **Built-in middleware**: CORS, body parsing, error handling, auth helpers without extra packages.

### Alternatives Considered

| Framework | Why Not |
|-----------|---------|
| Express | Large, slow, requires many middleware packages, weak TypeScript support |
| Fastify | Good performance but larger footprint, plugin system adds complexity we don't need |
| tRPC | Couples frontend and backend too tightly, we want a clean HTTP API boundary |

---

## 004: React + Vite Over Next.js

**Status**: Decided
**Date**: 2026-02-09

### Decision

Use React with Vite as a pure SPA, not Next.js.

### Reasoning

ADT Studio is a **desktop-first application** embedded in a desktop webview (Tauri or Electron). This changes the entire calculus:

1. **No server needed in the frontend**: Next.js brings SSR, server components, API routes, and a Node.js server — none of which apply. The desktop shell serves static HTML/JS/CSS, not from a Next.js server.
2. **SPA is the right model**: The app runs locally, talks to a local Hono API via HTTP. There's no SEO, no initial page load from a remote server, no need for streaming SSR.
3. **Vite is faster for development**: Near-instant HMR via native ES modules vs. Next.js's webpack/turbopack compilation.
4. **Simpler build output**: Vite produces a static `dist/` folder. Next.js produces a `.next/` directory that expects a Node.js runtime to serve it.
5. **Smaller bundle**: No Next.js runtime, no React Server Components hydration, no router overhead.
6. **Monorepo simplicity**: Vite's config is minimal. Next.js in a monorepo requires careful configuration of `transpilePackages`, `serverComponentsExternalPackages`, and module resolution.

### Why not Next.js specifically

| Next.js Feature | ADT Studio Need | Verdict |
|-----------------|-----------------|---------|
| SSR/SSG | Not needed (desktop app, no SEO) | Unnecessary complexity |
| Server Components | No server in frontend | Not applicable |
| API Routes | We have Hono for this | Duplicate |
| File-based routing | We use TanStack Router (type-safe) | Prefer explicit routes |
| Image optimization | Local app, not web-served | Not needed |
| Middleware | Hono handles this server-side | Not applicable |

### Alternatives Considered

| Framework | Why Not |
|-----------|---------|
| Next.js | Overkill — SSR/SSG/server components not needed, adds complexity to desktop embedding |
| Create React App | Deprecated, slow, ejection required for customization |
| Remix | Server-focused like Next.js, same issues for a desktop SPA |
| SvelteKit | Would require the team to learn Svelte, React ecosystem is more mature |

---

## 005: TanStack Ecosystem Over Mixed Libraries

**Status**: Decided
**Date**: 2026-02-09

### Decision

Adopt the full TanStack ecosystem: Router, Query, Table, and Form. Not individual pieces from different library authors.

### Reasoning

**One team, one philosophy, designed to work together.**

The core problem with mixing libraries (React Router + SWR + react-hook-form + react-table) is integration friction. Each library has its own:
- State model and lifecycle
- TypeScript approach (some type-safe, some not)
- Error handling pattern
- Caching strategy

TanStack eliminates this by providing a unified ecosystem where type safety flows from Router → Query → Table → Form.

#### TanStack Router (over React Router)

- **Type-safe routes**: Route params, search params, and loaders are all typed at compile time. A typo in a route path or param name is a TS error, not a runtime 404.
- **Search params as state**: URL search params are treated as first-class typed state — like `useState` but synced to the URL. Perfect for filters, pagination, sorting.
- **Integrated data loading**: Route loaders integrate with TanStack Query, so data prefetching happens at the routing level.
- **React Router v7 caveat**: React Router v7 added type safety, but only in "framework mode" (Remix-style). In SPA mode (which we need for desktop embedding), you don't get the enhanced features. TanStack Router is type-safe in all modes.

#### TanStack Query (over manual useEffect/fetch)

- **Caching and deduplication**: Multiple components requesting the same data get a single network call.
- **Stale-while-revalidate**: Show cached data immediately, refresh in background.
- **Automatic refetching**: `refetchInterval`, `refetchOnWindowFocus`, `refetchOnReconnect`.
- **Mutations with optimistic updates**: Built-in rollback on failure.
- **Loading/error states**: Consistent pattern across the entire app.
- **Replaces**: Manual `useEffect` + `useState` + `setInterval` polling pattern.

#### TanStack Table (over custom table implementations)

- **Headless**: Provides sorting, filtering, pagination, grouping, virtualization logic — we provide our own Tailwind-styled UI.
- **Type-safe columns**: Column definitions are typed against the data shape.
- **No lock-in**: Since it's headless, we can change the UI without touching the logic.

#### TanStack Form (over react-hook-form)

- **Zod integration**: Native adapter for Zod schemas — same schemas we use everywhere.
- **Type-safe fields**: Field names and values are typed from the form schema.
- **Framework-agnostic**: Same mental model as the rest of TanStack.

### Alternatives Considered

| Library | Why Not |
|---------|---------|
| React Router | Type safety only in framework mode; we need SPA mode for desktop embedding |
| SWR | Less features than TanStack Query, no mutation support built-in |
| react-hook-form | Good library but separate ecosystem, TanStack Form integrates better with our Zod-first approach |
| AG Grid / DataGrid | Heavy, opinionated UI — we want headless + Tailwind |
| Redux Toolkit Query | Brings in Redux, which we explicitly avoid |

---

## 006: Desktop Runtime — Tauri v2

**Status**: Decided
**Date**: 2026-02-09

### Decision

Use Tauri v2 with a sidecar architecture — the API server is compiled into a standalone Node.js binary and bundled inside the Tauri app.

### Candidates

#### Tauri

| Aspect | Details |
|--------|---------|
| Bundle size | ~10x smaller (uses system webview) |
| Memory | Lower footprint, no bundled Chromium |
| Backend | Rust — performance for file I/O, process management |
| Security | Allowlist-based permissions |
| Trade-off | Requires Rust toolchain, webview inconsistencies across platforms |

#### Electron

| Aspect | Details |
|--------|---------|
| Bundle size | Larger (~150MB, bundles Chromium) |
| Memory | Higher (separate Chromium process) |
| Backend | Node.js — same language as the rest of the stack |
| Security | Full Chromium sandboxing, well-understood model |
| Trade-off | Heavier, but consistent rendering across platforms, mature ecosystem |

### Architecture Note

The `apps/desktop/` wrapper is designed to be runtime-agnostic. The Studio SPA communicates with the API over HTTP regardless of which desktop shell is used. This means the choice can be deferred without blocking other work.

---

## 007: Tailwind CSS Over CSS Modules and CSS-in-JS

**Status**: Decided
**Date**: 2026-02-09

### Decision

Use Tailwind CSS utility classes exclusively for styling.

### Reasoning

- **No CSS files to manage**: Styles live in JSX, no context switching.
- **Consistent design system**: Built-in spacing, color, and typography scales.
- **Purged output**: Only used classes end up in the bundle.
- **No runtime**: Unlike styled-components or Emotion, Tailwind has zero JS runtime cost.
- **clsx for conditionals**: Clean, readable conditional class composition.

### Alternatives Considered

| Approach | Why Not |
|----------|---------|
| CSS Modules | Requires separate `.module.css` files, context switching, no design system |
| styled-components | JS runtime overhead, breaks with SSR (not our concern but still), verbose |
| Emotion | Same issues as styled-components |
| vanilla-extract | Type-safe but requires build step config, extra complexity |

---

## 008: Zod Over io-ts, Yup, and Joi

**Status**: Decided
**Date**: 2026-02-09

### Decision

Use Zod for all schema validation and type inference.

### Reasoning

- **Single source of truth**: Define a Zod schema once, infer the TypeScript type with `z.infer<>`. No duplicate interface + schema definitions.
- **Runtime + compile-time**: Validates at runtime (API boundaries) and provides compile-time types.
- **`.safeParse()`**: Non-throwing validation perfect for API error handling.
- **Composable**: Schema composition, transforms, refinements, defaults.
- **TanStack Form integration**: Native Zod adapter for form validation.

### Alternatives Considered

| Library | Why Not |
|---------|---------|
| io-ts | Functional programming style (fp-ts dependency), steeper learning curve, worse DX |
| Yup | Weaker TypeScript inference, larger bundle, less performant |
| Joi | No TypeScript inference at all, designed for Node.js server-side only |
| ArkType | Promising but less mature ecosystem, fewer integrations |

---

## 009: node-sqlite3-wasm Over better-sqlite3

**Status**: Decided
**Date**: 2026-02-09

### Decision

Use `node-sqlite3-wasm` (pure WASM SQLite) instead of `better-sqlite3` (native C binding).

### Reasoning

This directly follows from [Decision 001: Pure JS/TS Over Native](#001-pure-jsts-over-native-bindings).

- **No native compilation**: `better-sqlite3` requires `node-gyp` and a C++ compiler. `node-sqlite3-wasm` is a WASM binary that works everywhere Node.js runs.
- **Cross-platform by default**: No platform-specific prebuilds, no desktop runtime rebuild steps.
- **File system persistence**: Unlike `sql.js` (in-memory only without manual serialization) or `@sqlite.org/sqlite-wasm` (browser-only), `node-sqlite3-wasm` has a VFS that maps SQLite file operations to Node.js's `fs` API.
- **Based on SQLite 3.51.1**: Current SQLite version, actively maintained.
- **Synchronous API**: Same synchronous query pattern as `better-sqlite3`.

### Trade-offs

- **Manual cleanup required**: `node-sqlite3-wasm` is not fully garbage-collected. You must call `db.close()` when done, otherwise you risk memory leaks. This is manageable with proper lifecycle management.
- **Slightly slower than native**: WASM has ~10-20% overhead vs native C for CPU-bound operations. For our use case (book metadata, entity versioning), this is negligible.

### Alternatives Considered

| Library | Why Not |
|---------|---------|
| better-sqlite3 | Native C++ binding — violates pure JS/TS principle, causes cross-platform build issues |
| sql.js | Compiles SQLite to WASM but only supports in-memory databases. Persistence requires manual import/export of the entire DB as a binary blob — not suitable for file-based book storage |
| @sqlite.org/sqlite-wasm | Official SQLite WASM build but browser-only. Node.js support limited to in-memory databases without persistence |
| Drizzle ORM | ORM abstraction layer — adds complexity, we want direct SQL control. Could layer on top later if needed |
| Prisma | Heavy, requires code generation step, runs a Rust query engine binary (another native dep) |
| Flat JSON files | Sufficient for simple cases but entity versioning with queries (get latest version, filter by type) benefits from SQL |

---

## 010: Vitest Over Jest

**Status**: Decided
**Date**: 2026-02-09

### Decision

Use Vitest as the test runner.

### Reasoning

- **Native ESM**: Works with ES modules out of the box. Jest requires `--experimental-vm-modules` or transform configuration.
- **Vite pipeline**: Reuses Vite's transform pipeline — tests run the same code as development.
- **Faster**: Worker-thread-based execution, instant re-runs in watch mode.
- **Jest-compatible API**: `describe`, `it`, `expect`, `vi.mock` — minimal migration effort.
- **Built-in coverage**: Via c8/v8, no separate package needed.

### Alternatives Considered

| Runner | Why Not |
|--------|---------|
| Jest | ESM support still experimental, slower, requires babel/ts-jest transforms |
| Mocha + Chai | More configuration needed, no built-in mocking, dated DX |
| Node.js test runner | Too minimal, no watch mode, limited ecosystem |

---

## 011: clsx Over classnames

**Status**: Decided
**Date**: 2026-02-09

### Decision

Use clsx for conditional CSS class composition.

### Reasoning

- **~228 bytes**: Significantly smaller than classnames.
- **Same API**: Drop-in replacement, identical function signature.
- **Better tree-shaking**: ES module by default.
- **Perfect for Tailwind**: Conditional utility class patterns like `clsx("p-4", isActive && "bg-blue-100")`.

### Alternatives Considered

| Library | Why Not |
|---------|---------|
| classnames | Larger bundle (~600 bytes), CommonJS default, same API but bigger |
| Template literals | Messy for multiple conditions, no falsy value handling |
| tailwind-merge | Overkill unless we have conflicting utility classes (we shouldn't with proper component structure) |

---

## 012: shadcn/ui for UI Components

**Status**: Decided
**Date**: 2026-02-10

### Decision

Use shadcn/ui as the component library for the React frontend (Default style, Neutral base, UNICEF blue accent).

### Reasoning

- **Not a dependency**: shadcn/ui is a copy-paste system. Components are copied into `src/components/ui/`, not installed as a package. We own the code.
- **Tailwind-native**: Built entirely on Tailwind CSS. No conflicting styling systems.
- **Radix primitives**: Uses Radix UI headless primitives for accessibility (keyboard nav, ARIA, focus management).
- **Consistent design**: Pre-built Button, Dialog, Select, Input, Table, Form, Card etc. prevents subtly-different components for similar needs.
- **Customizable**: CSS variables for theming via Tailwind v4's `@theme` directive.

### Alternatives Considered

| Option | Why Not |
|--------|---------|
| Raw Tailwind only | Slower to build, more code to maintain, higher risk of inconsistent components |
| MUI / Ant Design | Heavy, opinionated, JS runtime for styling, conflicts with Tailwind approach |
| Headless UI | Fewer components, would need to build more from scratch |
| Radix directly | shadcn is already built on Radix — gives us the styled layer for free |

---

## 013: SSE for Pipeline Progress

**Status**: Decided
**Date**: 2026-02-10

### Decision

Use Server-Sent Events (SSE) for streaming real-time pipeline progress from API to frontend.

### Reasoning

- **One-way stream**: Pipeline progress is server→client only. SSE is purpose-built for this.
- **Native browser support**: `EventSource` API with automatic reconnection.
- **Hono built-in**: `streamSSE()` helper, zero extra dependencies.
- **Matches pipeline design**: Pipeline already emits `ProgressEvent` (discriminated union). We serialize and send.

### Alternatives Considered

| Option | Why Not |
|--------|---------|
| Polling | Higher latency, unnecessary requests, less responsive UI |
| WebSocket | Full duplex overkill for one-way progress, more complex server setup |

---

## 014: Developer Debug Panel for Pipeline Observability

**Status**: Decided
**Date**: 2026-02-10

### Decision

Add a browser-DevTools-style bottom drawer panel (toggled via `Cmd+Shift+D`) on book workflow routes for inspecting LLM logs, pipeline stats, active config, and entity version history. Also provide a dedicated popout route (`/books/$label/debug`) for detached debugging in a separate window.

### Reasoning

- **Iteration speed**: Pipeline development requires seeing exactly what's happening — prompts sent, cache hits, token usage, validation failures. This data exists in `llm_log` but was only accessible via raw SQL.
- **Zero external tools**: No need to open a separate DB viewer or log aggregator. Everything is in the browser, colocated with the pipeline output.
- **Live + historical**: SSE `llm-log` events stream during a run (summary only, no full prompts in SSE). Full prompt/response detail fetched on demand from REST endpoints.
- **Docked + detached workflows**: The bottom drawer supports in-context debugging, while `/books/$label/debug` supports dedicated multi-monitor or side-by-side debugging during long runs.
- **Cost awareness**: Token counts and estimated cost displayed per step, helping catch expensive prompts early.
- **Config visibility**: Merged config (global + book override) displayed in a structured read-only view, clarifying which settings are active.
- **Minimal footprint**: 4 REST endpoints, 1 SSE event type, and lightweight React route/components. No new dependencies.

### Alternatives Considered

| Option | Why Not |
|--------|---------|
| External log viewer | Requires switching context, additional setup, not integrated with pipeline UI |
| Browser console logging | Unstructured, lost on page refresh, no filtering/aggregation |
| Dedicated debug-only app/shell | More routing and layout complexity than needed; a single popout route is sufficient |

---

## 015: Breadcrumb Navigation Over Global Header

**Status**: Decided
**Date**: 2026-02-10

### Decision

Remove the global header bar and use per-page breadcrumb navigation instead.

### Reasoning

- **Vertical space**: A persistent header with "ADT Studio" title consumed 36-56px on every page. On a desktop app where every pixel matters for pipeline output and storyboards, this is wasted space.
- **Context-aware**: Breadcrumbs (e.g., `ADT Studio / Book Title / Storyboard`) provide navigation context that a static header doesn't — the user always knows where they are in the hierarchy.
- **Consistency**: Every page follows the same pattern: breadcrumb trail at the top, then page content. The home page uses its title as the breadcrumb root.

### Alternatives Considered

| Option | Why Not |
|--------|---------|
| Slim header (36px) | Still wastes vertical space on every page for a static label |
| Floating action button | Inconsistent with the rest of the navigation model |
| Sidebar nav | Wastes horizontal space, overkill for a 4-level hierarchy |

---

## 016: Home Page Split Layout

**Status**: Decided
**Date**: 2026-02-10

### Decision

Home page uses a 30/70 vertical split: workflow guide on the left, books list on the right.

### Reasoning

- **No dead space**: With few books, a full-width grid leaves a massive void. The workflow column fills vertical space naturally with the 5-step timeline.
- **Onboarding built-in**: New users see how the tool works without navigating to a separate help page.
- **Book list as vertical cards**: Full-width horizontal cards in a single column show all metadata (title, label, authors, publisher, language, page count) with always-visible edit/delete actions — more information density than small grid cards.

### Alternatives Considered

| Option | Why Not |
|--------|---------|
| Full-width book grid | Massive empty space with 1-2 books, workflow hidden at bottom |
| Centered content | Looks unfinished on wide screens, wastes horizontal space |
| Workflow as horizontal strip | Compact but takes away from the books section, hard to show 5 steps with descriptions |

---

## 017: Two-Level DAG Pipeline (Stage / Step Model)

**Status**: Decided
**Date**: 2026-02-19

### Decision

Organize the pipeline as a two-level DAG with a single source of truth in `packages/types/src/pipeline.ts`. The two levels are:

- **Stages** — High-level groupings visible in the UI (Extract, Storyboard, Quizzes, Captions, Glossary, Text & Speech, Package). Stages have inter-stage dependencies forming a DAG.
- **Steps** — Atomic processing operations within a stage (e.g., `image-filtering`, `page-sectioning`, `tts`). Steps have intra-stage dependencies and can run in parallel when their dependencies are met.

### Context

Previously, the pipeline topology was duplicated in multiple places:
- A hardcoded `STEP_ORDER` array in the API step runner
- A separate `UI_STEP_ORDER` with step-to-UI mappings in the frontend hooks
- Hardcoded sub-step lists in every view component
- A flat step list in the CLI runner

Each location had its own notion of ordering, grouping, and dependencies. Adding or reordering a step required changes across 5+ files, and inconsistencies crept in.

### The `PIPELINE` Constant

```typescript
// packages/types/src/pipeline.ts
export const PIPELINE: StageDef[] = [
  {
    name: "extract",
    label: "Extract",
    dependsOn: [],
    steps: [
      { name: "extract", label: "PDF Extraction" },
      { name: "metadata", label: "Metadata", dependsOn: ["extract"] },
      { name: "image-filtering", label: "Image Filtering", dependsOn: ["extract"] },
      // ... more steps with intra-stage dependencies
    ],
  },
  {
    name: "storyboard",
    label: "Storyboard",
    dependsOn: ["extract"],   // inter-stage dependency
    steps: [
      { name: "page-sectioning", label: "Page Sectioning" },
      { name: "web-rendering", label: "Web Rendering", dependsOn: ["page-sectioning"] },
    ],
  },
  // ... more stages
]
```

Derived lookups (`STAGE_ORDER`, `STEP_TO_STAGE`, `STAGE_BY_NAME`, `ALL_STEP_NAMES`) are computed once from `PIPELINE` and exported alongside it.

### What Derives From PIPELINE

| Consumer | What it derives |
|----------|----------------|
| CLI (`packages/pipeline/src/cli.ts`) | Progress bars grouped by stage, step labels |
| DAG runner (`packages/pipeline/src/pipeline-dag.ts`) | Execution graph, parallelism |
| API step runner (`apps/api/src/services/step-runner.ts`) | Stage ordering, step groupings |
| API routes (`apps/api/src/routes/steps.ts`) | Topology for range-based execution |
| UI sidebar (`StepSidebar.tsx`) | Stage list and navigation |
| UI run cards (`StageRunCard.tsx`) | Sub-step list per stage |
| UI step indicator (`StepIndicator.tsx`) | Step ordering and labels |
| UI hooks (`step-mapping.ts`, `step-run-range.ts`) | Stage ordering, step-to-stage mapping |

### Alternatives Considered

| Approach | Why Not |
|----------|---------|
| Flat step list with hardcoded groupings | No DAG, no parallelism within groups, grouping logic duplicated everywhere |
| Config file (JSON/YAML) | Loses TypeScript type safety, requires runtime parsing |
| Database-driven pipeline | Over-engineered for a fixed pipeline, adds latency and complexity |
| Separate definitions per consumer | What we had before — led to duplication and drift |

---

## 018: Per-Book Step Run Queue

**Status**: Decided
**Date**: 2026-02-20

### Decision

When a user starts a stage run while another is already running for the same book, queue it and execute sequentially rather than rejecting with HTTP 409. The frontend serializes API calls through a promise chain to guarantee ordering matches click order.

### Context

Previously, starting a stage run while another was active returned HTTP 409 ("step run already in progress"). The individual stage views only checked if *their own* stage was running (not any stage), so the Run button appeared enabled. Clicking it called `startRun()` which wiped global progress state, then the API call failed — leaving the UI corrupted with no progress indicators.

The natural user intent is "run Extract, then run Storyboard" — this should just work without requiring them to wait for each stage to finish before clicking the next.

### Architecture

#### Backend Queue (`apps/api/src/services/step-service.ts`)

Each book has a `BookRunState = { active: StepRunJob | null, queue: QueuedStepRun[] }`. When a run is requested:

- **No active job**: Start immediately, return `{ status: "started" }`
- **Active job exists**: Push to queue, return `{ status: "queued" }`

An `executeJob()` → `drainQueue()` cycle ensures the next queued job starts automatically when the current one completes (success or failure). Stages are independent — a failure in one doesn't block the next.

#### Deferred Data Clearing (`beforeRun` callback)

Each job carries a `beforeRun` callback that clears downstream pipeline data. This runs when the job *starts executing*, not when enqueued. This is critical — if a user queues Storyboard while Extract is running, we must not clear storyboard data until Extract finishes and Storyboard actually starts. The callback is idempotent (guarded by a `ran` flag) to handle any edge cases.

#### SSE Stream Continuity

The SSE stream (`GET /steps/status`) stays open across queue transitions. A new `queue-next` event type tells the frontend when a queued run starts executing. The stream only closes when the active job finishes AND the queue is empty.

#### Frontend Promise Chain (`apps/studio/src/routes/books.$label.tsx`)

A `runChainRef` (ref to a `Promise<void>`) serializes API calls. Each `queueRun()` call chains onto the previous promise, ensuring HTTP POSTs arrive at the server in the exact order the user clicked — even if they click rapidly. Without this, concurrent `fetch()` calls could arrive out of order due to network timing.

#### Centralized `queueRun` Context Function

All 14 run handlers (7 View components + 7 Settings components) previously managed their own `startRun` + `setSseEnabled` + `api.runSteps` + `queryClient.removeQueries` sequence. This is now a single `queueRun(options)` function provided through `StepRunContext`, eliminating duplication and ensuring consistent behavior.

#### Aggressive Query Invalidation

On every stage start (`status === "started"`), all TanStack Query cache entries for the book are removed via `queryClient.removeQueries({ queryKey: ["books", label] })`. This is simpler than targeted per-stage invalidation and stage starts are infrequent enough that the cost is negligible. Queued runs (`status === "queued"`) skip invalidation since data hasn't been cleared yet.

### Key Files

| File | Role |
|------|------|
| `apps/api/src/services/step-service.ts` | Backend queue logic, `BookRunState`, `drainQueue()` |
| `apps/api/src/routes/steps.ts` | Route changes, `beforeRun` closure, SSE continuity |
| `apps/studio/src/hooks/use-step-run.ts` | `startRun` merges state, `queue-next` handler, `QueueRunOptions` |
| `apps/studio/src/routes/books.$label.tsx` | `queueRun` with promise chain serialization |
| `apps/studio/src/components/pipeline/stages/*` | All handlers use `queueRun` |

### Alternatives Considered

| Approach | Why Not |
|----------|---------|
| Fix the 409 guard (disable Run button globally) | Works but poor UX — users must wait for each stage before clicking the next |
| Client-side queue only | Race conditions between tabs/reconnects, server doesn't know about ordering |
| WebSocket for bidirectional control | Overkill — SSE already handles server→client; we only need client→server ordering |
| External job queue (Bull, BullMQ) | Violates "minimize dependencies" principle, in-memory queue is sufficient for single-user desktop app |

---

## Decision Log Summary

| # | Decision | Chosen | Over |
|---|----------|--------|------|
| 001 | Binding strategy | Pure JS/TS + WASM | Native C/C++ bindings |
| 002 | Package manager | pnpm | npm, yarn |
| 003 | HTTP server | Hono | Express, Fastify |
| 004 | Frontend build | React + Vite (SPA) | Next.js, CRA |
| 005 | Frontend ecosystem | TanStack (Router, Query, Table, Form) | React Router, SWR, react-hook-form |
| 006 | Desktop runtime | Tauri v2 (sidecar) | Electron |
| 007 | Styling | Tailwind CSS | CSS Modules, styled-components |
| 008 | Validation | Zod | io-ts, Yup, Joi |
| 009 | Database | node-sqlite3-wasm | better-sqlite3, sql.js |
| 010 | Testing | Vitest | Jest |
| 011 | Class utility | clsx | classnames |
| 012 | UI components | shadcn/ui | MUI, Headless UI, raw Tailwind |
| 013 | Progress streaming | SSE | Polling, WebSocket |
| 014 | Debug panel | Bottom drawer + REST + SSE | External viewer, console logs |
| 015 | Navigation | Breadcrumb per page | Global header, sidebar |
| 016 | Home layout | 30/70 split (guide + books) | Full-width grid, centered content |
| 017 | Pipeline model | Two-level DAG (Stage / Step) | Flat step list, config file, per-consumer definitions |
| 018 | Concurrent stage runs | Per-book queue with promise chain serialization | 409 rejection, client-only queue, external job queue |
