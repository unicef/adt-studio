# ADT Studio

ADT Studio is a desktop-first application for automated book production — extracting content from PDFs, processing through LLM pipelines, and generating formatted output bundles.

## Tech Stack

- **Monorepo**: pnpm workspaces
- **Backend**: Hono (HTTP server), node-sqlite3-wasm (pure WASM SQLite), Zod
- **Frontend**: React + Vite SPA, TanStack (Router, Query, Table, Form), Tailwind CSS
- **Desktop**: Electron (electron-vite + electron-builder; API server bundled into the main process)
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
  desktop/         # Electron desktop wrapper

templates/         # Layout templates
config/            # Global configuration
docs/              # Documentation (guidelines, architecture)
```

**Layer rule**: `studio/desktop` → (HTTP only) → `api` → (direct imports) → `packages/*`
Frontend MUST NOT import from packages directly. All data flows through the API.

**Exception**: `@adt/types` may be imported by `studio` for the shared `PIPELINE` definition and derived constants (stage/step names, ordering). No business logic — only type-level and constant data.

## Pipeline Architecture

The pipeline uses a **two-level DAG** model defined in a single source of truth: `packages/types/src/pipeline.ts`.

### Terminology

- **Stage** — A high-level grouping visible in the UI (e.g., Extract, Storyboard, Quizzes). Stages have inter-stage dependencies forming a DAG.
- **Step** — An atomic processing operation within a stage (e.g., `image-filtering`, `page-sectioning`). Steps have intra-stage dependencies. Steps within the same stage can run in parallel if their dependencies are met.

### Single Source of Truth

The `PIPELINE` constant in `@adt/types` defines all stages, their steps, labels, and dependency graphs. Everything else is derived:

- **CLI progress bars** — pre-created from `PIPELINE`
- **API step runner** — stage ordering and step groupings from `STAGE_ORDER`
- **UI sidebar, cards, indicators** — all derived from `PIPELINE`
- **DAG execution engine** — reads `PIPELINE` to build the execution graph

**Never hardcode stage/step ordering, names, or groupings outside of `PIPELINE`.** If you need a new derived lookup, add it to `packages/types/src/pipeline.ts` alongside the existing ones (`STAGE_ORDER`, `STEP_TO_STAGE`, `STAGE_BY_NAME`, `ALL_STEP_NAMES`).

## Docker

Three build targets in `Dockerfile`:

| Target | Description | Used by |
|--------|-------------|---------|
| `api` | Node.js API server only | `docker-compose.yml` (multi-container) |
| `studio` | nginx serving the built SPA | `docker-compose.yml` (multi-container) |
| `app` | Combined single-image (API + nginx) | Release CI → `ghcr.io/unicef/adt-studio` |

```bash
# Multi-container — local testing (two separate services)
docker compose up --build

# Single-image — same image end users download
docker build --target app -t adt-studio .
docker run -p 8080:80 -v ./books:/app/books adt-studio
```

**Runtime env vars and volumes:**

| Env var | Default | Override |
|---------|---------|--------|
| `BOOKS_DIR` | `/app/books` | `-v ./books:/app/books` |
| `PROMPTS_DIR` | `/app/prompts` | `-v ./prompts:/app/prompts` |
| `CONFIG_PATH` | `/app/config.yaml` | `-v ./config.yaml:/app/config.yaml:ro` |
| `PORT` | `3001` | Internal only — nginx proxies to this |

**`TEMPLATES_DIR` trap:** The Dockerfile and `docker-compose.yml` set `TEMPLATES_DIR=/app/templates` but the application **never reads this env var**. Templates dir is always derived from `path.join(path.dirname(PROMPTS_DIR), "templates")`. To use a custom templates directory, mount it as a sibling of `prompts/` — i.e. override `PROMPTS_DIR` and keep `templates/` next to it.

**Release pipeline:** pushing a `v*` tag triggers `.github/workflows/release.yml` which builds the `app` target and pushes to `ghcr.io/unicef/adt-studio:latest` and `ghcr.io/unicef/adt-studio:<tag>`. A ready-to-use `docker-compose.yml` (generated from `docker/compose-release.yml.template`) is uploaded as a release asset.

**Key Docker files:**
- `Dockerfile` — multi-stage build (base → deps → build → api / studio / app)
- `docker-compose.yml` — local dev/testing (multi-container)
- `docker/nginx.conf` — nginx config for the `studio` stage (proxies to `http://api:3001`)
- `docker/nginx-single.conf` — nginx config for the `app` stage (proxies to `http://127.0.0.1:3001`)
- `docker/entrypoint.sh` — starts API + nginx in the `app` stage, health-checks API before nginx starts
- `docker/compose-release.yml.template` — template for the release asset

**External packages in Docker:** `jsdom`, `esbuild`, `tailwindcss`, `postcss`, and `playwright` cannot be bundled by esbuild because they read data files relative to their own `__dirname`. They are installed into `apps/api/dist/node_modules/` by the Dockerfile build stage via npm. If a new package exhibits the same pattern (ENOENT error pointing to a path under `/app/apps/`), add it to both the `external` array in `apps/api/scripts/bundle-server.mjs` and the npm install step in the Dockerfile.

## Commands

```bash
pnpm install       # Install dependencies
pnpm dev           # Run API + Studio dev servers
pnpm test          # Run tests
pnpm typecheck     # TypeScript strict check
pnpm lint          # Lint
pnpm build         # Build all packages
```

### Desktop Development

Prerequisites: Node.js 20+ and pnpm. No Rust, no platform native toolchains required for app code (electron-builder pulls platform-specific signing/packaging tools as needed).

```bash
# Dev mode — electron-vite drives main/preload/renderer with HMR
pnpm dev:desktop

# Production build — bundles API server, Studio SPA, and Electron app, then packages with electron-builder
pnpm build:desktop                       # all-in-one
pnpm --filter @adt/desktop build:unpack  # unpacked dir, no installer
pnpm --filter @adt/desktop build:win     # Windows NSIS installer
pnpm --filter @adt/desktop build:mac     # macOS DMG
pnpm --filter @adt/desktop build:linux   # Linux AppImage
```

#### How the desktop app runs the API

The API server is bundled by esbuild into a single ESM file (`apps/api/dist-electron/api-server.mjs`, plus required WASM assets) and copied into the Electron output. The Electron **main process** boots the API in-process on a free local port and the **renderer process** loads the Studio SPA. The frontend detects the Electron environment via the preload-injected `window.electronAPI` and points its API calls at the local API port.

Key files:
- `apps/api/scripts/bundle-electron-server.mjs` — esbuild bundle of the API + WASM copy
- `apps/api/scripts/install-server-runtime.mjs` — installs runtime-only deps (jsdom, playwright, etc.) next to the bundle so esbuild externals resolve at runtime
- `apps/desktop/electron.vite.config.ts` — electron-vite config (main / preload / renderer)
- `apps/desktop/electron-builder.js` — packaging config (appId, targets, signing, `extraResources`)
- `apps/desktop/src/main/index.ts` — main process entry; spawns the API and creates windows
- `apps/desktop/src/main/api/index.ts` — API lifecycle (port selection, startup, shutdown)
- `apps/desktop/src/preload/index.ts` — exposes `window.electronAPI` to the renderer
- `apps/studio/src/api/client.ts` — Electron base URL detection

### Releasing

Pushing a version tag triggers a GitHub Actions workflow that builds a Windows installer and creates a GitHub Release with auto-generated changelog.

```bash
git tag v0.2.0 && git push --tags   # Creates next release
```

Or create a new tag in the GitHub UI pointing at `main`.

## Internationalization (i18n)

The Studio app uses **Lingui v5** for i18n. All user-visible text in `apps/studio/` must be translated to all supported locales: **`en`, `pt-BR`, `es`, `fr`, `sq`**.

### Rules
- **Every user-visible string must be wrapped** in a Lingui macro — no raw string literals in JSX or component output
  - In React components: `const { t } = useLingui()` → `t\`Your string\``
  - In JSX content: `<Trans>Your string</Trans>`
  - In non-React code (utils, constants): `msg\`Your string\`` + `i18n._()` at runtime
- **After adding or changing any string**, run `pnpm --filter @adt/studio extract` to update all `.po` catalog files and commit them alongside the code change
- **All locales must be fully translated** — no empty `msgstr` entries in `es.po`, `pt-BR.po`, `fr.po`, or `sq.po`
- CI enforces both rules automatically via the `i18n` job in `.github/workflows/ci.yml`

### Available locales
Defined in `apps/studio/src/i18n/locales.ts` (single source of truth for locale metadata) and mirrored in `apps/studio/lingui.config.ts` (required separately by the Lingui CLI):
- `en` — English (source locale)
- `pt-BR` — Portuguese (Brazil)
- `es` — Spanish
- `fr` — French
- `sq` — Albanian (Kosovo)

### ESLint — hardcoded string detection
The `lingui/no-unlocalized-strings` rule in `apps/studio/eslint.config.js` flags raw strings that should be wrapped in a macro. It has an `ignoreNames` list for prop names whose values are never user-visible (e.g. `variant`, `className`, `href`).

**When adding a new prop or variable name that holds a non-translatable value** (e.g. a new component prop like `iconName` or `queryKey`):
1. Check if it's already in `ignoreNames` in `eslint.config.js`
2. If not, decide: is this value ever shown to the user as text?
   - **No** (it's a key, identifier, or config value) → add it to `ignoreNames`
   - **Yes** (it's displayed as UI text) → wrap the value in the appropriate macro instead
3. After updating `ignoreNames`, regenerate the suppressions baseline:
   ```bash
   cd apps/studio
   npx eslint src --suppressions-location ./eslint-suppressions.json --prune-suppressions
   npx eslint src --suppress-all --suppressions-location ./eslint-suppressions.json
   ```

### Adding a new language
See [`docs/I18N_ADD_LANGUAGE.md`](docs/I18N_ADD_LANGUAGE.md).

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
For per-role responsibilities when assigning focused agent tasks (Code Reviewer, Pipeline Developer, Frontend Developer), see [`docs/AGENT_ROLES.md`](docs/AGENT_ROLES.md).
