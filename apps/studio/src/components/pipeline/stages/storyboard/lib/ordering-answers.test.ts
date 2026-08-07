// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { updateOrderingAnswer } from "./ordering-answers"

const html = `
  <section data-section-type="activity_ordering" data-correct-order="item-2,item-1,item-3">
    <ol data-activity-order-list>
      <li data-activity-item="item-1">One</li>
      <li data-activity-item="item-2">Two</li>
      <li data-activity-item="item-3">Three</li>
    </ol>
  </section>`

describe("updateOrderingAnswer", () => {
  it("swaps an occupied rank and updates HTML and metadata atomically", () => {
    const result = updateOrderingAnswer(
      html,
      { "item-1": "2", "item-2": "1", "item-3": "3" },
      "item-1",
      "3",
    )

    expect(result?.answers).toEqual({
      "item-1": "3",
      "item-2": "1",
      "item-3": "2",
    })
    expect(result?.html).toContain('data-correct-order="item-2,item-3,item-1"')
  })

  it("rejects out-of-range edits without creating duplicate ranks", () => {
    expect(
      updateOrderingAnswer(
        html,
        { "item-1": "2", "item-2": "1", "item-3": "3" },
        "item-1",
        "4",
      ),
    ).toBeNull()
  })

  it("rejects an already-invalid rank map", () => {
    expect(
      updateOrderingAnswer(
        html,
        { "item-1": "1", "item-2": "1", "item-3": "3" },
        "item-1",
        "2",
      ),
    ).toBeNull()
  })
})
