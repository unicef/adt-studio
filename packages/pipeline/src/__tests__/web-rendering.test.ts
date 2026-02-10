import { describe, expect, it } from "vitest"
import type { AppConfig } from "@adt/types"
import type { LLMModel, GenerateObjectResult, GenerateObjectOptions } from "@adt/llm"
import { buildRenderConfig, renderPage } from "../web-rendering.js"

describe("buildRenderConfig", () => {
  it("extracts web rendering config from AppConfig", () => {
    const appConfig: AppConfig = {
      text_types: { heading: "Heading" },
      text_group_types: { paragraph: "Paragraph" },
      web_rendering: {
        prompt: "custom_render",
        model: "openai:gpt-4.1-mini",
        max_retries: 8,
      },
    }

    const config = buildRenderConfig(appConfig)
    expect(config.promptName).toBe("custom_render")
    expect(config.modelId).toBe("openai:gpt-4.1-mini")
    expect(config.maxRetries).toBe(8)
  })

  it("defaults prompt, model, and maxRetries when not specified", () => {
    const appConfig: AppConfig = {
      text_types: { heading: "Heading" },
      text_group_types: { paragraph: "Paragraph" },
    }

    const config = buildRenderConfig(appConfig)
    expect(config.promptName).toBe("web_generation_html")
    expect(config.modelId).toBe("openai:gpt-4o")
    expect(config.maxRetries).toBe(8)
  })
})

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
        pageId: "pg001",
        pageImageBase64: "base64img",
        sectioning: {
          reasoning: "test",
          sections: [
            {
              sectionType: "text_only",
              partIds: ["pg001_gp001"],
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: 1,
              isPruned: false,
            },
            {
              sectionType: "credits",
              partIds: ["pg001_gp002"],
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: null,
              isPruned: true,
            },
          ],
        },
        textClassification: {
          reasoning: "test",
          groups: [
            {
              groupId: "pg001_gp001",
              groupType: "paragraph",
              texts: [
                {
                  textType: "section_text",
                  text: "Hello",
                  isPruned: false,
                },
              ],
            },
            {
              groupId: "pg001_gp002",
              groupType: "paragraph",
              texts: [
                {
                  textType: "section_text",
                  text: "Credits info",
                  isPruned: false,
                },
              ],
            },
          ],
        },
        images: new Map(),
      },
      { promptName: "web_generation_html", modelId: "openai:gpt-4o", maxRetries: 8 },
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
        pageId: "pg001",
        pageImageBase64: "base64img",
        sectioning: {
          reasoning: "test",
          sections: [
            {
              sectionType: "text_only",
              partIds: ["pg001_gp001"],
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: 1,
              isPruned: false,
            },
          ],
        },
        textClassification: {
          reasoning: "test",
          groups: [
            {
              groupId: "pg001_gp001",
              groupType: "paragraph",
              texts: [
                // All texts pruned — section has no content
                {
                  textType: "header_text",
                  text: "Header",
                  isPruned: true,
                },
              ],
            },
          ],
        },
        images: new Map(),
      },
      { promptName: "web_generation_html", modelId: "openai:gpt-4o", maxRetries: 8 },
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
        pageId: "pg001",
        pageImageBase64: "base64img",
        sectioning: {
          reasoning: "test",
          sections: [
            {
              sectionType: "images_only",
              partIds: ["pg001_im001"],
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: 1,
              isPruned: false,
            },
          ],
        },
        textClassification: {
          reasoning: "test",
          groups: [],
        },
        images: new Map([["pg001_im001", "imagedata"]]),
      },
      { promptName: "web_generation_html", modelId: "openai:gpt-4o", maxRetries: 8 },
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
        pageId: "pg001",
        pageImageBase64: "base64img",
        sectioning: {
          reasoning: "test",
          sections: [
            {
              sectionType: "text_only",
              partIds: ["pg001_gp001"],
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: 1,
              isPruned: false,
            },
          ],
        },
        textClassification: {
          reasoning: "test",
          groups: [
            {
              groupId: "pg001_gp001",
              groupType: "paragraph",
              texts: [
                { textType: "section_text", text: "Hello", isPruned: false },
                { textType: "section_text", text: "World", isPruned: false },
                { textType: "header_text", text: "Pruned", isPruned: true },
              ],
            },
          ],
        },
        images: new Map(),
      },
      { promptName: "web_generation_html", modelId: "openai:gpt-4o", maxRetries: 8 },
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
        pageId: "pg001",
        pageImageBase64: "base64img",
        sectioning: {
          reasoning: "test",
          sections: [
            {
              sectionType: "text_only",
              partIds: ["pg001_gp001"],
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: 1,
              isPruned: false,
            },
          ],
        },
        textClassification: {
          reasoning: "test",
          groups: [
            {
              groupId: "pg001_gp001",
              groupType: "paragraph",
              texts: [
                { textType: "section_text", text: "Hello", isPruned: false },
              ],
            },
          ],
        },
        images: new Map(),
      },
      { promptName: "web_generation_html", modelId: "openai:gpt-4o", maxRetries: 8 },
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
        pageId: "pg001",
        pageImageBase64: "base64img",
        sectioning: {
          reasoning: "test",
          sections: [
            {
              sectionType: "text_only",
              partIds: ["pg001_gp001"],
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: 1,
              isPruned: false,
            },
            {
              sectionType: "text_only",
              partIds: ["pg001_gp002"],
              backgroundColor: "#ffffff",
              textColor: "#000000",
              pageNumber: 1,
              isPruned: false,
            },
          ],
        },
        textClassification: {
          reasoning: "test",
          groups: [
            {
              groupId: "pg001_gp001",
              groupType: "paragraph",
              texts: [
                { textType: "section_text", text: "First", isPruned: false },
              ],
            },
            {
              groupId: "pg001_gp002",
              groupType: "paragraph",
              texts: [
                { textType: "section_text", text: "Second", isPruned: false },
              ],
            },
          ],
        },
        images: new Map(),
      },
      { promptName: "web_generation_html", modelId: "openai:gpt-4o", maxRetries: 8 },
      fakeLlm
    )

    expect(result.sections).toHaveLength(2)
    expect(result.sections[0].sectionIndex).toBe(0)
    expect(result.sections[1].sectionIndex).toBe(1)
  })
})
