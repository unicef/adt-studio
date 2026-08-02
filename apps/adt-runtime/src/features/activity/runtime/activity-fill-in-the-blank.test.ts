// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"
import { getDefaultStore } from "jotai"
import { initializeFillInTheBlankActivity } from "./activity-fill-in-the-blank"
import {
  skipEnabledAtom,
  submitEnabledAtom,
  submitStateAtom,
  validateHandlerAtom,
} from "../state/activity.atoms"
import { pagesAtom, currentSectionIdAtom } from "../../navigation/state/nav.atoms"

const store = getDefaultStore()

declare global {
  interface Window {
    correctAnswers?: Record<string, string>
  }
}

function setupSectionWithInlineBlank(): HTMLInputElement {
  document.body.innerHTML = `
    <section data-section-type="activity_fill_in_the_blank" data-section-id="pg001_sec001">
      <p class="fitb-sentence">
        <span data-id="text-1">El cielo es de color [[blank:item-1]].</span>
      </p>
    </section>
  `
  window.correctAnswers = { "item-1": "azul" }
  return document.querySelector<HTMLInputElement>("input[data-activity-item='item-1']")!
}

function setupSectionWithStandaloneInput(): HTMLInputElement {
  document.body.innerHTML = `
    <section data-section-type="activity_fill_in_the_blank" data-section-id="pg001_sec002">
      <div class="flex items-center gap-3">
        <label data-id="text-1">Nombre:</label>
        <input type="text" data-aria-id="aria-1-0-0" data-activity-item="item-1" />
      </div>
    </section>
  `
  window.correctAnswers = { "item-1": "" } // open-ended
  return document.querySelector<HTMLInputElement>("input[data-activity-item='item-1']")!
}

beforeEach(() => {
  document.body.innerHTML = ""
  window.correctAnswers = {}
  store.set(submitEnabledAtom, false)
  store.set(skipEnabledAtom, false)
  store.set(submitStateAtom, "submit")
  store.set(validateHandlerAtom, () => null)
  store.set(pagesAtom, [
    { section_id: "pg001_sec001", href: "pg001_sec001.html" },
    { section_id: "next", href: "next.html" },
  ])
  store.set(currentSectionIdAtom, "pg001_sec001")
})

describe("initializeFillInTheBlankActivity — inline blanks", () => {
  it("hydrates [[blank:item-N]] into an <input>", () => {
    setupSectionWithInlineBlank()
    initializeFillInTheBlankActivity()

    const input = document.querySelector<HTMLInputElement>("input[data-activity-item='item-1']")
    expect(input).not.toBeNull()
    expect(input?.getAttribute("aria-label")).toBe("Blank")
  })

  it("enables submit only after the user types something", () => {
    const _input = setupSectionWithInlineBlank()
    initializeFillInTheBlankActivity()

    const input = document.querySelector<HTMLInputElement>("input[data-activity-item='item-1']")!
    expect(store.get(submitEnabledAtom)).toBe(false)

    input.value = "a"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    expect(store.get(submitEnabledAtom)).toBe(true)
  })

  it("validates correct answer on submit and flips to next state", () => {
    setupSectionWithInlineBlank()
    initializeFillInTheBlankActivity()

    const input = document.querySelector<HTMLInputElement>("input[data-activity-item='item-1']")!
    input.value = "azul"
    input.dispatchEvent(new Event("input", { bubbles: true }))

    const validate = store.get(validateHandlerAtom)
    validate?.()

    expect(store.get(submitStateAtom)).toBe("next")
  })

  it("validates wrong answer and stays in submit state", () => {
    setupSectionWithInlineBlank()
    initializeFillInTheBlankActivity()

    const input = document.querySelector<HTMLInputElement>("input[data-activity-item='item-1']")!
    input.value = "rojo"
    input.dispatchEvent(new Event("input", { bubbles: true }))

    const validate = store.get(validateHandlerAtom)
    validate?.()

    expect(store.get(submitStateAtom)).toBe("submit")
    expect(input.classList.contains("border-red-500")).toBe(true)
  })

  it("keeps the next-activity button enabled if the user edits after success", () => {
    setupSectionWithInlineBlank()
    initializeFillInTheBlankActivity()

    const input = document.querySelector<HTMLInputElement>("input[data-activity-item='item-1']")!
    input.value = "azul"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    store.get(validateHandlerAtom)?.()
    expect(store.get(submitStateAtom)).toBe("next")
    expect(store.get(submitEnabledAtom)).toBe(true)

    // User edits — clearing the input would previously disable the next button
    // and strand the user.
    input.value = ""
    input.dispatchEvent(new Event("input", { bubbles: true }))
    expect(store.get(submitStateAtom)).toBe("next")
    expect(store.get(submitEnabledAtom)).toBe(true)
  })

  it("accepts pipe-separated alternatives", () => {
    setupSectionWithInlineBlank()
    window.correctAnswers = { "item-1": "azul|celeste" }
    initializeFillInTheBlankActivity()

    const input = document.querySelector<HTMLInputElement>("input[data-activity-item='item-1']")!
    input.value = "Celeste" // case-insensitive
    input.dispatchEvent(new Event("input", { bubbles: true }))

    const validate = store.get(validateHandlerAtom)
    validate?.()
    expect(store.get(submitStateAtom)).toBe("next")
  })
})

describe("initializeFillInTheBlankActivity — standalone inputs", () => {
  it("treats empty correctAnswer as open-ended (any non-empty value counts as correct)", () => {
    setupSectionWithStandaloneInput()
    initializeFillInTheBlankActivity()

    const input = document.querySelector<HTMLInputElement>("input[data-activity-item='item-1']")!
    input.value = "María"
    input.dispatchEvent(new Event("input", { bubbles: true }))

    const validate = store.get(validateHandlerAtom)
    validate?.()
    expect(store.get(submitStateAtom)).toBe("next")
  })
})

describe("initializeFillInTheBlankActivity — guards", () => {
  it("returns null when there is no FITB section on the page", () => {
    document.body.innerHTML = "<main>plain page</main>"
    expect(initializeFillInTheBlankActivity()).toBeNull()
  })
})

describe("initializeFillInTheBlankActivity — fill-in-a-table", () => {
  it("validates a fill-in-a-table section against window.correctAnswers", () => {
    document.body.innerHTML = `
      <section data-section-type="activity_fill_in_a_table" data-section-id="pg001_sec010">
        <div class="activity-text">
          <div class="grid grid-cols-2 gap-4">
            <div class="p-4 rounded bg-gray-100 flex items-center">
              <label for="field1" data-id="text-1">House:</label>
              <input type="text" id="field1" data-aria-id="aria-1-0-0" data-activity-item="item-1" />
            </div>
            <div class="p-4 rounded bg-gray-100 flex items-center">
              <label for="field2" data-id="text-2">Dog:</label>
              <input type="text" id="field2" data-aria-id="aria-1-0-1" data-activity-item="item-2" />
            </div>
          </div>
        </div>
      </section>
    `
    window.correctAnswers = { "item-1": "casa", "item-2": "perro" }
    initializeFillInTheBlankActivity()

    const i1 = document.querySelector<HTMLInputElement>(
      "input[data-activity-item='item-1']",
    )!
    const i2 = document.querySelector<HTMLInputElement>(
      "input[data-activity-item='item-2']",
    )!
    i1.value = "casa"
    i1.dispatchEvent(new Event("input", { bubbles: true }))
    i2.value = "perro"
    i2.dispatchEvent(new Event("input", { bubbles: true }))

    store.get(validateHandlerAtom)?.()
    expect(store.get(submitStateAtom)).toBe("next")
  })

  it("does not hydrate any inputs (no [[blank:]] markers in tables)", () => {
    document.body.innerHTML = `
      <section data-section-type="activity_fill_in_a_table" data-section-id="pg001_sec011">
        <div class="activity-text">
          <input type="text" data-aria-id="aria-1-0-0" data-activity-item="item-1" />
        </div>
      </section>
    `
    window.correctAnswers = { "item-1": "x" }
    initializeFillInTheBlankActivity()

    // Only the one input the LLM emitted — no extras spawned by marker hydration.
    expect(document.querySelectorAll("input").length).toBe(1)
  })

  it("uses a table-specific aria-label for fill-in-a-table sections", () => {
    document.body.innerHTML = `
      <section data-section-type="activity_fill_in_a_table" data-section-id="pg001_sec012">
        <input type="text" data-aria-id="aria-1-0-0" data-activity-item="item-1" />
      </section>
    `
    window.correctAnswers = { "item-1": "x" }
    initializeFillInTheBlankActivity()

    const section = document.querySelector<HTMLElement>(
      "section[data-section-type='activity_fill_in_a_table']",
    )!
    expect(section.getAttribute("aria-label")).toBe("Fill in the table activity")
  })
})
