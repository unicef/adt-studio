import { describe, expect, it } from "vitest"
import {
  DEFAULT_MAX_SECTIONS_PER_PAGE,
  DEFAULT_SECTION_CHAR_BUDGET,
  nodeTextLength,
  sectionTextLength,
  splitOversizedReadingSections,
  type SplittableNode,
  type SplittableSection,
} from "../section-length-split.js"

// ── Helpers ─────────────────────────────────────────────────────

/** A paragraph container holding one text leaf of exactly `chars` characters. */
function para(chars: number, marker = "x"): SplittableNode {
  return {
    structure: "paragraph",
    children: [{ role: "text", text: marker.repeat(chars) }],
  }
}

function leaf(role: string, text: string): SplittableNode {
  return { role, text }
}

function section(
  sectionType: string,
  nodes: SplittableNode[],
): SplittableSection {
  return { section_type: sectionType, nodes }
}

const OPTS = {
  charBudget: DEFAULT_SECTION_CHAR_BUDGET,
  maxSectionsPerPage: DEFAULT_MAX_SECTIONS_PER_PAGE,
}

/** Flatten a section's nodes back to the text leaves they contain, in order. */
function texts(nodes: SplittableNode[], acc: string[] = []): string[] {
  for (const n of nodes) {
    if (n.children?.length) texts(n.children, acc)
    else if (n.text) acc.push(n.text)
  }
  return acc
}

// ── Measurement ─────────────────────────────────────────────────

describe("text measurement", () => {
  it("sums leaf text through containers and ignores image leaves", () => {
    const nodes = [
      para(100),
      { structure: "image_group", children: [{ role: "image", image_id: "img1" }] },
      leaf("text", "  padded  "),
    ]
    expect(nodeTextLength(nodes[0]!)).toBe(100)
    expect(nodeTextLength(nodes[1]!)).toBe(0)
    // Trimmed before counting — trailing whitespace is not rendered height.
    expect(nodeTextLength(nodes[2]!)).toBe(6)
    expect(sectionTextLength(nodes)).toBe(106)
  })
})

// ── Core behaviour ──────────────────────────────────────────────

describe("splitOversizedReadingSections", () => {
  it("leaves a reading section that fits the budget untouched", () => {
    const input = [section("text_only", [para(400), para(400)])]
    const out = splitOversizedReadingSections(input, OPTS)

    expect(out).toHaveLength(1)
    expect(out[0]).toBe(input[0])
  })

  it("splits an oversized reading section at a top-level node boundary", () => {
    // 700 + 400 = 1100 fits the 1200 budget; adding the third would reach 1800.
    const input = [section("text_only", [para(700, "a"), para(400, "b"), para(700, "c")])]
    const out = splitOversizedReadingSections(input, OPTS)

    expect(out).toHaveLength(2)
    expect(out.every((s) => s.section_type === "text_only")).toBe(true)
    expect(out[0]!.nodes).toHaveLength(2)
    expect(out[1]!.nodes).toHaveLength(1)
  })

  it("uses as many parts as the budget requires when nodes are indivisible", () => {
    // Three 700-char paragraphs cannot pair up under a 1200 budget (1400 > 1200),
    // so each becomes its own part rather than being cut mid-paragraph.
    const out = splitOversizedReadingSections(
      [section("text_only", [para(700, "a"), para(700, "b"), para(700, "c")])],
      OPTS,
    )

    expect(out).toHaveLength(3)
    expect(out.map((s) => s.nodes.length)).toEqual([1, 1, 1])
  })

  it("never splits inside a paragraph — every part holds whole original nodes", () => {
    const nodes = [para(700, "a"), para(700, "b"), para(700, "c")]
    const out = splitOversizedReadingSections([section("text_only", nodes)], OPTS)

    const emitted = out.flatMap((s) => s.nodes)
    expect(emitted).toEqual(nodes)
    // No leaf text was cut apart.
    expect(out.flatMap((s) => texts(s.nodes))).toEqual([
      "a".repeat(700),
      "b".repeat(700),
      "c".repeat(700),
    ])
  })

  it("balances the parts instead of leaving a near-empty tail", () => {
    // Greedy packing would fill part 1 to 1150 and strand 250 in part 2.
    // Both parts are needed either way, so they should come out even.
    const nodes = Array.from({ length: 14 }, (_, i) => para(100, String(i % 10)))
    const out = splitOversizedReadingSections([section("text_only", nodes)], OPTS)

    expect(out).toHaveLength(2)
    const sizes = out.map((s) => sectionTextLength(s.nodes))
    expect(sizes.reduce((a, b) => a + b)).toBe(1400)
    // Neither part is a token remainder — the smaller is at least 40% of the larger.
    expect(Math.min(...sizes) / Math.max(...sizes)).toBeGreaterThan(0.4)
    // And the budget is still respected.
    expect(Math.max(...sizes)).toBeLessThanOrEqual(DEFAULT_SECTION_CHAR_BUDGET)
  })

  it("keeps a single oversized node whole rather than breaking it up", () => {
    const input = [section("text_only", [para(5000)])]
    const out = splitOversizedReadingSections(input, OPTS)

    expect(out).toHaveLength(1)
    expect(out[0]!.nodes).toHaveLength(1)
  })

  it("preserves reading order and loses no content", () => {
    const nodes = Array.from({ length: 9 }, (_, i) => para(500, String(i)))
    const out = splitOversizedReadingSections([section("text_only", nodes)], {
      ...OPTS,
      maxSectionsPerPage: 5,
    })

    expect(out.length).toBeGreaterThan(1)
    expect(out.flatMap((s) => texts(s.nodes))).toEqual(nodes.flatMap((n) => texts([n])))
  })

  it("applies to every reading section type", () => {
    for (const type of ["text_only", "text_and_single_image", "text_and_images"]) {
      const out = splitOversizedReadingSections(
        [section(type, [para(700, "a"), para(700, "b")])],
        OPTS,
      )
      expect(out, type).toHaveLength(2)
    }
  })

  it("leaves non-reading sections alone however long they are", () => {
    for (const type of [
      "activity_open_ended_answer",
      "credits",
      "front_cover",
      "table_of_contents",
      "boxed_text",
    ]) {
      const input = [section(type, [para(2000, "a"), para(2000, "b")])]
      const out = splitOversizedReadingSections(input, OPTS)
      expect(out, type).toHaveLength(1)
      expect(out[0], type).toBe(input[0])
    }
  })
})

// ── Guardrails ──────────────────────────────────────────────────

describe("split guardrails", () => {
  it("never strands a trailing page number as its own section", () => {
    const input = [
      section("text_only", [para(1190, "a"), leaf("page_number", "24")]),
    ]
    const out = splitOversizedReadingSections(input, { ...OPTS, charBudget: 1000 })

    // 1190 alone exceeds the budget, so the page number would open part 2.
    // It carries no reading content, so it folds back into part 1.
    expect(out).toHaveLength(1)
    expect(texts(out[0]!.nodes)).toEqual(["a".repeat(1190), "24"])
  })

  it("never strands a leading running header as its own section", () => {
    const input = [
      section("text_only", [leaf("header", "Chapter 3"), para(1400, "a"), para(1400, "b")]),
    ]
    const out = splitOversizedReadingSections(input, OPTS)

    expect(out).toHaveLength(2)
    expect(out[0]!.nodes[0]).toEqual(leaf("header", "Chapter 3"))
    expect(out[0]!.nodes).toHaveLength(2)
  })

  it("keeps a heading with the prose it introduces", () => {
    const input = [
      section("text_only", [
        para(1100, "a"),
        leaf("heading", "De la historia al mito"),
        para(1100, "b"),
      ]),
    ]
    const out = splitOversizedReadingSections(input, OPTS)

    expect(out).toHaveLength(2)
    // The heading opens part 2 alongside the prose it introduces, not alone.
    expect(texts(out[1]!.nodes)).toEqual(["De la historia al mito", "b".repeat(1100)])
  })

  it("caps the total sections on a page", () => {
    const nodes = Array.from({ length: 20 }, (_, i) => para(600, String(i % 10)))
    const out = splitOversizedReadingSections([section("text_only", nodes)], OPTS)

    expect(out).toHaveLength(DEFAULT_MAX_SECTIONS_PER_PAGE)
    expect(out.flatMap((s) => s.nodes)).toEqual(nodes)
  })

  it("counts the model's own splits against the cap", () => {
    // Model already emitted 3 sections — the cap is spent, nothing more is added.
    const input = [
      section("activity_multiple_choice", [para(100)]),
      section("activity_open_ended_answer", [para(100)]),
      section("text_only", [para(2000, "a"), para(2000, "b")]),
    ]
    const out = splitOversizedReadingSections(input, OPTS)

    expect(out).toHaveLength(3)
    expect(out[2]!.nodes).toHaveLength(2)
  })

  it("splits only within the sections left under the cap", () => {
    const input = [
      section("activity_multiple_choice", [para(100)]),
      section("text_only", [para(900, "a"), para(900, "b"), para(900, "c")]),
    ]
    const out = splitOversizedReadingSections(input, OPTS)

    // One section already used; cap 3 leaves room for 2 more parts.
    expect(out).toHaveLength(3)
    expect(out[0]!.section_type).toBe("activity_multiple_choice")
  })

  it("is disabled by a zero or invalid budget", () => {
    const input = [section("text_only", [para(2000, "a"), para(2000, "b")])]

    expect(splitOversizedReadingSections(input, { ...OPTS, charBudget: 0 })).toBe(input)
    expect(
      splitOversizedReadingSections(input, {
        ...OPTS,
        charBudget: undefined as unknown as number,
      }),
    ).toBe(input)
    expect(
      splitOversizedReadingSections(input, { ...OPTS, maxSectionsPerPage: 0 }),
    ).toBe(input)
  })

  it("does not mutate the input sections", () => {
    const nodes = [para(900, "a"), para(900, "b")]
    const input = [section("text_only", nodes)]
    splitOversizedReadingSections(input, OPTS)

    expect(input).toHaveLength(1)
    expect(input[0]!.nodes).toHaveLength(2)
  })
})
