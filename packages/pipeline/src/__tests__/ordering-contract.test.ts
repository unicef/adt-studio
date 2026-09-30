import { describe, expect, it } from "vitest"
import { inspectOrderingActivityHtml } from "../ordering-contract.js"

const validHtml = `
  <section data-section-type="activity_ordering" data-correct-order="item-2,item-1,item-3">
    <ol data-activity-order-list>
      <li data-activity-item="item-1">One</li>
      <li data-activity-item="item-2">Two</li>
      <li data-activity-item="item-3">Three</li>
    </ol>
  </section>`

describe("inspectOrderingActivityHtml", () => {
  it("derives a complete 1..N rank map from a valid ordering contract", () => {
    const result = inspectOrderingActivityHtml(validHtml)

    expect(result.errors).toEqual([])
    expect(result.contract).toEqual({
      itemIds: ["item-1", "item-2", "item-3"],
      correctOrder: ["item-2", "item-1", "item-3"],
      answers: { "item-2": "1", "item-1": "2", "item-3": "3" },
    })
  })

  it("accepts an inspectable JSON-array order", () => {
    const result = inspectOrderingActivityHtml(
      validHtml.replace(
        'data-correct-order="item-2,item-1,item-3"',
        "data-correct-order='[&quot;item-3&quot;,&quot;item-2&quot;,&quot;item-1&quot;]'",
      ),
    )

    expect(result.contract?.correctOrder).toEqual(["item-3", "item-2", "item-1"])
  })

  it("rejects missing lists, too few items, and non-item direct children", () => {
    expect(
      inspectOrderingActivityHtml(
        '<section data-section-type="activity_ordering" data-correct-order="item-1"></section>',
      ).errors,
    ).toEqual(expect.arrayContaining([expect.stringContaining("exactly one")]))

    const result = inspectOrderingActivityHtml(`
      <section data-section-type="activity_ordering" data-correct-order="item-1">
        <ol data-activity-order-list>
          <li data-activity-item="item-1">One</li>
          <li>Decoration</li>
        </ol>
      </section>`)
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Every direct child"),
        expect.stringContaining("at least two"),
      ]),
    )
  })

  it("rejects duplicate item ids and non-permutation correct orders", () => {
    const duplicate = inspectOrderingActivityHtml(
      validHtml.replace('data-activity-item="item-3"', 'data-activity-item="item-2"'),
    )
    expect(duplicate.errors).toEqual(
      expect.arrayContaining([expect.stringContaining("must be unique")]),
    )

    const unknown = inspectOrderingActivityHtml(
      validHtml.replace("item-2,item-1,item-3", "item-2,item-1,item-99"),
    )
    expect(unknown.errors).toEqual(
      expect.arrayContaining([expect.stringContaining("every data-activity-item")]),
    )
  })

  it("ignores non-ordering activity HTML", () => {
    expect(
      inspectOrderingActivityHtml(
        '<section data-section-type="activity_sorting"><div>Categories</div></section>',
      ),
    ).toEqual({ isOrdering: false, errors: [] })
  })
})
