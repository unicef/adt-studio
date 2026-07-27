// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"
import { getDefaultStore } from "jotai"
import { initializeUnderlineTextActivity } from "./activity-underline-text"
import {
  skipEnabledAtom,
  submitEnabledAtom,
  submitStateAtom,
  validateHandlerAtom,
} from "../state/activity.atoms"
import { pagesAtom, currentSectionIdAtom } from "../../navigation/state/nav.atoms"

const store = getDefaultStore()

function setupSingleGroup(opts?: { sectionId?: string }): void {
  const sectionId = opts?.sectionId ?? "pg021_sec001"
  document.body.innerHTML = `
    <section data-section-type="activity_underline_text" data-section-id="${sectionId}">
      <p>
        <span data-id="text-1">
          <span class="activity-underline-option" data-activity-item="item-1" data-question-group="question-group-1">Mimi</span>
          <span> </span>
          <span class="activity-underline-option" data-activity-item="item-2" data-question-group="question-group-1">ninacheza</span>
          <span> </span>
          <span class="activity-underline-option" data-activity-item="item-3" data-question-group="question-group-1">mpira</span>
        </span>
      </p>
    </section>
  `
  window.correctAnswers = {
    "item-1": true,
    "item-2": false,
    "item-3": false,
  }
}

function optionFor(itemId: string): HTMLElement {
  return document.querySelector<HTMLElement>(`.activity-underline-option[data-activity-item='${itemId}']` )!
}

beforeEach(() => {
  document.body.innerHTML = ""
  window.correctAnswers = undefined
  store.set(submitEnabledAtom, false)
  store.set(skipEnabledAtom, false)
  store.set(submitStateAtom, "submit")
  store.set(validateHandlerAtom, () => null)
  store.set(pagesAtom, [
    { section_id: "pg021_sec001", href: "pg021_sec001.html" },
    { section_id: "pg022_sec001", href: "pg022_sec001.html" },
  ])
  store.set(currentSectionIdAtom, "pg021_sec001")
})

describe("initializeUnderlineTextActivity", () => {
  it("does nothing when no underline-text section is present", () => {
    document.body.innerHTML = `<section data-section-type="text_only"></section>`
    expect(initializeUnderlineTextActivity()).toBeNull()
  })

  it("enables submit after one segment is selected", () => {
    setupSingleGroup()
    initializeUnderlineTextActivity()
    expect(store.get(submitEnabledAtom)).toBe(false)
    optionFor("item-1").click()
    expect(store.get(submitEnabledAtom)).toBe(true)
    expect(optionFor("item-1").getAttribute("aria-checked")).toBe("true")
  })

  it("toggles a selected segment off on second click", () => {
    setupSingleGroup()
    initializeUnderlineTextActivity()
    const option = optionFor("item-1")
    option.click()
    option.click()
    expect(option.getAttribute("aria-checked")).toBe("false")
    expect(store.get(submitEnabledAtom)).toBe(false)
  })

  it("moves to next when the selected set equals the correct set", () => {
    setupSingleGroup()
    initializeUnderlineTextActivity()
    optionFor("item-1").click()
    store.get(validateHandlerAtom)?.()
    expect(store.get(submitStateAtom)).toBe("next")
  })

  it("stays in submit when the learner selects the wrong word", () => {
    setupSingleGroup()
    initializeUnderlineTextActivity()
    optionFor("item-2").click()
    store.get(validateHandlerAtom)?.()
    expect(store.get(submitStateAtom)).toBe("submit")
    expect(optionFor("item-2").getAttribute("data-underline-style-state")).toBe("incorrect")
  })

  it("supports multiple correct selections in one group", () => {
    setupSingleGroup()
    window.correctAnswers = {
      "item-1": true,
      "item-2": true,
      "item-3": false,
    }
    initializeUnderlineTextActivity()
    optionFor("item-1").click()
    optionFor("item-2").click()
    store.get(validateHandlerAtom)?.()
    expect(store.get(submitStateAtom)).toBe("next")
  })

  it("clears verdict styling on the next edit while preserving selection", () => {
    setupSingleGroup()
    initializeUnderlineTextActivity()
    optionFor("item-2").click()
    store.get(validateHandlerAtom)?.()
    expect(optionFor("item-2").getAttribute("data-underline-style-state")).toBe("incorrect")
    optionFor("item-1").click()
    expect(optionFor("item-2").getAttribute("data-underline-style-state")).toBe("selected")
    expect(optionFor("item-1").getAttribute("data-underline-style-state")).toBe("selected")
  })
})
