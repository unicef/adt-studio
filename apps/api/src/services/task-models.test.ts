import path from "node:path"
import { describe, expect, it } from "vitest"
import { resolveInheritedTaskModel, type AppConfig, type TaskModelEntry } from "@adt/types"
import {
  buildBookOutlineConfig,
  buildBookSummaryConfig,
  buildCaptionConfig,
  buildCatalogTranslationConfig,
  buildCoreTtsPreparationConfig,
  buildCroppingConfig,
  buildEasyReadConfig,
  buildFontAssignmentConfig,
  buildGlossaryConfig,
  buildMeaningfulnessConfig,
  buildMetadataConfig,
  buildPageSectioningConfig,
  buildQuizGenerationConfig,
  buildRenderStrategyResolver,
  buildSegmentationConfig,
  buildStyleguideGenerationConfig,
  buildTocGenerationConfig,
  loadConfig,
  resolveVisualReviewModelId,
} from "@adt/pipeline"
import { listTaskModels } from "./task-models.js"

const shipped = loadConfig(path.resolve(__dirname, "../../../../config.yaml"))

function runtimeModel(config: AppConfig, task: TaskModelEntry): string | undefined {
  if (task.kind === "render-strategy") {
    return buildRenderStrategyResolver({
      ...config,
      section_render_strategies: { probe: task.configKey },
    })("probe").modelId
  }
  switch (task.configKey) {
    case "metadata": return buildMetadataConfig(config).modelId
    case "book_summary": return buildBookSummaryConfig(config).modelId
    case "book_outline": return buildBookOutlineConfig(config).modelId
    case "image_meaningfulness": return buildMeaningfulnessConfig(config)?.modelId
    case "image_segmentation": return buildSegmentationConfig(config)?.modelId
    case "image_cropping": return buildCroppingConfig(config)?.modelId
    case "page_sectioning": return buildPageSectioningConfig(config).modelId
    case "translation": return buildCatalogTranslationConfig(config, "en").modelId
    case "quiz_generation": return buildQuizGenerationConfig(config, "en")?.modelId
    case "image_captioning": return buildCaptionConfig(config).modelId
    case "glossary": return buildGlossaryConfig(config, "en").modelId
    case "toc_generation": return buildTocGenerationConfig(config, "en").modelId
    case "easy_read": return buildEasyReadConfig(config, "en").modelId
    case "core_tts": return buildCoreTtsPreparationConfig(config).modelId
    case "font_assignment": return buildFontAssignmentConfig(config.font_assignment, config.default_model).modelId
    case "styleguide_generation":
      return buildStyleguideGenerationConfig(config.styleguide_generation, config.default_model).modelId
    case "visual_review": return resolveVisualReviewModelId(config)
    default: throw new Error(`No runtime resolver for ${task.configKey}`)
  }
}

function displayedModel(tasks: TaskModelEntry[], task: TaskModelEntry, defaultModel: string): string {
  return task.model ?? resolveInheritedTaskModel(
    task,
    (taskId) => tasks.find((entry) => entry.id === taskId)?.model,
    defaultModel,
  ).model
}

const withImageSteps = (config: AppConfig): AppConfig => ({
  ...config,
  image_filters: { ...config.image_filters, meaningfulness: true, segmentation: true, cropping: true },
})

const variants: Array<[string, AppConfig]> = [
  ["the shipped config", shipped],
  ["a page_sectioning model", { ...shipped, page_sectioning: { ...shipped.page_sectioning, model: "openai:gpt-5.5" } }],
  ["translation and meaningfulness models", {
    ...shipped,
    translation: { model: "openai:gpt-5.4" },
    image_meaningfulness: { ...shipped.image_meaningfulness, model: "openai:gpt-5.5" },
  }],
  ["a non-default default model", { ...shipped, default_model: "anthropic:claude-opus-4" }],
  ["an explicit book_outline model", { ...shipped, book_outline: { ...shipped.book_outline, model: "openai:gpt-6.1-sol" } }],
]

describe("task model display matches the pipeline runtime", () => {
  it.each(variants)("with %s", (_name, variant) => {
    const config = withImageSteps(variant)
    const defaultModel = config.default_model!
    const tasks = listTaskModels(config)
    for (const task of tasks) {
      expect({ task: task.id, model: displayedModel(tasks, task, defaultModel) })
        .toEqual({ task: task.id, model: runtimeModel(config, task) })
    }
  })

  it("shows the pinned outline model for the shipped default", () => {
    const tasks = listTaskModels(shipped)
    const outline = tasks.find((task) => task.id === "book_outline")!
    expect(displayedModel(tasks, outline, shipped.default_model!)).toBe("openai:gpt-5.4-mini")
  })
})
