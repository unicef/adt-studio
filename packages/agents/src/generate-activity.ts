import { randomUUID } from "node:crypto"
import type { Storage } from "@adt/storage"
import { runAgent, type AgentStepEvent } from "./runner.js"
import { createBookTools, type BookToolCallRecord } from "./tools/book-tools.js"
import { buildActivityGenerationSystemPrompt } from "./prompts/activity-generation.js"
import { FRONTEND_DESIGN_CHILDREN_PROMPT } from "./prompts/frontend-design-children.js"
import type { ActivityGenMode } from "./tools/activity-schema.js"
import type { AgentCredentials } from "./resolve-model.js"

export interface GenerateActivityOptions {
  storage: Storage
  bookLabel: string
  booksDir: string
  promptsDir: string
  configPath?: string
  /** The page the new activity will be appended to. */
  anchorPageId: string
  /** Natural-language description of the activity the user wants. */
  description: string
  /**
   * When true (default), the system prompt includes the Universal Design for
   * Learning block. Set to false to disable inclusive-design guidance for
   * comparison/testing purposes.
   */
  inclusiveDesign?: boolean
  /**
   * Which write path the agent may take. "auto" (default) lets the model
   * choose between templated and custom; "templated"/"custom" force the choice
   * by restricting the toolset and the prompt.
   */
  mode?: ActivityGenMode
  modelId: string
  /** Optional book styleguide markdown — appended to the agent's system prompt and forwarded to the renderer for the templated path. */
  styleguide?: string
  /**
   * Per-provider keys used by both the agent loop and the renderer's LLM
   * client. Each provider is authenticated with its own key (see
   * resolveAgentModel) — keys are never cross-wired.
   */
  credentials: AgentCredentials
  maxSteps?: number
  /** Whole-run timeout. Default 5 min. */
  timeoutMs?: number
  /**
   * Called when the agent makes progress. Wire to TaskService.emitProgress so
   * the user sees what's happening in real time. Optional.
   */
  onProgress?: (message: string) => void
}

export interface GenerateActivityResult {
  /** Final assistant text after all tool calls. Often empty if the model stopped right after a write. */
  text: string
  /** Every tool call the agent made, with args and results, in order. */
  toolCalls: BookToolCallRecord[]
  /** PageIds that received a write. For this agent that should always be just the anchor page. */
  touchedPageIds: string[]
  stepCount: number
  finishReason: string
}

/**
 * Convert a step event into a one-line human progress message.
 *
 * Per tool the agent calls, the message picks out the most useful argument
 * so the user can see which page is being read, which section type is being
 * created, etc. — without us having to invent a parallel progress channel.
 */
function describeStep(step: AgentStepEvent): string | undefined {
  if (step.toolCalls.length > 0) {
    const parts: string[] = []
    for (const tc of step.toolCalls) {
      const args = tc.args as Record<string, unknown>
      switch (tc.toolName) {
        case "listPages":
          parts.push("Listing pages")
          break
        case "getPage":
          parts.push(`Reading page ${args.pageId ?? "?"}`)
          break
        case "getSection":
          parts.push(
            `Reading ${args.pageId ?? "?"} section ${args.sectionIndex ?? "?"}`,
          )
          break
        case "listPageImages":
          parts.push(`Listing images on ${args.pageId ?? "?"}`)
          break
        case "createTemplatedActivity":
          parts.push(`Generating ${args.sectionType ?? "activity"} via templates`)
          break
        case "createCustomSection":
          parts.push(`Generating ${args.sectionType ?? "custom section"}`)
          break
        case "updateSection":
          parts.push(
            `Updating ${args.pageId ?? "?"} section ${args.sectionIndex ?? "?"}`,
          )
          break
        default:
          parts.push(tc.toolName)
      }
    }
    return parts.join(" + ")
  }
  if (step.text && step.text.trim()) {
    return step.text.trim().slice(0, 120)
  }
  return undefined
}

/**
 * Run the generative activity agent against a single anchor page.
 *
 * The agent can read any page in the book but can only write to the anchor
 * page. It is expected to call createTemplatedActivity (preferred) or
 * createCustomSection (escape hatch) exactly once. Whether it did is
 * recoverable from the touchedPageIds / toolCalls — callers can surface a
 * failure if no write landed.
 */
export async function generateActivity(
  opts: GenerateActivityOptions,
): Promise<GenerateActivityResult> {
  const bookTools = createBookTools({
    storage: opts.storage,
    bookLabel: opts.bookLabel,
    booksDir: opts.booksDir,
    promptsDir: opts.promptsDir,
    configPath: opts.configPath,
    styleguide: opts.styleguide,
    credentials: opts.credentials,
    restrictWritesToPageId: opts.anchorPageId,
    activityMode: opts.mode,
  })

  const systemParts: string[] = [
    buildActivityGenerationSystemPrompt({
      inclusiveDesign: opts.inclusiveDesign,
      mode: opts.mode,
    }),
    // Design lens for the createCustomSection path — the templated path
    // inherits styling from the pipeline's Liquid templates, but custom HTML
    // does not, so this gives the agent a children's-textbook design and a11y
    // vocabulary. Placed before the styleguide block it defers to.
    FRONTEND_DESIGN_CHILDREN_PROMPT,
  ]
  if (opts.styleguide && opts.styleguide.trim()) {
    systemParts.push(
      [
        "## Book styleguide (FOLLOW EXACTLY for custom sections)",
        "",
        "When you use createCustomSection, the HTML you write must follow this styleguide. The templated path applies it automatically; the custom path does not.",
        "",
        opts.styleguide.trim(),
      ].join("\n"),
    )
  }

  const toolInstruction =
    opts.mode === "templated"
      ? "Then build it with createTemplatedActivity (the only write tool available this run)."
      : opts.mode === "custom"
        ? "Then build a bespoke, fully-interactive activity with createCustomSection (the only write tool available this run)."
        : "Then choose the write tool that yields the best activity for this page: createTemplatedActivity for a standard exercise, or createCustomSection for a richer/bespoke one."

  const userPrompt = [
    `Anchor page: ${opts.anchorPageId}`,
    "",
    "User request:",
    opts.description.trim(),
    "",
    `Build the activity now. Start by calling getPage on the anchor page so you understand its content and any data-id indices already in use. ${toolInstruction} Call it exactly once.`,
  ].join("\n")

  opts.onProgress?.("Starting activity agent")

  const t0 = Date.now()
  const correlationId = randomUUID()

  const run = await runAgent({
    modelId: opts.modelId,
    system: systemParts.join("\n\n"),
    prompt: userPrompt,
    tools: bookTools.tools,
    credentials: opts.credentials,
    maxSteps: opts.maxSteps ?? 20,
    // Templated path makes an inner LLM call inside createTemplatedActivity
    // (renderSectionLlm + optional answer extraction), so the overall run
    // can take noticeably longer than the agent-loop default. Default to
    // 10 minutes here unless the caller overrides.
    timeoutMs: opts.timeoutMs ?? 10 * 60_000,
    onStepFinish: (step) => {
      const msg = describeStep(step)
      if (msg) opts.onProgress?.(msg)
    },
  })

  const durationMs = Date.now() - t0

  // Append a single summary entry to the per-book LLM log so the run shows up
  // in the existing debug "LLM Logs" tab. We synthesise a "messages" array
  // describing the agent's tool-call trajectory rather than the raw chat
  // completions — the chat completions live behind generateText and aren't
  // exposed by the SDK. The trajectory is the more useful artefact anyway.
  try {
    const trajectoryLines: string[] = []
    trajectoryLines.push(`User request: ${opts.description.trim()}`)
    trajectoryLines.push("")
    trajectoryLines.push(`Anchor page: ${opts.anchorPageId}`)
    trajectoryLines.push("")
    trajectoryLines.push("Tool calls:")
    for (const call of bookTools.calls) {
      const argsPreview = JSON.stringify(call.args).slice(0, 300)
      const status = call.error ? `ERROR: ${call.error}` : "ok"
      trajectoryLines.push(`  - ${call.name}(${argsPreview}) → ${status}`)
    }
    if (run.text?.trim()) {
      trajectoryLines.push("")
      trajectoryLines.push(`Final text: ${run.text.trim().slice(0, 500)}`)
    }
    trajectoryLines.push("")
    trajectoryLines.push(
      `finishReason=${run.finishReason} steps=${run.stepCount} duration=${durationMs}ms`,
    )

    opts.storage.appendLlmLog({
      requestId: randomUUID(),
      timestamp: new Date().toISOString(),
      taskType: "generate-activity",
      pageId: opts.anchorPageId,
      promptName: "activity-generation",
      modelId: opts.modelId,
      cacheHit: false,
      success: bookTools.touchedPageIds.size > 0,
      errorCount: bookTools.calls.filter((c) => c.error).length,
      attempt: 0,
      durationMs,
      ...(run.usage
        ? {
            usage: {
              inputTokens: run.usage.inputTokens,
              outputTokens: run.usage.outputTokens,
            },
          }
        : {}),
      messages: [
        { role: "user", content: [{ type: "text", text: userPrompt }] },
        {
          role: "assistant",
          content: [{ type: "text", text: trajectoryLines.join("\n") }],
        },
      ],
      correlationId,
    })
  } catch {
    // observability never breaks the path
  }

  return {
    text: run.text,
    toolCalls: bookTools.calls,
    touchedPageIds: [...bookTools.touchedPageIds],
    stepCount: run.stepCount,
    finishReason: run.finishReason,
  }
}
