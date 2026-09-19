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
import { getDefaultProviderRegistry } from "@adt/llm"
import { safeParseModelId } from "@adt/types"
import { loadStyleguideContent } from "./styleguide.js"

/**
 * Request-scoped credentials for every registered provider. Each provider is
 * authenticated with its own values — they are never cross-wired — so a book
 * that overrides `agents.model` to any provider works as long as that
 * provider's credentials were sent or configured on the server.
 */
export interface AgentCredentialOptions {
  credentials: AgentCredentials
}

/**
 * Model the agent prompts are tuned for. Used when neither `agents.model` nor
 * the default model's provider can pick one. The /providers route advertises
 * the same resolution chain so UI availability gates on the provider that
 * will actually run.
 */
export const DEFAULT_AGENT_MODEL = "openai:gpt-5.5"

/**
 * The agent model a `default_model` implies when `agents.model` is unset:
 * the same provider's declared agent default. A user who configured only a
 * Gemini or Anthropic key (with a matching default model) gets working agent
 * features instead of a hidden button demanding an OpenAI key. Providers that
 * cannot run the agent loop (e.g. claude-agent, ollama) return undefined and
 * fall through to DEFAULT_AGENT_MODEL.
 */
export function agentModelForDefaultModel(
  defaultModel: string | undefined,
): string | undefined {
  if (!defaultModel?.trim()) return undefined
  const parsed = safeParseModelId(defaultModel)
  if (!parsed.ok) return undefined
  const registry = getDefaultProviderRegistry()
  if (!registry.has(parsed.value.providerId)) return undefined
  const manifest = registry.get(parsed.value.providerId).manifest
  const agentDefault = manifest.defaultModels?.agent
  if (!manifest.modalities.includes("agent") || !agentDefault) return undefined
  return `${manifest.id}:${agentDefault}`
}

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
  // `google:gemini-3.1-pro-preview`. The matching provider key must be sent
  // with the request (X-OpenAI-Key / X-Anthropic-API-Key / X-Google-API-Key)
  // or the call fails to authenticate.
  return (
    config.agents?.model ??
    agentModelForDefaultModel(config.default_model) ??
    DEFAULT_AGENT_MODEL
  )
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

export interface LayoutMirrorServiceOptions extends AgentCredentialOptions {
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
    credentials,
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
      credentials,
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

export interface GenerateActivityServiceOptions extends AgentCredentialOptions {
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
    credentials,
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
      credentials,
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
