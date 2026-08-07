import path from "node:path"
import { PNG } from "pngjs"
import { describe, expect, it } from "vitest"
import { createPromptEngine } from "@adt/llm"
import type { GenerateObjectOptions, LLMModel, Message } from "@adt/llm"
import type {
  BookOutlineOutput,
  BookOutlineProposalOutput,
  PositionedTextOutput,
} from "@adt/types"
import {
  BOOK_OUTLINE_CHUNK_PAGE_LIMIT,
  buildBookOutlineConfig,
  generateBookOutline,
  outlineContextForPage,
} from "../book-outline.js"
import {
  BOOK_OUTLINE_MAX_PAGE_TEXT_CHARS,
  BOOK_OUTLINE_MAX_POSITIONED_PAGE_TEXT_CHARS,
  BOOK_OUTLINE_MAX_CANDIDATES_PER_PAGE,
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

function positionedHeadings(
  lines: Array<{
    text: string
    left?: number
    top?: number
    fontSize?: number
    fontWeight?: number
  }>,
): PositionedTextOutput {
  return {
    pageWidth: 600,
    pageHeight: 800,
    renderWidth: 1200,
    renderHeight: 1600,
    drawItems: lines.map((line, index) => ({
      kind: "paragraph" as const,
      textId: `tx${String(index + 1).padStart(3, "0")}`,
      top: line.top ?? 40 + index * 40,
      left: line.left ?? 60,
      lineHeight: line.fontSize ?? 16,
      text: line.text,
      segments: [{
        text: line.text,
        style: {
          "font-size": `${line.fontSize ?? 16}px`,
          "font-weight": String(line.fontWeight ?? 400),
        },
      }],
    })),
  }
}

function tocGuidedEvidence(): BookOutlineEvidence {
  return buildBookOutlineEvidence(
    [
      {
        pageId: "pg001",
        pageNumber: 1,
        text: "SUMÁRIO\nCAPÍTULO 1 Experiências vividas\nLinguagem formal e informal\nCurrículo profissional\nMedidas de comprimento",
        imageBase64: pngBase64(),
        positionedText: positionedHeadings([
          { text: "SUMÁRIO", left: 60, fontSize: 24, fontWeight: 700 },
          {
            text: "CAPÍTULO 1 Experiências vividas ................ 9",
            left: 60,
            fontSize: 18,
            fontWeight: 700,
          },
          { text: "Linguagem formal e informal ................ 18", left: 90 },
          { text: "Currículo profissional ..................... 19", left: 90 },
          { text: "Medidas de comprimento ..................... 22", left: 90 },
        ]),
      },
      ...[
        "EXPERIÊNCIAS VIVIDAS",
        "LINGUAGEM FORMAL E INFORMAL",
        "CURRÍCULO PROFISSIONAL",
        "MEDIDAS DE COMPRIMENTO",
      ].map((text, index) => ({
        pageId: `pg00${index + 2}`,
        pageNumber: index + 2,
        text,
        imageBase64: pngBase64(),
        positionedText: positionedHeadings([{
          text,
          fontSize: index === 0 ? 28 : 20,
          fontWeight: 700,
        }]),
      })),
    ],
    null,
  )
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

function proposal(book = output()): BookOutlineProposalOutput {
  return {
    reasoning: book.reasoning.slice(0, 600),
    styleClusters: book.styleClusters.map((cluster) => ({ ...cluster })),
    entries: book.entries.map((entry) => ({
      sourceCandidateIds: [...entry.sourceCandidateIds],
      level: entry.level,
      kind: entry.kind,
      styleClusterId: entry.styleClusterId,
      confidence: entry.confidence,
    })),
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
      widthRatio: 0.667,
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
    const partial = PNG.sync.read(Buffer.from(sheets[1].imageBase64, "base64"))
    expect({ width: partial.width, height: partial.height }).toEqual({ width: 26, height: 16 })
  })

  it("bounds OCR fallback candidates and oversized page text", () => {
    const text = Array.from({ length: 60 }, (_, index) =>
      `OCR heading candidate ${String(index + 1).padStart(2, "0")}`
    ).join("\n")
    const candidates = buildHeadingCandidates(
      [{ pageId: "pg001", pageNumber: 1, text, imageBase64: pngBase64() }],
      null,
    )
    expect(candidates).toHaveLength(BOOK_OUTLINE_MAX_CANDIDATES_PER_PAGE)

    const oversized = `${"a".repeat(7_000)}${"b".repeat(7_000)}`
    const bounded = buildBookOutlineEvidence(
      [{ pageId: "pg001", pageNumber: 1, text: oversized, imageBase64: pngBase64() }],
      null,
    )
    expect(bounded.pages[0].text).toHaveLength(BOOK_OUTLINE_MAX_PAGE_TEXT_CHARS)
    expect(bounded.pages[0].text).toContain("middle of page text omitted")
    expect(bounded.pages[0].text.startsWith("a")).toBe(true)
    expect(bounded.pages[0].text.endsWith("b")).toBe(true)

    const positioned = buildBookOutlineEvidence(
      [{
        pageId: "pg002",
        pageNumber: 2,
        text: oversized,
        imageBase64: pngBase64(),
        positionedText: positionedText(),
      }],
      null,
    )
    expect(positioned.pages[0].text).toHaveLength(
      BOOK_OUTLINE_MAX_POSITIONED_PAGE_TEXT_CHARS,
    )
  })

  it("drops table-of-contents navigation rows and their page numbers from evidence", () => {
    const candidates = buildHeadingCandidates(
      [{
        pageId: "pg001",
        pageNumber: 1,
        text: [
          "SUMÁRIO",
          "Capítulo um ........................ 9",
          "Tema A ............................. 10",
          "Tema B ............................. 14",
          "9",
          "10",
          "14",
        ].join("\n"),
        imageBase64: pngBase64(),
      }],
      null,
    )

    expect(candidates.map((candidate) => candidate.text)).toEqual(["SUMÁRIO"])
  })

  it("preserves TOC indentation as compact hierarchy evidence", () => {
    const bookEvidence = tocGuidedEvidence()

    expect(
      bookEvidence.candidates
        .filter((candidate) => candidate.pageId === "pg001")
        .map((candidate) => candidate.text),
    ).toEqual(["SUMÁRIO"])
    expect(bookEvidence.tocHierarchy).toEqual([
      expect.objectContaining({
        title: "CAPÍTULO 1 Experiências vividas",
        suggestedLevel: 1,
        confidence: 0.98,
      }),
      expect.objectContaining({
        title: "Linguagem formal e informal",
        suggestedLevel: 2,
        confidence: 0.98,
      }),
      expect.objectContaining({
        title: "Currículo profissional",
        suggestedLevel: 2,
        confidence: 0.98,
      }),
      expect.objectContaining({
        title: "Medidas de comprimento",
        suggestedLevel: 2,
        confidence: 0.98,
      }),
    ])
  })
})

describe("book outline generation", () => {
  it("uses the fast mini model for the shipped OpenAI default", () => {
    expect(
      buildBookOutlineConfig({
        default_model: "openai:gpt-5.4",
        structure_types: {},
        role_types: {},
      }).modelId,
    ).toBe("openai:gpt-5.4-mini")
  })

  it("keeps non-default and explicit outline model selections", () => {
    expect(
      buildBookOutlineConfig({
        default_model: "google:gemini-2.5-flash",
        structure_types: {},
        role_types: {},
      }).modelId,
    ).toBe("google:gemini-2.5-flash")
    expect(
      buildBookOutlineConfig({
        default_model: "openai:gpt-5.4",
        book_outline: { model: "openai:gpt-5.4" },
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
        const result = proposal()
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

  it("keeps a 20-page book in one outline call", async () => {
    const mediumEvidence = buildBookOutlineEvidence(
      Array.from({ length: 20 }, (_, index) => ({
        pageId: `pg${String(index + 1).padStart(3, "0")}`,
        pageNumber: index + 1,
        text: `Chapter ${index + 1}`,
        imageBase64: pngBase64(),
        positionedText: positionedText(),
      })),
      null,
    )
    const calls: GenerateObjectOptions[] = []
    const llm: LLMModel = {
      generateObject: async <T>(options: GenerateObjectOptions) => {
        calls.push(options)
        return {
          object: {
            reasoning: "No headings needed for this call-count test.",
            entries: [],
            styleClusters: [],
          } as T,
        }
      },
    }

    await generateBookOutline(
      mediumEvidence,
      buildBookOutlineConfig({ structure_types: {}, role_types: {} }),
      llm,
    )

    expect(calls).toHaveLength(1)
    expect(calls[0].prompt).toBe("book_outline")
    expect((calls[0].context?.pages as unknown[])).toHaveLength(20)
    expect((calls[0].context?.proof_sheets as unknown[])).toHaveLength(1)
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
    const proposals: BookOutlineProposalOutput[] = []
    const llm: LLMModel = {
      generateObject: async <T>(options: GenerateObjectOptions) => {
        calls.push(options)
        if (options.prompt === "book_outline_synthesis") {
          const combined: BookOutlineProposalOutput = {
            reasoning: "Normalized all deterministic chunks.",
            styleClusters: [
              { styleClusterId: "chapter-style", description: "Chapter title", level: 1 },
            ],
            entries: proposals.flatMap((proposal) =>
              proposal.entries.map((entry) => ({
                ...entry,
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
        const proposal: BookOutlineProposalOutput = {
          reasoning: "Provisional chunk headings.",
          styleClusters: [
            { styleClusterId: "chapter-style", description: "Chapter title", level: 1 },
          ],
          entries: pages.map((page) => {
            const candidate = candidates.find((item) => item.pageId === page.pageId)!
            return {
              sourceCandidateIds: [candidate.candidateId],
              level: 1,
              kind: "chapter" as const,
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
        const invalid = proposal()
        invalid.entries[0].sourceCandidateIds = ["invented"]
        const validation = options.validate?.(invalid, options.context ?? {})
        expect(validation?.valid).toBe(false)
        expect(validation?.errors.join(" ")).toContain("unknown candidate")
        return { object: invalid as T }
      },
    }

    await expect(generateBookOutline(
      evidence(),
      buildBookOutlineConfig({ structure_types: {}, role_types: {} }),
      llm,
    )).rejects.toThrow("unknown candidate")
  })

  it("derives exact outline titles from source candidates", async () => {
    const llm: LLMModel = {
      generateObject: async <T>(options: GenerateObjectOptions) => {
        const compact = proposal()
        const validation = options.validate?.(compact, options.context ?? {})
        expect(validation?.valid).toBe(true)
        return { object: compact as T }
      },
    }

    const result = await generateBookOutline(
      evidence(),
      buildBookOutlineConfig({ structure_types: {}, role_types: {} }),
      llm,
    )
    expect(result.entries[0].title).toBe("Chapter One")
  })

  it("derives a valid parent tree from entry order and semantic levels", async () => {
    const parentEvidence = buildBookOutlineEvidence(
      [{
        pageId: "pg001",
        pageNumber: 1,
        text: "Chapter\nSection\nSubsection\nPeer section",
        imageBase64: pngBase64(),
      }],
      null,
    )
    const compact: BookOutlineProposalOutput = {
      reasoning: "Ordered semantic levels define the hierarchy.",
      styleClusters: [
        { styleClusterId: "h1", description: "Chapter", level: 1 },
        { styleClusterId: "h2", description: "Section", level: 2 },
        { styleClusterId: "h3", description: "Subsection", level: 3 },
      ],
      entries: [1, 2, 3, 2].map((level, index) => ({
        sourceCandidateIds: [`pg001_hc${String(index + 1).padStart(3, "0")}`],
        level,
        kind: level === 1 ? "chapter" as const : "section" as const,
        styleClusterId: `h${level}`,
        confidence: 0.9,
      })),
    }
    const llm: LLMModel = {
      generateObject: async <T>(options: GenerateObjectOptions) => {
        expect(options.validate?.(compact, options.context ?? {})).toEqual({
          valid: true,
          errors: [],
        })
        return { object: compact as T }
      },
    }

    const result = await generateBookOutline(
      parentEvidence,
      buildBookOutlineConfig({ structure_types: {}, role_types: {} }),
      llm,
    )
    expect(result.entries.map((entry) => entry.parentId)).toEqual([
      null,
      "outline-001",
      "outline-002",
      "outline-001",
    ])
  })

  it("anchors matching in-book headings to the TOC hierarchy before deriving parents", async () => {
    const bookEvidence = tocGuidedEvidence()
    const compact: BookOutlineProposalOutput = {
      reasoning: "Visual size alone made later topic headings look top-level.",
      styleClusters: [
        { styleClusterId: "display", description: "Large red heading", level: 1 },
      ],
      entries: [
        { candidateId: "pg002_hc001", level: 1, kind: "chapter" as const },
        { candidateId: "pg003_hc001", level: 1, kind: "section" as const },
        { candidateId: "pg004_hc001", level: 1, kind: "section" as const },
        { candidateId: "pg005_hc001", level: 1, kind: "section" as const },
      ].map(({ candidateId, level, kind }) => ({
        sourceCandidateIds: [candidateId],
        level,
        kind,
        styleClusterId: "display",
        confidence: 0.9,
      })),
    }
    const llm: LLMModel = {
      generateObject: async <T>(options: GenerateObjectOptions) => {
        expect(options.context?.toc_hierarchy).toEqual(bookEvidence.tocHierarchy)
        expect(options.validate?.(compact, options.context ?? {})).toEqual({
          valid: true,
          errors: [],
        })
        return { object: compact as T }
      },
    }

    const result = await generateBookOutline(
      bookEvidence,
      buildBookOutlineConfig({ structure_types: {}, role_types: {} }),
      llm,
    )

    expect(result.entries.map((entry) => entry.level)).toEqual([1, 2, 2, 2])
    expect(result.entries.map((entry) => entry.parentId)).toEqual([
      null,
      "outline-001",
      "outline-001",
      "outline-001",
    ])
    expect(result.reasoning).toContain("3 deterministic TOC hierarchy corrections")
  })

  it("splits a visual style reused at different semantic levels without retrying", async () => {
    const llm: LLMModel = {
      generateObject: async <T>(options: GenerateObjectOptions) => {
        const mismatched = proposal()
        mismatched.entries.push({
          ...mismatched.entries[0],
          level: 2,
          kind: "section",
          sourceCandidateIds: ["pg001_hc002"],
        })

        const validation = options.validate?.(mismatched, options.context ?? {})
        expect(validation?.valid).toBe(true)
        return { object: mismatched as T }
      },
    }

    const result = await generateBookOutline(
      evidence(),
      buildBookOutlineConfig({ structure_types: {}, role_types: {} }),
      llm,
    )
    expect(result.entries[1].level).toBe(2)
    expect(result.entries[1].styleClusterId).toBe("chapter-style-level-2")
    expect(result.styleClusters).toContainEqual({
      styleClusterId: "chapter-style-level-2",
      description: "Large centered title (level 2 variant)",
      level: 2,
    })
  })

  it("corrects a cluster declaration when all entries agree on another level", async () => {
    const llm: LLMModel = {
      generateObject: async <T>(options: GenerateObjectOptions) => {
        const mismatched = proposal()
        mismatched.entries[0].level = 2
        const validation = options.validate?.(mismatched, options.context ?? {})
        expect(validation?.valid).toBe(true)
        return { object: mismatched as T }
      },
    }

    const result = await generateBookOutline(
      evidence(),
      buildBookOutlineConfig({ structure_types: {}, role_types: {} }),
      llm,
    )
    expect(result.entries[0].level).toBe(2)
    expect(result.styleClusters[0].level).toBe(2)
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
    const tocHierarchy = tocGuidedEvidence().tocHierarchy
    const messages = await promptEngine.renderPrompt("book_outline", {
      pages: bookEvidence.pages,
      candidates: bookEvidence.candidates,
      toc_hierarchy: tocHierarchy,
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
    expect(text).toContain("candidate_id | page_id | page_number")
    expect(text).toContain("proof-001 pages: pg001")
    expect(text).toContain("TOC navigation rows are links/list items")
    expect(text).toContain("Compact table-of-contents hierarchy guide")
    expect(text).toContain("Linguagem formal e informal")
    expect(imageParts).toHaveLength(1)
  })

  it("renders the bounded chunk and compact synthesis prompts", async () => {
    const promptEngine = createPromptEngine(path.join(process.cwd(), "prompts"))
    const bookEvidence = evidence()
    const tocHierarchy = tocGuidedEvidence().tocHierarchy
    const chunkMessages = await promptEngine.renderPrompt("book_outline_chunk", {
      pages: bookEvidence.pages,
      candidates: bookEvidence.candidates,
      toc_hierarchy: tocHierarchy,
      proof_sheets: bookEvidence.proofSheets.map((sheet) => ({
        sheet_id: sheet.sheetId,
        page_ids: sheet.pageIds,
        page_numbers: sheet.pageNumbers,
        image_base64: sheet.imageBase64,
      })),
      type_scale: bookEvidence.typeScale,
    })
    const chunkText = chunkMessages.map(messageText).join("\n")
    expect(chunkText).toContain("deterministic page chunk")
    expect(chunkText).toContain("exclude every TOC navigation row")
    expect(chunkText).toContain("every entry level equals its referenced style cluster level")

    const synthesisMessages = await promptEngine.renderPrompt("book_outline_synthesis", {
      chunks: [{
        chunk_id: "chunk-001",
        page_numbers: [1],
        entries: output().entries,
        style_clusters: output().styleClusters,
      }],
      toc_hierarchy: tocHierarchy,
      type_scale: bookEvidence.typeScale,
    })
    const synthesisText = synthesisMessages.map(messageText).join("\n")
    expect(synthesisText).toContain("final book-structure analyst")
    expect(synthesisText).toContain("pg001_hc001")
    expect(synthesisText).toContain("Never restore table-of-contents navigation rows")
    expect(synthesisText).toContain("every entry level equals its referenced style cluster level")
  })
})
