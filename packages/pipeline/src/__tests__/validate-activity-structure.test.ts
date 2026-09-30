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
// Underline text
// ---------------------------------------------------------------------------

describe("validateActivityStructure — underline text", () => {
  it("accepts a fully tokenized word-level underline-text section", () => {
    const errs = check(`
      <section data-section-type="activity_underline_text">
        <p>
          <span data-id="text-1">
            <span class="activity-underline-option" data-activity-item="item-1" data-question-group="question-group-1">Mimi</span>
            <span class="activity-underline-option" data-activity-item="item-2" data-question-group="question-group-1">ninacheza</span>
            <span class="activity-underline-option" data-activity-item="item-3" data-question-group="question-group-1">mpira</span>.
          </span>
        </p>
      </section>
    `)
    expect(errs).toEqual([])
  })

  it("flags a word-level group that leaves words unselectable", () => {
    const errs = check(`
      <section data-section-type="activity_underline_text">
        <p>
          <span data-id="text-1">
            <span class="activity-underline-option" data-activity-item="item-1" data-question-group="question-group-1">Mimi</span>
            ninacheza mpira.
          </span>
        </p>
      </section>
    `)
    expect(
      errs.some((e) => e.includes("unselectable") && e.includes('"ninacheza"') && e.includes('"mpira"')),
    ).toBe(true)
  })

  it("does not require tokenizing number markers or example labels", () => {
    const errs = check(`
      <section data-section-type="activity_underline_text">
        <p>
          <span data-id="text-1">(i)
            <span class="activity-underline-option" data-activity-item="item-1" data-question-group="question-group-1">Wewe</span>
            <span class="activity-underline-option" data-activity-item="item-2" data-question-group="question-group-1">unaimba</span>
            <span class="activity-underline-option" data-activity-item="item-3" data-question-group="question-group-1">vizuri</span>.
          </span>
        </p>
      </section>
    `)
    expect(errs).toEqual([])
  })

  it("does not apply word-level tokenization to sentence-level groups", () => {
    const errs = check(`
      <section data-section-type="activity_underline_text">
        <p>
          <span data-id="text-1">
            <span class="activity-underline-option" data-activity-item="item-1" data-question-group="question-group-1">She reads books.</span>
            <span class="activity-underline-option" data-activity-item="item-2" data-question-group="question-group-1">She read books.</span>
            Pick the correct sentence.
          </span>
        </p>
      </section>
    `)
    expect(errs).toEqual([])
  })

  it("flags a word-level group whose segments do not share a wrapper below the section", () => {
    const errs = check(`
      <section data-section-type="activity_underline_text">
        <p><span data-id="text-1"><span class="activity-underline-option" data-activity-item="item-1" data-question-group="question-group-1">She</span></span></p>
        <p><span data-id="text-2"><span class="activity-underline-option" data-activity-item="item-2" data-question-group="question-group-1">reads</span></span></p>
      </section>
    `)
    expect(errs.some((e) => e.includes("do not share a wrapper"))).toBe(true)
  })

  it("flags a word-level group whose wrapper also contains other groups", () => {
    const errs = check(`
      <section data-section-type="activity_underline_text">
        <p>
          <span data-id="text-1">
            <span class="activity-underline-option" data-activity-item="item-1" data-question-group="question-group-1">She</span>
            <span class="activity-underline-option" data-activity-item="item-2" data-question-group="question-group-2">reads</span>
            <span class="activity-underline-option" data-activity-item="item-3" data-question-group="question-group-1">books</span>
          </span>
        </p>
      </section>
    `)
    expect(errs.some((e) => e.includes("also contains segments of other"))).toBe(true)
  })

  it("flags a section with no selectable underline options", () => {
    const errs = check(`
      <section data-section-type="activity_underline_text">
        <p><span data-id="text-1">Mimi ninacheza mpira.</span></p>
      </section>
    `)
    expect(errs.some((e) => e.includes("activity-underline-option"))).toBe(true)
  })

  it("flags a selectable segment missing data-activity-item", () => {
    const errs = check(`
      <section data-section-type="activity_underline_text">
        <p>
          <span data-id="text-1">
            <span class="activity-underline-option" data-question-group="question-group-1">Mimi</span>
          </span>
        </p>
      </section>
    `)
    expect(errs.some((e) => e.includes("data-activity-item"))).toBe(true)
  })

  it("flags a selectable segment missing data-question-group", () => {
    const errs = check(`
      <section data-section-type="activity_underline_text">
        <p>
          <span data-id="text-1">
            <span class="activity-underline-option" data-activity-item="item-1">Mimi</span>
          </span>
        </p>
      </section>
    `)
    expect(errs.some((e) => e.includes("data-question-group"))).toBe(true)
  })

  it("flags duplicate data-activity-item values", () => {
    const errs = check(`
      <section data-section-type="activity_underline_text">
        <p>
          <span data-id="text-1">
            <span class="activity-underline-option" data-activity-item="item-1" data-question-group="question-group-1">Mimi</span>
            <span class="activity-underline-option" data-activity-item="item-1" data-question-group="question-group-1">sisi</span>
          </span>
        </p>
      </section>
    `)
    expect(errs.some((e) => e.includes("appears 2 times"))).toBe(true)
  })

  it("flags an empty selectable segment as an unnamed control", () => {
    const errs = check(`
      <section data-section-type="activity_underline_text">
        <p>
          <span data-id="text-1">
            <span class="activity-underline-option" data-activity-item="item-1" data-question-group="question-group-1">Mimi</span>
            <span class="activity-underline-option" data-activity-item="item-2" data-question-group="question-group-1"></span>
          </span>
        </p>
      </section>
    `)
    expect(errs.some((e) => e.includes("has no text"))).toBe(true)
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

// ---------------------------------------------------------------------------
// Custom activities (activity_custom_*) — accessibility floor
// ---------------------------------------------------------------------------

const WELL_FORMED_CUSTOM = `
  <section data-section-type="activity_custom_drag_drop" aria-labelledby="h1">
    <h3 id="h1">Sort the items</h3>
    <div data-activity-target="t1" role="group" tabindex="0" aria-label="Bucket one">
      <div class="drop-zone"></div>
    </div>
    <div data-activity-item="i1" role="button" tabindex="0"><span>Item one</span></div>
    <div data-activity-status role="status" aria-live="polite"></div>
  </section>`

describe("validateActivityStructure — custom activities", () => {
  it("accepts a fully accessible custom activity", () => {
    expect(check(WELL_FORMED_CUSTOM)).toEqual([])
  })

  it("flags a drop zone with no role (the real pg011 gap)", () => {
    const errs = check(`
      <section data-section-type="activity_custom_drag_drop" aria-labelledby="h1">
        <h3 id="h1">Sort</h3>
        <div data-activity-target="target-ai" tabindex="0" aria-label="AI drop box"></div>
        <div data-activity-item="i1" role="button" tabindex="0">AI</div>
        <div data-activity-status aria-live="polite"></div>
      </section>`)
    expect(errs.some((e) => e.includes("target-ai") && e.includes("no role"))).toBe(true)
  })

  it("flags a drop zone with no accessible label", () => {
    const errs = check(`
      <section data-section-type="activity_custom_jigsaw" aria-labelledby="h1">
        <h3 id="h1">Puzzle</h3>
        <div data-activity-target="slot-1" role="group" tabindex="0"></div>
        <div data-activity-item="i1" role="button" tabindex="0">Tile</div>
        <div data-activity-status aria-live="polite"></div>
      </section>`)
    expect(errs.some((e) => e.includes("slot-1") && e.includes("accessible label"))).toBe(true)
  })

  it("flags a non-focusable drop zone", () => {
    const errs = check(`
      <section data-section-type="activity_custom_jigsaw" aria-labelledby="h1">
        <h3 id="h1">Puzzle</h3>
        <div data-activity-target="slot-1" role="group" aria-label="Top left"></div>
        <div data-activity-item="i1" role="button" tabindex="0">Tile</div>
        <div data-activity-status aria-live="polite"></div>
      </section>`)
    expect(errs.some((e) => e.includes("slot-1") && e.includes("keyboard-focusable"))).toBe(true)
  })

  it("flags a card with no accessible name and a card that isn't keyboard-operable", () => {
    const errs = check(`
      <section data-section-type="activity_custom_jigsaw" aria-labelledby="h1">
        <h3 id="h1">Puzzle</h3>
        <div data-activity-target="slot-1" role="group" tabindex="0" aria-label="Top left"></div>
        <div data-activity-item="i1"></div>
        <div data-activity-status aria-live="polite"></div>
      </section>`)
    expect(errs.some((e) => e.includes("i1") && e.includes("no accessible name"))).toBe(true)
    expect(errs.some((e) => e.includes("i1") && e.includes("operable by keyboard"))).toBe(true)
  })

  it("accepts a card that IS an image, named by its own alt", () => {
    const errs = check(`
      <section data-section-type="activity_custom_jigsaw" aria-labelledby="h1">
        <h3 id="h1">Puzzle</h3>
        <div data-activity-target="slot-1" role="group" tabindex="0" aria-label="Top left"></div>
        <img data-activity-item="i1" alt="Puzzle tile A" role="button" tabindex="0">
        <div data-activity-status aria-live="polite"></div>
      </section>`)
    expect(errs.some((e) => e.includes("i1") && e.includes("no accessible name"))).toBe(false)
  })

  it("still flags an image card whose alt is empty", () => {
    const errs = check(`
      <section data-section-type="activity_custom_jigsaw" aria-labelledby="h1">
        <h3 id="h1">Puzzle</h3>
        <div data-activity-target="slot-1" role="group" tabindex="0" aria-label="Top left"></div>
        <img data-activity-item="i1" alt="  " role="button" tabindex="0">
        <div data-activity-status aria-live="polite"></div>
      </section>`)
    expect(errs.some((e) => e.includes("i1") && e.includes("no accessible name"))).toBe(true)
  })

  it("accepts a native <button> card with no explicit role/tabindex", () => {
    const errs = check(`
      <section data-section-type="activity_custom_connect_dots" aria-labelledby="h1">
        <h3 id="h1">Connect</h3>
        <button data-activity-item="dot-1" aria-pressed="false">Dot 1</button>
        <div data-activity-status aria-live="polite"></div>
      </section>`)
    expect(errs).toEqual([])
  })

  it("accepts a card named only by its image alt", () => {
    const errs = check(`
      <section data-section-type="activity_custom_jigsaw" aria-labelledby="h1">
        <h3 id="h1">Puzzle</h3>
        <div data-activity-target="slot-1" role="group" tabindex="0" aria-label="Top left"></div>
        <div data-activity-item="i1" role="button" tabindex="0"><img alt="Puzzle tile A"></div>
        <div data-activity-status aria-live="polite"></div>
      </section>`)
    expect(errs).toEqual([])
  })

  it("flags a section with no accessible name", () => {
    const errs = check(`
      <section data-section-type="activity_custom_drag_drop">
        <div data-activity-target="t1" role="group" tabindex="0" aria-label="Bucket"></div>
        <div data-activity-item="i1" role="button" tabindex="0">X</div>
        <div data-activity-status aria-live="polite"></div>
      </section>`)
    expect(errs.some((e) => e.includes("<section> has no accessible name"))).toBe(true)
  })

  it("flags a custom activity with no live region", () => {
    const errs = check(`
      <section data-section-type="activity_custom_drag_drop" aria-labelledby="h1">
        <h3 id="h1">Sort</h3>
        <div data-activity-target="t1" role="group" tabindex="0" aria-label="Bucket"></div>
        <div data-activity-item="i1" role="button" tabindex="0">X</div>
      </section>`)
    expect(errs.some((e) => e.includes("no live region"))).toBe(true)
  })

  it("flags an unlabelled crossword input but accepts an aria-labelled one", () => {
    const bad = check(`
      <section data-section-type="activity_custom_crossword" aria-labelledby="h1">
        <h3 id="h1">Crossword</h3>
        <input maxlength="1" placeholder="A" />
        <div data-activity-status aria-live="polite"></div>
      </section>`)
    expect(bad.some((e) => e.includes("no accessible label"))).toBe(true)

    const good = check(`
      <section data-section-type="activity_custom_crossword" aria-labelledby="h1">
        <h3 id="h1">Crossword</h3>
        <input maxlength="1" aria-label="A1 letter 1" />
        <div data-activity-status aria-live="polite"></div>
      </section>`)
    expect(good).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Ordered sequence
// ---------------------------------------------------------------------------

describe("validateActivityStructure — ordering", () => {
  it("accepts a complete ordering permutation", () => {
    expect(check(`
      <section data-section-type="activity_ordering" data-correct-order="item-2,item-1">
        <ol data-activity-order-list>
          <li data-activity-item="item-1">One</li>
          <li data-activity-item="item-2">Two</li>
        </ol>
      </section>
    `)).toEqual([])
  })

  it("surfaces ordering-contract errors to rendering retries", () => {
    const errors = check(`
      <section data-section-type="activity_ordering" data-correct-order="item-99">
        <ol data-activity-order-list>
          <li data-activity-item="item-1">Only item</li>
        </ol>
      </section>
    `)

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining("at least two"),
        expect.stringContaining("every data-activity-item"),
      ]),
    )
  })
})
