# Guidelines for ADT Studio

This document provides comprehensive guidelines for AI coding agents working on the ADT Studio codebase. It enforces architectural consistency, security best practices, and frontend development standards.

---

## Table of Contents

1. [Core Principles](#core-principles)
2. [Architecture Overview](#architecture-overview)
3. [Code Organization](#code-organization)
4. [Security Requirements](#security-requirements)
5. [Frontend Development](#frontend-development)
6. [Backend Development](#backend-development)
7. [Type Safety & Validation](#type-safety--validation)
8. [Testing Requirements](#testing-requirements)
9. [Common Patterns](#common-patterns)
10. [Anti-Patterns to Avoid](#anti-patterns-to-avoid)
11. [Checklist Before Submitting](#checklist-before-submitting)

---

## Core Principles

### CRITICAL: Read Before Any Code Change

These principles are non-negotiable and must guide every decision:


1. **Book Level Storage**: All book data must be isolated to a single directory that can be zipped and shared. Never store book-specific data outside the book's directory.

2. **Entity Level Versioning**: NEVER overwrite entities. Always create new versions with incremented version numbers. Users must be able to roll back.

3. **LLM Level Caching**: Cache at the LLM call level only. Hash all ordered inputs to create cache keys. Pipeline reruns should be fast if parameters unchanged.

4. **Maximum Transparency**: All LLM calls, prompts, and responses must be inspectable by users. No black boxes.

5. **Minimize Dependencies**: If you can avoid adding a new dependency, do so. Flat files > database when sufficient. In-memory queues > external queue services.

6. **Pure JS/TS Over Native**: Always prefer pure JavaScript/TypeScript or WASM-based libraries over native C/C++ bindings. Native bindings break cross-platform builds, complicate CI, and conflict with desktop packaging. If a native binding is the only option, document why.

---

## Architecture Overview

### Monorepo Structure

```
adt/
├── packages/           # Shared libraries (MUST be reused)
│   ├── types/         # Zod schemas - ALL types defined here
│   ├── pipeline/      # Extraction & generation - pure functions
│   ├── llm/           # LLM client, prompts, caching, cost tracking
│   ├── pdf/           # PDF extraction only
│   └── output/        # Bundle packaging only
│
├── apps/              # Application tier
│   ├── api/           # Hono HTTP server
│   ├── studio/        # React SPA (Vite)
│   └── desktop/       # Tauri v2 desktop wrapper (sidecar architecture)
│
├── templates/         # Layout templates
├── config/            # Global configuration
└── docs/              # Architecture documentation
```

### Layer Dependencies

```
┌─────────────────────────────────────────────────────────┐
│                    apps/studio (React)                   │
│                    apps/desktop (TBD)                    │
└─────────────────────────┬───────────────────────────────┘
                          │ HTTP only
                          ▼
┌─────────────────────────────────────────────────────────┐
│                     apps/api (Hono)                      │
└─────────────────────────┬───────────────────────────────┘
                          │ Direct imports
                          ▼
┌─────────────────────────────────────────────────────────┐
│  packages/pipeline  │  packages/llm  │  packages/output  │
└─────────────────────────┬───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│           packages/types  │  packages/pdf               │
└─────────────────────────────────────────────────────────┘
```

**RULE**: Frontend apps MUST NOT import directly from packages. All data flows through the API.

**Exception**: `@adt/types` may be imported by the studio app for the shared `PIPELINE` definition and derived constants (stage/step names, ordering). No business logic — only type-level and constant data.

---

## Code Organization

### Where to Put New Code

| Type of Code | Location | Notes |
|--------------|----------|-------|
| Zod schemas, TypeScript interfaces | `packages/types/src/` | Export from index.ts |
| LLM prompts, calls, caching | `packages/llm/src/` | Use existing client |
| PDF extraction logic | `packages/pdf/src/` | Pure functions |
| Pipeline step implementations | `packages/pipeline/src/` | Pure functions, one file per step |
| Pipeline definition (stages/steps/DAG) | `packages/types/src/pipeline.ts` | Single source of truth |
| Bundle/export logic | `packages/output/src/` | Archive creation |
| API endpoints | `apps/api/src/index.ts` | Hono routes |
| React components | `apps/studio/src/components/` | Reuse existing |
| React pages | `apps/studio/src/pages/` | One per route |
| API client methods | `apps/studio/src/api/client.ts` | Single file |
| Utility functions | Within relevant package | Not a utils folder |

### File Naming Conventions

```
kebab-case.ts          # All source files
kebab-case.test.ts     # Test files (co-located)
ComponentName.tsx      # React components (PascalCase)
```

### Import Order (Enforced)

```typescript
// 1. Node built-ins
import { readFile } from "fs/promises"
import path from "path"

// 2. External dependencies
import { z } from "zod"
import { Hono } from "hono"

// 3. Internal packages (workspace)
import { PipelineConfig } from "@adt/types"
import { createLLMClient } from "@adt/llm"

// 4. Relative imports (current package)
import { localHelper } from "./helpers.js"
```

---

## Security Requirements

### API Key Handling

**NEVER**:
- Log API keys to console or files
- Include API keys in error messages
- Store API keys in git, localStorage on web without encryption consideration
- Send API keys in URL parameters
- Expose API keys in client-side bundle

**ALWAYS**:
```typescript
// Correct: Header-based authentication
const key = c.req.header("X-OpenAI-Key")

// Correct: Environment variable (desktop sidecar)
const key = process.env["OPENAI_API_KEY"]

// Correct: Validate before use
function requireOpenAIKey(c: Context): string {
  const key = getOpenAIKey(c)
  if (!key) {
    throw new HTTPException(401, {
      message: "OpenAI API key required. Set it in Settings."
    })
  }
  return key
}
```

### Input Validation

**ALL user input MUST be validated with Zod**:

```typescript
// CORRECT: Validate with Zod schema
const CreateJobSchema = z.object({
  name: z.string().min(1).max(255),
  pdfPath: z.string(),
  config: PipelineConfig.optional()
})

app.post("/jobs", async (c) => {
  const body = await c.req.json()
  const result = CreateJobSchema.safeParse(body)

  if (!result.success) {
    throw new HTTPException(400, {
      message: `Validation error: ${result.error.message}`
    })
  }

  // Use result.data - guaranteed to be valid
  const job = await createJob(result.data)
  return c.json(job)
})
```

### Path Traversal Prevention

```typescript
// NEVER: Direct path concatenation
const filePath = `${baseDir}/${userInput}`  // VULNERABLE

// ALWAYS: Validate and normalize paths
import path from "path"

function getSafePath(baseDir: string, userPath: string): string {
  const normalized = path.normalize(userPath)
  const resolved = path.resolve(baseDir, normalized)

  // Ensure resolved path is within baseDir
  if (!resolved.startsWith(path.resolve(baseDir))) {
    throw new Error("Path traversal attempt detected")
  }

  return resolved
}
```

### SQL Injection Prevention

```typescript
// NEVER: String concatenation in SQL
db.prepare(`SELECT * FROM entities WHERE id = '${id}'`)  // VULNERABLE

// ALWAYS: Parameterized queries
db.prepare("SELECT * FROM entities WHERE id = ?").get(id)
```

### XSS Prevention

```typescript
// NEVER: Render raw HTML from user input
<div dangerouslySetInnerHTML={{ __html: userContent }} />  // VULNERABLE

// ALWAYS: Sanitize if HTML rendering is required
import DOMPurify from "dompurify"
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(userContent) }} />

// PREFER: Text content (React auto-escapes)
<div>{userContent}</div>  // Safe by default
```

### CORS Configuration

```typescript
// Only for development or controlled environments
app.use("*", cors({
  origin: ["http://localhost:5173"],  // Explicit origins
  credentials: true
}))

// NEVER: Allow all origins in production
app.use("*", cors({ origin: "*" }))  // DANGEROUS
```

---

## Frontend Development

### Component Structure

```typescript
// Standard component template using TanStack
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useParams, Link } from "@tanstack/react-router"
import { api } from "../api/client"
import type { Job } from "@adt/types"

interface ComponentNameProps {
  onSave?: (job: Job) => void
}

export default function ComponentName({ onSave }: ComponentNameProps) {
  // 1. Router hooks
  const navigate = useNavigate()
  const { id } = useParams({ strict: false })
  const queryClient = useQueryClient()

  // 2. Data fetching via TanStack Query
  const { data } = useSuspenseQuery({
    queryKey: ["job", id],
    queryFn: () => api.getJob(id!),
    enabled: !!id,
  })

  // 3. Mutations
  const updateMutation = useMutation({
    mutationFn: (job: Job) => api.updateJob(job.id, job),
    onSuccess: (_, job) => {
      queryClient.invalidateQueries({ queryKey: ["job", job.id] })
      onSave?.(job)
    },
  })

  // 4. Event handlers
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!data) return
    updateMutation.mutate(data)
  }

  // 5. Main render (loading/error handled by TanStack Query + ErrorBoundary)
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {updateMutation.error && (
        <div className="p-4 text-red-700 bg-red-100 rounded-lg">
          {updateMutation.error.message}
        </div>
      )}
      {/* Component JSX */}
    </form>
  )
}
```

### State Management Rules

**DO**:
- Use **TanStack Query** for all server state (fetching, caching, mutations)
- Use local `useState` for UI-only state (modals, form inputs, toggles)
- Use TanStack Query's `refetchInterval` for real-time polling
- Use TanStack Query's optimistic updates via `onMutate`

**DON'T**:
- Add Redux, Zustand, or other state management libraries
- Create global state stores
- Use raw `useEffect` for data fetching — use TanStack Query instead
- Use `fetch()` directly — go through the API client + Query

```typescript
// CORRECT: Polling with TanStack Query
const { data: jobs } = useQuery({
  queryKey: ["jobs"],
  queryFn: () => api.getJobs(),
  refetchInterval: 5000,  // Auto-poll every 5 seconds
})

// CORRECT: Optimistic update with TanStack Query
const queryClient = useQueryClient()

const deleteMutation = useMutation({
  mutationFn: (id: string) => api.deleteJob(id),
  onMutate: async (id) => {
    await queryClient.cancelQueries({ queryKey: ["jobs"] })
    const previous = queryClient.getQueryData<Job[]>(["jobs"])
    queryClient.setQueryData<Job[]>(["jobs"], (old) =>
      old?.filter((j) => j.id !== id)
    )
    return { previous }
  },
  onError: (_err, _id, context) => {
    queryClient.setQueryData(["jobs"], context?.previous)  // Rollback
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ["jobs"] })
  },
})
```

### Layout & Visual Balance

All screens must follow these layout principles:

**Grid symmetry**: When using multi-column grids, cards in the same row MUST stretch to equal heights (`items-stretch`, the flexbox/grid default). Never leave one card short beside a tall one.

**No orphan whitespace**: Every region of the viewport should be intentionally used. If a card has less content than its neighbor, either:
- Merge the smaller content into the larger card as a section
- Use a single-column layout instead
- Redistribute content so columns are roughly balanced

**Consistent spacing**: Use one spacing scale throughout a page — don't mix `gap-4` and `gap-6` on the same level. Standard gaps: `gap-4` between cards, `gap-6` for page-level sections, `p-4` inside cards, `p-6` for page padding.

**Full-width by default**: Page content should use the full available width. Only constrain width (`max-w-*`) for text-heavy forms or reading content. Dashboard-style pages, detail pages with data panels, and grids should go edge-to-edge.

**Balanced columns**: In a 2-column layout, prefer `grid-cols-2` (50/50) unless content clearly demands asymmetry. In a 3-column layout, use `grid-cols-3` (33/33/33). Avoid odd splits like 1/3 + 2/3 unless one column is a sidebar.

**Card consistency**: Cards at the same hierarchy level should use the same padding, border radius, and header style. Don't mix `CardHeader` sizes or omit borders on some cards.

**No scrolling when content fits**: If content can fit on screen by using available width, lay it out that way instead of stacking vertically and scrolling. Horizontal space is cheaper than vertical scroll.

### Styling with Tailwind

**ALWAYS use Tailwind utility classes**:

```typescript
// CORRECT: Tailwind utilities
<div className="flex items-center justify-between p-4 bg-white rounded-lg shadow">
  <h2 className="text-lg font-semibold text-gray-900">Title</h2>
  <button className="px-4 py-2 text-white bg-blue-600 rounded hover:bg-blue-700">
    Action
  </button>
</div>

// CORRECT: Conditional classes with clsx
import clsx from "clsx"

<div className={clsx(
  "p-4 rounded-lg",
  isActive && "bg-blue-100 border-blue-500",
  isError && "bg-red-100 border-red-500",
  !isActive && !isError && "bg-gray-100"
)}>
```

**NEVER**:
- Create CSS modules
- Use styled-components or CSS-in-JS
- Add inline styles (except for dynamic values)
- Create custom CSS files

### API Client Usage

**All API calls go through `apps/studio/src/api/client.ts`**:

```typescript
// CORRECT: Use the api client
import { api } from "../api/client"

const jobs = await api.getJobs()
const job = await api.createJob({ name, pdfPath, config })
await api.deleteJob(id)

// Adding a new endpoint? Add it to client.ts:
export const api = {
  // ... existing methods

  newEndpoint: async (data: NewType): Promise<ResponseType> => {
    return request<ResponseType>("/new-endpoint", {
      method: "POST",
      body: JSON.stringify(data)
    })
  }
}
```

**NEVER**:
- Call fetch() directly in components
- Create separate API modules per feature
- Duplicate request logic

### Component Reuse Requirements

**Before creating a new component**:

1. Check if a similar component exists in `apps/studio/src/components/`
2. Check if the component can be composed from existing components
3. If creating new, ensure it's generic enough for reuse

**Existing components to reuse**:
- `Layout.tsx` - Main app layout with navigation
- `SettingsModal.tsx` - Modal for settings/configuration

```typescript
// PREFER: Composition over new components
<div className="card">  {/* Use utility classes, not new component */}
  <CardHeader />
  <CardBody />
</div>

// AVOID: Creating near-duplicate components
// Bad: JobCard.tsx, BookCard.tsx, TemplateCard.tsx (with 90% same code)
// Good: Card.tsx with props for customization
```

### Error Handling in UI

```typescript
// CORRECT: Consistent error handling pattern
const [error, setError] = useState<string | null>(null)

const handleAction = async () => {
  try {
    setError(null)
    await api.action()
  } catch (err) {
    const message = err instanceof Error ? err.message : "An error occurred"
    setError(message)
    // Log for debugging but don't expose internals to user
    console.error("Action failed:", err)
  }
}

// Display errors consistently
{error && (
  <div className="p-4 text-red-700 bg-red-100 rounded-lg">
    {error}
  </div>
)}
```

### Navigation (TanStack Router)

```typescript
// CORRECT: TanStack Router navigation (type-safe)
import { useNavigate, Link } from "@tanstack/react-router"

function Component() {
  const navigate = useNavigate()

  // Programmatic navigation (type-safe)
  const handleClick = () => {
    navigate({ to: "/jobs/$id", params: { id } })
  }

  // Declarative navigation (type-safe)
  return <Link to="/jobs/$id" params={{ id }}>View Job</Link>
}
```

### Forms (TanStack Form)

```typescript
// CORRECT: TanStack Form with Zod validation
import { useForm } from "@tanstack/react-form"
import { zodValidator } from "@tanstack/zod-form-adapter"
import { CreateJobSchema } from "@adt/types"

function CreateJobForm() {
  const form = useForm({
    defaultValues: { name: "", pdfPath: "" },
    validatorAdapter: zodValidator(),
    validators: { onChange: CreateJobSchema },
    onSubmit: async ({ value }) => {
      await api.createJob(value)
    },
  })

  return (
    <form onSubmit={(e) => { e.preventDefault(); form.handleSubmit() }}>
      <form.Field name="name" children={(field) => (
        <input
          value={field.state.value}
          onChange={(e) => field.handleChange(e.target.value)}
          className="border rounded px-3 py-2"
        />
      )} />
    </form>
  )
}
```

### Tables (TanStack Table)

```typescript
// CORRECT: TanStack Table — headless, bring your own UI
import { useReactTable, getCoreRowModel, flexRender } from "@tanstack/react-table"

const table = useReactTable({
  data: jobs,
  columns,
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  getPaginationRowModel: getPaginationRowModel(),
})
```

---

## Backend Development

### API Endpoint Structure

```typescript
// Standard endpoint pattern
app.post("/resource", async (c) => {
  // 1. Authentication
  const apiKey = requireOpenAIKey(c)

  // 2. Input validation
  const body = await c.req.json()
  const result = RequestSchema.safeParse(body)
  if (!result.success) {
    throw new HTTPException(400, {
      message: `Validation error: ${result.error.message}`
    })
  }

  // 3. Business logic (delegate to service/package)
  const resource = await createResource(result.data, apiKey)

  // 4. Response
  return c.json(resource, 201)
})
```

### Error Handling

```typescript
// Use HTTPException for API errors
import { HTTPException } from "hono/http-exception"

// 400 - Bad Request (validation errors)
throw new HTTPException(400, { message: "Invalid input" })

// 401 - Unauthorized
throw new HTTPException(401, { message: "API key required" })

// 404 - Not Found
throw new HTTPException(404, { message: "Job not found" })

// 500 - Internal Error (let unexpected errors propagate)
// Don't catch and re-throw as 500 unless adding context
```

### Storage Operations

```typescript
// ALWAYS use the storage module with locking
import { withLock, loadJobs, saveJobs } from "./storage"

// CORRECT: Atomic read-modify-write
await withLock(async () => {
  const jobs = await loadJobs()
  jobs.push(newJob)
  await saveJobs(jobs)
})

// NEVER: Read and write without lock
const jobs = await loadJobs()  // Another process could modify here
jobs.push(newJob)
await saveJobs(jobs)  // Could overwrite other changes
```

### Database Operations (SQLite via WASM)

```typescript
// Use node-sqlite3-wasm — pure WASM, no native bindings
import { DatabaseSync } from "node-sqlite3-wasm"

const db = new DatabaseSync(dbPath)

// CORRECT: Parameterized query
const stmt = db.prepare(`
  SELECT * FROM versions
  WHERE resource_type = ? AND resource_id = ?
  ORDER BY created_at DESC
`)
const versions = stmt.all(resourceType, resourceId)

// CORRECT: Transactions for multiple operations
db.exec("BEGIN")
try {
  const insert = db.prepare("INSERT INTO items (id, data) VALUES (?, ?)")
  for (const item of items) {
    insert.run(item.id, JSON.stringify(item.data))
  }
  db.exec("COMMIT")
} catch (err) {
  db.exec("ROLLBACK")
  throw err
}

// IMPORTANT: Always close the database when done to prevent memory leaks
db.close()
```

### Pipeline Architecture (Stage / Step Model)

The pipeline is organized as a **two-level DAG** defined in `packages/types/src/pipeline.ts`:

- **Stages** — High-level groupings visible in the UI (Extract, Storyboard, Quizzes, Captions, Glossary, Text & Speech, Package). Stages have inter-stage dependencies.
- **Steps** — Atomic processing operations within a stage (e.g., `image-filtering`, `page-sectioning`). Steps have intra-stage dependencies and can run in parallel when dependencies are met.

The `PIPELINE` constant is the **single source of truth**. All ordering, groupings, labels, and dependency graphs are derived from it. Never hardcode step/stage ordering elsewhere.

```typescript
// Derived lookups available from @adt/types:
import { PIPELINE, STAGE_ORDER, STEP_TO_STAGE, STAGE_BY_NAME, ALL_STEP_NAMES } from "@adt/types"
import type { StepName, StageName } from "@adt/types"
```

Key files:
- `packages/types/src/pipeline.ts` — Pipeline definition and derived lookups
- `packages/pipeline/src/dag.ts` — Generic DAG runner
- `packages/pipeline/src/pipeline-dag.ts` — Pipeline-specific DAG executor
- `apps/api/src/services/step-runner.ts` — API-side stage runners
- `apps/studio/src/components/v2/StageRunCard.tsx` — UI card (sub-steps derived from PIPELINE)
- `apps/studio/src/components/v2/stages/` — Per-stage view components

### Pipeline Functions

```typescript
// Pipeline functions MUST be pure
// - No side effects
// - Same input = same output
// - All dependencies passed as parameters

// CORRECT: Pure pipeline function
export async function classifyText(
  text: string,
  options: ClassifyOptions,
  llmClient: LLMClient
): Promise<Classification> {
  const prompt = buildClassificationPrompt(text, options)
  const result = await llmClient.complete(prompt)
  return parseClassification(result)
}

// WRONG: Side effects, hidden dependencies
export async function classifyText(text: string) {
  const options = globalConfig.classification  // Hidden dependency
  console.log("Classifying:", text)  // Side effect
  const result = await globalLLMClient.complete(...)  // Hidden dependency
  saveToCache(result)  // Side effect
  return result
}
```

---

## Type Safety & Validation

### Zod Schema Requirements

**ALL data structures MUST have Zod schemas in `packages/types`**:

```typescript
// packages/types/src/job.ts
import { z } from "zod"

export const JobStatus = z.enum(["pending", "processing", "completed", "failed"])
export type JobStatus = z.infer<typeof JobStatus>

export const Job = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  status: JobStatus,
  pdfPath: z.string(),
  outputDir: z.string(),
  config: PipelineConfig,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
})
export type Job = z.infer<typeof Job>

// Export from index.ts
export { Job, JobStatus } from "./job.js"
```

### Validation Patterns

```typescript
// API input validation
const result = Schema.safeParse(input)
if (!result.success) {
  // Handle validation error
  throw new HTTPException(400, {
    message: result.error.issues.map(i => i.message).join(", ")
  })
}
// Use result.data (typed correctly)

// Configuration with defaults
const config = PipelineConfig.parse(userConfig)  // Applies defaults

// Type guards
if (Job.safeParse(data).success) {
  // data is Job
}
```

### Type Inference

```typescript
// CORRECT: Infer types from schemas
export const Job = z.object({ ... })
export type Job = z.infer<typeof Job>

// WRONG: Duplicate type definitions
export interface Job { ... }  // Don't duplicate!
export const JobSchema = z.object({ ... })
```

---

## Testing Requirements

### Test File Location

```
packages/types/src/config.ts       # Source
packages/types/src/config.test.ts  # Test (co-located)
```

### Unit Test Structure

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest"
import { functionToTest } from "./module.js"

describe("functionToTest", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should handle valid input", () => {
    const result = functionToTest(validInput)
    expect(result).toEqual(expectedOutput)
  })

  it("should throw on invalid input", () => {
    expect(() => functionToTest(invalidInput)).toThrow("Expected error message")
  })

  it("should apply defaults", () => {
    const result = functionToTest({})
    expect(result.optionalField).toBe("default")
  })
})
```

### What to Test

**MUST test**:
- Zod schema validation (valid/invalid inputs, defaults)
- Pure pipeline functions (input -> output)
- API endpoint request/response validation
- Error handling paths
- Edge cases (empty arrays, null values, etc.)

**SHOULD test**:
- React component rendering
- User interactions
- API client methods

**Coverage targets**:
- `packages/*`: 80% minimum
- `apps/api`: 70% minimum
- `apps/studio`: 50% minimum (UI testing is harder)

### Mocking

```typescript
// Mock LLM calls for tests
vi.mock("@adt/llm", () => ({
  createLLMClient: () => ({
    complete: vi.fn().mockResolvedValue("mocked response")
  })
}))

// Mock file system
vi.mock("fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue("file contents"),
  writeFile: vi.fn().mockResolvedValue(undefined)
}))
```

---

## Common Patterns

### Entity Versioning

```typescript
// ALWAYS create new versions, NEVER overwrite
interface VersionedEntity {
  id: string           // Unique entity ID
  version: number      // Incrementing version
  data: unknown        // Entity-specific data
  createdAt: string    // ISO timestamp
  createdBy?: string   // User or "system"
  inputVersions?: Record<string, number>  // Dependencies
}

// Creating a new version
async function saveNewVersion(
  db: Database,
  entityId: string,
  data: unknown,
  createdBy?: string
): Promise<VersionedEntity> {
  const current = await getLatestVersion(db, entityId)
  const newVersion = (current?.version ?? 0) + 1

  const entity: VersionedEntity = {
    id: entityId,
    version: newVersion,
    data,
    createdAt: new Date().toISOString(),
    createdBy
  }

  await insertVersion(db, entity)
  return entity
}
```

### LLM Call Caching

```typescript
// All LLM calls go through the cached client
import { createCachedLLMClient } from "@adt/llm"

const client = createCachedLLMClient({
  apiKey,
  cacheDir: path.join(bookDir, ".cache")
})

// Cache key is hash of: model + prompt + all parameters
const result = await client.complete({
  model: "gpt-4o",
  messages: [...],
  temperature: 0  // Must be deterministic for caching
})
```

### Progress Reporting

Pipeline progress uses a `ProgressEvent` discriminated union streamed via SSE. Events are emitted per-step (not per-stage):

```typescript
// ProgressEvent types (defined in @adt/types):
// - step-start:    { step: StepName }
// - step-progress: { step: StepName, page, totalPages }
// - step-complete: { step: StepName }
// - step-error:    { step: StepName, error }

// The DAG runner emits these automatically as steps execute.
// The UI maps step events to their parent stage via STEP_TO_STAGE.
```

### Platform Detection

```typescript
// Detect desktop vs Web environment
export function isDesktop(): boolean {
  // Tauri
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) return true
  // Electron
  if (typeof window !== "undefined" && "electronAPI" in window) return true
  return false
}

// Use for platform-specific behavior
const apiBase = isDesktop() ? "http://localhost:3000/api" : "/api"
```

---

## Anti-Patterns to Avoid

### Code Duplication

```typescript
// WRONG: Duplicating logic
// In file1.ts
const validateJob = (job) => { ... }

// In file2.ts
const checkJob = (job) => { ... }  // Same logic, different name!

// CORRECT: Single source of truth
// In packages/types/src/job.ts
export const Job = z.object({ ... })
// Use Job.parse() or Job.safeParse() everywhere
```

**Pipeline topology is especially prone to duplication.** Stage ordering, step groupings, step-to-stage mappings, and dependency graphs must all be derived from the `PIPELINE` constant in `@adt/types`. Never hardcode these in the API, UI, or CLI.

### Bypassing the API

```typescript
// WRONG: Direct package import in frontend
import { runPipeline } from "@adt/pipeline"  // NO!

// CORRECT: Always go through API
import { api } from "../api/client"
await api.createJob({ ... })
```

### Global State

```typescript
// WRONG: Global mutable state
let currentJob: Job | null = null
export function setCurrentJob(job: Job) { currentJob = job }

// CORRECT: Component-local state or pass as parameters
const [currentJob, setCurrentJob] = useState<Job | null>(null)
```

### Hardcoded Values

```typescript
// WRONG: Hardcoded configuration
const MODEL = "gpt-4o"
const MAX_TOKENS = 4096

// CORRECT: Use configuration
import { PipelineConfig } from "@adt/types"
const config = PipelineConfig.parse(userConfig)
const model = config.defaultModel
```

### Silent Error Swallowing

```typescript
// WRONG: Silent catch
try {
  await riskyOperation()
} catch {
  // Silently ignored!
}

// CORRECT: Handle or rethrow
try {
  await riskyOperation()
} catch (err) {
  console.error("Operation failed:", err)
  throw err  // Or handle appropriately
}
```

### Unnecessary Abstraction

```typescript
// WRONG: Over-engineering
class JobManagerFactory {
  createJobManager(config: Config): JobManager { ... }
}

class JobManager {
  constructor(private repository: JobRepository) {}
  async create(data: JobData): Promise<Job> { ... }
}

// CORRECT: Simple functions
export async function createJob(data: JobData): Promise<Job> {
  const job = { id: crypto.randomUUID(), ...data }
  await saveJob(job)
  return job
}
```

### Adding Dependencies Without Justification

Before adding ANY new dependency:
1. Check if functionality exists in Node.js built-ins
2. Check if existing dependencies provide the functionality
3. Justify the addition with clear benefits
4. Prefer smaller, focused packages over large frameworks

---

## Checklist Before Submitting

### Code Quality

- [ ] TypeScript strict mode passes (`pnpm typecheck`)
- [ ] No `any` types (use `unknown` if truly unknown)
- [ ] All new types have Zod schemas in `packages/types`
- [ ] No console.log in production code (use proper logging)
- [ ] No commented-out code
- [ ] No TODO comments without linked issues

### Security

- [ ] All user input validated with Zod
- [ ] No API keys logged or exposed
- [ ] No hardcoded secrets or credentials
- [ ] Path traversal prevention for file operations
- [ ] Parameterized queries for all SQL
- [ ] No `dangerouslySetInnerHTML` without sanitization

### Architecture

- [ ] Code placed in correct package/app
- [ ] No direct package imports in frontend
- [ ] Reused existing components/utilities
- [ ] Pure functions for pipeline logic
- [ ] Entity versioning (no overwrites)
- [ ] LLM calls go through cached client

### Testing

- [ ] Tests written for new functionality
- [ ] Tests pass (`pnpm test`)
- [ ] Coverage maintained or improved

### Frontend

- [ ] Used Tailwind utilities only (no custom CSS)
- [ ] Error states handled and displayed
- [ ] Loading states for async operations
- [ ] API calls through `api/client.ts` + TanStack Query
- [ ] No new state management libraries
- [ ] Pure JS/TS dependencies only — no native C/C++ bindings

### Documentation

- [ ] Complex logic has explanatory comments
- [ ] Public APIs have JSDoc comments
- [ ] README updated if new features added

---

## Quick Reference

### Commands

```bash
# Install dependencies
pnpm install

# Run development servers
pnpm dev

# Type checking
pnpm typecheck

# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Build all packages
pnpm build

# Lint
pnpm lint
```

### Key Files

| Purpose | Location |
|---------|----------|
| Pipeline definition (stages/steps) | `packages/types/src/pipeline.ts` |
| API routes | `apps/api/src/routes/` |
| API client | `apps/studio/src/api/client.ts` |
| Type schemas | `packages/types/src/` |
| Pipeline step implementations | `packages/pipeline/src/` |
| DAG runner | `packages/pipeline/src/dag.ts` |
| API stage runners | `apps/api/src/services/step-runner.ts` |
| LLM client | `packages/llm/src/client.ts` |
| Stage view components | `apps/studio/src/components/v2/stages/` |
| Global config | `config/` |
| Templates | `templates/` |

### Common Imports

```typescript
// Types
import { Job, PipelineConfig, BundleConfig } from "@adt/types"

// API client (frontend)
import { api } from "../api/client"

// LLM (backend)
import { createLLMClient, createCostTracker } from "@adt/llm"

// Validation
import { z } from "zod"

// Routing (frontend)
import { useNavigate, useParams, Link } from "@tanstack/react-router"

// Data fetching (frontend)
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

// Forms (frontend)
import { useForm } from "@tanstack/react-form"

// Tables (frontend)
import { useReactTable, getCoreRowModel } from "@tanstack/react-table"

// HTTP errors (backend)
import { HTTPException } from "hono/http-exception"
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | 2025-02-04 | Initial comprehensive guidelines |
