import { describe, expect, it } from "vitest"
import type { EditableActivity } from "@adt/types"
import {
  remapEditableActivities,
  renderEditableActivityStaticHtml,
  maskStepperPayloads,
} from "../render-editable-activity.js"
import { stripContentEditable } from "../packaging/web.js"

const mcActivity = (overrides?: Partial<EditableActivity>): EditableActivity =>
  ({
    kind: "multiple-choice",
    sectionType: "activity_multiple_choice",
    enabled: true,
    steps: [
      {
        id: "question-group-1",
        prompt: { text: "Which animal says meow?", dataId: "text-1" },
        options: [
          {
            itemId: "item-1",
            correct: true,
            text: { text: "The cat" },
            image: { src: "images/cat.png", alt: "A cat" },
          },
          { itemId: "item-2", correct: false, text: { text: "The dog" } },
        ],
      },
    ],
    ...overrides,
  }) as EditableActivity

describe("remapEditableActivities", () => {
  const a = mcActivity()
  const b = mcActivity({ sectionType: "activity_true_false" })
  const c = mcActivity({ enabled: false })

  it("shifts entries after a deleted section down and drops the deleted one", () => {
    const remapped = remapEditableActivities(
      { "0": a, "1": b, "2": c },
      (i) => (i === 1 ? null : i > 1 ? i - 1 : i),
    )
    expect(remapped).toEqual({ "0": a, "1": c })
  })

  it("shifts entries after an inserted section up", () => {
    const remapped = remapEditableActivities({ "0": a, "2": b }, (i) => (i > 0 ? i + 1 : i))
    expect(remapped).toEqual({ "0": a, "3": b })
  })

  it("returns null when nothing moved or dropped", () => {
    expect(remapEditableActivities({ "0": a, "1": b }, (i) => i)).toBeNull()
    expect(remapEditableActivities({}, () => null)).toBeNull()
  })

  it("drops entries with malformed keys", () => {
    const remapped = remapEditableActivities({ "0": a, junk: b }, (i) => i)
    expect(remapped).toEqual({ "0": a })
  })
})

describe("renderEditableActivityStaticHtml — multiple-choice options", () => {
  it("renders both the image and the text when an option has both", () => {
    const html = renderEditableActivityStaticHtml(mcActivity())
    expect(html).toContain('src="images/cat.png"')
    expect(html).toContain("The cat")
    expect(html).toContain("The dog")
  })
})

describe("maskStepperPayloads", () => {
  const payload =
    '<script type="application/json" data-editable-activity>' +
    '{"t":"keep contenteditable data-background-color=\\"#123456\\""}' +
    "</script>"
  const page = `${payload}<section data-background-color="#ffffff" contenteditable="true">x</section>`

  it("hides payload content from page-level regex passes", () => {
    const { masked } = maskStepperPayloads(page)
    expect(masked.match(/data-background-color="([^"]*)"/)?.[1]).toBe("#ffffff")
    const stripped = stripContentEditable(masked)
    expect(stripped).not.toContain('contenteditable="true"')
  })

  it("restores the payload verbatim after the transforms", () => {
    const { masked, restore } = maskStepperPayloads(page)
    const restored = restore(stripContentEditable(masked))
    expect(restored).toContain('keep contenteditable data-background-color=\\"#123456\\"')
    expect(restored).not.toContain('contenteditable="true"')
  })

  it("passes payload-free pages through unchanged", () => {
    const plain = "<section>hello</section>"
    const { masked, restore } = maskStepperPayloads(plain)
    expect(masked).toBe(plain)
    expect(restore(plain)).toBe(plain)
  })
})
