# ADT Studio — Developer Guide

This guide is for third-party teams taking on hosting and/or feature development for ADT Studio. It covers deployment, configuration, and the key extension points you'll need when building new pipeline steps, output formats, or UI features.

**Prerequisites for this guide**: Read [ARCHITECTURE.md](./ARCHITECTURE.md) first for a system overview.

---

## Table of Contents

1. [Hosting](#1-hosting)
2. [Environment Variables](#2-environment-variables)
3. [Data Persistence](#3-data-persistence)
4. [Security Considerations](#4-security-considerations)
5. [Reverse Proxy Notes](#5-reverse-proxy-notes)
6. [Configuration](#6-configuration)
7. [Developer Setup (Local)](#7-developer-setup-local)
8. [Monorepo Rules](#8-monorepo-rules)
9. [Extension Points](#9-extension-points)
   - [New Pipeline Step](#new-pipeline-step)
   - [New Render Strategy or Output Format](#new-render-strategy-or-output-format)
   - [New API Endpoint](#new-api-endpoint)
   - [New UI Page](#new-ui-page)
10. [Entity Versioning](#10-entity-versioning)
11. [LLM Caching](#11-llm-caching)
12. [Key Files Reference](#12-key-files-reference)
13. [Coding Standards](#13-coding-standards)
14. [Architecture Decisions](#14-architecture-decisions)

---

## 1. Hosting

### What the application needs

ADT Studio runs as two components:

| Component | Runtime | Default port | Requires |
|-----------|---------|-------------|---------|
| **API server** | Node.js process (`apps/api/`) | `3001` | Read/write access to `BOOKS_DIR`, `PROMPTS_DIR`, `TEMPLATES_DIR`, `CONFIG_PATH` |
| **Frontend (SPA)** | Static files (`apps/studio/dist/`) | any | Served by any web server; routes `/api/*` to the API server |

The only stateful resource is `BOOKS_DIR` — all book data lives there and it must survive restarts. Everything else (prompts, templates, config) is read-only and can be deployed as part of the application.

### Option A — Docker

The simplest path. The published image bundles the Node.js API and an nginx static server in a single container.

```bash
# Single command
docker run -p 8080:80 -v ./books:/app/books ghcr.io/unicef/adt-studio:latest

# With docker-compose (health checks, named volume)
docker compose up -d
docker compose logs -f
docker compose down
```

Change the host port by setting `PORT=9000` in a `.env` file next to `docker-compose.yml`. See the [README](../README.md) for build-from-source instructions.

### Option B — VPS / Bare Metal

Build the project and run the two components separately using any process manager and static file server.

```bash
# Build all packages and apps
pnpm install && pnpm build

# --- API server ---
# With PM2:
pm2 start apps/api/dist/index.js --name adt-api
# With systemd: create a unit file pointing at the same entry point
```

Serve the built SPA with nginx, Caddy, or Apache — any server that supports a `try_files` fallback for SPA routing:

```nginx
server {
    listen 80;
    root /opt/adt/apps/studio/dist;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API calls (see §5 for SSE and timeout requirements)
    location /api/ {
        proxy_pass http://localhost:3001/api/;
    }
}
```

Set the [environment variables](#2-environment-variables) for the API process to point at the correct paths for books, prompts, templates, and config.

### Option C — Cloud / Kubernetes

The two components map naturally to separate deployment units:

- **API**: A Node.js container or VM process. `BOOKS_DIR` must be on a persistent volume (AWS EBS, GCS Persistent Disk, Azure Managed Disk, NFS share, etc.).
- **SPA**: Static files — host on any CDN or object storage (S3 + CloudFront, GCS + Cloud CDN, Azure Static Web Apps, Netlify) or keep it served by the same nginx alongside the API.

For Kubernetes, a single `Deployment` using the combined Docker image is the simplest starting point. For a production split:

- `Deployment/adt-api` — Node.js container, `PersistentVolumeClaim` for `BOOKS_DIR`
- `Deployment/adt-studio` — nginx container serving the built SPA, with a `ConfigMap` for the nginx configuration that proxies `/api/*` to the API service

**Scaling note**: the API is stateful (it writes to `BOOKS_DIR`). Running multiple API replicas requires a shared network filesystem for `BOOKS_DIR`. For most deployments a single API replica is sufficient.

---

## 2. Environment Variables

These variables configure the API server process. Set them in your process manager, container environment, or shell.

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3001` | Port the API server listens on. |
| `BOOKS_DIR` | `./books` | Root directory for all book data. Must be writable and persistent. |
| `PROMPTS_DIR` | `./prompts` | Directory containing Liquid prompt templates (`*.liquid`). |
| `TEMPLATES_DIR` | `./templates` | Directory containing HTML rendering templates. |
| `CONFIG_PATH` | `./config.yaml` | Path to the global pipeline configuration file. |
| `PROJECT_ROOT` | `.` | Base path for resolving relative paths inside the API. |
| `OPENAI_API_KEY` | _(unset)_ | Server-level API key fallback. When set, used if no key is supplied via the `X-OpenAI-Key` request header. |

When `OPENAI_API_KEY` is set server-side, users do not need to enter an API key in the UI settings dialog.

---

## 3. Data Persistence

All book data lives in `BOOKS_DIR`. This is the only directory that needs to be persisted across restarts.

```
books/
└── {label}/                  # One directory per book (filesystem-safe label)
    ├── {label}.db            # SQLite database: pages, images, llm_log, node_data
    ├── config.yaml           # Per-book config overrides
    ├── .debug-images/        # Visual-review screenshots (hash.png)
    └── images/               # Extracted page renders and images
```

**Backup**: Copy or zip the `books/{label}/` directory. The entire book state — including all LLM outputs, version history, cached responses, and debug screenshots — is self-contained.

**Migration**: Move a book directory to a new instance and it will be automatically detected on next startup.

**Database**: The `.db` file uses [node-sqlite3-wasm](https://github.com/tndrle/node-sqlite3-wasm) (pure WASM SQLite). No external database server required.

---

## 4. Security Considerations

### API Keys

The OpenAI API key is passed via the `X-OpenAI-Key` request header from the frontend to the API. It is:
- Never logged (sanitized in `llm_log` — replaced with a hash)
- Never stored on disk
- Never included in URLs

When hosting for a team, you have two options:
1. **Set `OPENAI_API_KEY` as an environment variable** — the API uses it as a fallback; users don't enter it in the UI
2. **Use the UI settings dialog** — each browser session sends the key in headers; the key is stored in the browser's localStorage for that session only

### Authentication

ADT Studio has no built-in authentication layer. If you are hosting it for a team (not just locally), add authentication at the reverse proxy level before the application is accessible over a network:

```nginx
# Example: basic auth in nginx
location / {
    auth_basic "ADT Studio";
    auth_basic_user_file /etc/nginx/.htpasswd;
    proxy_pass http://localhost:8080;
}
```

### Input Validation

All API inputs are validated with Zod at the route level. Book labels are restricted to `/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/`. File paths are validated against their base directory on every access to prevent path traversal.

### CORS

CORS is configured to allow `http://localhost:5173` (Vite dev server) and `tauri://localhost` (desktop app) by default. For hosted deployments, update the allowed origins in `apps/api/src/app.ts`.

---

## 5. Reverse Proxy Notes

When placing a reverse proxy (nginx, Caddy, Traefik) in front of the container:

**SSE (Server-Sent Events)** — Pipeline progress streams over SSE. Proxies must not buffer SSE responses:
```nginx
location /api/books/ {
    proxy_pass http://localhost:8080;
    proxy_buffering off;
    proxy_cache off;
    proxy_set_header Connection '';
    proxy_http_version 1.1;
    chunked_transfer_encoding on;
}
```

**Timeouts** — LLM calls can take 60–120 seconds per page for large books. Set generous timeouts:
```nginx
proxy_read_timeout 300s;
proxy_send_timeout 300s;
```

**SPA routing** — The frontend is a single-page application. Non-API routes must fall back to `index.html`:
```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

The included `docker/nginx.conf` handles all of this correctly for the combined Docker image.

---

## 6. Configuration

### Global Config (`config.yaml`)

The global configuration file controls the pipeline's classification schemes, LLM models, rendering strategies, and concurrency. It is loaded fresh on each pipeline run — no restart required after edits.

Key sections:

| Section | Purpose |
|---------|---------|
| `text_types` | Named categories for extracted text (e.g., `section_heading`, `math`, `activity_option`) |
| `text_group_types` | Named groupings of text entries (e.g., `paragraph`, `list`, `stanza`) |
| `section_types` | Named categories for page sections (e.g., `text_only`, `activity_multiple_choice`) |
| `metadata`, `text_classification`, etc. | Per-step LLM model and prompt override |
| `render_strategies` | Named strategies for web rendering (template-based or LLM-based) |
| `image_filters` | Min/max pixel dimensions; meaningfulness and cropping toggles |
| `concurrency` | Max parallel LLM calls |
| `pruned_text_types` | Text types excluded from processing (e.g., headers, footers, page numbers) |
| `pruned_section_types` | Section types excluded from rendering (e.g., back cover, credits) |

### Per-Book Config (`books/{label}/config.yaml`)

Any `config.yaml` key can be overridden at the book level. The book config deep-merges onto the global config. This is created automatically by the "Add Book" wizard in the UI.

Example — override the LLM model for a single book:
```yaml
metadata:
  model: openai:gpt-4o
text_classification:
  model: openai:gpt-4o
```

### Visual refinement configuration (`render_strategies.*.config.visual_refinement`)

LLM-based and activity-based render strategies can run an iterative visual QA loop:
1. Render HTML.
2. Screenshot at desktop/tablet/mobile viewports using Playwright Chromium.
3. Ask a visual-review prompt to approve or return revised HTML.
4. Repeat up to `max_iterations`.

Example:

```yaml
render_strategies:
  llm:
    render_type: llm
    config:
      prompt: web_generation_html
      model: openai:gpt-5.2
      visual_refinement:
        enabled: true
        prompt: visual_review
        max_iterations: 5
        timeout: 180
        temperature: 0.3
```

Notes:
- The visual-review model is currently fixed in code (`DEFAULT_VISUAL_REVIEW_MODEL_ID` in `packages/pipeline/src/visual-review.ts`).
- Debug screenshots referenced from LLM logs are stored as files in `books/{label}/.debug-images/`.

### LLM Prompt Templates (`prompts/*.liquid`)

All LLM prompts are [Liquid](https://liquidjs.com/) templates stored as `.liquid` files. They define system messages, user messages, and inline images using custom tags:

```liquid
{% chat role:"system" %}
You are a content classifier for educational textbooks...
{% endchat %}

{% chat role:"user" %}
Classify the following text:
{{ text }}
{% endchat %}
```

Edit these files to change prompt wording, add examples, or adjust instructions — no code changes required.

### Rendering Templates (`templates/`)

HTML layout templates used by template-based render strategies (e.g., `two_column`, `two_column_story`). These are standard HTML files with template variables. Add new templates here to create new layout options.

---

## 7. Developer Setup (Local)

**Prerequisites**: [Node.js](https://nodejs.org/) >= 20, [pnpm](https://pnpm.io/) >= 9, and Playwright Chromium.

```bash
git clone git@github.com:unicef/adt-studio.git
cd adt-studio

# Install all workspace dependencies
pnpm install

# Install Playwright Chromium (required for visual refinement)
pnpm exec playwright install chromium

# Start API + Studio dev servers in parallel
pnpm dev
# API:    http://localhost:3001
# Studio: http://localhost:5173  (browser opens automatically)
```

On Linux, install Chromium OS packages if needed:

```bash
pnpm exec playwright install --with-deps chromium
```

On first run, `pnpm dev` compiles all packages (~1 min). Subsequent runs use incremental TypeScript builds and are fast.

**Useful commands:**

```bash
pnpm typecheck        # TypeScript strict mode check across all packages
pnpm test             # Run all Vitest tests
pnpm test:coverage    # Tests with coverage report
pnpm lint             # ESLint across all packages
pnpm build            # Full production build
```

**Desktop app** (optional — requires [Rust](https://rustup.rs/)):
```bash
pnpm dev:desktop      # Opens Tauri window pointing at the Vite dev server
```

---

## 8. Monorepo Rules

The monorepo uses pnpm workspaces. There are strict layer rules:

```
apps/studio, apps/desktop  →  (HTTP only)  →  apps/api  →  (imports)  →  packages/*
```

- **Frontend never imports from packages directly.** All data goes through `apps/api` over HTTP.
- **Exception**: `@adt/types` may be imported by `apps/studio` for the `PIPELINE` constant and derived lookups (stage/step names). No business logic — constants only.
- **Backend** (`apps/api`) imports from packages using the `@adt/*` workspace protocol.
- **Packages** may only import from other packages lower in the dependency graph (see [ARCHITECTURE.md](./ARCHITECTURE.md)).

**Where to put new code:**

| Code type | Location |
|-----------|----------|
| Zod schemas, TypeScript types | `packages/types/src/` — export from `index.ts` |
| Pipeline step logic | `packages/pipeline/src/` — one file per step, pure functions |
| LLM prompts | `prompts/*.liquid` |
| Pipeline DAG definition | `packages/types/src/pipeline.ts` only |
| API endpoints | `apps/api/src/routes/` |
| API business logic / services | `apps/api/src/services/` |
| React pages | `apps/studio/src/routes/` |
| React components | `apps/studio/src/components/` |
| Frontend API calls | `apps/studio/src/api/client.ts` |

---

## 9. Extension Points

### New Pipeline Step

Adding a new processing step to the pipeline:

**1. Define the step in `packages/types/src/pipeline.ts`** (the single source of truth):

```typescript
// Add your step to the appropriate stage's steps array:
{
  name: "storyboard",
  steps: [
    { name: "page-sectioning", label: "Page Sectioning" },
    { name: "web-rendering", label: "Web Rendering", dependsOn: ["page-sectioning"] },
    // Add here — specify dependsOn if it depends on other steps in the stage
    { name: "your-step", label: "Your Step Label", dependsOn: ["web-rendering"] },
  ],
}
```

Also add `"your-step"` to the `StepName` enum at the top of the file.

**2. Implement the step function in `packages/pipeline/src/your-step.ts`:**

```typescript
// Pipeline step functions must be pure — no hidden dependencies, no global state
export async function yourStep(
  pages: PageData[],
  storage: Storage,
  llmModel: LLMModel,
  config: YourStepConfig,
): Promise<void> {
  for (const page of pages) {
    const result = await llmModel.generateObject({ ... })
    storage.putNodeData("your-step", page.pageId, result)
  }
}
```

**3. Add a Liquid prompt template in `prompts/your-step.liquid`** (if LLM-based):

```liquid
{% chat role:"system" %}
Your system prompt here.
{% endchat %}

{% chat role:"user" %}
{{ input_data }}
{% endchat %}
```

**4. Add step config to `config.yaml`:**

```yaml
your_step:
  prompt: your-step
  model: openai:gpt-4o
  concurrency: 8
```

**5. Add a Zod schema for the step's output in `packages/types/src/`** and export it from `index.ts`.

**6. Wire the step into the API stage runner (`apps/api/src/services/step-runner.ts`)** — add it to the appropriate stage's execution block.

The UI sidebar, run cards, and step indicators all derive from the `PIPELINE` constant and will automatically display the new step — no UI changes required in most cases.

---

### New Render Strategy or Output Format

**Template-based strategy** (HTML layout, no LLM):

1. Create an HTML template in `templates/your-template.html`
2. Add it to `config.yaml` under `render_strategies`:
   ```yaml
   render_strategies:
     your_template:
       type: template
       template: your-template
   ```
3. The rendering step will pick it up by name from the book's section config

**LLM-based strategy** (LLM generates HTML):

1. Create a Liquid prompt template in `prompts/your-render-strategy.liquid`
2. Register the strategy name in `config.yaml`
3. Implement the rendering function in `packages/pipeline/src/web-rendering.ts` (or a new file) — add a branch for the new strategy name
4. Update the Zod schema in `packages/types/src/` if the output structure changes

**New export format** (e.g., EPUB, custom ZIP):

1. Add export logic in `packages/output/src/`
2. Add a new API route in `apps/api/src/routes/` (e.g., `export-epub.ts`)
3. Register the route in `apps/api/src/app.ts`
4. Add a client method in `apps/studio/src/api/client.ts`
5. Add a UI trigger (button) in the relevant stage view component

---

### New API Endpoint

**1. Create the route file (`apps/api/src/routes/your-resource.ts`):**

```typescript
import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"

const YourResourceSchema = z.object({
  label: z.string(),
  data: z.string(),
})

export const yourResourceRouter = new Hono()

yourResourceRouter.post("/", async (c) => {
  const body = await c.req.json()
  const result = YourResourceSchema.safeParse(body)
  if (!result.success) {
    throw new HTTPException(400, { message: result.error.message })
  }
  // ... business logic
  return c.json({ ok: true })
})
```

**2. Register it in `apps/api/src/app.ts`:**

```typescript
import { yourResourceRouter } from "./routes/your-resource.js"
app.route("/api/your-resource", yourResourceRouter)
```

**3. Add the client method in `apps/studio/src/api/client.ts`:**

```typescript
export const api = {
  // ... existing methods
  yourResource: async (data: YourResourceInput): Promise<YourResourceOutput> => {
    return request<YourResourceOutput>("/your-resource", {
      method: "POST",
      body: JSON.stringify(data),
    })
  },
}
```

---

### New UI Page

**1. Create the route file (`apps/studio/src/routes/your-page.tsx`):**

TanStack Router uses file-based routing. The file name becomes the URL path.

```typescript
import { createFileRoute } from "@tanstack/react-router"
import { useSuspenseQuery } from "@tanstack/react-query"
import { api } from "../api/client"

export const Route = createFileRoute("/your-page")({
  component: YourPage,
})

function YourPage() {
  const { data } = useSuspenseQuery({
    queryKey: ["your-resource"],
    queryFn: () => api.yourResource(),
  })

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">{data.title}</h1>
    </div>
  )
}
```

**2. Register the route** in the TanStack Router tree (see `apps/studio/src/router.tsx` or the existing route tree file).

**UI conventions:**
- Use Tailwind utility classes only — no CSS modules, no inline styles (except dynamic values)
- Use `shadcn/ui` components from `apps/studio/src/components/ui/` for standard elements (Button, Dialog, Input, etc.)
- All server state via TanStack Query — no `useEffect` for data fetching
- Local UI state via `useState` only

---

## 10. Entity Versioning

All pipeline outputs are stored in the `node_data` table with a composite key of `(node, item_id, version)`. The storage layer **never overwrites** — every `putNodeData()` call inserts a new version row.

```typescript
// Always inserts: version = MAX(version) + 1
storage.putNodeData("web-rendering", pageId, htmlOutput)

// Always reads the latest version
const latest = storage.getLatestNodeData("web-rendering", pageId)
```

When building new pipeline steps that write entities, follow this same pattern. Do not write directly to the SQLite database using `INSERT OR REPLACE` or `UPDATE`. This preserves the full version history and allows rollback.

---

## 11. LLM Caching

All LLM calls go through the cached client in `packages/llm/src/client.ts`. The cache key is the SHA-256 hash of `{ modelId, system, messages, schema }`. A cache hit returns the stored result instantly — no LLM call.

```typescript
const llmModel = createLLMModel({
  modelId: "openai:gpt-4o",
  cacheDir: path.join(bookDir, ".cache"),
  promptEngine,
  onLog: (entry) => storage.appendLlmLog(stepName, itemId, entry),
})

// Cache is automatic — first call hits LLM, subsequent calls with identical inputs return cache
const result = await llmModel.generateObject({ prompt: "my-prompt", variables: { ... }, schema: MyZodSchema })
```

Cache files are stored in `books/{label}/.cache/{sha256}.json`. Changing the model, prompt wording, or schema busts the cache automatically (hash changes). This means prompt iteration is fast for unchanged pages.

---

## 12. Key Files Reference

| Purpose | File |
|---------|------|
| Pipeline DAG (single source of truth) | `packages/types/src/pipeline.ts` |
| All Zod schemas | `packages/types/src/` |
| Global pipeline config | `config.yaml` |
| LLM prompt templates | `prompts/*.liquid` |
| Rendering templates | `templates/` |
| Pipeline step implementations | `packages/pipeline/src/` |
| LLM client + caching | `packages/llm/src/client.ts` |
| Book storage interface | `packages/storage/src/storage.ts` |
| DB schema + migrations | `packages/storage/src/db.ts` |
| API entry point | `apps/api/src/app.ts` |
| API routes | `apps/api/src/routes/` |
| API stage/step runner | `apps/api/src/services/step-runner.ts` |
| Stage queue + SSE | `apps/api/src/services/stage-service.ts` |
| Frontend API client | `apps/studio/src/api/client.ts` |
| Stage/step status hook | `apps/studio/src/hooks/use-book-run.ts` |
| Stage view components | `apps/studio/src/components/pipeline/stages/` |
| Stage color + icon config | `apps/studio/src/components/pipeline/stage-config.ts` |
| Docker config | `Dockerfile`, `docker-compose.yml`, `docker/` |

---

## 13. Coding Standards

See [docs/GUIDELINES.md](./GUIDELINES.md) for the full standards reference, including:

- Code organization rules (where to put each type of code)
- Security requirements (API key handling, input validation, path traversal, SQL injection)
- Frontend patterns (TanStack Query, TanStack Router, TanStack Form, Tailwind)
- Backend patterns (Hono routes, error handling, storage operations)
- Type safety requirements (Zod schemas for all data, no `any` types)
- Testing requirements and coverage targets
- Anti-patterns to avoid (global state, direct package imports from frontend, code duplication)
- Pre-submission checklist

---

## 14. Architecture Decisions

See [docs/DECISIONS.md](./DECISIONS.md) for the full Architecture Decision Record log. Key decisions relevant to developers extending the system:

| Decision | Why it matters when extending |
|----------|-------------------------------|
| Pure JS/TS over native bindings | New dependencies must be WASM or pure JS — no `node-gyp`, no native C/C++ bindings |
| Hono for API | Lightweight, TypeScript-first — add routes with minimal boilerplate |
| TanStack ecosystem | Router, Query, Form, Table are already installed — use them; do not add competing libraries |
| Zod for all types | New data structures need Zod schemas in `packages/types/src/`; infer TS types with `z.infer<>` |
| node-sqlite3-wasm | Use the existing `Storage` interface — do not open raw SQLite connections |
| Two-level DAG pipeline | New steps go into `PIPELINE` in `packages/types/src/pipeline.ts` — everything else derives from it |
| Always-on SSE with cache-patching | SSE events update TanStack Query cache directly; no separate local state machine needed |
| Per-book queue for stage runs | Stage runs queue sequentially per book; `queueRun()` from `useBookRun()` is the only correct way to trigger runs from the UI |
