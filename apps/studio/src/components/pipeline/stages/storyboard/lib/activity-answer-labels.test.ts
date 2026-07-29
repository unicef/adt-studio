// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import {
  parseActivityLabels,
  parseItemTokens,
  writeCustomAnswerToHtml,
} from "./activity-answer-labels"

// Jigsaw: one item per slot, slot label via aria-labelledby, tile label in text.
const JIGSAW = `
<section data-section-type="activity_custom_jigsaw">
  <div data-activity-target="slot-1" data-correct-items="item-1" aria-labelledby="slot-label-1">
    <div id="slot-label-1" class="font-semibold">Top left space</div>
    <div class="drop-zone"></div>
    <div class="slot-feedback">stale feedback</div>
  </div>
  <div data-activity-target="slot-2" data-correct-items="item-4" aria-labelledby="slot-label-2">
    <div id="slot-label-2" class="font-semibold">Top right space</div>
    <div class="drop-zone"></div>
  </div>
  <div class="items-source">
    <div data-activity-item="item-1"><img alt="Puzzle tile D"><span>Tile D</span><span class="item-feedback">✗</span></div>
    <div data-activity-item="item-4"><img alt="Puzzle tile A"><span>Tile A</span></div>
  </div>
</section>`

// Sorting bucket: multiple items per slot, label via aria-labelledby.
const SORTING = `
<section data-section-type="activity_custom_drag_drop">
  <div data-activity-target="target-autonomous" data-correct-items="item-1,item-2" aria-labelledby="lbl-a">
    <div id="lbl-a" class="font-semibold">Autonomous systems</div>
    <div class="drop-zone"></div>
  </div>
  <div class="items-source">
    <div data-activity-item="item-1"><span>Automatic sliding door</span></div>
    <div data-activity-item="item-2"><span>Sensor-based tap</span></div>
    <div data-activity-item="item-3"><span>Manual faucet</span></div>
  </div>
</section>`

describe("parseActivityLabels", () => {
  it("maps slot ids to their visible labels (via aria-labelledby)", () => {
    const { targetLabels } = parseActivityLabels(JIGSAW)
    expect(targetLabels).toEqual({
      "slot-1": "Top left space",
      "slot-2": "Top right space",
    })
  })

  it("maps item ids to their visible text, ignoring feedback marks", () => {
    const { itemLabels } = parseActivityLabels(JIGSAW)
    expect(itemLabels["item-1"]).toBe("Tile D")
    expect(itemLabels["item-4"]).toBe("Tile A")
  })

  it("lists items in document order for dropdowns", () => {
    const { items } = parseActivityLabels(SORTING)
    expect(items.map((i) => i.id)).toEqual(["item-1", "item-2", "item-3"])
    expect(items[0].label).toBe("Automatic sliding door")
  })

  it("falls back to image alt for image-only tiles", () => {
    const { itemLabels } = parseActivityLabels(
      `<div data-activity-item="item-x"><img alt="A red apple"></div>`,
    )
    expect(itemLabels["item-x"]).toBe("A red apple")
  })

  it("returns empty maps for empty / non-activity HTML", () => {
    expect(parseActivityLabels("")).toEqual({
      targetLabels: {},
      itemLabels: {},
      items: [],
      htmlAnswers: {},
    })
    expect(parseActivityLabels("<p>hello</p>")).toEqual({
      targetLabels: {},
      itemLabels: {},
      items: [],
      htmlAnswers: {},
    })
  })

  it("reads the grader's answer key from data-correct-items (drop targets)", () => {
    const { htmlAnswers } = parseActivityLabels(JIGSAW)
    expect(htmlAnswers).toEqual({ "slot-1": "item-1", "slot-2": "item-4" })
  })

  it("reads the grader's answer key from data-answer (per-slot inputs)", () => {
    const { htmlAnswers } = parseActivityLabels(
      `<section><input data-cell="r2c2" data-answer="B"><input data-cell="r2c3" data-answer="C"></section>`,
    )
    expect(htmlAnswers).toEqual({ r2c2: "B", r2c3: "C" })
  })
})

describe("parseItemTokens", () => {
  it("splits CSV item ids, trimming blanks", () => {
    expect(parseItemTokens("item-1, item-2 ,, item-3")).toEqual([
      "item-1",
      "item-2",
      "item-3",
    ])
    expect(parseItemTokens("")).toEqual([])
  })
})

describe("writeCustomAnswerToHtml", () => {
  it("updates data-correct-items on a drop target (the grader's source)", () => {
    const out = writeCustomAnswerToHtml(JIGSAW, "slot-1", "item-4")
    const { itemLabels } = parseActivityLabels(out)
    const doc = new DOMParser().parseFromString(out, "text/html")
    expect(
      doc
        .querySelector('[data-activity-target="slot-1"]')
        ?.getAttribute("data-correct-items"),
    ).toBe("item-4")
    // sanity: labels still parse
    expect(itemLabels["item-4"]).toBe("Tile A")
  })

  it("writes a CSV for multi-item buckets", () => {
    const out = writeCustomAnswerToHtml(
      SORTING,
      "target-autonomous",
      "item-1,item-3",
    )
    const doc = new DOMParser().parseFromString(out, "text/html")
    expect(
      doc
        .querySelector('[data-activity-target="target-autonomous"]')
        ?.getAttribute("data-correct-items"),
    ).toBe("item-1,item-3")
  })

  it("updates data-answer on a per-slot input (crossword/fill)", () => {
    const html = `<section><input data-cell="r2c2" data-answer="B"></section>`
    const out = writeCustomAnswerToHtml(html, "r2c2", "Z")
    const doc = new DOMParser().parseFromString(out, "text/html")
    expect(
      doc.querySelector('[data-cell="r2c2"]')?.getAttribute("data-answer"),
    ).toBe("Z")
  })

  it("returns the HTML unchanged when no matching element exists", () => {
    const html = `<section><div data-activity-target="slot-1" data-correct-items="item-1"></div></section>`
    expect(writeCustomAnswerToHtml(html, "nope", "x")).toBe(html)
  })
})
