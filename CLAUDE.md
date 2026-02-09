# ADT Studio

ADT Studio is a desktop-first application for automated book production — extracting content from PDFs, processing through LLM pipelines, and generating formatted output bundles.

## Tech Stack

- **Monorepo**: pnpm workspaces
- **Backend**: Hono (HTTP server), node-sqlite3-wasm (pure WASM SQLite), Zod
- **Frontend**: React + Vite SPA, TanStack (Router, Query, Table, Form), Tailwind CSS
- **Desktop**: Tauri (Rust wrapper)
- **Language**: TypeScript (strict mode)
- **Testing**: Vitest

## 6 Core Principles (Non-Negotiable)

1. **Book-Level Storage** — All book data lives in one directory (zippable, shareable). Never store book data elsewhere.
2. **Entity-Level Versioning** — NEVER overwrite entities. Always create new versions. Users must be able to roll back.
3. **LLM-Level Caching** — Cache at the LLM call level. Hash ordered inputs for cache keys. Reruns are fast if params unchanged.
4. **Maximum Transparency** — All LLM calls, prompts, and responses must be user-inspectable. No black boxes.
5. **Minimize Dependencies** — Avoid new deps. Flat files > database when sufficient. In-memory queues > external services.
6. **Pure JS/TS Over Native** — Always prefer pure JS/WASM libraries over native C/C++ bindings (e.g., node-sqlite3-wasm over better-sqlite3).

## Architecture

```
packages/          # Shared libraries (@adt/* workspace packages)
  types/           # Zod schemas — ALL types defined here
  pipeline/        # Extraction & generation — pure functions only
  llm/             # LLM client, prompts, caching, cost tracking
  pdf/             # PDF extraction
  output/          # Bundle packaging

apps/              # Application tier
  api/             # Hono HTTP server
  studio/          # React SPA (Vite)
  desktop/         # Tauri wrapper

templates/         # Layout templates
config/            # Global configuration
docs/              # Documentation (guidelines, architecture)
```

**Layer rule**: `studio/desktop` → (HTTP only) → `api` → (direct imports) → `packages/*`
Frontend MUST NOT import from packages directly. All data flows through the API.

## Commands

```bash
pnpm install       # Install dependencies
pnpm dev           # Run development servers
pnpm test          # Run tests
pnpm typecheck     # TypeScript strict check
pnpm lint          # Lint
pnpm build         # Build all packages
```

## Key Rules

- All types defined as Zod schemas in `packages/types/`, infer TS types with `z.infer<>`
- All API calls from frontend go through `apps/studio/src/api/client.ts` + TanStack Query
- Styling: Tailwind utility classes only — no CSS modules, no styled-components
- Server state: TanStack Query — no Redux, Zustand, or global stores; `useState` for UI-only state
- Routing: TanStack Router (type-safe), Forms: TanStack Form, Tables: TanStack Table
- Pipeline functions must be pure (no side effects, all deps as params)
- All user input validated with Zod (API layer)
- API keys: header-based (`X-OpenAI-Key`), never logged, never in URLs
- File paths: always validate against base directory (path traversal prevention)
- SQL: parameterized queries only

## Full Guidelines

For complete coding standards, security requirements, patterns, and anti-patterns, see [`docs/GUIDELINES.md`](docs/GUIDELINES.md).
For technology decisions and reasoning, see [`docs/DECISIONS.md`](docs/DECISIONS.md).
