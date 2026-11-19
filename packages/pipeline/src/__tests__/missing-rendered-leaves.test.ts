import { describe, expect, it } from "vitest"
import type { ContentNodeData, PageSectioningSection } from "@adt/types"
import { findMissingRenderedLeaves } from "../missing-rendered-leaves.js"

function leaf(nodeId: string, text: string, role = "text", isPruned = false): ContentNodeData {
  return { nodeId, role, text, isPruned }
}

function group(nodeId: string, children: ContentNodeData[], isPruned = false): ContentNodeData {
  return { nodeId, structure: "group", isPruned, children }
}

function section(nodes: ContentNodeData[], isPruned = false): PageSectioningSection {
  return {
    sectionId: "pg001_sec001",
    sectionType: "content",
    backgroundColor: "#ffffff",
    textColor: "#000000",
    pageNumber: 1,
    isPruned,
    nodes,
  }
}

function html(body: string): string {
  return `<div id="content"><section data-section-id="pg001_sec001">${body}</section></div>`
}

function rendering(sectionHtml: string, sectionIndex = 0) {
  return { sections: [{ sectionIndex, sectionType: "content", reasoning: "", html: sectionHtml }] }
}

describe("findMissingRenderedLeaves", () => {
  it("returns nothing when every visible text leaf has its data-id in the HTML", () => {
    const tree = { sections: [section([leaf("t1", "Hola"), group("g", [leaf("t2", "Adiós")])])] }
    const out = findMissingRenderedLeaves(
      tree,
      rendering(html(`<p data-id="t1">Hola</p><div><p data-id="t2">Adiós</p></div>`))
    )
    expect(out).toEqual([])
  })

  it("reports a visible text leaf whose data-id is absent from the HTML", () => {
    const tree = { sections: [section([leaf("t1", "Hola"), leaf("t2", "Me gustaría conocerte")])] }
    const out = findMissingRenderedLeaves(tree, rendering(html(`<p data-id="t1">Hola</p>`)))
    expect(out).toEqual([{ sectionIndex: 0, nodeId: "t2", text: "Me gustaría conocerte" }])
  })

  it("ignores leaves that are pruned themselves or through a pruned group", () => {
    const tree = {
      sections: [
        section([
          leaf("t1", "Own prune", "text", true),
          group("g", [leaf("t2", "Inherited prune")], true),
        ]),
      ],
    }
    expect(findMissingRenderedLeaves(tree, rendering(html("")))).toEqual([])
  })

  it("ignores pruned sections and sections with no rendering yet", () => {
    const tree = {
      sections: [section([leaf("t1", "Pruned section")], true), section([leaf("t2", "Not rendered")])],
    }
    expect(findMissingRenderedLeaves(tree, rendering(html(""), 0))).toEqual([])
  })

  it("ignores image leaves (the renderer drops images with no stored bytes)", () => {
    const tree = { sections: [section([{ nodeId: "img1", role: "image", isPruned: false }])] }
    expect(findMissingRenderedLeaves(tree, rendering(html("")))).toEqual([])
  })

  it("ignores leaves the renderer may drop by design: placeholders, enumeration markers, empty text", () => {
    const tree = {
      sections: [
        section([leaf("blank", "____"), leaf("marker", "1.", "label"), leaf("empty", "  ")]),
      ],
    }
    expect(findMissingRenderedLeaves(tree, rendering(html("")))).toEqual([])
  })

  it("does not report text hidden with sr-only (text baked into an image)", () => {
    const tree = { sections: [section([leaf("t1", "STOP")])] }
    const out = findMissingRenderedLeaves(
      tree,
      rendering(html(`<img data-id="img1" src="x"/><span data-id="t1" class="sr-only">STOP</span>`))
    )
    expect(out).toEqual([])
  })

  it("reports a header the book hides automatically: a visible one was un-hidden by the user", () => {
    const tree = { sections: [section([leaf("h1", "Unidad 3", "header"), leaf("t1", "Hola")])] }
    const out = findMissingRenderedLeaves(tree, rendering(html(`<p data-id="t1">Hola</p>`)), {
      prunedRoleTypes: ["header", "footer"],
    })
    expect(out).toEqual([{ sectionIndex: 0, nodeId: "h1", text: "Unidad 3" }])
  })

  it("ignores optional roles the book does not hide automatically (the renderer may drop them)", () => {
    const tree = {
      sections: [
        section([
          leaf("h1", "Unidad 3", "header"),
          leaf("w1", "MUESTRA", "watermark"),
          leaf("t1", "Hola"),
        ]),
      ],
    }
    const out = findMissingRenderedLeaves(tree, rendering(html(`<p data-id="t1">Hola</p>`)), {
      prunedRoleTypes: ["footer"],
    })
    expect(out).toEqual([])
  })

  it("skips a rendered section that no longer matches the tree's section (stale after a split or type change)", () => {
    const tree = { sections: [section([leaf("t1", "Hola")])] }
    const otherType = { sections: [{ sectionIndex: 0, sectionType: "activity_matching", reasoning: "", html: html("") }] }
    expect(findMissingRenderedLeaves(tree, otherType)).toEqual([])
    const otherId = rendering(`<section data-section-id="pg001_sec002"></section>`)
    expect(findMissingRenderedLeaves(tree, otherId)).toEqual([])
  })

  it("tolerates missing or malformed stored data", () => {
    expect(findMissingRenderedLeaves(null, null)).toEqual([])
    expect(findMissingRenderedLeaves({ sections: [] }, { sections: [] })).toEqual([])
  })
})
