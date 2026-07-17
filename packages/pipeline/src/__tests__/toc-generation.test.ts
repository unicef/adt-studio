import { describe, expect, it } from "vitest"
import type { AppConfig } from "@adt/types"
import type {
  GenerateObjectOptions,
  GenerateObjectResult,
  LLMModel,
} from "@adt/llm"
import type { Storage, PageData } from "@adt/storage"
import {
  buildTocGenerationConfig,
  generateToc,
} from "../toc-generation.js"

describe("buildTocGenerationConfig", () => {
  it("uses defaults when no toc_generation config", () => {
    const appConfig: AppConfig = {
      role_types: { section_text: "Main" },
      structure_types: { paragraph: "Para" },
    }
    const config = buildTocGenerationConfig(appConfig, "English")
    expect(config.promptName).toBe("toc_generation")
    expect(config.modelId).toBe("openai:gpt-4.1")
    expect(config.maxRetries).toBe(5)
    expect(config.language).toBe("English")
    expect(config.mode).toBe("extract")
  })

  it("reads mode from app config", () => {
    const appConfig: AppConfig = {
      role_types: { section_text: "Main" },
      structure_types: { paragraph: "Para" },
      toc_mode: "dynamic",
    }
    const config = buildTocGenerationConfig(appConfig, "English")
    expect(config.mode).toBe("dynamic")
  })

  it("falls back to page_sectioning model", () => {
    const appConfig: AppConfig = {
      role_types: { section_text: "Main" },
      structure_types: { paragraph: "Para" },
      page_sectioning: { model: "openai:gpt-4.1-mini" },
    }
    const config = buildTocGenerationConfig(appConfig, "en")
    expect(config.modelId).toBe("openai:gpt-4.1-mini")
  })
})

function makeStorageWithSection(opts: {
  headingText?: string
  tocSection?: boolean
}): Storage {
  return {
    getLatestNodeData: (node: string) => {
      if (node === "page-sectioning") {
        return {
          version: 1,
          data: {
            reasoning: "",
            sections: [
              ...(opts.tocSection
                ? [
                    {
                      sectionId: "toc_section",
                      sectionType: "table_of_contents",
                      backgroundColor: "#fff",
                      textColor: "#000",
                      isPruned: false,
                      nodes: [],
                      pageNumber: 1,
                    },
                  ]
                : []),
              {
                sectionId: "sec_001",
                sectionType: "content",
                backgroundColor: "#fff",
                textColor: "#000",
                isPruned: false,
                pageNumber: 1,
                nodes: [
                  {
                    nodeId: "h_001",
                    isPruned: false,
                    role: "heading",
                    text: opts.headingText ?? "Chapter 1",
                  },
                ],
              },
            ],
          },
        }
      }
      if (node === "web-rendering") {
        return {
          version: 1,
          data: {
            sections: [
              ...(opts.tocSection
                ? [
                    {
                      sectionIndex: 0,
                      sectionType: "table_of_contents",
                      reasoning: "",
                      html: "<p>Original printed TOC here</p>",
                    },
                  ]
                : []),
              {
                sectionIndex: opts.tocSection ? 1 : 0,
                sectionType: "content",
                reasoning: "",
                html: "<h1>Chapter 1</h1>",
              },
            ],
          },
        }
      }
      return null
    },
  } as unknown as Storage
}

describe("generateToc", () => {
  const pages: PageData[] = [{ pageId: "pg001", pageNumber: 1, text: "" }]

  function makeLlm(
    onCall: (options: GenerateObjectOptions) => void,
  ): LLMModel {
    return {
      generateObject: async <T>(options: GenerateObjectOptions) => {
        onCall(options)
        return {
          object: {
            reasoning: "",
            entries: [
              { title: "Chapter 1", sectionId: "sec_001", level: 1 },
            ],
          } as T,
        } as GenerateObjectResult<T>
      },
    }
  }

  it("passes mode to LLM context and surfaces original TOC in extract mode", async () => {
    let capturedContext: Record<string, unknown> | null = null
    const llm = makeLlm((opts) => {
      capturedContext = opts.context as Record<string, unknown>
    })

    await generateToc({
      storage: makeStorageWithSection({ tocSection: true }),
      pages,
      config: {
        ...buildTocGenerationConfig(
          { role_types: {}, structure_types: {} },
          "English",
        ),
        mode: "extract",
      },
      llmModel: llm,
    })

    expect(capturedContext?.mode).toBe("extract")
    expect(capturedContext?.has_original_toc).toBe(true)
    expect(capturedContext?.original_toc_text).toContain("Original printed TOC")
  })

  it("collects headings from the semantic tree for fixed-layout pages", async () => {
    let capturedContext: Record<string, unknown> | null = null
    const llm = makeLlm((opts) => {
      capturedContext = opts.context as Record<string, unknown>
    })

    // Fixed-layout: the render (positioned) tree has only text/image roles;
    // the heading lives in the semantic page-sectioning tree.
    const storage = {
      getLatestNodeData: (node: string) => {
        if (node === "fixed-layout-sectioning") {
          return {
            version: 1,
            data: {
              reasoning: "",
              sections: [
                {
                  sectionId: "pg001_sec001",
                  sectionType: "fixed-layout-page",
                  backgroundColor: "#fff",
                  textColor: "#000",
                  isPruned: false,
                  pageNumber: 1,
                  viewport: { width: 595, height: 420 },
                  nodes: [
                    { nodeId: "pg001_im001", isPruned: false, role: "image" },
                    { nodeId: "pg001_t001", isPruned: false, role: "text", text: "The Real Title" },
                  ],
                },
              ],
            },
          }
        }
        if (node === "page-sectioning") {
          return {
            version: 1,
            data: {
              reasoning: "",
              sections: [
                {
                  sectionId: "pg001_sec001",
                  sectionType: "fixed-layout-page",
                  backgroundColor: "#fff",
                  textColor: "#000",
                  isPruned: false,
                  pageNumber: 1,
                  nodes: [
                    { nodeId: "pg001_h001", isPruned: false, role: "heading", text: "The Real Title" },
                  ],
                },
              ],
            },
          }
        }
        if (node === "web-rendering") {
          return {
            version: 1,
            data: {
              sections: [
                { sectionIndex: 0, sectionType: "fixed-layout-page", reasoning: "", html: "<div>x</div>" },
              ],
            },
          }
        }
        return null
      },
    } as unknown as Storage

    await generateToc({
      storage,
      pages,
      config: {
        ...buildTocGenerationConfig({ role_types: {}, structure_types: {} }, "English"),
        mode: "dynamic",
      },
      llmModel: llm,
    })

    expect(capturedContext).not.toBeNull()
    expect(capturedContext?.headings).toEqual([
      { sectionId: "pg001_sec001", title: "The Real Title", textType: "heading" },
    ])
  })

  it("suppresses original TOC in dynamic mode even when present", async () => {
    let capturedContext: Record<string, unknown> | null = null
    const llm = makeLlm((opts) => {
      capturedContext = opts.context as Record<string, unknown>
    })

    await generateToc({
      storage: makeStorageWithSection({ tocSection: true }),
      pages,
      config: {
        ...buildTocGenerationConfig(
          { role_types: {}, structure_types: {} },
          "English",
        ),
        mode: "dynamic",
      },
      llmModel: llm,
    })

    expect(capturedContext?.mode).toBe("dynamic")
    expect(capturedContext?.has_original_toc).toBe(false)
    expect(capturedContext?.original_toc_text).toBe("")
  })
})
