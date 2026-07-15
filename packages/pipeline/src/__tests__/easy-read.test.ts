import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { DomUtils, parseDocument } from "htmlparser2"
import type { GenerateObjectOptions, GenerateObjectResult, LLMModel } from "@adt/llm"
import type { PageData } from "@adt/storage"
import { buildEasyReadConfig } from "../easy-read.js"
import {
  buildPageEasyReadBlocks,
  createEmptyEasyReadOutput,
  generateEasyRead,
  rewriteBlockEasyRead,
  flattenEasyReadEntries,
  getEasyReadElementEligibility,
  isDeterministicEmptyEasyReadOutput,
} from "../easy-read.js"
import type { EasyReadOutput } from "@adt/types"

function makeFakeModel(
  fn: (texts: Array<{ index: number; text: string }>) => string[],
  onCall?: (options: GenerateObjectOptions) => void,
): LLMModel {
  return {
    generateObject: async <T>(options: GenerateObjectOptions) => {
      onCall?.(options)
      const context = options.context as { texts: Array<{ index: number; text: string }> }
      const object = { texts: fn(context.texts) }
      options.validate?.(object, options.context ?? {})
      return {
        object: object as T,
        usage: { inputTokens: 1, outputTokens: 1 },
      } as GenerateObjectResult<T>
    },
  }
}

const page: PageData = { pageId: "pg001", pageNumber: 1, text: "" }

/** Build an Easy Read source block with `count` simple entries. */
function makeBlock(
  pageId: string,
  sectionIndex: number,
  count: number,
): EasyReadOutput["blocks"][number] {
  const sectionId = `${pageId}_sec${String(sectionIndex).padStart(3, "0")}`
  return {
    pageId,
    pageNumber: sectionIndex + 1,
    sectionId,
    sectionIndex,
    sectionType: "text_only",
    entries: Array.from({ length: count }, (_, i) => {
      const sourceId = `${pageId}_tx${sectionIndex}${String(i).padStart(3, "0")}`
      const originalText = `${pageId} s${sectionIndex} text ${i}`
      return {
        sourceId,
        easyReadId: `${sourceId}_easy_read`,
        originalText,
        text: originalText,
        pageId,
        sectionId,
        sectionIndex,
      }
    }),
  }
}

describe("buildPageEasyReadBlocks", () => {
  it("selects non-interactive body text and excludes headings, images, and activity controls", () => {
    const blocks = buildPageEasyReadBlocks(
      page,
      {
        sections: [
          {
            sectionIndex: 0,
            sectionType: "text_only",
            reasoning: "",
            html: `
              <section>
                <h1 data-id="pg001_h001">Chapter title</h1>
                <p data-id="pg001_tx001">Photosynthesis makes food for plants.</p>
                <img data-id="pg001_im001" src="x.png" />
                <p class="activity-text" data-id="pg001_tx002">Do this activity.</p>
              </section>
            `,
          },
          {
            sectionIndex: 1,
            sectionType: "activity_multiple_choice",
            reasoning: "",
            html: `
              <section>
                <p data-id="pg001_tx003">Read the source and answer.</p>
                <button data-activity-item="item-1"><span data-id="pg001_tx004">Option A</span></button>
              </section>
            `,
          },
        ],
      },
      {
        reasoning: "",
        sections: [
          {
            sectionId: "pg001_sec001",
            sectionType: "text_only",
            backgroundColor: "#fff",
            textColor: "#000",
            pageNumber: 1,
            isPruned: false,
            nodes: [],
          },
          {
            sectionId: "pg001_sec002",
            sectionType: "activity_multiple_choice",
            backgroundColor: "#fff",
            textColor: "#000",
            pageNumber: 1,
            isPruned: false,
            nodes: [],
          },
        ],
      },
    )

    expect(blocks).toHaveLength(2)
    expect(blocks[0].entries).toEqual([
      {
        sourceId: "pg001_tx001",
        easyReadId: "pg001_tx001_easy_read",
        originalText: "Photosynthesis makes food for plants.",
        text: "Photosynthesis makes food for plants.",
        pageId: "pg001",
        sectionId: "pg001_sec001",
        sectionIndex: 0,
      },
      {
        sourceId: "pg001_tx002",
        easyReadId: "pg001_tx002_easy_read",
        originalText: "Do this activity.",
        text: "Do this activity.",
        pageId: "pg001",
        sectionId: "pg001_sec001",
        sectionIndex: 0,
      },
    ])
    expect(blocks[1].entries).toEqual([
      {
        sourceId: "pg001_tx003",
        easyReadId: "pg001_tx003_easy_read",
        originalText: "Read the source and answer.",
        text: "Read the source and answer.",
        pageId: "pg001",
        sectionId: "pg001_sec002",
        sectionIndex: 1,
      },
    ])
  })

  it("reports why rendered elements are excluded from Easy Read", () => {
    const doc = parseDocument(`
      <section>
        <p data-id="pg001_tx001">Body text.</p>
        <h2 data-id="pg001_h001">Heading</h2>
        <img data-id="pg001_im001" src="x.png" />
        <figcaption data-id="pg001_im002">Generated image caption.</figcaption>
        <div data-id="activity_gen_opt1">Generated option.</div>
        <p class="activity-text" data-id="pg001_tx002">Activity instruction.</p>
        <button data-activity-item="item-1"><span data-id="pg001_tx003">Option</span></button>
        <button><span data-id="pg001_tx005">Button text</span></button>
        <p data-id="pg001_tx004">   </p>
      </section>
    `)
    const elements = DomUtils.findAll(
      (el) => el.type === "tag" && el.attribs?.["data-id"] !== undefined,
      doc.children,
    )
    const reasons = new Map(
      elements.map((el) => [
        el.attribs["data-id"],
        getEasyReadElementEligibility(el).reason ?? "eligible",
      ]),
    )

    expect(reasons.get("pg001_tx001")).toBe("eligible")
    expect(reasons.get("pg001_h001")).toBe("heading")
    expect(reasons.get("pg001_im001")).toBe("image")
    expect(reasons.get("pg001_im002")).toBe("image-caption")
    expect(reasons.get("activity_gen_opt1")).toBe("activity-generated")
    expect(reasons.get("pg001_tx002")).toBe("eligible")
    expect(reasons.get("pg001_tx003")).toBe("excluded-context")
    expect(reasons.get("pg001_tx005")).toBe("excluded-context")
    expect(reasons.get("pg001_tx004")).toBe("empty-text")
  })

  it("keeps captions and interactive text out while allowing safe activity prompt text", () => {
    const blocks = buildPageEasyReadBlocks(
      page,
      {
        sections: [
          {
            sectionIndex: 0,
            sectionType: "text_only",
            reasoning: "",
            html: `
              <section>
                <p data-id="pg001_tx001">Body text.</p>
                <figcaption data-id="pg001_im001">Caption text.</figcaption>
                <button data-activity-item="item-1"><span data-id="pg001_tx002">Option</span></button>
              </section>
            `,
          },
          {
            sectionIndex: 1,
            sectionType: "activity_open_ended_answer",
            reasoning: "",
            html: `
              <section>
                <table>
                  <tbody>
                    <tr>
                      <td><span data-id="pg001_tx003">Los bovidos, los cervidos, los camelidos y los jirafidos son animales rumiantes que se alimentan de vegetales.</span></td>
                      <td><input data-activity-item="item-1" aria-label="answer" /></td>
                    </tr>
                  </tbody>
                </table>
                <button data-activity-item="item-2"><span data-id="pg001_tx004">Interactive option</span></button>
              </section>
            `,
          },
        ],
      },
      {
        reasoning: "",
        sections: [
          {
            sectionId: "pg001_sec001",
            sectionType: "text_only",
            backgroundColor: "#fff",
            textColor: "#000",
            pageNumber: 1,
            isPruned: false,
            nodes: [],
          },
          {
            sectionId: "pg001_sec002",
            sectionType: "activity_open_ended_answer",
            backgroundColor: "#fff",
            textColor: "#000",
            pageNumber: 1,
            isPruned: false,
            nodes: [],
          },
        ],
      },
    )

    expect(blocks).toHaveLength(2)
    expect(blocks[0].entries.map((entry) => entry.sourceId)).toEqual(["pg001_tx001"])
    expect(blocks[1].entries.map((entry) => entry.sourceId)).toEqual(["pg001_tx003"])
    expect(blocks[1].entries[0].originalText).toBe(
      "Los bovidos, los cervidos, los camelidos y los jirafidos son animales rumiantes que se alimentan de vegetales.",
    )
  })

  it("deduplicates repeated data-ids from responsive activity layouts", () => {
    const blocks = buildPageEasyReadBlocks(
      page,
      {
        sections: [
          {
            sectionIndex: 0,
            sectionType: "activity_open_ended_answer",
            reasoning: "",
            html: `
              <section>
                <div class="hidden md:block">
                  <span data-id="pg001_tx001">Long activity summary.</span>
                </div>
                <div class="md:hidden">
                  <span data-id="pg001_tx001">Long activity summary.</span>
                </div>
              </section>
            `,
          },
        ],
      },
      {
        reasoning: "",
        sections: [
          {
            sectionId: "pg001_sec001",
            sectionType: "activity_open_ended_answer",
            backgroundColor: "#fff",
            textColor: "#000",
            pageNumber: 1,
            isPruned: false,
            nodes: [],
          },
        ],
      },
    )

    expect(blocks).toHaveLength(1)
    expect(blocks[0].entries.map((entry) => entry.sourceId)).toEqual(["pg001_tx001"])
  })
})

describe("generateEasyRead", () => {
  it("defaults Easy Read to disabled unless a book opts in", () => {
    const config = buildEasyReadConfig(
      {
        role_types: { text: "Text" },
        structure_types: { paragraph: "Paragraph" },
      },
      "en",
    )

    expect(config.enabled).toBe(false)
  })

  it("uses a deterministic empty output marker", () => {
    const empty = createEmptyEasyReadOutput()

    expect(empty).toEqual({
      blocks: [],
      generatedAt: "1970-01-01T00:00:00.000Z",
    })
    expect(isDeterministicEmptyEasyReadOutput(empty)).toBe(true)
    expect(isDeterministicEmptyEasyReadOutput({ blocks: [], generatedAt: new Date().toISOString() })).toBe(false)
  })

  it("generates _easy_read entries and validates response count", async () => {
    const config = buildEasyReadConfig(
      {
        role_types: { text: "Text" },
        structure_types: { paragraph: "Paragraph" },
        easy_read: { enabled: true, batch_size: 2 },
      },
      "en",
    )
    let sawValidator = false
    const model = makeFakeModel(
      (texts) => texts.map((t) => `Easy: ${t.text}`),
      (options) => {
        sawValidator = typeof options.validate === "function"
      },
    )

    const output = await generateEasyRead(
      [
        {
          pageId: "pg001",
          pageNumber: 1,
          sectionId: "pg001_sec001",
          sectionIndex: 0,
          sectionType: "text_only",
          entries: [
            {
              sourceId: "pg001_tx001",
              easyReadId: "pg001_tx001_easy_read",
              originalText: "A complex sentence.",
              text: "A complex sentence.",
              pageId: "pg001",
              sectionId: "pg001_sec001",
              sectionIndex: 0,
            },
          ],
        },
      ],
      config,
      model,
    )

    expect(sawValidator).toBe(true)
    expect(flattenEasyReadEntries(output)).toEqual([
      { id: "pg001_tx001_easy_read", text: "Easy: A complex sentence." },
    ])
  })

  it("passes section text as context while preserving one response per entry", async () => {
    const config = buildEasyReadConfig(
      {
        role_types: { text: "Text" },
        structure_types: { paragraph: "Paragraph" },
        easy_read: { enabled: true, batch_size: 10 },
      },
      "es",
    )
    let sectionText = ""
    const model = makeFakeModel(
      (texts) => texts.map((t) => `Adaptado: ${t.text}`),
      (options) => {
        const context = options.context as { section_text?: string }
        sectionText = context.section_text ?? ""
      },
    )

    await generateEasyRead(
      [
        {
          pageId: "pg001",
          pageNumber: 1,
          sectionId: "pg001_sec001",
          sectionIndex: 0,
          sectionType: "text_only",
          entries: [
            {
              sourceId: "pg001_tx001",
              easyReadId: "pg001_tx001_easy_read",
              originalText: "Primera idea compleja.",
              text: "Primera idea compleja.",
              pageId: "pg001",
              sectionId: "pg001_sec001",
              sectionIndex: 0,
            },
            {
              sourceId: "pg001_tx002",
              easyReadId: "pg001_tx002_easy_read",
              originalText: "Segunda idea compleja.",
              text: "Segunda idea compleja.",
              pageId: "pg001",
              sectionId: "pg001_sec001",
              sectionIndex: 0,
            },
          ],
        },
      ],
      config,
      model,
    )

    expect(sectionText).toBe("Primera idea compleja.\nSegunda idea compleja.")
  })

  it("allows prompt-shaped outputs for questions, enumerations, simple text, and abstract concepts", async () => {
    const config = buildEasyReadConfig(
      {
        role_types: { text: "Text" },
        structure_types: { paragraph: "Paragraph" },
        easy_read: { enabled: true, batch_size: 10 },
      },
      "es",
    )
    const outputs = [
      "¿Que tan lejos pueden ver los gatos?",
      "La democracia tiene varias dimensiones:\n- politica\n- social\n- cultural\n- economica",
      "El agua es necesaria para vivir.",
      "La solidaridad significa que las personas de un grupo ayudan y actuan juntas.",
    ]
    const model = makeFakeModel(() => outputs)

    const output = await generateEasyRead(
      [
        {
          pageId: "pg001",
          pageNumber: 1,
          sectionId: "pg001_sec001",
          sectionIndex: 0,
          sectionType: "text_only",
          entries: [
            {
              sourceId: "pg001_tx001",
              easyReadId: "pg001_tx001_easy_read",
              originalText: "¿A que distancia pueden ver los felinos?",
              text: "¿A que distancia pueden ver los felinos?",
              pageId: "pg001",
              sectionId: "pg001_sec001",
              sectionIndex: 0,
            },
            {
              sourceId: "pg001_tx002",
              easyReadId: "pg001_tx002_easy_read",
              originalText: "La democracia tiene dimensiones politica, social, cultural y economica.",
              text: "La democracia tiene dimensiones politica, social, cultural y economica.",
              pageId: "pg001",
              sectionId: "pg001_sec001",
              sectionIndex: 0,
            },
            {
              sourceId: "pg001_tx003",
              easyReadId: "pg001_tx003_easy_read",
              originalText: "El agua es necesaria para vivir.",
              text: "El agua es necesaria para vivir.",
              pageId: "pg001",
              sectionId: "pg001_sec001",
              sectionIndex: 0,
            },
            {
              sourceId: "pg001_tx004",
              easyReadId: "pg001_tx004_easy_read",
              originalText: "La solidaridad supone actuar como un todo.",
              text: "La solidaridad supone actuar como un todo.",
              pageId: "pg001",
              sectionId: "pg001_sec001",
              sectionIndex: 0,
            },
          ],
        },
      ],
      config,
      model,
    )

    expect(flattenEasyReadEntries(output)).toEqual([
      { id: "pg001_tx001_easy_read", text: outputs[0] },
      { id: "pg001_tx002_easy_read", text: outputs[1] },
      { id: "pg001_tx003_easy_read", text: outputs[2] },
      { id: "pg001_tx004_easy_read", text: outputs[3] },
    ])
  })

  it("reports cumulative progress that reaches total/total", async () => {
    const config = buildEasyReadConfig(
      {
        role_types: { text: "Text" },
        structure_types: { paragraph: "Paragraph" },
        easy_read: { enabled: true, batch_size: 10 },
      },
      "en",
    )
    const model = makeFakeModel((texts) => texts.map((t) => `Easy: ${t.text}`))
    const blocks = [makeBlock("pg001", 0, 2), makeBlock("pg002", 1, 3), makeBlock("pg003", 2, 1)]
    const totalEntries = 6

    const progress: Array<[number, number]> = []
    await generateEasyRead(blocks, config, model, {
      concurrency: 4,
      onProgress: (completed, total) => progress.push([completed, total]),
    })

    // One callback per block (3 blocks), totals always equal the entry count.
    expect(progress).toHaveLength(3)
    expect(progress.every(([, total]) => total === totalEntries)).toBe(true)
    // Cumulative completed counts are monotonically increasing and end at total.
    const completedCounts = progress.map(([completed]) => completed)
    expect(completedCounts).toEqual([...completedCounts].sort((a, b) => a - b))
    expect(completedCounts.at(-1)).toBe(totalEntries)
  })

  it("produces identical output regardless of concurrency", async () => {
    const config = buildEasyReadConfig(
      {
        role_types: { text: "Text" },
        structure_types: { paragraph: "Paragraph" },
        easy_read: { enabled: true, batch_size: 2 },
      },
      "en",
    )
    const blocks = [makeBlock("pg001", 0, 3), makeBlock("pg002", 1, 2), makeBlock("pg003", 2, 4)]
    const buildModel = () => makeFakeModel((texts) => texts.map((t) => `Easy: ${t.text}`))

    const sequential = await generateEasyRead(blocks, config, buildModel(), { concurrency: 1 })
    const concurrent = await generateEasyRead(blocks, config, buildModel(), { concurrency: 8 })

    expect(flattenEasyReadEntries(concurrent)).toEqual(flattenEasyReadEntries(sequential))
  })
})

describe("rewriteBlockEasyRead", () => {
  it("adapts a single section's entries and keys them by sourceId", async () => {
    const config = buildEasyReadConfig(
      {
        role_types: { text: "Text" },
        structure_types: { paragraph: "Paragraph" },
        easy_read: { enabled: true, batch_size: 2 },
      },
      "en",
    )
    let sectionText = ""
    let callCount = 0
    const model = makeFakeModel(
      (texts) => texts.map((t) => `Easy: ${t.text}`),
      (options) => {
        callCount += 1
        const context = options.context as { section_text?: string }
        sectionText = context.section_text ?? ""
      },
    )

    const block = makeBlock("pg001", 0, 3)
    const result = await rewriteBlockEasyRead(block, config, model)

    // batch_size 2 over 3 entries → 2 LLM calls, each seeing the full section text.
    expect(callCount).toBe(2)
    expect(sectionText).toBe("pg001 s0 text 0\npg001 s0 text 1\npg001 s0 text 2")
    expect(result.get("pg001_tx0000")).toBe("Easy: pg001 s0 text 0")
    expect(result.get("pg001_tx0002")).toBe("Easy: pg001 s0 text 2")
    expect(result.size).toBe(3)
  })
})

describe("easy_read prompt", () => {
  it("documents the compatibility contract and restrained section context usage", () => {
    const prompt = fs.readFileSync(path.join(process.cwd(), "prompts", "easy_read.liquid"), "utf-8")

    expect(prompt).toContain("Use the context to understand references, omitted subjects, continuity")
    expect(prompt).toContain("Do not copy information from the context")
    expect(prompt).toContain("Each output must correspond only to the input text with the same index")
    expect(prompt).toContain("Do not merge several input texts into a single output")
    expect(prompt).toContain("The output language must be {{ language }} ({{ language_code }})")
    expect(prompt).toContain("Do not add emojis, icons, or decorative symbols")
    expect(prompt).toContain("If the input text enumerates 3 or more elements as examples, parts, characteristics")
    expect(prompt).toContain("Do not keep 3 or more elements separated only by commas inside a table")
    expect(prompt).toContain("Each bullet must start with a hyphen and a space")
    expect(prompt).toContain("If 3 or more elements are the subject of a single short and very clear sentence")
  })
})
