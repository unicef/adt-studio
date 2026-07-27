import { describe, expect, it } from "vitest"
import { autoRepairUnderlineActivityHtml } from "../activity-underline-repair.js"

describe("autoRepairUnderlineActivityHtml", () => {
  it("wraps numbered sentence text in underline options when the LLM returns plain text", () => {
    const html = `
      <div id="content">
        <section data-section-type="activity_underline_text" data-section-id="sec-1">
          <div>
            <span data-id="title">Underline the pronoun.</span>
            <span data-id="num-1">(i)</span>
            <span data-id="sent-1">She reads books every day.</span>
          </div>
        </section>
      </div>
    `

    const repaired = autoRepairUnderlineActivityHtml(html, "activity_underline_text")
    expect(repaired).toContain('class="activity-underline-option')
    expect(repaired).toContain('data-question-group="question-group-1"')
    expect(repaired).toContain(">She</span>")
    expect(repaired).toContain(">reads</span>")
    expect(repaired).toContain(">books</span>")
  })

  it("skips worked-example sentences after Mfano until numbered questions begin", () => {
    const html = `
      <div id="content">
        <section data-section-type="activity_underline_text" data-section-id="sec-2">
          <div>
            <span data-id="label">Mfano:</span>
            <span data-id="example-1">I play football.</span>
            <span data-id="num-1">(i)</span>
            <span data-id="sent-1">They sing loudly.</span>
          </div>
        </section>
      </div>
    `

    const repaired = autoRepairUnderlineActivityHtml(html, "activity_underline_text")
    expect(repaired).not.toContain('data-id="example-1"><span class="activity-underline-option')
    expect(repaired).toContain('data-id="sent-1"><span class="activity-underline-option')
  })
})
