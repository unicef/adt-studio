import { Hono } from "hono"
import type { Context } from "hono"
import { HTTPException } from "hono/http-exception"
import { parseBookLabel } from "@adt/types"
import {
  layoutMirrorService,
  generateActivityService,
  type AgentApiKeys,
} from "../services/agents-service.js"
import type { TaskService } from "../services/task-service.js"

/**
 * Read the per-provider API keys from the request headers. Mirrors the header
 * convention used by the stages/quizzes routes (X-OpenAI-Key,
 * X-Anthropic-API-Key, X-Google-API-Key). At least one key must be present;
 * which one is required depends on the book's configured `agents.model`, which
 * the service resolves — so we only enforce "at least one" here.
 */
function readAgentKeys(c: Context): AgentApiKeys {
  const keys: AgentApiKeys = {
    openaiApiKey: c.req.header("X-OpenAI-Key") || undefined,
    anthropicApiKey: c.req.header("X-Anthropic-API-Key") || undefined,
    googleApiKey: c.req.header("X-Google-API-Key") || undefined,
  }
  if (!keys.openaiApiKey && !keys.anthropicApiKey && !keys.googleApiKey) {
    throw new HTTPException(400, {
      message:
        "Missing API key. Set X-OpenAI-Key, X-Anthropic-API-Key, or X-Google-API-Key to match the book's configured agents.model.",
    })
  }
  return keys
}

interface LayoutMirrorRequestBody {
  source?: { pageId?: unknown; sectionIndex?: unknown }
  targets?: Array<{ pageId?: unknown; sectionIndex?: unknown }>
  instruction?: unknown
}

interface GenerateActivityRequestBody {
  anchorPageId?: unknown
  description?: unknown
  inclusiveDesign?: unknown
  mode?: unknown
}

const ACTIVITY_MODES = ["auto", "templated", "custom"] as const
type ActivityMode = (typeof ACTIVITY_MODES)[number]

function parseActivityMode(v: unknown): ActivityMode {
  return ACTIVITY_MODES.includes(v as ActivityMode) ? (v as ActivityMode) : "auto"
}

/** Max sections a single layout-mirror request may rewrite. Each target is one
 * sequential LLM call, so an unbounded list is an unbounded, uncancellable job. */
const MAX_MIRROR_TARGETS = 50
/** Max characters for free-text fields that flow into an LLM prompt. */
const MAX_TEXT_INPUT = 4000
/** Max activity/layout agent jobs running concurrently in this process. Each
 * job runs a multi-step LLM agent, so unbounded concurrency saturates the
 * process and multiplies cost. Excess requests are rejected with 429. */
const MAX_CONCURRENT_AGENT_JOBS = 4
let runningAgentJobs = 0

async function readJsonBody<T>(c: Context): Promise<T> {
  try {
    return (await c.req.json()) as T
  } catch {
    throw new HTTPException(400, { message: "Invalid JSON body" })
  }
}

/**
 * Reserve a concurrency slot (throwing 429 if the cap is reached) and wrap the
 * executor so the slot is released when it settles. The check + increment run
 * synchronously (no await between), so concurrent requests can't over-commit.
 */
function gateAgentJob(
  run: (emitProgress?: (msg: string, percent?: number) => void) => Promise<unknown>,
): (emitProgress?: (msg: string, percent?: number) => void) => Promise<unknown> {
  if (runningAgentJobs >= MAX_CONCURRENT_AGENT_JOBS) {
    throw new HTTPException(429, {
      message:
        "Too many activity/layout agent jobs are running. Wait for one to finish and try again.",
    })
  }
  runningAgentJobs++
  return async (emitProgress) => {
    try {
      return await run(emitProgress)
    } finally {
      runningAgentJobs--
    }
  }
}

function parseTarget(v: {
  pageId?: unknown
  sectionIndex?: unknown
}): { pageId: string; sectionIndex: number } {
  if (typeof v?.pageId !== "string" || !v.pageId) {
    throw new HTTPException(400, { message: "Missing or invalid pageId" })
  }
  const idx =
    typeof v.sectionIndex === "number"
      ? v.sectionIndex
      : parseInt(String(v.sectionIndex ?? ""), 10)
  if (!Number.isFinite(idx) || idx < 0) {
    throw new HTTPException(400, {
      message: `Missing or invalid sectionIndex for page ${v.pageId}`,
    })
  }
  return { pageId: v.pageId, sectionIndex: idx }
}

export function createAgentRoutes(
  booksDir: string,
  promptsDir: string,
  configPath?: string,
  taskService?: TaskService,
): Hono {
  const app = new Hono()

  // POST /books/:label/agents/layout-mirror
  //
  // Body: { source: { pageId, sectionIndex }, targets: [{ pageId, sectionIndex }, ...], instruction?: string }
  //
  // Rewrites every target section's HTML to mirror the source section's layout
  // while preserving the target's content and data-ids. Each successful target
  // gets a new web-rendering version.
  app.post("/books/:label/agents/layout-mirror", async (c) => {
    const { label } = c.req.param()
    const safeLabel = parseBookLabel(label)

    const apiKeys = readAgentKeys(c)

    const body = await readJsonBody<LayoutMirrorRequestBody>(c)
    if (!body.source) {
      throw new HTTPException(400, { message: "Missing source" })
    }
    const source = parseTarget(body.source)

    if (!Array.isArray(body.targets) || body.targets.length === 0) {
      throw new HTTPException(400, { message: "Missing targets" })
    }
    if (body.targets.length > MAX_MIRROR_TARGETS) {
      throw new HTTPException(400, {
        message: `Too many targets (${body.targets.length}); max ${MAX_MIRROR_TARGETS} per request.`,
      })
    }
    const targets = body.targets.map(parseTarget)

    const instruction =
      typeof body.instruction === "string" ? body.instruction : undefined
    if (instruction && instruction.length > MAX_TEXT_INPUT) {
      throw new HTTPException(400, {
        message: `instruction is too long (max ${MAX_TEXT_INPUT} characters).`,
      })
    }

    const run = gateAgentJob((emitProgress) =>
      layoutMirrorService({
        label: safeLabel,
        booksDir,
        configPath,
        source,
        targets,
        instruction,
        ...apiKeys,
        onProgress: emitProgress
          ? (message: string) => emitProgress(message)
          : undefined,
      }),
    )

    if (taskService) {
      const targetsLabel = targets
        .map((t) => `${t.pageId}#${t.sectionIndex}`)
        .join(", ")
      const desc = `Mirroring layout from ${source.pageId}#${source.sectionIndex} onto ${targetsLabel}`
      const { taskId } = taskService.submitTask(
        safeLabel,
        "layout-mirror",
        desc,
        run,
        {
          pageId: targets[0].pageId,
          url: `/books/${safeLabel}/storyboard/${targets[0].pageId}`,
        },
      )
      return c.json({ taskId, status: "submitted" })
    }

    const result = await run()
    return c.json(result)
  })

  // POST /books/:label/agents/generate-activity
  //
  // Body: { anchorPageId: string, description: string }
  //
  // Runs the generative agent against the anchor page. The agent may read any
  // page but only writes to the anchor — it creates exactly one new section.
  app.post("/books/:label/agents/generate-activity", async (c) => {
    const { label } = c.req.param()
    const safeLabel = parseBookLabel(label)

    const apiKeys = readAgentKeys(c)

    const body = await readJsonBody<GenerateActivityRequestBody>(c)
    if (typeof body.anchorPageId !== "string" || !body.anchorPageId) {
      throw new HTTPException(400, { message: "Missing anchorPageId" })
    }
    if (typeof body.description !== "string" || !body.description.trim()) {
      throw new HTTPException(400, { message: "Missing description" })
    }
    if (body.description.length > MAX_TEXT_INPUT) {
      throw new HTTPException(400, {
        message: `description is too long (max ${MAX_TEXT_INPUT} characters).`,
      })
    }
    const anchorPageId = body.anchorPageId
    const description = body.description
    // Default-on. Only honor an explicit `false`; any other value (missing,
    // null, non-boolean) leaves the inclusive-design block in the prompt.
    const inclusiveDesign = body.inclusiveDesign !== false
    // Defaults to "auto"; an unknown value falls back to "auto" too.
    const mode = parseActivityMode(body.mode)

    const run = gateAgentJob((emitProgress) =>
      generateActivityService({
        label: safeLabel,
        booksDir,
        promptsDir,
        configPath,
        anchorPageId,
        description,
        inclusiveDesign,
        mode,
        ...apiKeys,
        onProgress: emitProgress
          ? (message: string) => emitProgress(message)
          : undefined,
      }),
    )

    if (taskService) {
      const desc = `Generating activity on ${anchorPageId}`
      const { taskId } = taskService.submitTask(
        safeLabel,
        "generate-activity",
        desc,
        run,
        {
          pageId: anchorPageId,
          url: `/books/${safeLabel}/storyboard/${anchorPageId}`,
        },
      )
      return c.json({ taskId, status: "submitted" })
    }

    const result = await run()
    return c.json(result)
  })

  return app
}
