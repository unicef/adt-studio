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

  describe("accessibility semantics", () => {
    it("appends an aria-hidden check/cross mark so the verdict is not color-only", () => {
      setupSingleGroup()
      initializeUnderlineTextActivity()
      optionFor("item-1").click()
      optionFor("item-2").click()
      store.get(validateHandlerAtom)?.()
      const correctMark = optionFor("item-1").querySelector<HTMLElement>(
        "[data-underline-verdict-mark='correct']",
      )!
      const wrongMark = optionFor("item-2").querySelector<HTMLElement>(
        "[data-underline-verdict-mark='incorrect']",
      )!
      expect(correctMark.getAttribute("aria-hidden")).toBe("true")
      expect(correctMark.querySelector("i")!.className).toContain("fa-check-circle")
      expect(wrongMark.getAttribute("aria-hidden")).toBe("true")
      expect(wrongMark.querySelector("i")!.className).toContain("fa-times-circle")
    })

    it("never writes inline styles to tokens, so selection and verdicts cannot reflow text", () => {
      setupSingleGroup()
      initializeUnderlineTextActivity()
      // Chip styling, state colors, and badge positioning all live in the
      // injected stylesheet keyed off attributes — inline style mutations are
      // what previously shifted the surrounding words.
      expect(document.getElementById("underline-text-activity-style")).not.toBeNull()
      optionFor("item-1").click()
      optionFor("item-2").click()
      store.get(validateHandlerAtom)?.()
      for (const id of ["item-1", "item-2", "item-3"]) {
        expect(optionFor(id).getAttribute("style")).toBeNull()
      }
    })

    it("removes the verdict mark when the learner edits after submit", () => {
      setupSingleGroup()
      initializeUnderlineTextActivity()
      optionFor("item-2").click()
      store.get(validateHandlerAtom)?.()
      expect(
        optionFor("item-2").querySelector("[data-underline-verdict-mark]"),
      ).not.toBeNull()
      optionFor("item-1").click()
      expect(
        optionFor("item-2").querySelector("[data-underline-verdict-mark]"),
      ).toBeNull()
    })

    it("exposes each token as a focusable checkbox named by its text content", () => {
      setupSingleGroup()
      initializeUnderlineTextActivity()
      const option = optionFor("item-1")
      expect(option.getAttribute("role")).toBe("checkbox")
      expect(option.getAttribute("tabindex")).toBe("0")
      expect(option.getAttribute("aria-checked")).toBe("false")
      // Name must come from content so it follows the visible word across
      // language switches — a static aria-label would go stale.
      expect(option.hasAttribute("aria-label")).toBe(false)
      expect(option.textContent).toBe("Mimi")
    })

    it("groups a question's tokens under a labeled group container", () => {
      setupSingleGroup()
      initializeUnderlineTextActivity()
      const wrapper = document.querySelector<HTMLElement>("[data-id='text-1']")!
      expect(wrapper.getAttribute("role")).toBe("group")
      expect(wrapper.getAttribute("aria-label")).toBe("Question 1")
    })

    it("labels multiple question groups with distinct question numbers", () => {
      document.body.innerHTML = `
        <section data-section-type="activity_underline_text" data-section-id="pg021_sec001">
          <p><span data-id="text-1">
            <span class="activity-underline-option" data-activity-item="item-1" data-question-group="question-group-1">She</span>
            <span class="activity-underline-option" data-activity-item="item-2" data-question-group="question-group-1">reads</span>
          </span></p>
          <p><span data-id="text-2">
            <span class="activity-underline-option" data-activity-item="item-3" data-question-group="question-group-2">We</span>
            <span class="activity-underline-option" data-activity-item="item-4" data-question-group="question-group-2">sing</span>
          </span></p>
        </section>
      `
      window.correctAnswers = { "item-1": true, "item-3": true }
      initializeUnderlineTextActivity()
      expect(
        document.querySelector("[data-id='text-1']")!.getAttribute("aria-label"),
      ).toBe("Question 1")
      expect(
        document.querySelector("[data-id='text-2']")!.getAttribute("aria-label"),
      ).toBe("Question 2")
    })

    it("toggles selection with Enter and Space", () => {
      setupSingleGroup()
      initializeUnderlineTextActivity()
      const option = optionFor("item-1")
      option.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
      expect(option.getAttribute("aria-checked")).toBe("true")
      option.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }))
      expect(option.getAttribute("aria-checked")).toBe("false")
    })

    it("announces the verdict in the live region after a failed submit", async () => {
      setupSingleGroup()
      initializeUnderlineTextActivity()
      optionFor("item-2").click() // wrong; item-1 stays missed
      store.get(validateHandlerAtom)?.()
      await new Promise((resolve) => setTimeout(resolve, 80))
      const region = document.getElementById("sr-announcement")!
      expect(region.textContent).toBe("0 correct, 1 incorrect, 1 still to find.")
    })

    it("announces success in the live region when everything is correct", async () => {
      setupSingleGroup()
      initializeUnderlineTextActivity()
      optionFor("item-1").click()
      store.get(validateHandlerAtom)?.()
      await new Promise((resolve) => setTimeout(resolve, 80))
      const region = document.getElementById("sr-announcement")!
      expect(region.textContent).toBe("All answers are correct!")
    })

    it("moves focus to the first wrong token after a failed submit", () => {
      setupSingleGroup()
      initializeUnderlineTextActivity()
      const wrong = optionFor("item-2")
      wrong.click()
      store.get(validateHandlerAtom)?.()
      expect(document.activeElement).toBe(wrong)
    })

    it("marks only wrongly selected tokens aria-invalid after submit", () => {
      setupSingleGroup()
      initializeUnderlineTextActivity()
      optionFor("item-1").click()
      optionFor("item-2").click()
      store.get(validateHandlerAtom)?.()
      expect(optionFor("item-1").getAttribute("aria-invalid")).toBe("false")
      expect(optionFor("item-2").getAttribute("aria-invalid")).toBe("true")
    })
  })
})
