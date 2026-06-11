import type { LLMModel } from "@adt/llm"
import { FontAssignmentOutput, type BookFont } from "@adt/types"
export type { FontAssignmentOutput } from "@adt/types"

export interface FontAssignmentInput {
  fonts: BookFont[]
  pageImages: Array<{
    pageId: string
    pageNumber: number
    imageBase64: string
  }>
  bookSummary?: string
  bookTitle?: string
}

export interface FontAssignmentConfig {
  promptName: string
  modelId: string
  maxRetries: number
  temperature?: number
}

export function buildFontAssignmentConfig(
  stepConfig?: { prompt?: string; model?: string; max_retries?: number; temperature?: number },
): FontAssignmentConfig {
  return {
    promptName: stepConfig?.prompt ?? "font_assignment",
    modelId: stepConfig?.model ?? "openai:gpt-5.4",
    maxRetries: stepConfig?.max_retries ?? 3,
    temperature: stepConfig?.temperature,
  }
}

export async function generateFontAssignment(
  input: FontAssignmentInput,
  config: FontAssignmentConfig,
  llmModel: LLMModel,
): Promise<FontAssignmentOutput> {
  const context = {
    fonts: input.fonts.map((f) => ({
      id: f.id,
      family: f.family,
      source: f.source,
      category: f.category ?? null,
      weights: [...new Set(f.faces.map((face) => face.weight))].sort((a, b) => a - b),
      has_italic: f.faces.some((face) => face.style === "italic"),
      locked_role: f.roleLockedByUser ? f.role : null,
    })),
    page_images: input.pageImages.map((p) => ({
      page_id: p.pageId,
      page_number: p.pageNumber,
      image_base64: p.imageBase64,
    })),
    book_summary: input.bookSummary ?? null,
    book_title: input.bookTitle ?? null,
  }

  const result = await llmModel.generateObject<FontAssignmentOutput>({
    schema: FontAssignmentOutput,
    prompt: config.promptName,
    context,
    maxRetries: config.maxRetries,
    maxTokens: 8192,
    temperature: config.temperature,
    timeoutMs: 120_000,
    log: {
      taskType: "font-assignment",
      promptName: config.promptName,
    },
  })

  return result.object
}
