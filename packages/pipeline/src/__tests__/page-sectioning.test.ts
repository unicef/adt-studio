import { describe, expect, it } from "vitest"
import type { AppConfig, TextClassificationOutput } from "@adt/types"
import type { LLMModel, GenerateObjectResult, GenerateObjectOptions } from "@adt/llm"
import {
  buildSectioningConfig,
  buildGroupSummaries,
  sectionPage,
} from "../page-sectioning.js"

describe("buildSectioningConfig", () => {
  it("extracts section types and config from AppConfig", () => {
    const appConfig: AppConfig = {
      text_types: { heading: "Heading" },
      text_group_types: { paragraph: "Paragraph" },
      section_types: {
        text_only: "Reading section with only text",
        images_only: "Section with only images",
      },
      pruned_section_types: ["credits"],
      page_sectioning: {
        prompt: "custom_sectioning",
        model: "openai:gpt-4.1-mini",
        max_retries: 7,
      },
    }

    const config = buildSectioningConfig(appConfig)
    expect(config.promptName).toBe("custom_sectioning")
    expect(config.modelId).toBe("openai:gpt-4.1-mini")
    expect(config.maxRetries).toBe(7)
    expect(config.sectionTypes).toEqual([
      { key: "text_only", description: "Reading section with only text" },
      { key: "images_only", description: "Section with only images" },
    ])
    expect(config.prunedSectionTypes).toEqual(["credits"])
  })

  it("excludes disabled section types from sectionTypes", () => {
    const appConfig: AppConfig = {
      text_types: { heading: "Heading" },
      text_group_types: { paragraph: "Paragraph" },
      section_types: {
        text_only: "Reading section with only text",
        images_only: "Section with only images",
        credits: "Credits section",
      },
      pruned_section_types: ["credits"],
      disabled_section_types: ["images_only"],
    }

    const config = buildSectioningConfig(appConfig)
    expect(config.sectionTypes).toEqual([
      { key: "text_only", description: "Reading section with only text" },
      { key: "credits", description: "Credits section" },
    ])
    expect(config.prunedSectionTypes).toEqual(["credits"])
  })

  it("handles empty disabled_section_types", () => {
    const appConfig: AppConfig = {
      text_types: { heading: "Heading" },
      text_group_types: { paragraph: "Paragraph" },
      section_types: { text_only: "Text" },
      disabled_section_types: [],
    }

    const config = buildSectioningConfig(appConfig)
    expect(config.sectionTypes).toEqual([
      { key: "text_only", description: "Text" },
    ])
  })

  it("defaults prompt and model when not specified", () => {
    const appConfig: AppConfig = {
      text_types: { heading: "Heading" },
      text_group_types: { paragraph: "Paragraph" },
    }

    const config = buildSectioningConfig(appConfig)
    expect(config.promptName).toBe("page_sectioning")
    expect(config.modelId).toBe("openai:gpt-5.2")
    expect(config.maxRetries).toBe(5)
    expect(config.sectionTypes).toEqual([])
    expect(config.prunedSectionTypes).toEqual([])
  })
})

describe("buildGroupSummaries", () => {
  it("builds summaries from unpruned text entries", () => {
    const textClassification: TextClassificationOutput = {
      reasoning: "test",
      groups: [
        {
          groupId: "pg001_gp001",
          groupType: "paragraph",
          texts: [
            { textType: "section_text", text: "Hello world.", isPruned: false },
            { textType: "section_text", text: "More text.", isPruned: false },
          ],
        },
        {
          groupId: "pg001_gp002",
          groupType: "heading",
          texts: [
            { textType: "section_heading", text: "Chapter 1", isPruned: false },
          ],
        },
      ],
    }

    const summaries = buildGroupSummaries(textClassification)
    expect(summaries).toEqual([
      {
        groupId: "pg001_gp001",
        groupType: "paragraph",
        text: "Hello world. More text.",
      },
      {
        groupId: "pg001_gp002",
        groupType: "heading",
        text: "Chapter 1",
      },
    ])
  })

  it("excludes groups where all texts are pruned", () => {
    const textClassification: TextClassificationOutput = {
      reasoning: "test",
      groups: [
        {
          groupId: "pg001_gp001",
          groupType: "paragraph",
          texts: [
            { textType: "header_text", text: "Header", isPruned: true },
          ],
        },
        {
          groupId: "pg001_gp002",
          groupType: "paragraph",
          texts: [
            { textType: "section_text", text: "Body text", isPruned: false },
          ],
        },
      ],
    }

    const summaries = buildGroupSummaries(textClassification)
    expect(summaries).toHaveLength(1)
    expect(summaries[0].groupId).toBe("pg001_gp002")
  })

  it("excludes pruned texts within a group", () => {
    const textClassification: TextClassificationOutput = {
      reasoning: "test",
      groups: [
        {
          groupId: "pg001_gp001",
          groupType: "paragraph",
          texts: [
            { textType: "page_number", text: "42", isPruned: true },
            { textType: "section_text", text: "Body text", isPruned: false },
          ],
        },
      ],
    }

    const summaries = buildGroupSummaries(textClassification)
    expect(summaries).toEqual([
      { groupId: "pg001_gp001", groupType: "paragraph", text: "Body text" },
    ])
  })
})

describe("sectionPage", () => {
  it("returns empty sections when no content", async () => {
    const fakeLlm: LLMModel = {
      generateObject: async <T>() =>
        ({ object: { reasoning: "", sections: [] } as T }) as GenerateObjectResult<T>,
    }

    const result = await sectionPage(
      {
        pageId: "pg001",
        pageNumber: 1,
        pageImageBase64: "base64img",
        textClassification: { reasoning: "test", groups: [] },
        imageClassification: { images: [] },
        images: [],
      },
      {
        sectionTypes: [{ key: "text_only", description: "Text only" }],
        prunedSectionTypes: [],
        promptName: "page_sectioning",
        modelId: "openai:gpt-4o",
      },
      fakeLlm
    )

    expect(result.reasoning).toBe("No content to section")
    expect(result.sections).toEqual([])
  })

  it("calls LLM and post-processes sections", async () => {
    const response = {
      reasoning: "Grouped content logically",
      sections: [
        {
          section_type: "text_only",
          part_ids: ["pg001_gp001"],
          background_color: "#ffffff",
          text_color: "#000000",
          page_number: 1,
        },
        {
          section_type: "credits",
          part_ids: ["pg001_gp002"],
          background_color: "#f0f0f0",
          text_color: "#333333",
          page_number: null,
        },
      ],
    }

    const fakeLlm: LLMModel = {
      generateObject: async <T>() =>
        ({ object: response as T }) as GenerateObjectResult<T>,
    }

    const result = await sectionPage(
      {
        pageId: "pg001",
        pageNumber: 1,
        pageImageBase64: "base64img",
        textClassification: {
          reasoning: "test",
          groups: [
            {
              groupId: "pg001_gp001",
              groupType: "paragraph",
              texts: [
                {
                  textType: "section_text",
                  text: "Body text",
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
        imageClassification: { images: [] },
        images: [],
      },
      {
        sectionTypes: [
          { key: "text_only", description: "Text only" },
          { key: "credits", description: "Credits" },
        ],
        prunedSectionTypes: ["credits"],
        promptName: "page_sectioning",
        modelId: "openai:gpt-4o",
      },
      fakeLlm
    )

    expect(result.reasoning).toBe("Grouped content logically")
    expect(result.sections).toHaveLength(2)

    expect(result.sections[0]).toEqual({
      sectionId: "pg001_sec001",
      sectionType: "text_only",
      parts: [
        {
          type: "text_group",
          groupId: "pg001_gp001",
          groupType: "paragraph",
          texts: [
            { textId: "pg001_gp001_tx001", textType: "section_text", text: "Body text", isPruned: false },
          ],
          isPruned: false,
        },
      ],
      backgroundColor: "#ffffff",
      textColor: "#000000",
      pageNumber: 1,
      isPruned: false,
    })

    expect(result.sections[1]).toEqual({
      sectionId: "pg001_sec002",
      sectionType: "credits",
      parts: [
        {
          type: "text_group",
          groupId: "pg001_gp002",
          groupType: "paragraph",
          texts: [
            { textId: "pg001_gp002_tx001", textType: "section_text", text: "Credits info", isPruned: false },
          ],
          isPruned: false,
        },
      ],
      backgroundColor: "#f0f0f0",
      textColor: "#333333",
      pageNumber: null,
      isPruned: true,
    })
  })

  it("filters pruned images from LLM input", async () => {
    let capturedContext: Record<string, unknown> | undefined

    const fakeLlm: LLMModel = {
      generateObject: async <T>(opts: GenerateObjectOptions) => {
        capturedContext = opts.context
        return {
          object: { reasoning: "test", sections: [] } as T,
        } as GenerateObjectResult<T>
      },
    }

    await sectionPage(
      {
        pageId: "pg001",
        pageNumber: 1,
        pageImageBase64: "base64img",
        textClassification: {
          reasoning: "test",
          groups: [
            {
              groupId: "pg001_gp001",
              groupType: "paragraph",
              texts: [
                {
                  textType: "section_text",
                  text: "Body",
                  isPruned: false,
                },
              ],
            },
          ],
        },
        imageClassification: {
          images: [
            { imageId: "pg001_im001", isPruned: true, reason: "too small" },
            { imageId: "pg001_im002", isPruned: false },
          ],
        },
        images: [
          { imageId: "pg001_im001", imageBase64: "small" },
          { imageId: "pg001_im002", imageBase64: "good" },
        ],
      },
      {
        sectionTypes: [{ key: "text_only", description: "Text only" }],
        prunedSectionTypes: [],
        promptName: "page_sectioning",
        modelId: "openai:gpt-4o",
      },
      fakeLlm
    )

    // Only unpruned image should be passed to LLM
    const images = capturedContext?.images as Array<{ image_id: string }>
    expect(images).toHaveLength(1)
    expect(images[0].image_id).toBe("pg001_im002")
  })

  it("adds unassigned parts as pruned to last non-pruned section", async () => {
    const response = {
      reasoning: "Only used first group",
      sections: [
        {
          section_type: "text_only",
          part_ids: ["pg001_gp001"],
          background_color: "#ffffff",
          text_color: "#000000",
          page_number: 1,
        },
      ],
    }

    const fakeLlm: LLMModel = {
      generateObject: async <T>() =>
        ({ object: response as T }) as GenerateObjectResult<T>,
    }

    const result = await sectionPage(
      {
        pageId: "pg001",
        pageNumber: 1,
        pageImageBase64: "base64img",
        textClassification: {
          reasoning: "test",
          groups: [
            {
              groupId: "pg001_gp001",
              groupType: "paragraph",
              texts: [
                { textType: "section_text", text: "Body", isPruned: false },
              ],
            },
            {
              groupId: "pg001_gp002",
              groupType: "heading",
              texts: [
                { textType: "header_text", text: "Header", isPruned: true },
              ],
            },
          ],
        },
        imageClassification: {
          images: [
            { imageId: "pg001_im001", isPruned: true, reason: "too small" },
          ],
        },
        images: [],
      },
      {
        sectionTypes: [{ key: "text_only", description: "Text only" }],
        prunedSectionTypes: [],
        promptName: "page_sectioning",
        modelId: "openai:gpt-4o",
      },
      fakeLlm
    )

    // Section should have the assigned group + unassigned group and image as pruned
    expect(result.sections).toHaveLength(1)
    expect(result.sections[0].parts).toHaveLength(3)
    expect(result.sections[0].parts[0]).toEqual({
      type: "text_group",
      groupId: "pg001_gp001",
      groupType: "paragraph",
      texts: [{ textId: "pg001_gp001_tx001", textType: "section_text", text: "Body", isPruned: false }],
      isPruned: false,
    })
    expect(result.sections[0].parts[1]).toEqual({
      type: "text_group",
      groupId: "pg001_gp002",
      groupType: "heading",
      texts: [{ textId: "pg001_gp002_tx001", textType: "header_text", text: "Header", isPruned: true }],
      isPruned: true,
    })
    expect(result.sections[0].parts[2]).toEqual({
      type: "image",
      imageId: "pg001_im001",
      isPruned: true,
      reason: "too small",
    })
  })

  it("throws when no section types configured", async () => {
    const fakeLlm: LLMModel = {
      generateObject: async <T>() =>
        ({ object: { reasoning: "", sections: [] } as T }) as GenerateObjectResult<T>,
    }

    await expect(
      sectionPage(
        {
          pageId: "pg001",
          pageNumber: 1,
          pageImageBase64: "base64img",
          textClassification: {
            reasoning: "test",
            groups: [
              {
                groupId: "pg001_gp001",
                groupType: "paragraph",
                texts: [
                  {
                    textType: "section_text",
                    text: "Body",
                    isPruned: false,
                  },
                ],
              },
            ],
          },
          imageClassification: { images: [] },
          images: [],
        },
        {
          sectionTypes: [],
          prunedSectionTypes: [],
          promptName: "page_sectioning",
          modelId: "openai:gpt-4o",
        },
        fakeLlm
      )
    ).rejects.toThrow("No section types configured")
  })
})
