import { describe, expect, it } from "vitest"
import { validateSectionHtml } from "../validate-html.js"

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
