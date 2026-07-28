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

  it("keeps verdict marks attached to underline options across a text swap", () => {
    document.body.innerHTML = `
      <section data-section-type="activity_underline_text">
        <span data-id="line-1">
          <span class="activity-underline-option" data-activity-item="item-1" data-question-group="question-group-1">We<span data-underline-verdict-mark="correct" aria-hidden="true"><i class="fas fa-check"></i></span></span>
          <span> </span>
          <span class="activity-underline-option" data-activity-item="item-2" data-question-group="question-group-1">sing</span>
        </span>
      </section>
    `

    applyTranslationsToDOM({
      "line-1": "Nous chantons",
    })

    const options = document.querySelectorAll<HTMLElement>(
      ".activity-underline-option[data-activity-item]",
    )
    expect(options).toHaveLength(2)
    const mark = options[0].querySelector("[data-underline-verdict-mark]")
    expect(mark).not.toBeNull()
    expect(options[0].textContent).toBe("Nous")
    expect(options[1].textContent).toBe("chantons")
  })
})
