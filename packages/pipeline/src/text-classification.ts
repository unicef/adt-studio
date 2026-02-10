import {
  type TextClassificationOutput,
  buildTextClassificationLLMSchema,
  type TypeDef,
  type AppConfig,
} from "@adt/types"
import type { LLMModel } from "@adt/llm"

export interface ClassifyConfig {
  textTypes: TypeDef[]
  textGroupTypes: TypeDef[]
  prunedTextTypes: string[]
  promptName: string
  modelId: string
}

export interface PageInput {
  pageId: string
  pageNumber: number
  text: string
  imageBase64: string
}

/**
 * Classify text on a single page. Pure function — no side effects.
 * The caller handles concurrency, storage writes, and progress.
 */
export async function classifyPageText(
  page: PageInput,
  config: ClassifyConfig,
  llmModel: LLMModel
): Promise<TextClassificationOutput> {
  const textTypeKeys = config.textTypes.map((t) => t.key)
  const groupTypeKeys = config.textGroupTypes.map((t) => t.key)

  if (textTypeKeys.length === 0) {
    throw new Error("No text types configured")
  }
  if (groupTypeKeys.length === 0) {
    throw new Error("No text group types configured")
  }

  const schema = buildTextClassificationLLMSchema(
    textTypeKeys as [string, ...string[]],
    groupTypeKeys as [string, ...string[]]
  )

  const result = await llmModel.generateObject<{
    reasoning: string
    groups: Array<{
      group_type: string
      texts: Array<{ text_type: string; text: string }>
    }>
  }>({
    schema,
    prompt: {
      name: config.promptName,
      context: {
        page: {
          pageNumber: page.pageNumber,
          text: page.text,
          imageBase64: page.imageBase64,
        },
        text_types: config.textTypes,
        text_group_types: config.textGroupTypes,
      },
    },
    maxRetries: 2,
    maxTokens: 16384,
    log: {
      taskType: "text-classification",
      pageId: page.pageId,
      promptName: config.promptName,
    },
  })

  // Post-process: assign group IDs and mark pruned entries
  const prunedSet = new Set(config.prunedTextTypes)
  const groups = result.object.groups.map((g, idx) => ({
    groupId: `${page.pageId}_gp${String(idx + 1).padStart(3, "0")}`,
    groupType: g.group_type,
    texts: g.texts.map((t) => ({
      textType: t.text_type,
      text: t.text,
      isPruned: prunedSet.has(t.text_type),
    })),
  }))

  return {
    reasoning: result.object.reasoning,
    groups,
  }
}

/**
 * Build ClassifyConfig from AppConfig.
 */
export function buildClassifyConfig(appConfig: AppConfig): ClassifyConfig {
  const textTypes: TypeDef[] = Object.entries(appConfig.text_types).map(
    ([key, description]) => ({ key, description })
  )
  const textGroupTypes: TypeDef[] = Object.entries(appConfig.text_group_types).map(
    ([key, description]) => ({ key, description })
  )

  return {
    textTypes,
    textGroupTypes,
    prunedTextTypes: appConfig.pruned_text_types ?? [],
    promptName: appConfig.text_classification?.prompt ?? "text_classification",
    modelId: appConfig.text_classification?.model ?? "openai:gpt-4o",
  }
}
