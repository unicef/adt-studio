// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"
import { getDefaultStore } from "jotai"
import { initializeQuizActivity } from "./activity-quiz"
import {
  skipEnabledAtom,
  submitEnabledAtom,
  submitStateAtom,
  validateHandlerAtom,
} from "../state/activity.atoms"
import { pagesAtom, currentSectionIdAtom } from "../../navigation/state/nav.atoms"

const store = getDefaultStore()

function setupStandaloneQuiz(): void {
  document.body.innerHTML = `
    <section data-section-type="activity_quiz" data-section-id="qz001"
             data-correct-answers='{"item-1":true,"item-2":false}'>
      <label class="activity-option" data-activity-item="item-1">
        <div class="feedback-container hidden"><div><span class="feedback-icon"></span><span class="feedback-text"></span></div></div>
        <span>Option 1</span>
      </label>
      <label class="activity-option" data-activity-item="item-2">
        <div class="feedback-container hidden"><div><span class="feedback-icon"></span><span class="feedback-text"></span></div></div>
        <span>Option 2</span>
      </label>
    </section>
  `
}

function setupMultipleChoice(): void {
  document.body.innerHTML = `
    <section data-section-type="activity_multiple_choice" data-section-id="pg002_sec001">
      <div class="questions grow space-y-4" role="group">
        <p>Which is correct?</p>
        <div class="option-container">
          <label class="activity-option">
            <input type="radio" name="q1" value="item-1" data-activity-item="item-1" class="sr-only" />
            <div data-id="text-1">Option 1</div>
            <div class="feedback-container hidden"><div><span class="feedback-icon"></span><span class="feedback-text"></span></div></div>
          </label>
        </div>
        <div class="option-container">
          <label class="activity-option">
            <input type="radio" name="q1" value="item-2" data-activity-item="item-2" class="sr-only" />
            <div data-id="text-2">Option 2</div>
            <div class="feedback-container hidden"><div><span class="feedback-icon"></span><span class="feedback-text"></span></div></div>
          </label>
        </div>
      </div>
    </section>
  `
  window.correctAnswers = { "item-1": true, "item-2": false }
}

beforeEach(() => {
  document.body.innerHTML = ""
  window.correctAnswers = undefined
  store.set(submitEnabledAtom, false)
  store.set(skipEnabledAtom, false)
  store.set(submitStateAtom, "submit")
  store.set(validateHandlerAtom, () => null)
})

describe("initializeQuizActivity — standalone activity_quiz", () => {
  beforeEach(() => {
    store.set(pagesAtom, [
      { section_id: "pg001_sec001", href: "pg001_sec001.html" },
      { section_id: "qz001", href: "qz001.html" },
      { section_id: "pg002_sec001", href: "pg002_sec001.html" },
      { section_id: "qz002", href: "qz002.html" },
    ])
    store.set(currentSectionIdAtom, "qz001")
  })

  it("validates the selected option against data-correct-answers", () => {
    setupStandaloneQuiz()
    initializeQuizActivity()

    const option = document.querySelector<HTMLElement>(
      ".activity-option[data-activity-item='item-1']",
    )!
    option.click()
    expect(store.get(submitEnabledAtom)).toBe(true)

    store.get(validateHandlerAtom)?.()
    expect(store.get(submitStateAtom)).toBe("next")
    expect(store.get(submitEnabledAtom)).toBe(true) // next page exists
  })

  it("disables next when this is the last page", () => {
    store.set(currentSectionIdAtom, "qz002") // last page
    setupStandaloneQuiz()
    document.querySelector("section")!.setAttribute("data-section-id", "qz002")
    initializeQuizActivity()

    document
      .querySelector<HTMLElement>(".activity-option[data-activity-item='item-1']")!
      .click()
    store.get(validateHandlerAtom)?.()
    expect(store.get(submitStateAtom)).toBe("next")
    expect(store.get(submitEnabledAtom)).toBe(false)
  })
})

describe("initializeQuizActivity — embedded activity_multiple_choice", () => {
  beforeEach(() => {
    store.set(pagesAtom, [
      { section_id: "pg002_sec001", href: "pg002_sec001.html" },
      { section_id: "pg003_sec001", href: "pg003_sec001.html" },
    ])
    store.set(currentSectionIdAtom, "pg002_sec001")
  })

  it("reads correct answers from window.correctAnswers", () => {
    setupMultipleChoice()
    initializeQuizActivity()

    document
      .querySelector<HTMLInputElement>("input[data-activity-item='item-1']")!
      .closest<HTMLElement>(".activity-option")!
      .click()
    store.get(validateHandlerAtom)?.()
    expect(store.get(submitStateAtom)).toBe("next")
  })

  it("treats a wrong pick as incorrect and stays in submit state", () => {
    setupMultipleChoice()
    initializeQuizActivity()

    document
      .querySelector<HTMLInputElement>("input[data-activity-item='item-2']")!
      .closest<HTMLElement>(".activity-option")!
      .click()
    store.get(validateHandlerAtom)?.()
    expect(store.get(submitStateAtom)).toBe("submit")
  })

  it("post-correct, submit enables for the next sequential page (not the next quiz)", () => {
    setupMultipleChoice()
    initializeQuizActivity()

    document
      .querySelector<HTMLInputElement>("input[data-activity-item='item-1']")!
      .closest<HTMLElement>(".activity-option")!
      .click()
    store.get(validateHandlerAtom)?.()
    expect(store.get(submitStateAtom)).toBe("next")
    // Next page exists in the page list above (pg003_sec001), so enabled.
    expect(store.get(submitEnabledAtom)).toBe(true)
  })

  it("applies a visible selection highlight on the picked option label", () => {
    setupMultipleChoice()
    initializeQuizActivity()

    const opt1 = document
      .querySelector<HTMLInputElement>("input[data-activity-item='item-1']")!
      .closest<HTMLElement>(".activity-option")!
    opt1.click()
    expect(opt1.getAttribute("data-mc-style-state") === "selected").toBe(true)

    // Switching to a different option moves the highlight, doesn't accumulate.
    const opt2 = document
      .querySelector<HTMLInputElement>("input[data-activity-item='item-2']")!
      .closest<HTMLElement>(".activity-option")!
    opt2.click()
    expect(opt1.getAttribute("data-mc-style-state") === "selected").toBe(false)
    expect(opt2.getAttribute("data-mc-style-state") === "selected").toBe(true)
  })

  it("strips the selection highlight on validation and applies the correct/incorrect state class", () => {
    setupMultipleChoice()
    initializeQuizActivity()

    const opt = document
      .querySelector<HTMLInputElement>("input[data-activity-item='item-1']")!
      .closest<HTMLElement>(".activity-option")!
    opt.click()
    store.get(validateHandlerAtom)?.()
    expect(opt.getAttribute("data-mc-style-state") === "selected").toBe(false)
    expect(opt.getAttribute("data-mc-style-state") === "correct").toBe(true)
  })

  it("injects a status badge for correct/incorrect verdicts (non-color cue)", () => {
    setupMultipleChoice()
    initializeQuizActivity()

    const correctOpt = document
      .querySelector<HTMLInputElement>("input[data-activity-item='item-1']")!
      .closest<HTMLElement>(".activity-option")!
    correctOpt.click()
    store.get(validateHandlerAtom)?.()
    const badge = correctOpt.querySelector("[data-mc-status-badge]")
    expect(badge).not.toBeNull()
    expect(badge?.getAttribute("data-mc-status-badge")).toBe("correct")
    expect(badge?.querySelector(".fa-check")).not.toBeNull()
  })

  it("syncs selection state when the inner radio fires `change` (arrow-key navigation)", () => {
    setupMultipleChoice()
    initializeQuizActivity()

    const radio2 = document.querySelector<HTMLInputElement>(
      "input[data-activity-item='item-2']",
    )!
    radio2.checked = true
    radio2.dispatchEvent(new Event("change", { bubbles: true }))

    const opt2 = radio2.closest<HTMLElement>(".activity-option")!
    expect(opt2.getAttribute("data-mc-style-state") === "selected").toBe(true)
    expect(store.get(submitEnabledAtom)).toBe(true)

    // Validation runs against the keyboard-selected option.
    store.get(validateHandlerAtom)?.()
    expect(store.get(submitStateAtom)).toBe("submit") // item-2 is the wrong answer
  })

  it("handles image-only option labels (no inner text)", () => {
    document.body.innerHTML = `
      <section data-section-type="activity_multiple_choice" data-section-id="pg002_sec010">
        <div role="group">
          <p>Pick the right image.</p>
          <label class="activity-option">
            <input type="radio" name="q1" value="item-1" data-activity-item="item-1" class="sr-only" />
            <img data-id="img-1" src="images/a.png" alt="A" style="width:100%" />
            <div class="feedback-container hidden"><div><span class="feedback-icon"></span><span class="feedback-text"></span></div></div>
          </label>
          <label class="activity-option">
            <input type="radio" name="q1" value="item-2" data-activity-item="item-2" class="sr-only" />
            <img data-id="img-2" src="images/b.png" alt="B" style="width:100%" />
            <div class="feedback-container hidden"><div><span class="feedback-icon"></span><span class="feedback-text"></span></div></div>
          </label>
        </div>
      </section>
    `
    window.correctAnswers = { "item-1": true, "item-2": false }
    initializeQuizActivity()

    const correctImgOpt = document
      .querySelector<HTMLInputElement>("input[data-activity-item='item-1']")!
      .closest<HTMLElement>(".activity-option")!
    correctImgOpt.click()
    expect(correctImgOpt.getAttribute("data-mc-style-state") === "selected").toBe(true)

    store.get(validateHandlerAtom)?.()
    expect(store.get(submitStateAtom)).toBe("next")
  })

  it("supports multiple question groups on a single page", () => {
    document.body.innerHTML = `
      <section data-section-type="activity_multiple_choice" data-section-id="pg002_sec020">
        <div role="group">
          <p>Question 1.</p>
          <div class="option-container">
            <label class="activity-option">
              <input type="radio" name="question-group-1" value="item-1" data-activity-item="item-1" class="sr-only" />
              <div data-id="text-1">Q1A</div>
              <div class="feedback-container hidden"><div><span class="feedback-icon"></span><span class="feedback-text"></span></div></div>
            </label>
          </div>
          <div class="option-container">
            <label class="activity-option">
              <input type="radio" name="question-group-1" value="item-2" data-activity-item="item-2" class="sr-only" />
              <div data-id="text-2">Q1B</div>
              <div class="feedback-container hidden"><div><span class="feedback-icon"></span><span class="feedback-text"></span></div></div>
            </label>
          </div>
        </div>
        <div role="group">
          <p>Question 2.</p>
          <div class="option-container">
            <label class="activity-option">
              <input type="radio" name="question-group-2" value="item-3" data-activity-item="item-3" class="sr-only" />
              <div data-id="text-3">Q2A</div>
              <div class="feedback-container hidden"><div><span class="feedback-icon"></span><span class="feedback-text"></span></div></div>
            </label>
          </div>
          <div class="option-container">
            <label class="activity-option">
              <input type="radio" name="question-group-2" value="item-4" data-activity-item="item-4" class="sr-only" />
              <div data-id="text-4">Q2B</div>
              <div class="feedback-container hidden"><div><span class="feedback-icon"></span><span class="feedback-text"></span></div></div>
            </label>
          </div>
        </div>
      </section>
    `
    // Q1A and Q2B are correct.
    window.correctAnswers = {
      "item-1": true,
      "item-2": false,
      "item-3": false,
      "item-4": true,
    }
    initializeQuizActivity()

    const q1a = document
      .querySelector<HTMLInputElement>("input[data-activity-item='item-1']")!
      .closest<HTMLElement>(".activity-option")!
    const q2b = document
      .querySelector<HTMLInputElement>("input[data-activity-item='item-4']")!
      .closest<HTMLElement>(".activity-option")!

    // Picking in q1 should NOT clear q2 and vice versa.
    q1a.click()
    expect(q1a.getAttribute("data-mc-style-state") === "selected").toBe(true)
    q2b.click()
    expect(q1a.getAttribute("data-mc-style-state") === "selected").toBe(true) // still selected
    expect(q2b.getAttribute("data-mc-style-state") === "selected").toBe(true)
    expect(store.get(submitEnabledAtom)).toBe(true)

    store.get(validateHandlerAtom)?.()
    expect(store.get(submitStateAtom)).toBe("next")
  })

  it("requires every group to be answered correctly before flipping to next", () => {
    document.body.innerHTML = `
      <section data-section-type="activity_multiple_choice" data-section-id="pg002_sec021">
        <div role="group">
          <label class="activity-option">
            <input type="radio" name="question-group-1" value="item-1" data-activity-item="item-1" class="sr-only" />
            <div data-id="text-1">Q1A</div>
            <div class="feedback-container hidden"><div><span class="feedback-icon"></span><span class="feedback-text"></span></div></div>
          </label>
        </div>
        <div role="group">
          <label class="activity-option">
            <input type="radio" name="question-group-2" value="item-2" data-activity-item="item-2" class="sr-only" />
            <div data-id="text-2">Q2A (wrong)</div>
            <div class="feedback-container hidden"><div><span class="feedback-icon"></span><span class="feedback-text"></span></div></div>
          </label>
        </div>
      </section>
    `
    window.correctAnswers = { "item-1": true, "item-2": false }
    initializeQuizActivity()

    // Answer q1 correctly, leave q2 unanswered — should stay in submit.
    document
      .querySelector<HTMLInputElement>("input[data-activity-item='item-1']")!
      .closest<HTMLElement>(".activity-option")!
      .click()
    store.get(validateHandlerAtom)?.()
    expect(store.get(submitStateAtom)).toBe("submit")

    // Now answer q2 (the only option, which is wrong) — still stays in submit.
    document
      .querySelector<HTMLInputElement>("input[data-activity-item='item-2']")!
      .closest<HTMLElement>(".activity-option")!
      .click()
    store.get(validateHandlerAtom)?.()
    expect(store.get(submitStateAtom)).toBe("submit")
  })

  it("handles option labels that mix an image and a text label", () => {
    document.body.innerHTML = `
      <section data-section-type="activity_multiple_choice" data-section-id="pg002_sec011">
        <div role="group">
          <p>Pick the right one.</p>
          <label class="activity-option">
            <input type="radio" name="q1" value="item-1" data-activity-item="item-1" class="sr-only" />
            <img data-id="img-1" src="images/a.png" alt="" style="width:100%" />
            <span data-id="text-1">Caption A</span>
            <div class="feedback-container hidden"><div><span class="feedback-icon"></span><span class="feedback-text"></span></div></div>
          </label>
          <label class="activity-option">
            <input type="radio" name="q1" value="item-2" data-activity-item="item-2" class="sr-only" />
            <img data-id="img-2" src="images/b.png" alt="" style="width:100%" />
            <span data-id="text-2">Caption B</span>
            <div class="feedback-container hidden"><div><span class="feedback-icon"></span><span class="feedback-text"></span></div></div>
          </label>
        </div>
      </section>
    `
    window.correctAnswers = { "item-1": false, "item-2": true }
    initializeQuizActivity()

    // Click on the image inside the label — should still register selection
    // on the parent .activity-option via event bubbling.
    const img = document.querySelector<HTMLImageElement>("img[data-id='img-2']")!
    img.closest<HTMLElement>(".activity-option")!.click()
    store.get(validateHandlerAtom)?.()
    expect(store.get(submitStateAtom)).toBe("next")
  })

  it("falls back to structural detection when the LLM omits `.activity-option`", () => {
    // Mirrors pg006 sec 1: image-grid layout where the LLM drops the
    // activity-option class. The runtime should still pick up each <label>
    // that wraps a radio with data-activity-item.
    document.body.innerHTML = `
      <section data-section-type="activity_multiple_choice" data-section-id="pg006_sec001">
        <div role="group" aria-label="Question group 1">
          <div class="grid grid-cols-2 gap-4">
            <label class="relative flex items-center justify-center cursor-pointer">
              <input type="radio" name="question-group-1" value="item-1" data-activity-item="item-1" class="sr-only" />
              <img data-id="img-1" src="images/a.png" alt="A" style="width:60%" />
            </label>
            <label class="relative flex items-center justify-center cursor-pointer">
              <input type="radio" name="question-group-1" value="item-2" data-activity-item="item-2" class="sr-only" />
              <img data-id="img-2" src="images/b.png" alt="B" style="width:82%" />
            </label>
          </div>
        </div>
      </section>
    `
    window.correctAnswers = { "item-1": false, "item-2": true }
    initializeQuizActivity()

    const winner = document
      .querySelector<HTMLInputElement>("input[data-activity-item='item-2']")!
      .closest<HTMLElement>("label")!
    winner.click()
    expect(store.get(submitEnabledAtom)).toBe(true)

    store.get(validateHandlerAtom)?.()
    expect(store.get(submitStateAtom)).toBe("next")
  })
})
