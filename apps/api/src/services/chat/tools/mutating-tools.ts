import { z } from "zod"
import { defineChatTool, type ChatTool } from "@adt/chat"
import { StageName, WebRenderingOutput, type StageName as StageNameType } from "@adt/types"
import { createBookStorage } from "@adt/storage"
import { getBookConfig, updateBookConfig } from "../../book-service.js"
import { aiEditSection } from "../../page-edit-service.js"
import { getRunningSteps, activePipelineRunMessage } from "../../pipeline-run-guard.js"
import { makeBeforeRun, planStageClear } from "../../stage-clear.js"
import { saveStoryboardNode } from "../../storyboard-save.js"
import { saveTranslationCatalog } from "../../translation-save.js"
import type { ChatToolContext } from "../context.js"
import { readNode, withStorage } from "./book-access.js"
import { clampText } from "./budget.js"

export interface BlockedByRun {
  status: "blocked"
  reason: "pipeline-running"
  runningSteps: string[]
  message: string
}

/**
 * A running pipeline step can overwrite what we are about to change. Surface it
 * as a tool result rather than an exception so the model explains the situation
 * instead of the request failing.
 */
function blockedByRun(ctx: ChatToolContext): BlockedByRun | null {
  const runningSteps = withStorage(ctx, getRunningSteps)
  if (runningSteps.length === 0) return null
  return {
    status: "blocked",
    reason: "pipeline-running",
    runningSteps,
    message: activePipelineRunMessage(runningSteps),
  }
}

export const runStages = defineChatTool<
  ChatToolContext,
  { fromStage: StageNameType; toStage: StageNameType; renderOnly?: boolean }
>({
  name: "run_stages",
  description:
    "Start a pipeline run over a range of stages. Starting at a stage clears that stage's output and everything downstream of it, then queues the run. Progress shows in the pipeline UI; this returns as soon as the run is queued.",
  inputSchema: z.object({
    fromStage: StageName,
    toStage: StageName,
    renderOnly: z
      .boolean()
      .optional()
      .describe("Storyboard only: re-render from existing sections without re-sectioning."),
  }),
  mutating: true,
  execute: (ctx, input) => {
    const blocked = blockedByRun(ctx)
    if (blocked) return blocked

    if (!ctx.credentials.openaiApiKey) {
      return {
        status: "error" as const,
        message:
          "A pipeline run needs an OpenAI key — the stage runner uses it regardless of the chat model. Add one in Settings → Providers.",
      }
    }

    const plan = planStageClear(input.fromStage, input.toStage)
    const clearData = makeBeforeRun(
      ctx.safeLabel,
      input.fromStage,
      input.toStage,
      ctx.paths.booksDir,
    )

    const result = ctx.stageService.startStageRun(ctx.safeLabel, {
      booksDir: ctx.paths.booksDir,
      apiKey: ctx.credentials.openaiApiKey,
      anthropicApiKey: ctx.credentials.anthropicApiKey,
      googleApiKey: ctx.credentials.googleApiKey,
      promptsDir: ctx.paths.promptsDir,
      webAssetsDir: ctx.paths.webAssetsDir,
      configPath: ctx.paths.configPath,
      fromStage: input.fromStage,
      toStage: input.toStage,
      renderOnly: input.renderOnly,
      beforeRun: clearData,
    })

    if (result.status === "started") clearData()

    return {
      status: result.status,
      fromStage: input.fromStage,
      toStage: input.toStage,
      clearedNodes: plan.nodes,
      resetStages: plan.stages,
      clearedExtractedData: plan.clearsExtractedData,
      message:
        result.status === "queued"
          ? "Queued behind the run already in progress."
          : "Run started. Watch the pipeline view for progress, or ask me for the stage status later.",
    }
  },
})

export const updateStageConfig = defineChatTool<
  ChatToolContext,
  { changes: Record<string, unknown> }
>({
  name: "update_stage_config",
  description:
    "Change this book's config overrides. Keys are merged into the existing overrides; pass null to drop a key and fall back to the global default. Config is not entity-versioned — the previous value is replaced, exactly as the settings UI does it.",
  inputSchema: z.object({
    changes: z
      .record(z.string(), z.unknown())
      .describe("Config keys to set, e.g. { \"glossary_amount\": \"comprehensive\" }."),
  }),
  mutating: true,
  execute: (ctx, input) => {
    const blocked = blockedByRun(ctx)
    if (blocked) return blocked

    const current = getBookConfig(ctx.safeLabel, ctx.paths.booksDir) ?? {}
    const next: Record<string, unknown> = { ...current }
    const removed: string[] = []

    for (const [key, value] of Object.entries(input.changes)) {
      if (value === null) {
        delete next[key]
        removed.push(key)
      } else {
        next[key] = value
      }
    }

    updateBookConfig(ctx.safeLabel, ctx.paths.booksDir, next)

    return {
      status: "ok" as const,
      config: getBookConfig(ctx.safeLabel, ctx.paths.booksDir) ?? {},
      removedKeys: removed,
      message:
        "Config saved. Stages already run keep their output — re-run the affected stages for the new settings to take effect.",
    }
  },
})

export const editStoryboardSection = defineChatTool<
  ChatToolContext,
  { pageId: string; sectionIndex: number; html: string }
>({
  name: "edit_storyboard_section",
  description:
    "Replace one storyboard section's rendered HTML. Saves through the same path as the storyboard editor, so it creates a new entity version and can be rolled back from the version picker.",
  inputSchema: z.object({
    pageId: z.string().min(1).max(128),
    sectionIndex: z.number().int().min(0),
    html: z.string().min(1).max(100_000),
  }),
  mutating: true,
  execute: (ctx, input) => {
    const blocked = blockedByRun(ctx)
    if (blocked) return blocked

    const storage = createBookStorage(ctx.safeLabel, ctx.paths.booksDir)
    try {
      const row = storage.getLatestNodeData("web-rendering", input.pageId)
      const parsed = row ? WebRenderingOutput.safeParse(row.data) : null
      if (!parsed?.success) {
        return {
          status: "not-found" as const,
          message: `No rendered storyboard for page ${input.pageId}. Run the Storyboard stage first.`,
        }
      }

      const target = parsed.data.sections.find(
        (section) => section.sectionIndex === input.sectionIndex,
      )
      if (!target) {
        return {
          status: "not-found" as const,
          message: `Page ${input.pageId} has no section ${input.sectionIndex}. Available: ${parsed.data.sections
            .map((section) => section.sectionIndex)
            .join(", ")}.`,
        }
      }

      const version = saveStoryboardNode(
        storage,
        "web-rendering",
        input.pageId,
        {
          sections: parsed.data.sections.map((section) =>
            section.sectionIndex === input.sectionIndex
              ? { ...section, html: input.html }
              : section,
          ),
        },
        { renderingInSync: true },
      )

      return {
        status: "ok" as const,
        pageId: input.pageId,
        sectionIndex: input.sectionIndex,
        version,
        message: `Saved as version ${version}. Downstream outputs (captions, catalog, speech, package) were marked stale.`,
      }
    } finally {
      storage.close()
    }
  },
})

export const editTranslation = defineChatTool<
  ChatToolContext,
  { language: string; entryId: string; text: string }
>({
  name: "edit_translation",
  description:
    "Replace one entry's translated text for a language. Saves a new version of that language's catalog and invalidates the speech and package outputs derived from it.",
  inputSchema: z.object({
    language: z.string().min(2).max(32),
    entryId: z.string().min(1).max(128),
    text: z.string().max(20_000),
  }),
  mutating: true,
  execute: (ctx, input) => {
    const blocked = blockedByRun(ctx)
    if (blocked) return blocked

    const storage = createBookStorage(ctx.safeLabel, ctx.paths.booksDir)
    try {
      const existing = readNode<{ entries?: Array<{ id: string; text: string }> }>(
        storage,
        "text-catalog-translation",
        input.language,
      )
      if (!existing?.entries) {
        return {
          status: "not-found" as const,
          message: `No translation catalog for ${input.language}. Run the Translate stage for that language first.`,
        }
      }
      if (!existing.entries.some((entry) => entry.id === input.entryId)) {
        return {
          status: "not-found" as const,
          message: `Entry ${input.entryId} is not in the ${input.language} catalog. Use get_translations to find the right id.`,
        }
      }

      const version = saveTranslationCatalog(
        storage,
        input.language,
        existing.entries.map((entry) =>
          entry.id === input.entryId ? { ...entry, text: input.text } : entry,
        ),
      )

      return {
        status: "ok" as const,
        language: input.language,
        entryId: input.entryId,
        version,
        message: `Saved as version ${version}. Speech and packaging for ${input.language} were marked stale.`,
      }
    } finally {
      storage.close()
    }
  },
})

export const rerunWithInstructions = defineChatTool<
  ChatToolContext,
  { pageId: string; sectionIndex: number; instruction: string }
>({
  name: "rerun_with_instructions",
  description:
    "Ask the AI editor to rewrite one storyboard section from a natural-language instruction, then save the result. Use this when the user describes the change they want rather than supplying HTML.",
  inputSchema: z.object({
    pageId: z.string().min(1).max(128),
    sectionIndex: z.number().int().min(0),
    instruction: z.string().min(1).max(4_000),
  }),
  mutating: true,
  execute: async (ctx, input) => {
    const blocked = blockedByRun(ctx)
    if (blocked) return blocked

    if (!ctx.credentials.openaiApiKey) {
      return {
        status: "error" as const,
        message:
          "The AI section editor runs on OpenAI. Add an OpenAI key in Settings → Providers.",
      }
    }

    const result = await aiEditSection({
      label: ctx.safeLabel,
      pageId: input.pageId,
      sectionIndex: input.sectionIndex,
      instruction: input.instruction,
      booksDir: ctx.paths.booksDir,
      promptsDir: ctx.paths.promptsDir,
      webAssetsDir: ctx.paths.webAssetsDir,
      configPath: ctx.paths.configPath,
      apiKey: ctx.credentials.openaiApiKey,
    })

    const storage = createBookStorage(ctx.safeLabel, ctx.paths.booksDir)
    try {
      const row = storage.getLatestNodeData("web-rendering", input.pageId)
      const parsed = row ? WebRenderingOutput.safeParse(row.data) : null
      if (!parsed?.success) {
        return {
          status: "not-found" as const,
          message: `No rendered storyboard for page ${input.pageId}.`,
        }
      }

      const version = saveStoryboardNode(
        storage,
        "web-rendering",
        input.pageId,
        {
          sections: parsed.data.sections.map((section) =>
            section.sectionIndex === input.sectionIndex
              ? {
                  ...section,
                  html: result.html,
                  ...(result.activityAnswers
                    ? { activityAnswers: result.activityAnswers }
                    : {}),
                }
              : section,
          ),
        },
        { renderingInSync: true },
      )

      return {
        status: "ok" as const,
        pageId: input.pageId,
        sectionIndex: input.sectionIndex,
        version,
        reasoning: clampText(result.reasoning, 1_200).text,
      }
    } finally {
      storage.close()
    }
  },
})

export const MUTATING_TOOLS: ChatTool<ChatToolContext, never>[] = [
  runStages,
  updateStageConfig,
  editStoryboardSection,
  editTranslation,
  rerunWithInstructions,
]
