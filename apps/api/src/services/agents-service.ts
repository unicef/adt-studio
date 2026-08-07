import { createBookStorage } from "@adt/storage"
import { mirrorLayout, generateActivity } from "@adt/agents"
import type {
  LayoutMirrorResult,
  GenerateActivityResult,
  LayoutMirrorTarget,
  AgentCredentials,
  ActivityGenMode,
} from "@adt/agents"
import { loadBookConfig } from "@adt/pipeline"
import { loadStyleguideContent } from "./styleguide.js"

/**
 * Per-provider API keys forwarded from the request headers. Each provider is
 * authenticated with its own key — they are never cross-wired — so a book that
 * overrides `agents.model` to an `anthropic:` or `google:` model works as long
 * as the matching key was sent.
 */
export interface AgentApiKeys {
  openaiApiKey?: string
  anthropicApiKey?: string
  googleApiKey?: string
}

function toCredentials(keys: AgentApiKeys): AgentCredentials {
  return {
    ...(keys.openaiApiKey ? { openaiApiKey: keys.openaiApiKey } : {}),
    ...(keys.anthropicApiKey ? { anthropicApiKey: keys.anthropicApiKey } : {}),
    ...(keys.googleApiKey ? { googleApiKey: keys.googleApiKey } : {}),
  }
}

/** Model the agent prompts are tuned for. Used when a book sets no override. */
const DEFAULT_AGENT_MODEL = "openai:gpt-5.5"

/**
 * Resolve the model id for the agents from book config, falling back to a
 * sensible default. Mirrors how page-edit-service derives the editing model
 * from page_sectioning config — both are "thoughtful" LLM tasks.
 */
function resolveAgentModelId(
  label: string,
  booksDir: string,
  configPath: string | undefined,
): string {
  const config = loadBookConfig(label, booksDir, configPath)
  // Override per-book by setting `agents.model` in the book's config.yaml —
  // e.g. `openai:gpt-4o`, `anthropic:claude-sonnet-4-6`, or
  // `google:gemini-2.5-pro`. The matching provider key must be sent with the
  // request (X-OpenAI-Key / X-Anthropic-API-Key / X-Google-API-Key) or the
  // call fails to authenticate.
  return config.agents?.model ?? DEFAULT_AGENT_MODEL
}

function resolveStyleguide(
  label: string,
  booksDir: string,
  configPath: string | undefined,
): string | undefined {
  const config = loadBookConfig(label, booksDir, configPath) as Record<
    string,
    unknown
  >
  const name = typeof config.styleguide === "string" ? config.styleguide : undefined
  return loadStyleguideContent(name, configPath, booksDir, label)
}

export interface LayoutMirrorServiceOptions extends AgentApiKeys {
  label: string
  booksDir: string
  configPath?: string
  source: LayoutMirrorTarget
  targets: LayoutMirrorTarget[]
  instruction?: string
  onProgress?: (message: string) => void
}

export async function layoutMirrorService(
  options: LayoutMirrorServiceOptions,
): Promise<LayoutMirrorResult> {
  const {
    label,
    booksDir,
    configPath,
    source,
    targets,
    instruction,
    onProgress,
  } = options

  const storage = createBookStorage(label, booksDir)
  try {
    const modelId = resolveAgentModelId(label, booksDir, configPath)
    const result = await mirrorLayout({
      storage,
      bookLabel: label,
      booksDir,
      source,
      targets,
      instruction,
      modelId,
      credentials: toCredentials(options),
      onProgress,
    })

    // If every target failed, surface that as a task error rather than a
    // silent "completed". A partial-success run (some ok, some not) stays a
    // success — caller inspects `results` for per-target detail.
    const successful = result.results.filter((r) => r.ok)
    if (successful.length === 0) {
      const errors = result.results
        .map((r) => `${r.pageId}#${r.sectionIndex}: ${r.error ?? "unknown error"}`)
        .join("; ")
      throw new Error(`Layout mirror failed for all targets — ${errors}`)
    }

    return result
  } finally {
    storage.close()
  }
}

export interface GenerateActivityServiceOptions extends AgentApiKeys {
  label: string
  booksDir: string
  promptsDir: string
  configPath?: string
  anchorPageId: string
  description: string
  /** Defaults to true. When false, the UDL block is omitted from the agent's system prompt. */
  inclusiveDesign?: boolean
  /** Which write path to allow. Defaults to "auto" (the agent chooses). */
  mode?: ActivityGenMode
  /** Forwarded to the agent so per-step progress reaches the task UI. */
  onProgress?: (message: string) => void
}

export async function generateActivityService(
  options: GenerateActivityServiceOptions,
): Promise<GenerateActivityResult> {
  const {
    label,
    booksDir,
    promptsDir,
    configPath,
    anchorPageId,
    description,
    inclusiveDesign,
    mode,
    onProgress,
  } = options

  const storage = createBookStorage(label, booksDir)
  try {
    const modelId = resolveAgentModelId(label, booksDir, configPath)
    const styleguide = resolveStyleguide(label, booksDir, configPath)
    const result = await generateActivity({
      storage,
      bookLabel: label,
      booksDir,
      promptsDir,
      configPath,
      anchorPageId,
      description,
      inclusiveDesign,
      mode,
      modelId,
      styleguide,
      credentials: toCredentials(options),
      onProgress,
    })

    // The agent must call one of the create tools at least once. If it didn't
    // (model stopped early, hallucinated the work, etc.) we'd silently
    // complete the task — leaving the user looking at an unchanged page.
    // Surface the real outcome through the task error channel instead.
    if (result.touchedPageIds.length === 0) {
      const failedCalls = result.toolCalls.filter((c) => c.error)
      const detail = failedCalls.length
        ? failedCalls
            .map((c) => `${c.name}: ${c.error ?? "unknown error"}`)
            .join("; ")
        : result.text?.trim()
          ? `model said: ${result.text.trim().slice(0, 300)}`
          : `model produced no tool calls and no text (finishReason=${result.finishReason}, steps=${result.stepCount})`
      throw new Error(`Activity generation did not write any sections — ${detail}`)
    }

    // Warn if a custom section omitted activityAnswers for a section type
    // whose name implies it should have one. We don't fail the task — the
    // section is still useful — but the warning lands in the API logs so we
    // can spot prompt drift. The templated path extracts answers
    // automatically and doesn't need this check.
    for (const call of result.toolCalls) {
      if (call.name !== "createCustomSection" || call.error) continue
      const args = call.args as {
        sectionType?: string
        activityAnswers?: unknown
      }
      const isActivity =
        typeof args.sectionType === "string" &&
        args.sectionType.startsWith("activity_") &&
        args.sectionType !== "activity_open_ended_answer"
      if (isActivity && !args.activityAnswers) {
        console.warn(
          `[generate-activity] ${anchorPageId}: createCustomSection ${args.sectionType} without activityAnswers — published ADT will not grade this activity`,
        )
      }
    }

    return result
  } finally {
    storage.close()
  }
}
