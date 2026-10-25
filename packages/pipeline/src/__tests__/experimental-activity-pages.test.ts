import { describe, it, expect } from "vitest"
import { JSDOM } from "jsdom"
import type { Storage } from "@adt/storage"
import { AppConfig } from "@adt/types"
import type { ResolvedItem } from "../reading-order.js"
import { buildPageSectioningConfig } from "../page-sectioning.js"
import { groupExperimentalActivityPages, wrapExperimentalActivityBlock } from "../experimental-activity-pages.js"

const config = AppConfig.parse({ structure_types: {}, role_types: {}, page_sectioning: { mode: "page", experimental_activity_pages: "page" } })
const storage = { getLatestNodeData: () => null } as unknown as Storage
function item(id: string, pageId = "pg001", type = "activity_fill_in_the_blank"): ResolvedItem {
  return { kind: "section", id, pageId, sectionIndex: 0, pageNumber: 1,
    section: { sectionId: id, sectionType: type, nodes: [], pageNumber: 1, isPruned: false, backgroundColor: "#fff", textColor: "#000" },
    rendering: { sectionId: id, sectionIndex: 0, sectionType: type, reasoning: "", html: `<section data-section-type="${type}"></section>` } }
}
describe("experimental activity page composition", () => {
  it("groups only adjacent sections of the same source page without changing their identities", () => {
    const items = [item("a"), item("b"), item("c", "pg002"), item("d", "pg001")]
    const before = JSON.stringify(items)
    expect(groupExperimentalActivityPages(storage, items, config).map(group => group.map(x => x.id))).toEqual([["a", "b"], ["c"], ["d"]])
    expect(JSON.stringify(items)).toBe(before)
    expect(groupExperimentalActivityPages(storage, items)).toHaveLength(4)
    expect(groupExperimentalActivityPages(storage, items, { ...config, generate_activities: false })).toHaveLength(4)
  })
  it("leaves custom scripts and positioned pages on their existing path", () => {
    const first = item("a")
    const second = item("b")
    if (second.kind !== "section") throw new Error("fixture")
    second.rendering.html += "<script>custom()</script>"
    expect(groupExperimentalActivityPages(storage, [first, second], config)).toHaveLength(2)
    second.rendering.html = "<section></section>"
    second.section.viewport = { width: 600, height: 800 }
    expect(groupExperimentalActivityPages(storage, [first, second], config)).toHaveLength(2)
    expect(groupExperimentalActivityPages(storage, [first, item("c", "pg001", "activity_custom_test")], config)).toHaveLength(2)
  })
  it("isolates HTML/radio IDs and answers while preserving authored text IDs and blank markers", () => {
    const rendering = { sectionIndex: 0, sectionType: "activity_fill_in_the_blank", reasoning: "",
      html: '<div id="content"><section><label id="label" for="answer">Answer</label><input id="answer" name="choice" aria-labelledby="label" data-activity-item="item-1"><span data-id="authored-text">[[blank:item-1]]</span></section></div>',
      activityAnswers: { "item-1": '</div><script>alert("x")</script>' } }
    const document = new JSDOM(wrapExperimentalActivityBlock(rendering, "a") + wrapExperimentalActivityBlock(rendering, "b")).window.document
    const ids = Array.from(document.querySelectorAll("[id]")).map(x => x.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(document.querySelector('label[for="a--answer"]')).not.toBeNull()
    expect(Array.from(document.querySelectorAll("input")).map(x => x.name)).toEqual(["a--choice", "b--choice"])
    expect(document.querySelectorAll('[data-id="authored-text"]')).toHaveLength(2)
    expect(document.querySelector("script")).toBeNull()
    expect(JSON.parse(document.querySelector("[data-block-answers]")!.getAttribute("data-block-answers")!)).toEqual(rendering.activityAnswers)
    expect(document.body.textContent).toContain("[[blank:item-1]]")
  })
  it("opts By Page into semantic activity detection only when the experiment and activities are enabled", () => {
    expect(buildPageSectioningConfig(config).mode).toBe("dynamic")
    expect(buildPageSectioningConfig({ ...config, generate_activities: false }).mode).toBe("page")
    expect(buildPageSectioningConfig({ ...config, page_sectioning: { mode: "page" } }).mode).toBe("page")
  })
})
