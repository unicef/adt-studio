import { describe, expect, it } from "vitest"
import { splitMixedHeadingContainers } from "../render-template.js"
import type { RenderNode } from "../web-rendering.js"

const leaf = (node_id: string, role: string, extra: Partial<RenderNode> = {}): RenderNode => ({
  node_id,
  role,
  text: node_id,
  ...extra,
})
const heading = (node_id: string, children: RenderNode[]): RenderNode => ({
  node_id,
  structure: "heading",
  children,
})

describe("splitMixedHeadingContainers", () => {
  it("returns a container unchanged when the template's tag fits every heading child", () => {
    const nodes = [
      heading("h1", [leaf("a", "chapter_title"), leaf("b", "chapter_title")]),
      heading("h2", [leaf("c", "text"), leaf("d", "text")]),
      heading("h3", [leaf("e", "text"), leaf("f", "section_heading")]),
      heading("h4", [leaf("g", "heading", { heading_level: 4 }), leaf("h", "heading", { heading_level: 4 })]),
      heading("h5", [leaf("i", "chapter_title"), leaf("j", "heading")]),
      heading("h6", [leaf("k", "subheading"), leaf("l", "heading")]),
    ]
    expect(splitMixedHeadingContainers(nodes)).toEqual(nodes)
  })

  it("keeps a heading leaf without heading_level in the current run, since it fits any tag", () => {
    const out = splitMixedHeadingContainers([
      heading("hd", [leaf("a", "chapter_title"), leaf("b", "heading"), leaf("c", "subheading")]),
      heading("he", [leaf("d", "heading"), leaf("e", "subheading")]),
      heading("hf", [leaf("f", "chapter_title"), leaf("g", "heading"), leaf("h", "chapter_title"), leaf("i", "subheading")]),
    ])
    expect(out).toEqual([
      heading("hd_part1", [leaf("a", "chapter_title"), leaf("b", "heading")]),
      heading("hd_part2", [leaf("c", "subheading")]),
      heading("he_part1", [leaf("d", "heading")]),
      heading("he_part2", [leaf("e", "subheading")]),
      heading("hf_part1", [leaf("f", "chapter_title"), leaf("g", "heading"), leaf("h", "chapter_title")]),
      heading("hf_part2", [leaf("i", "subheading")]),
    ])
  })

  it("splits into one container per run of the same level, keeping leaf order and ids", () => {
    const out = splitMixedHeadingContainers([
      heading("hd", [
        leaf("a", "chapter_title"),
        leaf("b", "chapter_title"),
        leaf("c", "subheading"),
        leaf("d", "heading", { heading_level: 3 }),
      ]),
    ])
    expect(out).toEqual([
      heading("hd_part1", [leaf("a", "chapter_title"), leaf("b", "chapter_title")]),
      heading("hd_part2", [leaf("c", "subheading"), leaf("d", "heading", { heading_level: 3 })]),
    ])
  })

  it("lifts plain children of a split container out as standalone nodes", () => {
    const out = splitMixedHeadingContainers([
      heading("hd", [leaf("a", "text"), leaf("b", "chapter_title"), leaf("c", "text"), leaf("d", "subheading")]),
    ])
    expect(out).toEqual([
      leaf("a", "text"),
      heading("hd_part1", [leaf("b", "chapter_title")]),
      leaf("c", "text"),
      heading("hd_part2", [leaf("d", "subheading")]),
    ])
  })

  it("splits heading containers nested inside other containers", () => {
    const out = splitMixedHeadingContainers([
      {
        node_id: "grp",
        structure: "group",
        children: [heading("hd", [leaf("a", "section_heading"), leaf("b", "subheading")])],
      },
    ])
    expect(out).toEqual([
      {
        node_id: "grp",
        structure: "group",
        children: [heading("hd_part1", [leaf("a", "section_heading")]), heading("hd_part2", [leaf("b", "subheading")])],
      },
    ])
  })

  it("does not mutate its input", () => {
    const input = [heading("hd", [leaf("a", "chapter_title"), leaf("b", "subheading")])]
    const snapshot = structuredClone(input)
    splitMixedHeadingContainers(input)
    expect(input).toEqual(snapshot)
  })
})
