# ADT Studio — Architecture Decision Records

This document records all significant technology and architecture decisions made for the project, including the reasoning and alternatives considered.

---

## Table of Contents

1. [Guiding Principle: Pure JS/TS Over Native](#001-pure-jsts-over-native-bindings)
2. [Package Manager: pnpm](#002-pnpm-over-npm-and-yarn)
3. [HTTP Server: Hono](#003-hono-over-express-and-fastify)
4. [Frontend Framework: React + Vite (not Next.js)](#004-react--vite-over-nextjs)
5. [Frontend Ecosystem: TanStack (Router, Query, Table, Form)](#005-tanstack-ecosystem-over-mixed-libraries)
6. [Desktop Runtime: Tauri or Electron (TBD)](#006-desktop-runtime-tauri-or-electron)
7. [Styling: Tailwind CSS](#007-tailwind-css-over-css-modules-and-css-in-js)
8. [Validation: Zod](#008-zod-over-io-ts-yup-and-joi)
9. [Database: node-sqlite3-wasm](#009-node-sqlite3-wasm-over-better-sqlite3)
10. [Testing: Vitest](#010-vitest-over-jest)
11. [Conditional Classes: clsx](#011-clsx-over-classnames)
12. [UI Components: shadcn/ui](#012-shadcnui-for-ui-components)
13. [Progress Streaming: SSE](#013-sse-for-pipeline-progress)

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

## 006: Desktop Runtime — Tauri or Electron

**Status**: Pending
**Date**: 2026-02-09

### Decision

Desktop runtime is **TBD**. The two candidates are Tauri and Electron. This decision will be made when desktop packaging work begins.

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

## Decision Log Summary

| # | Decision | Chosen | Over |
|---|----------|--------|------|
| 001 | Binding strategy | Pure JS/TS + WASM | Native C/C++ bindings |
| 002 | Package manager | pnpm | npm, yarn |
| 003 | HTTP server | Hono | Express, Fastify |
| 004 | Frontend build | React + Vite (SPA) | Next.js, CRA |
| 005 | Frontend ecosystem | TanStack (Router, Query, Table, Form) | React Router, SWR, react-hook-form |
| 006 | Desktop runtime | Tauri or Electron (TBD) | — |
| 007 | Styling | Tailwind CSS | CSS Modules, styled-components |
| 008 | Validation | Zod | io-ts, Yup, Joi |
| 009 | Database | node-sqlite3-wasm | better-sqlite3, sql.js |
| 010 | Testing | Vitest | Jest |
| 011 | Class utility | clsx | classnames |
| 012 | UI components | shadcn/ui | MUI, Headless UI, raw Tailwind |
| 013 | Progress streaming | SSE | Polling, WebSocket |
