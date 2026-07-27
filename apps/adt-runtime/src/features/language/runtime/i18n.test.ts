// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { applyTranslationsToDOM } from "./i18n"

describe("applyTranslationsToDOM", () => {
  it("preserves underline activity option spans inside translated wrappers", () => {
    document.body.innerHTML = `
      <section data-section-type="activity_underline_text">
        <span data-id="line-1">
          <span class="activity-underline-option" data-activity-item="item-1" data-question-group="question-group-1">We</span>
          <span> </span>
          <span class="activity-underline-option" data-activity-item="item-2" data-question-group="question-group-1">sing</span>
          <span> </span>
          <span class="activity-underline-option" data-activity-item="item-3" data-question-group="question-group-1">songs</span>.
        </span>
      </section>
    `

    applyTranslationsToDOM({
      "line-1": "We sing songs.",
    })

    const wrapper = document.querySelector<HTMLElement>('[data-id="line-1"]')
    expect(wrapper).not.toBeNull()
    const options = wrapper!.querySelectorAll(".activity-underline-option[data-activity-item]")
    expect(options).toHaveLength(3)
    expect(options[0].textContent).toBe("We")
    expect(options[1].textContent).toBe("sing")
    expect(options[2].textContent).toBe("songs")
  })
})
