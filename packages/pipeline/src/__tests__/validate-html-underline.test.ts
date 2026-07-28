import { describe, expect, it } from "vitest"
import { validateSectionHtml } from "../validate-html.js"

describe("validateSectionHtml — underline activity preservation", () => {
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
