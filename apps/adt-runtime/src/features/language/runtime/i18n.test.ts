// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { applyTranslationsToDOM } from "./i18n"

describe("applyTranslationsToDOM", () => {
  it("preserves translated TOC title, leader, and page-number spans", () => {
    document.body.innerHTML = `
      <section data-section-type="table_of_contents">
        <div data-id="toc-1" class="flex items-baseline">
          <span data-toc-title="true">Digestive system</span>
          <span data-toc-leader="true" aria-hidden="true" class="border-dotted"><span class="sr-only">........</span></span>
          <span data-toc-page-number="true">1</span>
        </div>
      </section>
    `

    applyTranslationsToDOM({ "toc-1": "Sistema digestivo........1" })

    const row = document.querySelector<HTMLElement>('[data-id="toc-1"]')!
    expect(row.querySelector("[data-toc-title]")?.textContent).toBe("Sistema digestivo")
    expect(row.querySelector("[data-toc-leader] .sr-only")?.textContent).toBe("........")
    expect(row.querySelector("[data-toc-page-number]")?.textContent).toBe("1")
    expect(row.querySelectorAll(":scope > span")).toHaveLength(3)
  })

  it("keeps spaced dot leaders out of the visible title after translation", () => {
    document.body.innerHTML = `
      <section data-section-type="table_of_contents">
        <div data-id="toc-1" class="flex items-baseline">
          <span data-toc-title="true">Weather</span>
          <span data-toc-leader="true" aria-hidden="true" class="border-dotted"><span class="sr-only">. . . . .</span></span>
          <span data-toc-page-number="true">5</span>
        </div>
      </section>
    `

    applyTranslationsToDOM({ "toc-1": "Clima . . . . . 5" })

    const row = document.querySelector<HTMLElement>('[data-id="toc-1"]')!
    expect(row.querySelector("[data-toc-title]")?.textContent).toBe("Clima ")
    expect(row.querySelector("[data-toc-leader] .sr-only")?.textContent).toBe(". . . . .")
    expect(row.querySelector("[data-toc-page-number]")?.textContent).toBe(" 5")
  })

  it("translates the title while preserving TOC layout when no page number is supplied", () => {
    document.body.innerHTML = `
      <section data-section-type="table_of_contents">
        <div data-id="toc-1" class="flex items-baseline">
          <span data-toc-title="true">Introduction</span>
          <span data-toc-leader="true" aria-hidden="true" class="border-dotted"></span>
          <span data-toc-page-number="true">vi</span>
        </div>
      </section>
    `

    applyTranslationsToDOM({ "toc-1": "Introducción" })

    expect(document.querySelector("[data-toc-title]")?.textContent).toBe("Introducción")
    expect(document.querySelector("[data-toc-page-number]")?.textContent).toBe("vi")
  })

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
