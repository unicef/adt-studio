import { describe, expect, it } from "vitest"
import type { AppConfig, PageSectioningOutput, WebRenderingOutput } from "@adt/types"
import type {
  GenerateObjectOptions,
  GenerateObjectResult,
  LLMModel,
} from "@adt/llm"
import {
  extractTextFromHtml,
  isContentPage,
  batchPages,
  buildQuizGenerationConfig,
  generateQuiz,
  generateAllQuizzes,
} from "../quiz-generation.js"
import type { QuizPageInput } from "../quiz-generation.js"

function makeFakeLLMModel(
  response: {
    reasoning: string
    question: string
    options: Array<{ text: string; explanation: string }>
    answer_index: number
  },
  onCall?: (options: GenerateObjectOptions) => void
): LLMModel {
  return {
    generateObject: async <T>(options: GenerateObjectOptions) => {
      onCall?.(options)
      return {
        object: response as T,
        usage: { inputTokens: 10, outputTokens: 10 },
      } as GenerateObjectResult<T>
    },
  }
}

const validQuizResponse = {
  reasoning: "The text discusses photosynthesis.",
  question: "What do plants need for photosynthesis?",
  options: [
    { text: "1) Sunlight", explanation: "✅ Correct! Plants need sunlight." },
    { text: "2) Darkness", explanation: "❌ Not quite. Plants need light." },
    { text: "3) Sand", explanation: "❌ Not quite. Sand is not required." },
  ],
  answer_index: 0,
}

function makePageInput(
  pageId: string,
  html: string,
  isPruned = false
): QuizPageInput {
  return {
    pageId,
    rendering: {
      sections: [{ sectionIndex: 0, sectionType: "text_only", reasoning: "", html }],
    },
    sectioning: {
      reasoning: "",
      sections: [
        {
          sectionType: isPruned ? "front_cover" : "text_only",
          partIds: [],
          backgroundColor: "#ffffff",
          textColor: "#000000",
          pageNumber: null,
          isPruned,
        },
      ],
    },
  }
}

describe("extractTextFromHtml", () => {
  it("strips HTML tags and returns plain text", () => {
    const html = "<section><h1>Hello</h1><p>World of <strong>plants</strong></p></section>"
    expect(extractTextFromHtml(html)).toBe("HelloWorld of plants")
  })

  it("returns empty string for empty HTML", () => {
    expect(extractTextFromHtml("")).toBe("")
  })

  it("handles nested elements", () => {
    const html = "<div><ul><li>Item 1</li><li>Item 2</li></ul></div>"
    expect(extractTextFromHtml(html)).toBe("Item 1Item 2")
  })
})

describe("isContentPage", () => {
  it("returns true when at least one section is not pruned", () => {
    const sectioning: PageSectioningOutput = {
      reasoning: "",
      sections: [
        { sectionType: "front_cover", partIds: [], backgroundColor: "#fff", textColor: "#000", pageNumber: null, isPruned: true },
        { sectionType: "text_only", partIds: [], backgroundColor: "#fff", textColor: "#000", pageNumber: null, isPruned: false },
      ],
    }
    expect(isContentPage(sectioning)).toBe(true)
  })

  it("returns false when all sections are pruned", () => {
    const sectioning: PageSectioningOutput = {
      reasoning: "",
      sections: [
        { sectionType: "front_cover", partIds: [], backgroundColor: "#fff", textColor: "#000", pageNumber: null, isPruned: true },
      ],
    }
    expect(isContentPage(sectioning)).toBe(false)
  })
})

describe("batchPages", () => {
  it("groups content pages into batches", () => {
    const pages = [
      makePageInput("pg001", "<p>Page 1</p>"),
      makePageInput("pg002", "<p>Page 2</p>"),
      makePageInput("pg003", "<p>Page 3</p>"),
      makePageInput("pg004", "<p>Page 4</p>"),
      makePageInput("pg005", "<p>Page 5</p>"),
    ]

    const batches = batchPages(pages, 2)
    expect(batches).toHaveLength(3)
    expect(batches[0]).toHaveLength(2)
    expect(batches[1]).toHaveLength(2)
    expect(batches[2]).toHaveLength(1)
  })

  it("skips non-content pages", () => {
    const pages = [
      makePageInput("pg001", "<p>Cover</p>", true),
      makePageInput("pg002", "<p>Content 1</p>"),
      makePageInput("pg003", "<p>Credits</p>", true),
      makePageInput("pg004", "<p>Content 2</p>"),
      makePageInput("pg005", "<p>Content 3</p>"),
    ]

    const batches = batchPages(pages, 3)
    expect(batches).toHaveLength(1)
    expect(batches[0].map((p) => p.pageId)).toEqual(["pg002", "pg004", "pg005"])
  })

  it("returns empty array when no content pages", () => {
    const pages = [makePageInput("pg001", "<p>Cover</p>", true)]
    expect(batchPages(pages, 3)).toEqual([])
  })
})

describe("buildQuizGenerationConfig", () => {
  it("builds config with defaults", () => {
    const appConfig: AppConfig = {
      text_types: { section_text: "Body text" },
      text_group_types: { paragraph: "Paragraph" },
    }
    const config = buildQuizGenerationConfig(appConfig, "en")
    expect(config).toEqual({
      language: "en",
      pagesPerQuiz: 3,
      promptName: "quiz_generation",
      modelId: "openai:gpt-5.2",
      maxRetries: 2,
      timeoutMs: 90_000,
    })
  })

  it("uses editing_language over detected language", () => {
    const appConfig: AppConfig = {
      text_types: { section_text: "Body text" },
      text_group_types: { paragraph: "Paragraph" },
      editing_language: "fr",
    }
    const config = buildQuizGenerationConfig(appConfig, "en")
    expect(config?.language).toBe("fr")
  })

  it("uses quiz_generation config overrides", () => {
    const appConfig: AppConfig = {
      text_types: { section_text: "Body text" },
      text_group_types: { paragraph: "Paragraph" },
      quiz_generation: {
        pages_per_quiz: 5,
        model: "openai:gpt-4.1",
        prompt: "custom_quiz",
        max_retries: 4,
        timeout: 120,
      },
    }
    const config = buildQuizGenerationConfig(appConfig, "en")
    expect(config).toEqual({
      language: "en",
      pagesPerQuiz: 5,
      promptName: "custom_quiz",
      modelId: "openai:gpt-4.1",
      maxRetries: 4,
      timeoutMs: 120_000,
    })
  })

  it("returns null when no language available", () => {
    const appConfig: AppConfig = {
      text_types: { section_text: "Body text" },
      text_group_types: { paragraph: "Paragraph" },
    }
    expect(buildQuizGenerationConfig(appConfig, null)).toBeNull()
  })
})

describe("generateQuiz", () => {
  it("passes correct prompt and context to LLM", async () => {
    let capturedOptions: GenerateObjectOptions | null = null
    const llmModel = makeFakeLLMModel(validQuizResponse, (options) => {
      capturedOptions = options
    })

    const batch = [
      makePageInput("pg001", "<p>Photosynthesis is the process...</p>"),
      makePageInput("pg002", "<p>Plants use sunlight...</p>"),
    ]

    const config = {
      language: "en",
      pagesPerQuiz: 2,
      promptName: "quiz_generation",
      modelId: "openai:gpt-5.2",
      maxRetries: 2,
      timeoutMs: 90_000,
    }

    const quiz = await generateQuiz(batch, 0, config, llmModel)

    expect(capturedOptions?.prompt).toBe("quiz_generation")
    expect(capturedOptions?.context?.language).toBe("en")
    const pageTexts = capturedOptions?.context?.page_texts as Array<{
      pageId: string
      text: string
    }>
    expect(pageTexts).toHaveLength(2)
    expect(pageTexts[0].pageId).toBe("pg001")
    expect(pageTexts[0].text).toContain("Photosynthesis")

    expect(quiz.quizIndex).toBe(0)
    expect(quiz.afterPageId).toBe("pg002")
    expect(quiz.pageIds).toEqual(["pg001", "pg002"])
    expect(quiz.question).toBe(validQuizResponse.question)
    expect(quiz.options).toEqual(validQuizResponse.options)
    expect(quiz.answerIndex).toBe(0)
  })

  it("validation catches wrong option count", async () => {
    const badResponse = {
      ...validQuizResponse,
      options: [validQuizResponse.options[0], validQuizResponse.options[1]],
    }
    let capturedOptions: GenerateObjectOptions | null = null
    const llmModel = makeFakeLLMModel(badResponse, (options) => {
      capturedOptions = options
    })

    const batch = [makePageInput("pg001", "<p>Content</p>")]
    const config = {
      language: "en",
      pagesPerQuiz: 1,
      promptName: "quiz_generation",
      modelId: "openai:gpt-5.2",
      maxRetries: 0,
      timeoutMs: 90_000,
    }

    await generateQuiz(batch, 0, config, llmModel)

    const validation = capturedOptions?.validate?.(badResponse, {})
    expect(validation?.valid).toBe(false)
    expect(validation?.errors[0]).toContain("exactly 3 options")
  })
})

describe("generateAllQuizzes", () => {
  it("generates correct number of quizzes", async () => {
    let callCount = 0
    const llmModel = makeFakeLLMModel(validQuizResponse, () => {
      callCount++
    })

    const pages = [
      makePageInput("pg001", "<p>Page 1</p>"),
      makePageInput("pg002", "<p>Page 2</p>"),
      makePageInput("pg003", "<p>Page 3</p>"),
      makePageInput("pg004", "<p>Page 4</p>"),
      makePageInput("pg005", "<p>Page 5</p>"),
    ]

    const config = {
      language: "en",
      pagesPerQuiz: 2,
      promptName: "quiz_generation",
      modelId: "openai:gpt-5.2",
      maxRetries: 2,
      timeoutMs: 90_000,
    }

    const result = await generateAllQuizzes(pages, config, llmModel)

    expect(result.quizzes).toHaveLength(3)
    expect(result.language).toBe("en")
    expect(result.pagesPerQuiz).toBe(2)
    expect(result.generatedAt).toBeTruthy()
    expect(callCount).toBe(3)

    expect(result.quizzes[0].quizIndex).toBe(0)
    expect(result.quizzes[1].quizIndex).toBe(1)
    expect(result.quizzes[2].quizIndex).toBe(2)
  })
})
