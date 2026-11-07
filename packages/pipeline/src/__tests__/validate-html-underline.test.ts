import { describe, expect, it } from "vitest"
import { validateSectionHtml } from "../validate-html.js"

describe("validateSectionHtml — drag-and-drop activities", () => {
  it("counts draggable activity cards as the learner's response controls", () => {
    const html = `
      <div id="content">
        <section data-section-type="activity_matching" data-section-id="sec-1">
          <p><span data-id="i-1">Match the sentences.</span></p>
          <span data-id="a-1" data-activity-item="item-1" draggable="true" tabindex="0">She reads.</span>
          <span data-id="a-2" data-activity-item="item-2" draggable="true" tabindex="0">He runs.</span>
        </section>
      </div>
    `
    const result = validateSectionHtml(html, ["i-1", "a-1", "a-2"], [], undefined, {
      expectedTexts: new Map([["i-1", "Match the sentences."], ["a-1", "She reads."], ["a-2", "He runs."]]),
      expectedSectionType: "activity_matching",
      expectedSectionId: "sec-1",
      minimumEditableElements: 2,
    })
    expect(result.errors.filter((error) => error.includes("response control"))).toEqual([])
  })
})

describe("validateSectionHtml — underline activity preservation", () => {
  it("counts selectable underline segments as the learner's response, so no extra input is needed", () => {
    const html = `
      <div id="content">
        <section data-section-type="activity_underline_text" data-section-id="sec-1">
          <p><span data-id="q-1">Underline the verb.</span></p>
          <p>
            <span data-id="sent-1">
              <span class="activity-underline-option" data-activity-item="item-1" data-question-group="question-group-1">She</span>
              <span class="activity-underline-option" data-activity-item="item-2" data-question-group="question-group-1">reads</span>.
            </span>
          </p>
        </section>
      </div>
    `
    const result = validateSectionHtml(html, ["q-1", "sent-1"], [], undefined, {
      expectedTexts: new Map([["q-1", "Underline the verb."], ["sent-1", "She reads."]]),
      expectedSectionType: "activity_underline_text",
      expectedSectionId: "sec-1",
      minimumEditableElements: 1,
    })
    expect(result.errors.filter((error) => error.includes("response control"))).toEqual([])
  })

  it("preserves activity-underline-option spans inside a data-id wrapper", () => {
    const html = `
      <div id="content">
        <section data-section-type="activity_underline_text" data-section-id="sec-1">
          <p>
            <span data-id="sent-1">
              <span class="activity-underline-option" data-activity-item="item-1" data-question-group="question-group-1">She</span>
              <span class="activity-underline-option" data-activity-item="item-2" data-question-group="question-group-1">reads</span>
              <span class="activity-underline-option" data-activity-item="item-3" data-question-group="question-group-1">books</span>.
            </span>
          </p>
        </section>
      </div>
    `

    const result = validateSectionHtml(
      html,
      ["sent-1"],
      [],
      undefined,
      {
        expectedTexts: new Map([["sent-1", "She reads books."]]),
        expectedSectionType: "activity_underline_text",
        expectedSectionId: "sec-1",
      },
    )

    expect(result.valid).toBe(true)
    expect(result.sectionHtml).toContain("activity-underline-option")
    expect(result.sectionHtml).toContain('data-activity-item="item-1"')
  })
})
