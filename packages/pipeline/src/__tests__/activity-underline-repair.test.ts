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

  describe("word-level group completion", () => {
    const option = (item: string, group: string, word: string): string =>
      `<span class="activity-underline-option" data-activity-item="${item}" data-question-group="${group}">${word}</span>`

    it("completes a word-level group so every word is selectable", () => {
      const html = `
        <div id="content">
          <section data-section-type="activity_underline_text" data-section-id="sec-1">
            <span data-id="title">Underline the pronoun.</span>
            <p><span data-id="sent-1">(ii) ${option("item-1", "question-group-1", "Yeye")} ${option("item-2", "question-group-1", "anasoma")} kwa ${option("item-3", "question-group-1", "bidii")}.</span></p>
          </section>
        </div>
      `

      const repaired = autoRepairUnderlineActivityHtml(html, "activity_underline_text")
      // "kwa" becomes an option of the same group, ids continuing after the max.
      expect(repaired).toContain('data-activity-item="item-4"')
      expect(repaired).toMatch(/data-activity-item="item-4"[^>]*data-question-group="question-group-1"[^>]*>kwa</)
      // Existing options are untouched.
      expect(repaired).toContain(option("item-1", "question-group-1", "Yeye"))
      // The instruction outside the group's wrapper stays plain.
      expect(repaired).toContain('<span data-id="title">Underline the pronoun.</span>')
      // The number marker stays plain text.
      expect(repaired).not.toMatch(/data-activity-item="[^"]*"[^>]*>i</)
    })

    it("returns the input unchanged when word-level groups are fully tokenized", () => {
      const html = `
        <div id="content">
          <section data-section-type="activity_underline_text" data-section-id="sec-1">
            <p><span data-id="sent-1">${option("item-1", "question-group-1", "Wewe")} ${option("item-2", "question-group-1", "unaimba")} ${option("item-3", "question-group-1", "vizuri")}.</span></p>
          </section>
        </div>
      `
      expect(autoRepairUnderlineActivityHtml(html, "activity_underline_text")).toBe(html)
    })

    it("leaves sentence-level groups untouched", () => {
      const html = `
        <div id="content">
          <section data-section-type="activity_underline_text" data-section-id="sec-1">
            <p><span data-id="sent-1">${option("item-1", "question-group-1", "She reads books.")} ${option("item-2", "question-group-1", "She read books.")} Pick the correct sentence.</span></p>
          </section>
        </div>
      `
      expect(autoRepairUnderlineActivityHtml(html, "activity_underline_text")).toBe(html)
    })

    it("does not tokenize example labels during completion", () => {
      const html = `
        <div id="content">
          <section data-section-type="activity_underline_text" data-section-id="sec-1">
            <p><span data-id="ex-1">Mfano: ${option("item-1", "question-group-1", "Mimi")} ninacheza.</span></p>
          </section>
        </div>
      `
      const repaired = autoRepairUnderlineActivityHtml(html, "activity_underline_text")
      expect(repaired).toMatch(/>ninacheza</)
      expect(repaired).toContain('data-activity-item="item-2"')
      expect(repaired).not.toMatch(/data-activity-item="[^"]*"[^>]*>Mfano</)
    })

    it("skips groups whose wrapper also contains other groups", () => {
      const html = `
        <div id="content">
          <section data-section-type="activity_underline_text" data-section-id="sec-1">
            <p><span data-id="sent-1">${option("item-1", "question-group-1", "She")} ${option("item-2", "question-group-2", "reads")} books here.</span></p>
          </section>
        </div>
      `
      expect(autoRepairUnderlineActivityHtml(html, "activity_underline_text")).toBe(html)
    })
  })
})
