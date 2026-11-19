import path from "node:path"
import { describe, expect, it } from "vitest"
import { createPromptEngine } from "@adt/llm"
import type { Message } from "@adt/llm"
import type {
  AppConfig,
  BookOutlineEntry,
  BookOutlineOutput,
  ContentNodeData,
  PageSectioningOutput,
  PageSectioningSection,
} from "@adt/types"
import {
  bookContextPromptValue,
  buildRenderBookContext,
  digestSectionsWithinBudget,
  outlinePositionForPage,
  resolveRenderContextOptions,
  truncateText,
  type RenderBookContextSources,
  type RenderContextOptions,
} from "../render-book-context.js"

const OPTIONS: RenderContextOptions = {
  summary: true,
  outlinePosition: true,
  neighborPages: 1,
  neighborChars: 600,
}

function leaf(nodeId: string, text: string, isPruned = false): ContentNodeData {
  return { nodeId, role: "text", text, isPruned }
}

function section(
  sectionId: string,
  sectionType: string,
  nodes: ContentNodeData[],
  isPruned = false,
): PageSectioningSection {
  return {
    sectionId,
    sectionType,
    backgroundColor: "#fff",
    textColor: "#000",
    pageNumber: null,
    isPruned,
    nodes,
  }
}

function sectioning(sections: PageSectioningSection[]): PageSectioningOutput {
  return { reasoning: "", sections } as unknown as PageSectioningOutput
}

function outlineEntry(
  outlineId: string,
  title: string,
  level: 1 | 2 | 3,
  pageNumber: number,
  parentId: string | null,
): BookOutlineEntry {
  return {
    outlineId,
    title,
    level,
    kind: level === 1 ? "chapter" : "section",
    pageId: `pg${String(pageNumber).padStart(3, "0")}`,
    pageNumber,
    sourceCandidateIds: [`c_${outlineId}`],
    parentId,
    styleClusterId: `h${level}`,
    confidence: 1,
  } as BookOutlineEntry
}

const OUTLINE: BookOutlineOutput = {
  reasoning: "",
  entries: [
    outlineEntry("o1", "Chapter 1: Plants", 1, 1, null),
    outlineEntry("o2", "1.1 Roots", 2, 2, "o1"),
    outlineEntry("o3", "Chapter 2: Animals", 1, 4, null),
  ],
  styleClusters: [],
}

const SECTIONINGS: Record<string, PageSectioningOutput> = {
  pg002: sectioning([
    section("pg002_s1", "text_only", [leaf("a", "Roots hold the plant in the soil.")]),
  ]),
  pg003: sectioning([
    section("pg003_s1", "text_only", [leaf("b", "Roots absorb water."), leaf("c", "hidden", true)]),
    section("pg003_s2", "footer", [leaf("d", "Page 3")], true),
    section("pg003_s3", "activity_multiple_choice", [leaf("e", "Which part absorbs water?")]),
  ]),
  pg004: sectioning([
    section("pg004_s1", "text_only", [leaf("f", "Animals move.")]),
  ]),
}

function sources(pageId: string): RenderBookContextSources {
  return {
    pageId,
    pages: [1, 2, 3, 4].map((n) => ({ pageId: `pg${String(n).padStart(3, "0")}`, pageNumber: n })),
    metadata: {
      title: "Science 3",
      authors: ["A. Author"],
      publisher: null,
      language_code: "en",
      cover_page_number: 1,
      reasoning: "",
    },
    summary: "A science book about living things.",
    outline: OUTLINE,
    sectioningFor: (id) => SECTIONINGS[id] ?? null,
  }
}

function messageText(message: Message): string {
  if (typeof message.content === "string") return message.content
  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
}

describe("resolveRenderContextOptions", () => {
  it("is disabled unless explicitly enabled", () => {
    expect(resolveRenderContextOptions({} as AppConfig)).toBeNull()
    expect(resolveRenderContextOptions({ render_context: { enabled: false } } as AppConfig)).toBeNull()
  })

  it("applies defaults when enabled", () => {
    expect(resolveRenderContextOptions({ render_context: { enabled: true } } as AppConfig)).toEqual(OPTIONS)
  })
})

describe("truncateText", () => {
  it("keeps short text and marks cut text with an ellipsis", () => {
    expect(truncateText("short", 10)).toBe("short")
    expect(truncateText("abcdefghij", 5)).toBe("abcd…")
    expect(truncateText("anything", 0)).toBe("")
  })
})

describe("outlinePositionForPage", () => {
  it("returns the heading chain in force when the page begins", () => {
    expect(outlinePositionForPage(OUTLINE, 3).map((h) => h.title)).toEqual([
      "Chapter 1: Plants",
      "1.1 Roots",
    ])
  })

  it("ignores headings that start on the page itself", () => {
    expect(outlinePositionForPage(OUTLINE, 1)).toEqual([])
    expect(outlinePositionForPage(OUTLINE, 4).map((h) => h.title)).toEqual([
      "Chapter 1: Plants",
      "1.1 Roots",
    ])
  })
})

describe("digestSectionsWithinBudget", () => {
  it("skips pruned content and stops at the character budget", () => {
    const digests = digestSectionsWithinBudget(SECTIONINGS.pg003, 12)
    expect(digests).toEqual([{ sectionIndex: 0, sectionType: "text_only", text: "Roots absor…" }])
  })
})

describe("buildRenderBookContext", () => {
  it("collects book, position, siblings and neighbors for a page", () => {
    const context = buildRenderBookContext(sources("pg003"), OPTIONS)
    expect(context?.book).toEqual({
      title: "Science 3",
      authors: ["A. Author"],
      languageCode: "en",
      summary: "A science book about living things.",
    })
    expect(context?.pageSections.map((s) => s.sectionIndex)).toEqual([0, 2])
    expect(context?.neighborPages.map((p) => [p.relation, p.pageNumber])).toEqual([
      ["previous", 2],
      ["next", 4],
    ])
  })

  it("honours disabled summary, outline and neighbors", () => {
    const context = buildRenderBookContext(sources("pg003"), {
      summary: false,
      outlinePosition: false,
      neighborPages: 0,
      neighborChars: 600,
    })
    expect(context?.book?.summary).toBeNull()
    expect(context?.position).toEqual([])
    expect(context?.pageHeadings).toEqual([])
    expect(context?.neighborPages).toEqual([])
  })

  it("returns undefined for an unknown page", () => {
    expect(buildRenderBookContext(sources("pg999"), OPTIONS)).toBeUndefined()
  })
})

describe("bookContextPromptValue", () => {
  const context = buildRenderBookContext(sources("pg003"), OPTIONS)

  it("marks the section being rendered by its raw index", () => {
    const value = bookContextPromptValue(context, 2, "render")
    expect(value?.section_number).toBe(2)
    expect(value?.page_sections.map((s) => s.is_current)).toEqual([false, true])
  })

  it("drops the neighborhood for review", () => {
    const value = bookContextPromptValue(context, 2, "review")
    expect(value?.page_sections).toEqual([])
    expect(value?.neighbor_pages).toEqual([])
    expect(value?.position.length).toBe(2)
  })

  it("is null without a context", () => {
    expect(bookContextPromptValue(undefined, 0, "render")).toBeNull()
  })
})

describe("book context in prompts", () => {
  const promptEngine = createPromptEngine(path.join(process.cwd(), "prompts"))
  const context = buildRenderBookContext(sources("pg003"), OPTIONS)
  const baseContext = {
    page_image_base64: "page-image",
    source_pages: [],
    section_id: "pg003_s3",
    section_type: "text_only",
    images: [],
    nodes: [{ node_id: "e", role: "text", text: "Which part absorbs water?" }],
    leaf_texts: [],
    styleguide: "",
    book_fonts: [],
    typography: [],
    viewports: [{ label: "Desktop", width: 1280, tailwind_prefix: "" }],
    user_instructions: "",
    current_html: "<section></section>",
    has_merged_content: false,
  }

  const cases: Array<[string, string | undefined, "render" | "review"]> = [
    ["web_generation_html", undefined, "render"],
    ["web_generation_html", "openai:gpt-6.1-sol", "render"],
    ["web_generation_html", "openai:gpt-6-luna", "render"],
    ["visual_review", undefined, "review"],
    ["visual_review", "openai:gpt-6.1-sol", "review"],
    ["visual_review_flexible", undefined, "review"],
    ["visual_review_flexible", "openai:gpt-6.1-sol", "review"],
  ]

  for (const [promptName, modelId, scope] of cases) {
    const label = `${promptName}${modelId ? ` (${modelId})` : ""}`

    it(`${label} is unchanged when the context is absent`, async () => {
      const options = modelId ? { modelId } : undefined
      const without = await promptEngine.renderPrompt(promptName, baseContext, options)
      const withNull = await promptEngine.renderPrompt(promptName, { ...baseContext, book_context: null }, options)
      expect(withNull.map(messageText)).toEqual(without.map(messageText))
      expect(without.map(messageText).join("\n")).not.toContain("<book_context>")
    })

    it(`${label} renders the context when present`, async () => {
      const options = modelId ? { modelId } : undefined
      const messages = await promptEngine.renderPrompt(
        promptName,
        { ...baseContext, book_context: bookContextPromptValue(context, 2, scope) },
        options,
      )
      const prompt = messages.map(messageText).join("\n")
      expect(prompt).toContain("<book_context>")
      expect(prompt).toContain("Summary: A science book about living things.")
      expect(prompt).toContain("Location where this page begins: Chapter 1: Plants (level 1 chapter) > 1.1 Roots (level 2 section)")
      if (scope === "render") {
        expect(prompt).toContain("(you are rendering section 2 of 2)")
        expect(prompt).toContain("2. activity_multiple_choice [this section]: Which part absorbs water?")
        expect(prompt).toContain("Previous page 2:\n- text_only: Roots hold the plant in the soil.")
        expect(prompt).toContain("Next page 4:\n- text_only: Animals move.")
      } else {
        expect(prompt).not.toContain("Sections on this page")
        expect(prompt).not.toContain("Previous page")
      }
    })
  }
})
