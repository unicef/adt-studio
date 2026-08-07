import path from "node:path"
import { PNG } from "pngjs"
import { describe, expect, it } from "vitest"
import { createPromptEngine } from "@adt/llm"
import type { GenerateObjectOptions, LLMModel, Message } from "@adt/llm"
import type { BookOutlineOutput, PositionedTextOutput } from "@adt/types"
import {
  BOOK_OUTLINE_CHUNK_PAGE_LIMIT,
  buildBookOutlineConfig,
  generateBookOutline,
  outlineContextForPage,
} from "../book-outline.js"
import {
  BOOK_OUTLINE_MAX_PAGE_TEXT_CHARS,
  buildBookOutlineEvidence,
  buildHeadingCandidates,
  buildProofSheets,
  type BookOutlineEvidence,
} from "../book-outline-evidence.js"

function pngBase64(width = 4, height = 6): string {
  const image = new PNG({ width, height })
  image.data.fill(255)
  return PNG.sync.write(image).toString("base64")
}

function positionedText(): PositionedTextOutput {
  return {
    pageWidth: 600,
    pageHeight: 800,
    renderWidth: 1200,
    renderHeight: 1600,
    drawItems: [
      {
        kind: "paragraph",
        textId: "pg001_tx001",
        mergedParagraphId: "title",
        top: 40,
        left: 100,
        lineHeight: 42,
        textAlign: "center",
        text: "Chapter One",
        segments: [
          {
            text: "Chapter One",
            style: {
              "font-size": "32px",
              "font-weight": "700",
              "font-family": "Aptos",
            },
          },
        ],
        blockBounds: { x: 100, y: 40, width: 400, height: 42 },
      },
      {
        kind: "paragraph",
        textId: "pg001_tx002",
        top: 150,
        left: 60,
        lineHeight: 18,
        text: "Body copy for the chapter.",
        segments: [{ text: "Body copy for the chapter.", style: { "font-size": "16px" } }],
      },
    ],
  }
}

function evidence(): BookOutlineEvidence {
  return buildBookOutlineEvidence(
    [
      {
        pageId: "pg001",
        pageNumber: 1,
        text: "Chapter One\nBody copy for the chapter.",
        imageBase64: pngBase64(),
        positionedText: positionedText(),
      },
    ],
    {
      bodyPx: 16,
      h1Px: 32,
      h2Px: 26,
      h3Px: 21,
      captionPx: 13,
      sampleChars: 38,
      observed: [
        { px: 32, chars: 11 },
        { px: 16, chars: 27 },
      ],
    },
  )
}

function output(): BookOutlineOutput {
  return {
    reasoning: "The repeated large title style marks chapters.",
    styleClusters: [
      { styleClusterId: "chapter-style", description: "Large centered title", level: 1 },
    ],
    entries: [
      {
        outlineId: "outline-001",
        title: "Chapter One",
        level: 1,
        kind: "chapter",
        pageId: "pg001",
        pageNumber: 1,
        sourceCandidateIds: ["pg001_hc001"],
        parentId: null,
        styleClusterId: "chapter-style",
        confidence: 0.98,
      },
    ],
  }
}

function messageText(message: Message): string {
  if (typeof message.content === "string") return message.content
  return message.content
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
}

describe("book outline evidence", () => {
  it("captures positioned typography and normalized coordinates", () => {
    const candidates = buildHeadingCandidates(
      [
        {
          pageId: "pg001",
          pageNumber: 1,
          text: "Chapter One",
          imageBase64: pngBase64(),
          positionedText: positionedText(),
        },
      ],
      null,
    )

    expect(candidates[0]).toMatchObject({
      candidateId: "pg001_hc001",
      text: "Chapter One",
      fontSizePx: 32,
      fontWeight: 700,
      centered: true,
      topRatio: 0.05,
      widthRatio: 2 / 3,
    })
    expect(candidates[0].headingLikelihood).toBeGreaterThan(candidates[1].headingLikelihood)
  })

  it("builds bounded row-major proof sheets from full page images", () => {
    const sheets = buildProofSheets(
      Array.from({ length: 5 }, (_, index) => ({
        pageId: `pg${index + 1}`,
        pageNumber: index + 1,
        text: "",
        imageBase64: pngBase64(),
      })),
      { columns: 2, rows: 2, cellWidth: 10, cellHeight: 12, gap: 2 },
    )

    expect(sheets).toHaveLength(2)
    expect(sheets[0].pageIds).toEqual(["pg1", "pg2", "pg3", "pg4"])
    expect(sheets[1].pageIds).toEqual(["pg5"])
    const rendered = PNG.sync.read(Buffer.from(sheets[0].imageBase64, "base64"))
    expect({ width: rendered.width, height: rendered.height }).toEqual({ width: 26, height: 30 })
  })

  it("bounds OCR fallback candidates and oversized page text", () => {
    const text = Array.from({ length: 60 }, (_, index) =>
      `OCR heading candidate ${String(index + 1).padStart(2, "0")}`
    ).join("\n")
    const candidates = buildHeadingCandidates(
      [{ pageId: "pg001", pageNumber: 1, text, imageBase64: pngBase64() }],
      null,
    )
    expect(candidates).toHaveLength(40)

    const oversized = `${"a".repeat(7_000)}${"b".repeat(7_000)}`
    const bounded = buildBookOutlineEvidence(
      [{ pageId: "pg001", pageNumber: 1, text: oversized, imageBase64: pngBase64() }],
      null,
    )
    expect(bounded.pages[0].text).toHaveLength(BOOK_OUTLINE_MAX_PAGE_TEXT_CHARS)
    expect(bounded.pages[0].text).toContain("middle of page text omitted")
    expect(bounded.pages[0].text.startsWith("a")).toBe(true)
    expect(bounded.pages[0].text.endsWith("b")).toBe(true)
  })
})

describe("book outline generation", () => {
  it("inherits the configured OpenAI default model", () => {
    expect(
      buildBookOutlineConfig({
        default_model: "openai:gpt-5.4",
        structure_types: {},
        role_types: {},
      }).modelId,
    ).toBe("openai:gpt-5.4")
  })

  it("sends the complete evidence and validates model references", async () => {
    let captured: GenerateObjectOptions | null = null
    const llm: LLMModel = {
      generateObject: async <T>(options: GenerateObjectOptions) => {
        captured = options
        const result = output()
        expect(options.validate?.(result, options.context ?? {})).toEqual({ valid: true, errors: [] })
        return { object: result as T }
      },
    }

    const result = await generateBookOutline(
      evidence(),
      buildBookOutlineConfig({
        default_model: "openai:gpt-5.4",
        structure_types: {},
        role_types: {},
      }),
      llm,
    )

    expect(result.entries[0].level).toBe(1)
    expect(captured?.prompt).toBe("book_outline")
    expect(captured?.log?.taskType).toBe("book-outline")
    expect((captured?.context?.pages as unknown[])).toHaveLength(1)
    expect((captured?.context?.proof_sheets as unknown[])).toHaveLength(1)
  })

  it("chunks long books and globally synthesizes only compact proposals", async () => {
    const longEvidence = buildBookOutlineEvidence(
      Array.from({ length: BOOK_OUTLINE_CHUNK_PAGE_LIMIT * 2 + 1 }, (_, index) => ({
        pageId: `pg${String(index + 1).padStart(3, "0")}`,
        pageNumber: index + 1,
        text: `Chapter ${index + 1}`,
        imageBase64: pngBase64(),
        positionedText: positionedText(),
      })),
      null,
    )
    const calls: GenerateObjectOptions[] = []
    const proposals: BookOutlineOutput[] = []
    const llm: LLMModel = {
      generateObject: async <T>(options: GenerateObjectOptions) => {
        calls.push(options)
        if (options.prompt === "book_outline_synthesis") {
          let nextId = 1
          const combined: BookOutlineOutput = {
            reasoning: "Normalized all deterministic chunks.",
            styleClusters: [
              { styleClusterId: "chapter-style", description: "Chapter title", level: 1 },
            ],
            entries: proposals.flatMap((proposal) =>
              proposal.entries.map((entry) => ({
                ...entry,
                outlineId: `outline-${String(nextId++).padStart(3, "0")}`,
                styleClusterId: "chapter-style",
              })),
            ),
          }
          expect(options.validate?.(combined, options.context ?? {})).toEqual({
            valid: true,
            errors: [],
          })
          return { object: combined as T }
        }

        const pages = options.context?.pages as Array<{ pageId: string; pageNumber: number }>
        const candidates = options.context?.candidates as Array<{
          candidateId: string
          pageId: string
          text: string
        }>
        const proposal: BookOutlineOutput = {
          reasoning: "Provisional chunk headings.",
          styleClusters: [
            { styleClusterId: "chapter-style", description: "Chapter title", level: 1 },
          ],
          entries: pages.map((page, index) => {
            const candidate = candidates.find((item) => item.pageId === page.pageId)!
            return {
              outlineId: `outline-${String(index + 1).padStart(3, "0")}`,
              title: candidate.text,
              level: 1,
              kind: "chapter" as const,
              pageId: page.pageId,
              pageNumber: page.pageNumber,
              sourceCandidateIds: [candidate.candidateId],
              parentId: null,
              styleClusterId: "chapter-style",
              confidence: 0.9,
            }
          }),
        }
        expect(options.validate?.(proposal, options.context ?? {})).toEqual({
          valid: true,
          errors: [],
        })
        proposals.push(proposal)
        return { object: proposal as T }
      },
    }

    const result = await generateBookOutline(
      longEvidence,
      buildBookOutlineConfig({ structure_types: {}, role_types: {} }),
      llm,
    )

    const chunkCalls = calls.filter((call) => call.prompt === "book_outline_chunk")
    expect(chunkCalls).toHaveLength(3)
    expect(chunkCalls.every((call) =>
      (call.context?.pages as unknown[]).length <= BOOK_OUTLINE_CHUNK_PAGE_LIMIT
    )).toBe(true)
    expect(chunkCalls.every((call) =>
      (call.context?.proof_sheets as unknown[]).length <= 1
    )).toBe(true)
    const synthesis = calls.at(-1)!
    expect(synthesis.prompt).toBe("book_outline_synthesis")
    expect(synthesis.context).not.toHaveProperty("pages")
    expect(synthesis.context).not.toHaveProperty("candidates")
    expect(synthesis.context).not.toHaveProperty("proof_sheets")
    expect((synthesis.context?.chunks as unknown[])).toHaveLength(3)
    expect(result.entries).toHaveLength(longEvidence.pages.length)
  })

  it("rejects invented candidate references", async () => {
    const llm: LLMModel = {
      generateObject: async <T>(options: GenerateObjectOptions) => {
        const invalid = output()
        invalid.entries[0].sourceCandidateIds = ["invented"]
        const validation = options.validate?.(invalid, options.context ?? {})
        expect(validation?.valid).toBe(false)
        expect(validation?.errors.join(" ")).toContain("unknown candidate")
        return { object: invalid as T }
      },
    }

    await generateBookOutline(
      evidence(),
      buildBookOutlineConfig({ structure_types: {}, role_types: {} }),
      llm,
    )
  })

  it("rejects rewritten outline titles", async () => {
    const llm: LLMModel = {
      generateObject: async <T>(options: GenerateObjectOptions) => {
        const invalid = output()
        invalid.entries[0].title = "A rewritten chapter name"
        const validation = options.validate?.(invalid, options.context ?? {})
        expect(validation?.valid).toBe(false)
        expect(validation?.errors.join(" ")).toContain("title must exactly match")
        return { object: invalid as T }
      },
    }

    await generateBookOutline(
      evidence(),
      buildBookOutlineConfig({ structure_types: {}, role_types: {} }),
      llm,
    )
  })

  it("returns page entries with their ancestor and style context", () => {
    const book = output()
    book.entries.push({
      ...book.entries[0],
      outlineId: "outline-002",
      title: "A Subsection",
      level: 2,
      kind: "section",
      pageId: "pg002",
      pageNumber: 2,
      sourceCandidateIds: ["pg002_hc001"],
      parentId: "outline-001",
      styleClusterId: "section-style",
    })
    book.styleClusters.push({
      styleClusterId: "section-style",
      description: "Section style",
      level: 2,
    })

    const context = outlineContextForPage(book, "pg002")
    expect(context?.entries.map((entry) => entry.outlineId)).toEqual(["outline-002"])
    expect(context?.ancestors.map((entry) => entry.outlineId)).toEqual(["outline-001"])
    expect(context?.styleClusters.map((cluster) => cluster.styleClusterId)).toEqual([
      "chapter-style",
      "section-style",
    ])
  })

  it("renders all evidence plus a proof-sheet image in the OpenAI prompt", async () => {
    const promptEngine = createPromptEngine(path.join(process.cwd(), "prompts"))
    const bookEvidence = evidence()
    const messages = await promptEngine.renderPrompt("book_outline", {
      pages: bookEvidence.pages,
      candidates: bookEvidence.candidates,
      proof_sheets: bookEvidence.proofSheets.map((sheet) => ({
        sheet_id: sheet.sheetId,
        page_ids: sheet.pageIds,
        page_numbers: sheet.pageNumbers,
        image_base64: sheet.imageBase64,
      })),
      type_scale: bookEvidence.typeScale,
    })
    const text = messages.map(messageText).join("\n")
    const imageParts = messages.flatMap((message) =>
      typeof message.content === "string"
        ? []
        : message.content.filter((part) => part.type === "image"),
    )

    expect(text).toContain("Chapter One")
    expect(text).toContain("pg001_hc001")
    expect(text).toContain("proof-001 pages: pg001")
    expect(imageParts).toHaveLength(1)
  })

  it("renders the bounded chunk and compact synthesis prompts", async () => {
    const promptEngine = createPromptEngine(path.join(process.cwd(), "prompts"))
    const bookEvidence = evidence()
    const chunkMessages = await promptEngine.renderPrompt("book_outline_chunk", {
      pages: bookEvidence.pages,
      candidates: bookEvidence.candidates,
      proof_sheets: bookEvidence.proofSheets.map((sheet) => ({
        sheet_id: sheet.sheetId,
        page_ids: sheet.pageIds,
        page_numbers: sheet.pageNumbers,
        image_base64: sheet.imageBase64,
      })),
      type_scale: bookEvidence.typeScale,
    })
    expect(chunkMessages.map(messageText).join("\n")).toContain("deterministic page chunk")

    const synthesisMessages = await promptEngine.renderPrompt("book_outline_synthesis", {
      chunks: [{
        chunk_id: "chunk-001",
        page_numbers: [1],
        entries: output().entries,
        style_clusters: output().styleClusters,
      }],
      type_scale: bookEvidence.typeScale,
    })
    const synthesisText = synthesisMessages.map(messageText).join("\n")
    expect(synthesisText).toContain("final book-structure analyst")
    expect(synthesisText).toContain("pg001_hc001")
  })
})
