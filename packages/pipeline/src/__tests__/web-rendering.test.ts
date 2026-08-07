import { describe, expect, it } from "vitest"
import type { AppConfig, ContentNodeData } from "@adt/types"
import type { LLMModel, GenerateObjectResult, GenerateObjectOptions } from "@adt/llm"
import { buildRenderStrategyResolver, collectReferencedImageIds, renderPage, type RenderConfig } from "../web-rendering.js"
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
      role_types: { heading: "Heading" },
      structure_types: { paragraph: "Paragraph" },
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
      role_types: { heading: "Heading" },
      structure_types: { paragraph: "Paragraph" },
      default_render_strategy: "llm",
      render_strategies: {
        llm: {
          render_type: "llm",
          config: { prompt: "default_prompt", model: "openai:gpt-5.4" },
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
    expect(textOnly.modelId).toBe("openai:gpt-5.4")
  })

  it("falls back to hardcoded defaults when no config provided", () => {
    const appConfig: AppConfig = {
      role_types: { heading: "Heading" },
      structure_types: { paragraph: "Paragraph" },
    }

    const resolve = buildRenderStrategyResolver(appConfig)
    const config = resolve("anything")
    expect(config.renderType).toBe("llm")
    expect(config.promptName).toBe("web_generation_html")
    expect(config.modelId).toBe("openai:gpt-5.4")
    expect(config.maxRetries).toBe(5)
    expect(config.timeoutMs).toBe(180000)
    expect(config.templateName).toBe("")
  })

  it("uses the configured global default model when a strategy has no override", () => {
    const appConfig: AppConfig = {
      role_types: { heading: "Heading" },
      structure_types: { paragraph: "Paragraph" },
      default_model: "google:gemini-2.5-pro",
    }

    expect(buildRenderStrategyResolver(appConfig)("anything").modelId).toBe(
      "google:gemini-2.5-pro",
    )
  })

  it("falls back to default strategy when section strategy name is missing", () => {
    const appConfig: AppConfig = {
      role_types: { heading: "Heading" },
      structure_types: { paragraph: "Paragraph" },
      default_render_strategy: "llm_default",
      render_strategies: {
        llm_default: {
          render_type: "llm",
          config: { prompt: "default_prompt", model: "openai:gpt-5.4" },
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
    expect(config.modelId).toBe("openai:gpt-5.4")
  })

  it("resolves template strategy with render type and template name", () => {
    const appConfig: AppConfig = {
      role_types: { heading: "Heading" },
      structure_types: { paragraph: "Paragraph" },
      default_render_strategy: "llm",
      render_strategies: {
        llm: {
          render_type: "llm",
          config: { prompt: "default_prompt", model: "openai:gpt-5.4" },
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

// ── Tree-node helpers ────────────────────────────────────────────
// These build ContentNodeData tree fixtures. Each leaf's `nodeId` is emitted
// directly as the rendered `data-id`, so leaf nodeIds here follow the
// `${groupId}_tx001` convention to match the values asserted on rendered HTML.

function leafNode(
  nodeId: string,
  role: string,
  text: string,
  isPruned = false
): ContentNodeData {
  return { nodeId, isPruned, role, text }
}

function groupNode(
  nodeId: string,
  structure: string,
  children: ContentNodeData[],
  isPruned = false
): ContentNodeData {
  return { nodeId, isPruned, structure, children }
}

function imageNode(nodeId: string, imageId: string, isPruned = false): ContentNodeData {
  return {
    nodeId,
    isPruned,
    structure: "image_group",
    children: [{ nodeId: imageId, isPruned: false, role: "image" }],
  }
}

describe("renderPage", () => {
  const htmlResponse = {
    reasoning: "test",
    content: '<div id="content" class="container"><section data-section-type="text_only" data-section-id="pg001_sec001"><p data-id="pg001_gp001_tx001">Hello</p></section></div>',
  }

  it("passes authoritative text order to LLM output validation", async () => {
    let validation: { valid: boolean; errors: string[] } | undefined
    const outOfOrderResponse = {
      reasoning: "restored the page-image order",
      content:
        '<div id="content" class="container"><section data-section-type="text_only" data-section-id="pg001_sec001"><h2 data-id="sense_heading">Sense</h2><h2 data-id="rescue_heading">Rescue</h2></section></div>',
    }
    const fakeLlm: LLMModel = {
      generateObject: async <T>(opts: GenerateObjectOptions) => {
        validation = opts.validate?.(
          outOfOrderResponse,
          opts.context ?? {},
        )
        return {
          object: outOfOrderResponse as T,
        } as GenerateObjectResult<T>
      },
    }

    await renderPage(
      {
        label: "test-book",
        pageId: "pg001",
        pageImageBase64: "base64img",
        sectioning: {
          reasoning: "user reordered Rescue before Sense",
          sections: [
            {
              sectionId: "pg001_sec001",
              sectionType: "text_only",
              nodes: [
                leafNode("rescue_heading", "heading", "Rescue"),
                leafNode("sense_heading", "heading", "Sense"),
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
      fakeLlm,
    )

    expect(validation?.valid).toBe(false)
    expect(validation?.errors).toContainEqual(
      expect.stringContaining(
        'expected "rescue_heading" but found "sense_heading"',
      ),
    )
  })

  it("passes the cancellation signal to LLM calls and stops between sections", async () => {
    const controller = new AbortController()
    const seenSignals: Array<AbortSignal | undefined> = []
    let calls = 0

    const fakeLlm: LLMModel = {
      generateObject: async <T>(opts: GenerateObjectOptions) => {
        calls++
        seenSignals.push(opts.signal)
        const context = opts.context as {
          section_id: string
          section_type: string
          leaf_texts: Array<{ text_id: string; text: string }>
        }
        const leaf = context.leaf_texts[0]
        controller.abort()
        return {
          object: {
            reasoning: "test",
            content: `<div id="content" class="container"><section data-section-type="${context.section_type}" data-section-id="${context.section_id}"><p data-id="${leaf.text_id}">${leaf.text}</p></section></div>`,
          } as T,
        } as GenerateObjectResult<T>
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
                nodes: [
                  groupNode("pg001_gp001", "paragraph", [
                    leafNode("pg001_gp001_tx001", "section_text", "Hello"),
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
                nodes: [
                  groupNode("pg001_gp002", "paragraph", [
                    leafNode("pg001_gp002_tx001", "section_text", "Second"),
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
        fakeLlm,
        undefined,
        undefined,
        { signal: controller.signal },
      )
    ).rejects.toThrow()

    expect(calls).toBe(1)
    expect(seenSignals).toEqual([controller.signal])
  })

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
              nodes: [
                groupNode("pg001_gp001", "paragraph", [
                  leafNode("pg001_gp001_tx001", "section_text", "Hello"),
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
              nodes: [
                groupNode("pg001_gp002", "paragraph", [
                  leafNode("pg001_gp002_tx001", "section_text", "Credits info"),
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
              nodes: [
                groupNode("pg001_gp001", "paragraph", [
                  // All texts pruned — section has no content
                  leafNode("pg001_gp001_tx001", "header_text", "Header", true),
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
        '<div id="content" class="container"><section data-section-type="images_only" data-section-id="pg001_sec001"><img data-id="pg001_im001" src="placeholder" alt="test" /></section></div>',
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
              nodes: [imageNode("pg001_img_node", "pg001_im001")],
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: 1,
              isPruned: false,
            },
          ],
        },
        images: new Map([["pg001_im001", { base64: "imagedata" }]]),
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
              '<div id="content" class="container"><section data-section-type="text_only" data-section-id="pg001_sec001"><p data-id="pg001_gp001_tx001">Hello</p><p data-id="pg001_gp001_tx002">World</p></section></div>',
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
              nodes: [
                groupNode("pg001_gp001", "paragraph", [
                  leafNode("pg001_gp001_tx001", "section_text", "Hello"),
                  leafNode("pg001_gp001_tx002", "section_text", "World"),
                  leafNode("pg001_gp001_tx003", "header_text", "Pruned", true),
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

    const texts = capturedContext?.leaf_texts as Array<{
      text_id: string
      text_type: string
      text: string
    }>
    expect(texts).toHaveLength(2)
    expect(texts[0].text_id).toBe("pg001_gp001_tx001")
    expect(texts[1].text_id).toBe("pg001_gp001_tx002")
  })

  it("preserves original text IDs when earlier entries are pruned", async () => {
    let capturedContext: Record<string, unknown> | undefined

    const fakeLlm: LLMModel = {
      generateObject: async <T>(opts: GenerateObjectOptions) => {
        capturedContext = opts.context
        return {
          object: {
            reasoning: "test",
            content:
              '<div id="content" class="container"><section data-section-type="text_only" data-section-id="pg001_sec001"><p data-id="pg001_gp001_tx002">Second</p><p data-id="pg001_gp001_tx003">Third</p></section></div>',
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
              nodes: [
                groupNode("pg001_gp001", "paragraph", [
                  leafNode("pg001_gp001_tx001", "header_text", "First (pruned)", true),
                  leafNode("pg001_gp001_tx002", "section_text", "Second"),
                  leafNode("pg001_gp001_tx003", "section_text", "Third"),
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

    const texts = capturedContext?.leaf_texts as Array<{
      text_id: string
      text_type: string
      text: string
    }>
    expect(texts).toHaveLength(2)
    expect(texts[0].text_id).toBe("pg001_gp001_tx002")
    expect(texts[1].text_id).toBe("pg001_gp001_tx003")
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
              '<div id="content" class="container"><section data-section-type="text_only" data-section-id="pg001_sec001"><p data-id="pg001_gp001_tx001">Hello</p></section></div>',
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
              nodes: [
                groupNode("pg001_gp001", "paragraph", [
                  leafNode("pg001_gp001_tx001", "section_text", "Hello"),
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

    const texts = capturedContext?.leaf_texts as Array<{
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
            content: `<div id="content" class="container"><section data-section-type="text_only" data-section-id="pg001_sec00${callCount}"><p data-id="pg001_gp00${callCount}_tx001">Text ${callCount}</p></section></div>`,
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
              nodes: [
                groupNode("pg001_gp001", "paragraph", [
                  leafNode("pg001_gp001_tx001", "section_text", "First"),
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
              nodes: [
                groupNode("pg001_gp002", "paragraph", [
                  leafNode("pg001_gp002_tx001", "section_text", "Second"),
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
        return '<section data-section-type="text_only" data-section-id="pg001_sec001"><p data-id="pg001_gp001_tx001">Hello</p></section>'
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
              nodes: [
                groupNode("pg001_gp001", "paragraph", [
                  leafNode("pg001_gp001_tx001", "section_text", "Hello"),
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

    // Check template context shape — tree-based
    const nodes = capturedContext?.nodes as Array<{ node_id: string; structure?: string }>
    expect(nodes).toHaveLength(1)
    expect(nodes[0].node_id).toBe("pg001_gp001")
    expect(nodes[0].structure).toBe("paragraph")
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
                nodes: [
                  groupNode("pg001_gp001", "paragraph", [
                    leafNode("pg001_gp001_tx001", "section_text", "Hello"),
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
            ? '<div id="content" class="container"><section data-section-type="text_only" data-section-id="pg001_sec001"><p data-id="pg001_gp001_tx001">First</p></section></div>'
            : '<div id="content" class="container"><section data-section-type="text_only" data-section-id="pg001_sec002"><p data-id="pg001_gp002_tx001">Second</p></section></div>'
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
              nodes: [
                groupNode("pg001_gp001", "paragraph", [
                  leafNode("pg001_gp001_tx001", "section_text", "First"),
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
              nodes: [
                groupNode("pg001_gp002", "paragraph", [
                  leafNode("pg001_gp002_tx001", "section_text", "Second"),
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
        '<div id="content" class="container"><section data-section-type="activity_multiple_choice" data-section-id="pg001_sec001"><div data-id="pg001_gp001_tx001">Question</div><div data-id="activity_gen_opt1">Option A</div></section></div>',
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
      modelId: "openai:gpt-5.4",
      maxRetries: 5,
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
              nodes: [
                groupNode("pg001_gp001", "paragraph", [
                  leafNode("pg001_gp001_tx001", "instruction_text", "Question"),
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

  it("derives ordering ranks deterministically without a second LLM call", async () => {
    const llmCalls: string[] = []
    const fakeLlm: LLMModel = {
      generateObject: async <T>(opts: GenerateObjectOptions) => {
        llmCalls.push(opts.log?.taskType ?? "unknown")
        return {
          object: {
            reasoning: "ordering reasoning",
            content: `<div id="content"><section data-section-type="activity_ordering" data-section-id="pg001_sec001" data-correct-order="item-2,item-1,item-3">
              <p data-id="pg001_gp001_tx001">Arrange the items.</p>
              <ol data-activity-order-list>
                <li data-activity-item="item-1"><span data-id="activity_gen_item1">One</span></li>
                <li data-activity-item="item-2"><span data-id="activity_gen_item2">Two</span></li>
                <li data-activity-item="item-3"><span data-id="activity_gen_item3">Three</span></li>
              </ol>
            </section></div>`,
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
              sectionType: "activity_ordering",
              nodes: [
                groupNode("pg001_gp001", "activity", [
                  leafNode("pg001_gp001_tx001", "activity_question", "Arrange the items."),
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
      () => ({
        renderType: "activity",
        promptName: "activity_ordering",
        modelId: "openai:gpt-5.4",
        maxRetries: 5,
        timeoutMs: 180000,
        answerPromptName: "must-not-be-called-for-ordering",
        templateName: "",
      }),
      fakeLlm,
    )

    expect(llmCalls).toEqual(["activity-rendering"])
    expect(result.sections[0].activityReasoning).toContain("Derived deterministically")
    expect(result.sections[0].activityAnswers).toEqual({
      "item-2": "1",
      "item-1": "2",
      "item-3": "3",
    })
  })

  it("skips answer generation when answerPromptName is empty", async () => {
    const llmCalls: string[] = []
    const activityHtmlResponse = {
      reasoning: "open ended reasoning",
      content:
        '<div id="content" class="container"><section data-section-type="activity_open_ended_answer" data-section-id="pg001_sec001"><div data-id="pg001_gp001_tx001">Question</div><textarea data-id="activity_gen_input1"></textarea></section></div>',
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
      modelId: "openai:gpt-5.4",
      maxRetries: 5,
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
              nodes: [
                groupNode("pg001_gp001", "paragraph", [
                  leafNode("pg001_gp001_tx001", "instruction_text", "Question"),
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
        '<div id="content" class="container"><section data-section-type="text" data-section-id="pg001_sec001"><div data-id="pg001_gp001_tx001">Body text</div></section></div>',
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
      modelId: "openai:gpt-5.4",
      maxRetries: 5,
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
              nodes: [
                groupNode("pg001_gp001", "paragraph", [
                  leafNode("pg001_gp001_tx001", "body_text", "Body text"),
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

  it("persists repaired underline activity html before saving", async () => {
    const fakeLlm: LLMModel = {
      generateObject: async <T>(opts: GenerateObjectOptions) => {
        if (opts.log?.taskType === "activity-answers") {
          return {
            object: {
              reasoning: "answer reasoning",
              answers: [{ id: "item-1", value: true }],
            } as T,
          } as GenerateObjectResult<T>
        }

        return {
          object: {
            reasoning: "underline reasoning",
            content:
              '<div id="content" class="container"><section data-section-type="activity_underline_text" data-section-id="pg001_sec001"><div data-id="t1">Mfano:</div><div data-id="t2">She reads books.</div><div data-id="t3">(i)</div><div data-id="t4">We sing songs.</div></section></div>',
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
              sectionType: "activity_underline_text",
              nodes: [
                groupNode("g1", "paragraph", [
                  leafNode("t1", "instruction_text", "Mfano:"),
                  leafNode("t2", "instruction_text", "She reads books."),
                  leafNode("t3", "instruction_text", "(i)"),
                  leafNode("t4", "instruction_text", "We sing songs."),
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
      (): RenderConfig => ({
        renderType: "activity",
        promptName: "activity_underline_text",
        modelId: "openai:gpt-5.4",
        maxRetries: 5,
        timeoutMs: 180000,
        answerPromptName: "activity_underline_text_answers",
        templateName: "",
      }),
      fakeLlm
    )

    expect(result.sections).toHaveLength(1)
    expect(result.sections[0].html).toContain("activity-underline-option")
    expect(result.sections[0].html).toContain('data-question-group="question-group-1"')
  })

  it("skips pruned parts within a section", async () => {
    let capturedContext: Record<string, unknown> | undefined

    const fakeLlm: LLMModel = {
      generateObject: async <T>(opts: GenerateObjectOptions) => {
        capturedContext = opts.context
        return {
          object: {
            reasoning: "test",
            content: '<div id="content" class="container"><section><p data-id="pg001_gp001_tx001">Hello</p></section></div>',
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
              nodes: [
                groupNode("pg001_gp001", "paragraph", [
                  leafNode("pg001_gp001_tx001", "section_text", "Hello"),
                ]),
                groupNode(
                  "pg001_gp002",
                  "heading",
                  [leafNode("pg001_gp002_tx001", "header_text", "Pruned group")],
                  true // container-level pruned
                ),
                imageNode("pg001_img_node", "pg001_im001", true), // pruned image
              ],
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: 1,
              isPruned: false,
            },
          ],
        },
        images: new Map([["pg001_im001", { base64: "imagedata" }]]),
      },
      defaultResolveConfig,
      fakeLlm
    )

    // Only unpruned parts should be passed to the renderer
    const texts = capturedContext?.leaf_texts as Array<{ text_id: string }>
    expect(texts).toHaveLength(1)
    expect(texts[0].text_id).toBe("pg001_gp001_tx001")

    const images = capturedContext?.images as Array<{ image_id: string }>
    expect(images).toHaveLength(0)
  })
})

describe("buildRenderStrategyResolver — activity", () => {
  it("resolves activity strategy with answerPromptName", () => {
    const appConfig: AppConfig = {
      role_types: { heading: "Heading" },
      structure_types: { paragraph: "Paragraph" },
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
            model: "openai:gpt-5.4",
            max_retries: 5,
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
    expect(config.modelId).toBe("openai:gpt-5.4")
    expect(config.maxRetries).toBe(5)
    expect(config.timeoutMs).toBe(180000)
  })

  it("resolves activity strategy without answer_prompt to empty answerPromptName", () => {
    const appConfig: AppConfig = {
      role_types: { heading: "Heading" },
      structure_types: { paragraph: "Paragraph" },
      render_strategies: {
        activity_open_ended: {
          render_type: "activity",
          config: {
            prompt: "activity_open_ended_answer",
            model: "openai:gpt-5.4",
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

describe("collectReferencedImageIds", () => {
  const leaf = (nodeId: string, role = "text"): ContentNodeData => ({
    nodeId,
    isPruned: false,
    role,
    ...(role !== "image" ? { text: "" } : {}),
  })

  const section = (nodes: ContentNodeData[], isPruned = false) => ({
    sectionId: "p1_sec001",
    sectionType: "content",
    backgroundColor: "#fff",
    textColor: "#000",
    pageNumber: 1,
    isPruned,
    nodes,
  })

  it("collects image ids at any depth, including foreign-page ids", () => {
    const ids = collectReferencedImageIds([
      section([
        leaf("p1_n0001"),
        leaf("p1_im001", "image"),
        {
          nodeId: "p1_n0002",
          isPruned: false,
          structure: "group",
          children: [leaf("p5_im003", "image")],
        },
      ]),
    ])
    expect([...ids].sort()).toEqual(["p1_im001", "p5_im003"])
  })

  it("skips pruned images, pruned subtrees, and pruned sections", () => {
    const prunedImage = { ...leaf("p1_im001", "image"), isPruned: true }
    const prunedGroup: ContentNodeData = {
      nodeId: "p1_n0001",
      isPruned: true,
      structure: "group",
      children: [leaf("p1_im002", "image")],
    }
    const ids = collectReferencedImageIds([
      section([prunedImage, prunedGroup, leaf("p1_im003", "image")]),
      section([leaf("p1_im004", "image")], true),
    ])
    expect([...ids]).toEqual(["p1_im003"])
  })
})

describe("renderPage — cross-page merged sections", () => {
  it("passes source page images for sections with sourcePageIds", async () => {
    let capturedContext: Record<string, unknown> | undefined
    const fakeLlm: LLMModel = {
      generateObject: async <T>(opts: GenerateObjectOptions) => {
        capturedContext = opts.context
        return {
          object: {
            reasoning: "test",
            content:
              '<div id="content" class="container"><section data-section-type="text_only" data-section-id="pg006_sec001"><p data-id="pg005_n0001">Hello</p></section></div>',
          } as T,
        } as GenerateObjectResult<T>
      },
    }

    await renderPage(
      {
        label: "test-book",
        pageId: "pg006",
        pageImageBase64: "targetpageimg",
        sectioning: {
          reasoning: "test",
          sections: [
            {
              sectionId: "pg006_sec001",
              sectionType: "text_only",
              nodes: [
                groupNode("pg005_gp001", "paragraph", [
                  leafNode("pg005_n0001", "section_text", "Hello"),
                ]),
              ],
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: 6,
              isPruned: false,
              sourcePageIds: ["pg005"],
            },
          ],
        },
        images: new Map(),
        sourcePageImages: new Map([["pg005", "sourcepageimg"]]),
      },
      defaultResolveConfig,
      fakeLlm
    )

    expect(capturedContext?.source_pages).toEqual([
      { page_id: "pg005", image_base64: "sourcepageimg" },
    ])
    expect(capturedContext?.page_image_base64).toBe("targetpageimg")
  })

  it("passes an empty source_pages list for ordinary sections", async () => {
    let capturedContext: Record<string, unknown> | undefined
    const fakeLlm: LLMModel = {
      generateObject: async <T>(opts: GenerateObjectOptions) => {
        capturedContext = opts.context
        return {
          object: {
            reasoning: "test",
            content:
              '<div id="content" class="container"><section data-section-type="text_only" data-section-id="pg001_sec001"><p data-id="pg001_n0001">Hello</p></section></div>',
          } as T,
        } as GenerateObjectResult<T>
      },
    }

    await renderPage(
      {
        label: "test-book",
        pageId: "pg001",
        pageImageBase64: "img",
        sectioning: {
          reasoning: "test",
          sections: [
            {
              sectionId: "pg001_sec001",
              sectionType: "text_only",
              nodes: [
                groupNode("pg001_gp001", "paragraph", [
                  leafNode("pg001_n0001", "section_text", "Hello"),
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

    expect(capturedContext?.source_pages).toEqual([])
  })
})
