import { describe, expect, it } from "vitest"
import { parseDocument, DomUtils } from "htmlparser2"
import { validateActivityStructure } from "../validate-activity-structure.js"

function sectionFromHtml(html: string): {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  section: any
  sectionType: string
} {
  const doc = parseDocument(html)
  const section = DomUtils.findOne(
    (el) => el.type === "tag" && el.name === "section",
    doc.children ?? [],
    true,
  )
  if (!section) throw new Error("test fixture missing <section>")
  const sectionType = section.attribs?.["data-section-type"] ?? ""
  return { section, sectionType }
}

function check(html: string): string[] {
  const { section, sectionType } = sectionFromHtml(html)
  return validateActivityStructure(section, sectionType)
}

// ---------------------------------------------------------------------------
// Multiple choice / quiz
// ---------------------------------------------------------------------------

describe("validateActivityStructure — multiple choice", () => {
  it("accepts a well-formed MC option label", () => {
    const errs = check(`
      <section data-section-type="activity_multiple_choice">
        <label class="activity-option">
          <input type="radio" name="q1" data-activity-item="item-1" />
          <span>A</span>
        </label>
        <label class="activity-option">
          <input type="radio" name="q1" data-activity-item="item-2" />
          <span>B</span>
        </label>
      </section>
    `)
    expect(errs).toEqual([])
  })

  it("flags an option label missing class=\"activity-option\" (pg006 sec1 regression)", () => {
    const errs = check(`
      <section data-section-type="activity_multiple_choice">
        <label class="relative flex items-center justify-center cursor-pointer">
          <input type="radio" name="question-group-1" data-activity-item="item-1" />
          <img alt="" />
        </label>
      </section>
    `)
    expect(errs.some((e) => e.includes("class=\"activity-option\""))).toBe(true)
    expect(errs.some((e) => e.includes("item-1"))).toBe(true)
  })

  it("flags a radio with no name attribute", () => {
    const errs = check(`
      <section data-section-type="activity_multiple_choice">
        <label class="activity-option">
          <input type="radio" data-activity-item="item-1" />
        </label>
      </section>
    `)
    expect(errs.some((e) => e.includes("name"))).toBe(true)
  })

  it("flags an .activity-option label with no inner radio", () => {
    const errs = check(`
      <section data-section-type="activity_multiple_choice">
        <label class="activity-option">
          <span>just text, no radio</span>
        </label>
      </section>
    `)
    expect(errs.some((e) => e.includes("no <input type=\"radio\""))).toBe(true)
  })

  it("flags duplicate data-activity-item values across options", () => {
    const errs = check(`
      <section data-section-type="activity_multiple_choice">
        <label class="activity-option">
          <input type="radio" name="q1" data-activity-item="item-1" />
        </label>
        <label class="activity-option">
          <input type="radio" name="q1" data-activity-item="item-1" />
        </label>
      </section>
    `)
    expect(errs.some((e) => e.includes("appears 2 times"))).toBe(true)
  })

  it("applies the same rules to standalone activity_quiz", () => {
    const errs = check(`
      <section data-section-type="activity_quiz">
        <label class="flex">
          <input type="radio" name="q1" data-activity-item="item-1" />
        </label>
      </section>
    `)
    expect(errs.some((e) => e.includes("class=\"activity-option\""))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Multi-select ("select all that apply")
// ---------------------------------------------------------------------------

describe("validateActivityStructure — multi-select", () => {
  it("accepts a well-formed multi-select section", () => {
    const errs = check(`
      <section data-section-type="activity_multi_select">
        <label class="activity-option">
          <input type="checkbox" name="q1" data-activity-item="item-1" />
          <span>A</span>
        </label>
        <label class="activity-option">
          <input type="checkbox" name="q1" data-activity-item="item-2" />
          <span>B</span>
        </label>
        <label class="activity-option">
          <input type="checkbox" name="q1" data-activity-item="item-3" />
          <span>C</span>
        </label>
      </section>
    `)
    expect(errs).toEqual([])
  })

  it("flags an option label missing class=\"activity-option\"", () => {
    const errs = check(`
      <section data-section-type="activity_multi_select">
        <label class="flex items-center cursor-pointer">
          <input type="checkbox" name="q1" data-activity-item="item-1" />
          <span>A</span>
        </label>
      </section>
    `)
    expect(errs.some((e) => e.includes("class=\"activity-option\""))).toBe(true)
    expect(errs.some((e) => e.includes("item-1"))).toBe(true)
  })

  it("flags a checkbox missing the name attribute", () => {
    const errs = check(`
      <section data-section-type="activity_multi_select">
        <label class="activity-option">
          <input type="checkbox" data-activity-item="item-1" />
        </label>
      </section>
    `)
    expect(errs.some((e) => e.includes("name"))).toBe(true)
    expect(errs.some((e) => e.includes("item-1"))).toBe(true)
  })

  it("flags an .activity-option label with no inner checkbox", () => {
    const errs = check(`
      <section data-section-type="activity_multi_select">
        <label class="activity-option">
          <span>just text, no checkbox</span>
        </label>
      </section>
    `)
    expect(errs.some((e) => e.includes("no <input type=\"checkbox\""))).toBe(true)
  })

  it("does NOT misfire on a sibling radio in a multi-select section", () => {
    // Defensive: a stray radio inside a multi-select section shouldn't be
    // misinterpreted as a missing-name checkbox violation. The MS rule only
    // looks at type="checkbox" inputs.
    const errs = check(`
      <section data-section-type="activity_multi_select">
        <label class="activity-option">
          <input type="checkbox" name="q1" data-activity-item="item-1" />
        </label>
        <input type="radio" data-activity-item="ignored-1" />
      </section>
    `)
    expect(errs.filter((e) => e.includes("checkbox"))).toEqual([])
  })

  it("flags duplicate data-activity-item across checkboxes", () => {
    const errs = check(`
      <section data-section-type="activity_multi_select">
        <label class="activity-option">
          <input type="checkbox" name="q1" data-activity-item="item-1" />
        </label>
        <label class="activity-option">
          <input type="checkbox" name="q1" data-activity-item="item-1" />
        </label>
      </section>
    `)
    expect(errs.some((e) => e.includes("appears 2 times"))).toBe(true)
  })

  it("accepts multiple question groups with distinct names", () => {
    const errs = check(`
      <section data-section-type="activity_multi_select">
        <label class="activity-option">
          <input type="checkbox" name="question-group-1" data-activity-item="item-1" />
        </label>
        <label class="activity-option">
          <input type="checkbox" name="question-group-1" data-activity-item="item-2" />
        </label>
        <label class="activity-option">
          <input type="checkbox" name="question-group-2" data-activity-item="item-3" />
        </label>
        <label class="activity-option">
          <input type="checkbox" name="question-group-2" data-activity-item="item-4" />
        </label>
      </section>
    `)
    expect(errs).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// True/false
// ---------------------------------------------------------------------------

describe("validateActivityStructure — true/false", () => {
  it("accepts a well-formed true/false fieldset", () => {
    const errs = check(`
      <section data-section-type="activity_true_false">
        <fieldset>
          <label>
            <input type="radio" name="q1" value="true" data-activity-item="item-1" />
            <span class="validation-mark hidden"></span>
          </label>
          <label>
            <input type="radio" name="q1" value="false" data-activity-item="item-1" />
            <span class="validation-mark hidden"></span>
          </label>
        </fieldset>
      </section>
    `)
    expect(errs).toEqual([])
  })

  it("flags a fieldset whose paired radios don't share a data-activity-item", () => {
    const errs = check(`
      <section data-section-type="activity_true_false">
        <fieldset>
          <label>
            <input type="radio" name="q1" value="true" data-activity-item="item-1" />
            <span class="validation-mark hidden"></span>
          </label>
          <label>
            <input type="radio" name="q1" value="false" data-activity-item="item-2" />
            <span class="validation-mark hidden"></span>
          </label>
        </fieldset>
      </section>
    `)
    expect(errs.some((e) => e.includes("share the same data-activity-item"))).toBe(true)
  })

  it("flags a fieldset that's missing the false value", () => {
    const errs = check(`
      <section data-section-type="activity_true_false">
        <fieldset>
          <label>
            <input type="radio" name="q1" value="yes" data-activity-item="item-1" />
            <span class="validation-mark hidden"></span>
          </label>
          <label>
            <input type="radio" name="q1" value="no" data-activity-item="item-1" />
            <span class="validation-mark hidden"></span>
          </label>
        </fieldset>
      </section>
    `)
    expect(errs.some((e) => e.includes("value=\"true\" and one with value=\"false\""))).toBe(true)
  })

  it("flags a missing .validation-mark span", () => {
    const errs = check(`
      <section data-section-type="activity_true_false">
        <fieldset>
          <label>
            <input type="radio" name="q1" value="true" data-activity-item="item-1" />
          </label>
          <label>
            <input type="radio" name="q1" value="false" data-activity-item="item-1" />
          </label>
        </fieldset>
      </section>
    `)
    expect(errs.some((e) => e.includes("validation-mark"))).toBe(true)
  })

  it("accepts multiple questions when each fieldset is internally consistent", () => {
    const errs = check(`
      <section data-section-type="activity_true_false">
        <fieldset>
          <label>
            <input type="radio" name="q1" value="true" data-activity-item="item-1" />
            <span class="validation-mark hidden"></span>
          </label>
          <label>
            <input type="radio" name="q1" value="false" data-activity-item="item-1" />
            <span class="validation-mark hidden"></span>
          </label>
        </fieldset>
        <fieldset>
          <label>
            <input type="radio" name="q2" value="true" data-activity-item="item-2" />
            <span class="validation-mark hidden"></span>
          </label>
          <label>
            <input type="radio" name="q2" value="false" data-activity-item="item-2" />
            <span class="validation-mark hidden"></span>
          </label>
        </fieldset>
      </section>
    `)
    expect(errs).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Fill-in-the-blank / fill-in-a-table
// ---------------------------------------------------------------------------

describe("validateActivityStructure — fill in the blank", () => {
  it("accepts inline [[blank:item-N]] markers without explicit inputs", () => {
    const errs = check(`
      <section data-section-type="activity_fill_in_the_blank">
        <p class="fitb-sentence">
          <span data-id="text-1">El cielo es de color [[blank:item-1]].</span>
        </p>
      </section>
    `)
    expect(errs).toEqual([])
  })

  it("flags a malformed [[blank:...]] marker", () => {
    const errs = check(`
      <section data-section-type="activity_fill_in_the_blank">
        <p class="fitb-sentence">
          <span data-id="text-1">El cielo es de color [[blank:azul]].</span>
        </p>
      </section>
    `)
    expect(errs.some((e) => e.includes("Malformed blank marker"))).toBe(true)
  })

  it("flags duplicate item ids across markers", () => {
    const errs = check(`
      <section data-section-type="activity_fill_in_the_blank">
        <p class="fitb-sentence">
          <span data-id="text-1">A [[blank:item-1]] and B [[blank:item-1]].</span>
        </p>
      </section>
    `)
    expect(errs.some((e) => e.includes("appears 2 times"))).toBe(true)
  })

  it("accepts a fill-in-a-table with explicit inputs", () => {
    const errs = check(`
      <section data-section-type="activity_fill_in_a_table">
        <input type="text" data-aria-id="aria-1-0-0" data-activity-item="item-1" />
        <input type="text" data-aria-id="aria-1-0-1" data-activity-item="item-2" />
      </section>
    `)
    expect(errs).toEqual([])
  })

  it("flags a fill-in-a-table input missing data-activity-item", () => {
    const errs = check(`
      <section data-section-type="activity_fill_in_a_table">
        <input type="text" data-aria-id="aria-1-0-0" />
      </section>
    `)
    expect(errs.some((e) => e.includes("missing data-activity-item"))).toBe(true)
  })

})

// ---------------------------------------------------------------------------
// Open-ended
// ---------------------------------------------------------------------------

describe("validateActivityStructure — open ended", () => {
  it("accepts a well-formed open-ended section", () => {
    const errs = check(`
      <section data-section-type="activity_open_ended_answer">
        <input type="text" data-aria-id="aria-1-0-0" aria-label="Student name" />
        <textarea data-aria-id="aria-1-0-1" aria-label="Describe what happened"></textarea>
      </section>
    `)
    expect(errs).toEqual([])
  })

  it("flags an input missing aria-label/aria-labelledby", () => {
    const errs = check(`
      <section data-section-type="activity_open_ended_answer">
        <input type="text" data-aria-id="aria-1-0-0" />
      </section>
    `)
    expect(errs.some((e) => e.includes("no accessible label"))).toBe(true)
  })

})

// ---------------------------------------------------------------------------
// Unknown / non-activity section types
// ---------------------------------------------------------------------------

describe("validateActivityStructure — non-activity sections", () => {
  it("is a no-op for unknown section types", () => {
    const errs = check(`
      <section data-section-type="text_only">
        <p>Plain content</p>
      </section>
    `)
    expect(errs).toEqual([])
  })
})
