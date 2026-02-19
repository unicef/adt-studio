import { describe, expect, it } from "vitest"
import type { AppConfig } from "@adt/types"
import type { LLMModel, GenerateObjectResult, GenerateObjectOptions } from "@adt/llm"
import { buildRenderStrategyResolver, renderPage, type RenderConfig } from "../web-rendering.js"
import type { TemplateEngine } from "../render-template.js"

const defaultResolveConfig = (): RenderConfig => ({
  renderType: "llm",
  promptName: "web_generation_html",
  modelId: "openai:gpt-4o",
  maxRetries: 8,
  timeoutMs: 180000,
  answerPromptName: "",
  templateName: "",
})

describe("buildRenderStrategyResolver", () => {
  it("resolves default strategy from config", () => {
    const appConfig: AppConfig = {
      text_types: { heading: "Heading" },
      text_group_types: { paragraph: "Paragraph" },
      default_render_strategy: "llm",
      render_strategies: {
        llm: {
          render_type: "llm",
          config: {
            prompt: "custom_render",
            model: "openai:gpt-4.1-mini",
            max_retries: 8,
          },
        },
      },
    }

    const resolve = buildRenderStrategyResolver(appConfig)
    const config = resolve("text_only")
    expect(config.renderType).toBe("llm")
    expect(config.promptName).toBe("custom_render")
    expect(config.modelId).toBe("openai:gpt-4.1-mini")
    expect(config.maxRetries).toBe(8)
    expect(config.timeoutMs).toBe(180000)
    expect(config.templateName).toBe("")
  })

  it("resolves section-specific strategy", () => {
    const appConfig: AppConfig = {
      text_types: { heading: "Heading" },
      text_group_types: { paragraph: "Paragraph" },
      default_render_strategy: "llm",
      render_strategies: {
        llm: {
          render_type: "llm",
          config: { prompt: "default_prompt", model: "openai:gpt-5.2" },
        },
        custom: {
          render_type: "llm",
          config: { prompt: "custom_prompt", model: "openai:gpt-4.1-mini", max_retries: 3 },
        },
      },
      section_render_strategies: {
        front_cover: "custom",
      },
    }

    const resolve = buildRenderStrategyResolver(appConfig)

    const frontCover = resolve("front_cover")
    expect(frontCover.promptName).toBe("custom_prompt")
    expect(frontCover.modelId).toBe("openai:gpt-4.1-mini")
    expect(frontCover.maxRetries).toBe(3)

    const textOnly = resolve("text_only")
    expect(textOnly.promptName).toBe("default_prompt")
    expect(textOnly.modelId).toBe("openai:gpt-5.2")
  })

  it("falls back to hardcoded defaults when no config provided", () => {
    const appConfig: AppConfig = {
      text_types: { heading: "Heading" },
      text_group_types: { paragraph: "Paragraph" },
    }

    const resolve = buildRenderStrategyResolver(appConfig)
    const config = resolve("anything")
    expect(config.renderType).toBe("llm")
    expect(config.promptName).toBe("web_generation_html")
    expect(config.modelId).toBe("openai:gpt-5.2")
    expect(config.maxRetries).toBe(25)
    expect(config.timeoutMs).toBe(180000)
    expect(config.templateName).toBe("")
  })

  it("falls back to default strategy when section strategy name is missing", () => {
    const appConfig: AppConfig = {
      text_types: { heading: "Heading" },
      text_group_types: { paragraph: "Paragraph" },
      default_render_strategy: "llm_default",
      render_strategies: {
        llm_default: {
          render_type: "llm",
          config: { prompt: "default_prompt", model: "openai:gpt-5.2" },
        },
      },
      section_render_strategies: {
        front_cover: "missing_strategy",
      },
    }

    const resolve = buildRenderStrategyResolver(appConfig)
    const config = resolve("front_cover")

    expect(config.renderType).toBe("llm")
    expect(config.promptName).toBe("default_prompt")
    expect(config.modelId).toBe("openai:gpt-5.2")
  })

  it("resolves template strategy with render type and template name", () => {
    const appConfig: AppConfig = {
      text_types: { heading: "Heading" },
      text_group_types: { paragraph: "Paragraph" },
      default_render_strategy: "llm",
      render_strategies: {
        llm: {
          render_type: "llm",
          config: { prompt: "default_prompt", model: "openai:gpt-5.2" },
        },
        two_column: {
          render_type: "template",
          config: { template: "two_column_render" },
        },
      },
      section_render_strategies: {
        front_cover: "two_column",
      },
    }

    const resolve = buildRenderStrategyResolver(appConfig)

    const frontCover = resolve("front_cover")
    expect(frontCover.renderType).toBe("template")
    expect(frontCover.templateName).toBe("two_column_render")

    const textOnly = resolve("text_only")
    expect(textOnly.renderType).toBe("llm")
    expect(textOnly.promptName).toBe("default_prompt")
  })
})

// Helper to build inline text group part
function textPart(groupId: string, groupType: string, texts: Array<{ textType: string; text: string; isPruned: boolean }>, isPruned = false) {
  return { type: "text_group" as const, groupId, groupType, texts, isPruned }
}

// Helper to build inline image part
function imagePart(imageId: string, isPruned = false) {
  return { type: "image" as const, imageId, isPruned }
}

describe("renderPage", () => {
  const htmlResponse = {
    reasoning: "test",
    content: '<div id="content" class="container"><section role="article" data-section-type="text_only"><p data-id="pg001_gp001_tx001">Hello</p></section></div>',
  }

  it("skips pruned sections", async () => {
    const calls: string[] = []
    const fakeLlm: LLMModel = {
      generateObject: async <T>() => {
        calls.push("called")
        return { object: htmlResponse as T } as GenerateObjectResult<T>
      },
    }

    const result = await renderPage(
      {
        label: "test-book",
        pageId: "pg001",
        pageImageBase64: "base64img",
        sectioning: {
          reasoning: "test",
          sections: [
            {
              sectionId: "pg001_sec001",
              sectionType: "text_only",
              parts: [
                textPart("pg001_gp001", "paragraph", [
                  { textType: "section_text", text: "Hello", isPruned: false },
                ]),
              ],
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: 1,
              isPruned: false,
            },
            {
              sectionId: "pg001_sec002",
              sectionType: "credits",
              parts: [
                textPart("pg001_gp002", "paragraph", [
                  { textType: "section_text", text: "Credits info", isPruned: false },
                ]),
              ],
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: null,
              isPruned: true,
            },
          ],
        },
        images: new Map(),
      },
      defaultResolveConfig,
      fakeLlm
    )

    // Only one section rendered (credits was pruned)
    expect(result.sections).toHaveLength(1)
    expect(result.sections[0].sectionType).toBe("text_only")
    expect(calls).toHaveLength(1)
  })

  it("skips sections with no content", async () => {
    const calls: string[] = []
    const fakeLlm: LLMModel = {
      generateObject: async <T>() => {
        calls.push("called")
        return {
          object: { reasoning: "test", content: "<div></div>" } as T,
        } as GenerateObjectResult<T>
      },
    }

    const result = await renderPage(
      {
        label: "test-book",
        pageId: "pg001",
        pageImageBase64: "base64img",
        sectioning: {
          reasoning: "test",
          sections: [
            {
              sectionId: "pg001_sec001",
              sectionType: "text_only",
              parts: [
                textPart("pg001_gp001", "paragraph", [
                  // All texts pruned — section has no content
                  { textType: "header_text", text: "Header", isPruned: true },
                ]),
              ],
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: 1,
              isPruned: false,
            },
          ],
        },
        images: new Map(),
      },
      defaultResolveConfig,
      fakeLlm
    )

    expect(result.sections).toHaveLength(0)
    expect(calls).toHaveLength(0)
  })

  it("resolves image part IDs to image base64", async () => {
    let capturedContext: Record<string, unknown> | undefined

    const imgResponse = {
      reasoning: "test",
      content:
        '<div id="content" class="container"><section role="article" data-section-type="images_only"><img data-id="pg001_im001" src="placeholder" alt="test" /></section></div>',
    }

    const fakeLlm: LLMModel = {
      generateObject: async <T>(opts: GenerateObjectOptions) => {
        capturedContext = opts.context
        return { object: imgResponse as T } as GenerateObjectResult<T>
      },
    }

    await renderPage(
      {
        label: "test-book",
        pageId: "pg001",
        pageImageBase64: "base64img",
        sectioning: {
          reasoning: "test",
          sections: [
            {
              sectionId: "pg001_sec001",
              sectionType: "images_only",
              parts: [imagePart("pg001_im001")],
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: 1,
              isPruned: false,
            },
          ],
        },
        images: new Map([["pg001_im001", "imagedata"]]),
      },
      defaultResolveConfig,
      fakeLlm
    )

    const images = capturedContext?.images as Array<{
      image_id: string
      image_base64: string
    }>
    expect(images).toHaveLength(1)
    expect(images[0].image_id).toBe("pg001_im001")
    expect(images[0].image_base64).toBe("imagedata")
  })

  it("generates unique text IDs for multi-text groups", async () => {
    let capturedContext: Record<string, unknown> | undefined

    const fakeLlm: LLMModel = {
      generateObject: async <T>(opts: GenerateObjectOptions) => {
        capturedContext = opts.context
        return {
          object: {
            reasoning: "test",
            content:
              '<div id="content" class="container"><section role="article" data-section-type="text_only"><p data-id="pg001_gp001_tx001">Hello</p><p data-id="pg001_gp001_tx002">World</p></section></div>',
          } as T,
        } as GenerateObjectResult<T>
      },
    }

    await renderPage(
      {
        label: "test-book",
        pageId: "pg001",
        pageImageBase64: "base64img",
        sectioning: {
          reasoning: "test",
          sections: [
            {
              sectionId: "pg001_sec001",
              sectionType: "text_only",
              parts: [
                textPart("pg001_gp001", "paragraph", [
                  { textType: "section_text", text: "Hello", isPruned: false },
                  { textType: "section_text", text: "World", isPruned: false },
                  { textType: "header_text", text: "Pruned", isPruned: true },
                ]),
              ],
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: 1,
              isPruned: false,
            },
          ],
        },
        images: new Map(),
      },
      defaultResolveConfig,
      fakeLlm
    )

    const texts = capturedContext?.texts as Array<{
      text_id: string
      text_type: string
      text: string
    }>
    expect(texts).toHaveLength(2)
    expect(texts[0].text_id).toBe("pg001_gp001_tx001")
    expect(texts[1].text_id).toBe("pg001_gp001_tx002")
  })

  it("generates tx ID for single-text groups", async () => {
    let capturedContext: Record<string, unknown> | undefined

    const fakeLlm: LLMModel = {
      generateObject: async <T>(opts: GenerateObjectOptions) => {
        capturedContext = opts.context
        return {
          object: {
            reasoning: "test",
            content:
              '<div id="content" class="container"><section role="article" data-section-type="text_only"><p data-id="pg001_gp001_tx001">Hello</p></section></div>',
          } as T,
        } as GenerateObjectResult<T>
      },
    }

    await renderPage(
      {
        label: "test-book",
        pageId: "pg001",
        pageImageBase64: "base64img",
        sectioning: {
          reasoning: "test",
          sections: [
            {
              sectionId: "pg001_sec001",
              sectionType: "text_only",
              parts: [
                textPart("pg001_gp001", "paragraph", [
                  { textType: "section_text", text: "Hello", isPruned: false },
                ]),
              ],
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: 1,
              isPruned: false,
            },
          ],
        },
        images: new Map(),
      },
      defaultResolveConfig,
      fakeLlm
    )

    const texts = capturedContext?.texts as Array<{
      text_id: string
    }>
    expect(texts).toHaveLength(1)
    expect(texts[0].text_id).toBe("pg001_gp001_tx001")
  })

  it("renders multiple non-pruned sections sequentially", async () => {
    let callCount = 0
    const fakeLlm: LLMModel = {
      generateObject: async <T>() => {
        callCount++
        return {
          object: {
            reasoning: `section ${callCount}`,
            content: `<div id="content" class="container"><section role="article" data-section-type="text_only"><p data-id="pg001_gp00${callCount}_tx001">Text ${callCount}</p></section></div>`,
          } as T,
        } as GenerateObjectResult<T>
      },
    }

    const result = await renderPage(
      {
        label: "test-book",
        pageId: "pg001",
        pageImageBase64: "base64img",
        sectioning: {
          reasoning: "test",
          sections: [
            {
              sectionId: "pg001_sec001",
              sectionType: "text_only",
              parts: [
                textPart("pg001_gp001", "paragraph", [
                  { textType: "section_text", text: "First", isPruned: false },
                ]),
              ],
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: 1,
              isPruned: false,
            },
            {
              sectionId: "pg001_sec002",
              sectionType: "text_only",
              parts: [
                textPart("pg001_gp002", "paragraph", [
                  { textType: "section_text", text: "Second", isPruned: false },
                ]),
              ],
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: 1,
              isPruned: false,
            },
          ],
        },
        images: new Map(),
      },
      defaultResolveConfig,
      fakeLlm
    )

    expect(result.sections).toHaveLength(2)
    expect(result.sections[0].sectionIndex).toBe(0)
    expect(result.sections[1].sectionIndex).toBe(1)
  })

  it("dispatches to template renderer when renderType is template", async () => {
    let templateCalled = false
    let capturedTemplateName = ""
    let capturedContext: Record<string, unknown> | undefined

    const fakeTemplateEngine: TemplateEngine = {
      async render(templateName: string, context: Record<string, unknown>) {
        templateCalled = true
        capturedTemplateName = templateName
        capturedContext = context
        return '<section><p data-id="pg001_gp001_tx001">Hello</p></section>'
      },
    }

    const templateResolveConfig = (): RenderConfig => ({
      renderType: "template",
      promptName: "",
      modelId: "",
      maxRetries: 0,
      timeoutMs: 0,
      answerPromptName: "",
      templateName: "two_column_render",
    })

    const fakeLlm: LLMModel = {
      generateObject: async <T>() => {
        throw new Error("LLM should not be called for template rendering")
      },
    }

    const result = await renderPage(
      {
        label: "test-book",
        pageId: "pg001",
        pageImageBase64: "base64img",
        sectioning: {
          reasoning: "test",
          sections: [
            {
              sectionId: "pg001_sec001",
              sectionType: "text_only",
              parts: [
                textPart("pg001_gp001", "paragraph", [
                  { textType: "section_text", text: "Hello", isPruned: false },
                ]),
              ],
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: 1,
              isPruned: false,
            },
          ],
        },
        images: new Map(),
      },
      templateResolveConfig,
      fakeLlm,
      fakeTemplateEngine,
    )

    expect(templateCalled).toBe(true)
    expect(capturedTemplateName).toBe("two_column_render")
    expect(result.sections).toHaveLength(1)
    expect(result.sections[0].reasoning).toBe("template-based rendering")
    expect(result.sections[0].html).toContain("data-id")

    // Check template context shape
    const parts = capturedContext?.parts as Array<{ type: string }>
    expect(parts).toHaveLength(1)
    expect(parts[0].type).toBe("group")
  })

  it("throws when template renderType but no template engine", async () => {
    const templateResolveConfig = (): RenderConfig => ({
      renderType: "template",
      promptName: "",
      modelId: "",
      maxRetries: 0,
      timeoutMs: 0,
      answerPromptName: "",
      templateName: "two_column_render",
    })

    const fakeLlm: LLMModel = {
      generateObject: async <T>() => {
        throw new Error("should not be called")
      },
    }

    await expect(
      renderPage(
        {
          label: "test-book",
          pageId: "pg001",
          pageImageBase64: "base64img",
          sectioning: {
            reasoning: "test",
            sections: [
              {
                sectionId: "pg001_sec001",
                sectionType: "text_only",
                parts: [
                  textPart("pg001_gp001", "paragraph", [
                    { textType: "section_text", text: "Hello", isPruned: false },
                  ]),
                ],
                backgroundColor: "#ffffff",
                textColor: "#000000",
                pageNumber: 1,
                isPruned: false,
              },
            ],
          },
          images: new Map(),
        },
        templateResolveConfig,
        fakeLlm
        // no template engine passed
      )
    ).rejects.toThrow("Template engine required")
  })

  it("resolves LLM model per section render config", async () => {
    const calls: string[] = []
    const llmResolver = (modelId: string): LLMModel => ({
      generateObject: async <T>() => {
        calls.push(modelId)
        const content =
          modelId === "openai:model-a"
            ? '<div id="content" class="container"><section role="article" data-section-type="text_only"><p data-id="pg001_gp001_tx001">First</p></section></div>'
            : '<div id="content" class="container"><section role="article" data-section-type="text_only"><p data-id="pg001_gp002_tx001">Second</p></section></div>'
        return {
          object: { reasoning: "test", content } as T,
        } as GenerateObjectResult<T>
      },
    })

    const resolveConfig = (sectionType: string): RenderConfig =>
      sectionType === "cover"
        ? {
            renderType: "llm",
            promptName: "prompt_a",
            modelId: "openai:model-a",
            maxRetries: 2,
            timeoutMs: 180000,
            answerPromptName: "",
            templateName: "",
          }
        : {
            renderType: "llm",
            promptName: "prompt_b",
            modelId: "openai:model-b",
            maxRetries: 2,
            timeoutMs: 180000,
            answerPromptName: "",
            templateName: "",
          }

    const result = await renderPage(
      {
        label: "test-book",
        pageId: "pg001",
        pageImageBase64: "base64img",
        sectioning: {
          reasoning: "test",
          sections: [
            {
              sectionId: "pg001_sec001",
              sectionType: "cover",
              parts: [
                textPart("pg001_gp001", "paragraph", [
                  { textType: "section_text", text: "First", isPruned: false },
                ]),
              ],
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: 1,
              isPruned: false,
            },
            {
              sectionId: "pg001_sec002",
              sectionType: "body",
              parts: [
                textPart("pg001_gp002", "paragraph", [
                  { textType: "section_text", text: "Second", isPruned: false },
                ]),
              ],
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: 1,
              isPruned: false,
            },
          ],
        },
        images: new Map(),
      },
      resolveConfig,
      llmResolver
    )

    expect(result.sections).toHaveLength(2)
    expect(calls).toEqual(["openai:model-a", "openai:model-b"])
  })

  it("routes activity renderType through LLM renderer with answer generation", async () => {
    const llmCalls: Array<{ prompt?: string; taskType?: string }> = []
    const activityHtmlResponse = {
      reasoning: "activity reasoning",
      content:
        '<div id="content" class="container"><section role="article" data-section-type="activity_multiple_choice"><div data-id="pg001_gp001_tx001">Question</div><div data-id="activity_gen_opt1">Option A</div></section></div>',
    }
    const activityAnswersResponse = {
      reasoning: "answer reasoning",
      answers: [{ id: "activity_gen_opt1", value: "A" }],
    }

    const fakeLlm: LLMModel = {
      generateObject: async <T>(opts: GenerateObjectOptions) => {
        llmCalls.push({
          prompt: opts.prompt,
          taskType: opts.log?.taskType,
        })
        if (opts.log?.taskType === "activity-answers") {
          return { object: activityAnswersResponse as T } as GenerateObjectResult<T>
        }
        return { object: activityHtmlResponse as T } as GenerateObjectResult<T>
      },
    }

    const activityResolveConfig = (): RenderConfig => ({
      renderType: "activity",
      promptName: "activity_multiple_choice",
      modelId: "openai:gpt-5.2",
      maxRetries: 25,
      timeoutMs: 180000,
      answerPromptName: "activity_multiple_choice_answers",
      templateName: "",
    })

    const result = await renderPage(
      {
        label: "test-book",
        pageId: "pg001",
        pageImageBase64: "base64img",
        sectioning: {
          reasoning: "test",
          sections: [
            {
              sectionId: "pg001_sec001",
              sectionType: "activity_multiple_choice",
              parts: [
                textPart("pg001_gp001", "paragraph", [
                  { textType: "instruction_text", text: "Question", isPruned: false },
                ]),
              ],
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: 1,
              isPruned: false,
            },
          ],
        },
        images: new Map(),
      },
      activityResolveConfig,
      fakeLlm
    )

    // Two LLM calls: HTML generation + answer generation
    expect(llmCalls).toHaveLength(2)
    expect(llmCalls[0].prompt).toBe("activity_multiple_choice")
    expect(llmCalls[0].taskType).toBe("activity-rendering")
    expect(llmCalls[1].prompt).toBe("activity_multiple_choice_answers")
    expect(llmCalls[1].taskType).toBe("activity-answers")

    expect(result.sections).toHaveLength(1)
    expect(result.sections[0].activityReasoning).toBe("answer reasoning")
    expect(result.sections[0].activityAnswers).toEqual({ activity_gen_opt1: "A" })
  })

  it("skips answer generation when answerPromptName is empty", async () => {
    const llmCalls: string[] = []
    const activityHtmlResponse = {
      reasoning: "open ended reasoning",
      content:
        '<div id="content" class="container"><section role="article" data-section-type="activity_open_ended_answer"><div data-id="pg001_gp001_tx001">Question</div><textarea data-id="activity_gen_input1"></textarea></section></div>',
    }

    const fakeLlm: LLMModel = {
      generateObject: async <T>(opts: GenerateObjectOptions) => {
        llmCalls.push(opts.log?.taskType ?? "unknown")
        return { object: activityHtmlResponse as T } as GenerateObjectResult<T>
      },
    }

    const activityResolveConfig = (): RenderConfig => ({
      renderType: "activity",
      promptName: "activity_open_ended_answer",
      modelId: "openai:gpt-5.2",
      maxRetries: 25,
      timeoutMs: 180000,
      answerPromptName: "",
      templateName: "",
    })

    const result = await renderPage(
      {
        label: "test-book",
        pageId: "pg001",
        pageImageBase64: "base64img",
        sectioning: {
          reasoning: "test",
          sections: [
            {
              sectionId: "pg001_sec001",
              sectionType: "activity_open_ended_answer",
              parts: [
                textPart("pg001_gp001", "paragraph", [
                  { textType: "instruction_text", text: "Question", isPruned: false },
                ]),
              ],
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: 1,
              isPruned: false,
            },
          ],
        },
        images: new Map(),
      },
      activityResolveConfig,
      fakeLlm
    )

    // Only one LLM call (no answer generation)
    expect(llmCalls).toHaveLength(1)
    expect(llmCalls[0]).toBe("activity-rendering")

    expect(result.sections).toHaveLength(1)
    expect(result.sections[0].activityReasoning).toBeUndefined()
    expect(result.sections[0].activityAnswers).toBeUndefined()
  })

  it("does not generate activity answers for non-activity render types", async () => {
    const llmCalls: string[] = []
    const llmHtmlResponse = {
      reasoning: "normal section reasoning",
      content:
        '<div id="content" class="container"><section role="article" data-section-type="text"><div data-id="pg001_gp001_tx001">Body text</div></section></div>',
    }

    const fakeLlm: LLMModel = {
      generateObject: async <T>(opts: GenerateObjectOptions) => {
        llmCalls.push(opts.log?.taskType ?? "unknown")
        return { object: llmHtmlResponse as T } as GenerateObjectResult<T>
      },
    }

    const nonActivityConfig = (): RenderConfig => ({
      renderType: "llm",
      promptName: "web_generation_html",
      modelId: "openai:gpt-5.2",
      maxRetries: 25,
      timeoutMs: 180000,
      answerPromptName: "activity_true_false_answers",
      templateName: "",
    })

    const result = await renderPage(
      {
        label: "test-book",
        pageId: "pg001",
        pageImageBase64: "base64img",
        sectioning: {
          reasoning: "test",
          sections: [
            {
              sectionId: "pg001_sec001",
              sectionType: "text",
              parts: [
                textPart("pg001_gp001", "paragraph", [
                  { textType: "body_text", text: "Body text", isPruned: false },
                ]),
              ],
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: 1,
              isPruned: false,
            },
          ],
        },
        images: new Map(),
      },
      nonActivityConfig,
      fakeLlm
    )

    expect(llmCalls).toEqual(["web-rendering"])
    expect(result.sections).toHaveLength(1)
    expect(result.sections[0].activityReasoning).toBeUndefined()
    expect(result.sections[0].activityAnswers).toBeUndefined()
  })

  it("skips pruned parts within a section", async () => {
    let capturedContext: Record<string, unknown> | undefined

    const fakeLlm: LLMModel = {
      generateObject: async <T>(opts: GenerateObjectOptions) => {
        capturedContext = opts.context
        return {
          object: {
            reasoning: "test",
            content: '<div id="content" class="container"><section role="article"><p data-id="pg001_gp001_tx001">Hello</p></section></div>',
          } as T,
        } as GenerateObjectResult<T>
      },
    }

    await renderPage(
      {
        label: "test-book",
        pageId: "pg001",
        pageImageBase64: "base64img",
        sectioning: {
          reasoning: "test",
          sections: [
            {
              sectionId: "pg001_sec001",
              sectionType: "text_only",
              parts: [
                textPart("pg001_gp001", "paragraph", [
                  { textType: "section_text", text: "Hello", isPruned: false },
                ]),
                textPart("pg001_gp002", "heading", [
                  { textType: "header_text", text: "Pruned group", isPruned: false },
                ], true), // part-level pruned
                imagePart("pg001_im001", true), // pruned image
              ],
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: 1,
              isPruned: false,
            },
          ],
        },
        images: new Map([["pg001_im001", "imagedata"]]),
      },
      defaultResolveConfig,
      fakeLlm
    )

    // Only unpruned parts should be passed to the renderer
    const texts = capturedContext?.texts as Array<{ text_id: string }>
    expect(texts).toHaveLength(1)
    expect(texts[0].text_id).toBe("pg001_gp001_tx001")

    const images = capturedContext?.images as Array<{ image_id: string }>
    expect(images).toHaveLength(0)
  })
})

describe("buildRenderStrategyResolver — activity", () => {
  it("resolves activity strategy with answerPromptName", () => {
    const appConfig: AppConfig = {
      text_types: { heading: "Heading" },
      text_group_types: { paragraph: "Paragraph" },
      default_render_strategy: "two_column",
      render_strategies: {
        two_column: {
          render_type: "template",
          config: { template: "two_column_render" },
        },
        activity_multiple_choice: {
          render_type: "activity",
          config: {
            prompt: "activity_multiple_choice",
            answer_prompt: "activity_multiple_choice_answers",
            model: "openai:gpt-5.2",
            max_retries: 25,
            timeout: 180,
          },
        },
      },
      section_render_strategies: {
        activity_multiple_choice: "activity_multiple_choice",
      },
    }

    const resolve = buildRenderStrategyResolver(appConfig)
    const config = resolve("activity_multiple_choice")

    expect(config.renderType).toBe("activity")
    expect(config.promptName).toBe("activity_multiple_choice")
    expect(config.answerPromptName).toBe("activity_multiple_choice_answers")
    expect(config.modelId).toBe("openai:gpt-5.2")
    expect(config.maxRetries).toBe(25)
    expect(config.timeoutMs).toBe(180000)
  })

  it("resolves activity strategy without answer_prompt to empty answerPromptName", () => {
    const appConfig: AppConfig = {
      text_types: { heading: "Heading" },
      text_group_types: { paragraph: "Paragraph" },
      render_strategies: {
        activity_open_ended: {
          render_type: "activity",
          config: {
            prompt: "activity_open_ended_answer",
            model: "openai:gpt-5.2",
          },
        },
      },
      section_render_strategies: {
        activity_open_ended_answer: "activity_open_ended",
      },
    }

    const resolve = buildRenderStrategyResolver(appConfig)
    const config = resolve("activity_open_ended_answer")

    expect(config.renderType).toBe("activity")
    expect(config.promptName).toBe("activity_open_ended_answer")
    expect(config.answerPromptName).toBe("")
  })
})
